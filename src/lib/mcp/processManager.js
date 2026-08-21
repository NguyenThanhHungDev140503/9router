const { EventEmitter } = require("events");
const { McpClient } = require("./client");
const { StdioTransport } = require("./stdioTransport");
const { SseTransport } = require("./sseTransport");
const { sanitizeMcpError, truncateOutput } = require("./security");
const { McpError } = require("./errors");

const MAX_RESTART_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

class McpProcessManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.db = options.db || null;
    this.sessions = new Map(); // serverId -> { server, client, transport, status, restartCount, restartTimer }
    this.allowAnyCommand = options.allowAnyCommand ?? false;
    this.allowPrivateIps = options.allowPrivateIps ?? false;
  }

  async startServer(serverConfig) {
    const serverId = serverConfig.id;
    if (!serverId) {
      throw new McpError("Server config must have an id", "MCP_INVALID_CONFIG");
    }

    if (this.sessions.has(serverId)) {
      const existing = this.sessions.get(serverId);
      if (existing.status === "running" || existing.status === "starting") {
        return existing.client;
      }
      await this.stopServer(serverId);
    }

    const session = {
      server: serverConfig,
      client: null,
      transport: null,
      status: "starting",
      restartCount: 0,
      restartTimer: null,
      lastError: null,
    };

    this.sessions.set(serverId, session);
    this.emit("statusChange", { serverId, status: "starting" });

    try {
      await this._createAndConnectSession(session);
      return session.client;
    } catch (err) {
      session.status = "failed";
      session.lastError = sanitizeMcpError(err);
      this.emit("statusChange", { serverId, status: "failed", error: session.lastError });
      this._scheduleRestart(session);
      throw err;
    }
  }

  async _createAndConnectSession(session) {
    const { server } = session;
    let transport;

    if (server.transport === "stdio") {
      transport = new StdioTransport({
        command: server.command,
        args: typeof server.args === "string" ? JSON.parse(server.args) : (server.args || []),
        env: typeof server.env === "string" ? JSON.parse(server.env) : (server.env || {}),
        allowAnyCommand: this.allowAnyCommand,
      });
    } else if (server.transport === "sse" || server.transport === "http") {
      transport = new SseTransport({
        url: server.url,
        headers: typeof server.headers === "string" ? JSON.parse(server.headers) : (server.headers || {}),
        allowPrivateIps: this.allowPrivateIps,
      });
    } else {
      throw new McpError("Unsupported transport: " + server.transport, "MCP_UNSUPPORTED_TRANSPORT");
    }

    const client = new McpClient(transport, {
      timeoutMs: server.timeoutMs || 30000,
    });

    session.transport = transport;
    session.client = client;

    transport.on("close", (details) => {
      this._handleSessionClose(session, details);
    });

    transport.on("error", (err) => {
      session.lastError = sanitizeMcpError(err);
      this.emit("error", { serverId: server.id, error: session.lastError });
    });

    await transport.start();
    await client.initialize({
      name: "9router",
      version: "1.0.0",
    });

    session.status = "running";
    session.restartCount = 0; // reset backoff on success
    this.emit("statusChange", { serverId: server.id, status: "running" });

    // Sync tools if db provided
    await this.syncServerTools(server.id);
  }

  async syncServerTools(serverId) {
    const session = this.sessions.get(serverId);
    if (!session || !session.client || session.status !== "running") {
      throw new McpError("Server is not running: " + serverId, "MCP_SERVER_NOT_RUNNING");
    }

    try {
      const res = await session.client.listTools();
      const tools = res.tools || [];

      if (this.db && typeof this.db.replaceMcpToolsCache === "function") {
        await this.db.replaceMcpToolsCache(serverId, tools);
      }

      this.emit("toolsSynced", { serverId, tools });
      return tools;
    } catch (err) {
      session.lastError = sanitizeMcpError(err);
      this.emit("error", { serverId, error: session.lastError });
      throw err;
    }
  }

  async callServerTool(serverId, toolName, args = {}, meta = {}) {
    const session = this.sessions.get(serverId);
    if (!session || !session.client || session.status !== "running") {
      throw new McpError("Server is not running: " + serverId, "MCP_SERVER_NOT_RUNNING");
    }

    const result = await session.client.callTool(toolName, args, meta);
    return result;
  }

  _handleSessionClose(session, details = {}) {
    const serverId = session.server.id;
    if (session.status === "stopped") {
      return;
    }

    session.status = "crashed";
    this.emit("statusChange", { serverId, status: "crashed", details });
    this._scheduleRestart(session);
  }

  _scheduleRestart(session) {
    if (session.status === "stopped") return;
    if (session.restartCount >= MAX_RESTART_ATTEMPTS) {
      session.status = "failed";
      this.emit("statusChange", {
        serverId: session.server.id,
        status: "failed",
        error: "Max restart attempts reached",
      });
      return;
    }

    const backoffMs = Math.min(
      INITIAL_BACKOFF_MS * Math.pow(2, session.restartCount),
      MAX_BACKOFF_MS
    );
    session.restartCount++;

    if (session.restartTimer) {
      clearTimeout(session.restartTimer);
    }

    session.restartTimer = setTimeout(async () => {
      if (session.status === "stopped") return;
      session.status = "restarting";
      this.emit("statusChange", { serverId: session.server.id, status: "restarting", attempt: session.restartCount });

      try {
        await this._createAndConnectSession(session);
      } catch (err) {
        session.status = "failed";
        session.lastError = sanitizeMcpError(err);
        this._scheduleRestart(session);
      }
    }, backoffMs);
  }

  async stopServer(serverId) {
    const session = this.sessions.get(serverId);
    if (!session) return;

    session.status = "stopped";
    if (session.restartTimer) {
      clearTimeout(session.restartTimer);
      session.restartTimer = null;
    }

    if (session.client) {
      try {
        await session.client.close();
      } catch (e) {}
    }

    if (session.transport) {
      try {
        await session.transport.close();
      } catch (e) {}
    }

    this.sessions.delete(serverId);
    this.emit("statusChange", { serverId, status: "stopped" });
  }

  async stopAll() {
    const serverIds = Array.from(this.sessions.keys());
    await Promise.all(serverIds.map((id) => this.stopServer(id)));
  }

  getServerStatus(serverId) {
    const session = this.sessions.get(serverId);
    if (!session) return "offline";
    return session.status;
  }

  getSession(serverId) {
    return this.sessions.get(serverId) || null;
  }
}

// Global ProcessManager singleton
let globalManager = null;

function getProcessManager(options = {}) {
  if (!globalManager) {
    globalManager = new McpProcessManager(options);
  }
  return globalManager;
}

module.exports = {
  McpProcessManager,
  getProcessManager,
  MAX_RESTART_ATTEMPTS,
};
