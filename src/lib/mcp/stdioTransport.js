const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const readline = require("readline");
const { validateCommandSecurity, DEFAULT_MAX_BUFFER_SIZE } = require("./security");
const { McpError, McpTransportClosedError } = require("./errors");

class StdioTransport extends EventEmitter {
  constructor(options = {}) {
    super();
    this.command = options.command;
    this.args = options.args || [];
    this.env = options.env || {};
    this.cwd = options.cwd || undefined;
    this.allowAnyCommand = options.allowAnyCommand ?? false;
    this.maxBufferSize = options.maxBufferSize || DEFAULT_MAX_BUFFER_SIZE;

    this.process = null;
    this.readline = null;
    this.closed = false;
  }

  async start() {
    if (this.process) {
      return;
    }

    const { command, args } = validateCommandSecurity(this.command, this.args, {
      allowAnyCommand: this.allowAnyCommand,
    });

    const env = {
      ...process.env,
      ...this.env,
    };

    try {
      this.process = spawn(command, args, {
        env,
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      throw new McpError("Failed to spawn process: " + err.message, "MCP_SPAWN_ERROR", err);
    }

    this.readline = readline.createInterface({
      input: this.process.stdout,
      terminal: false,
      historySize: 0,
      crlfDelay: Infinity,
    });

    this.readline.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const parsed = JSON.parse(trimmed);
        this.emit("message", parsed);
      } catch (err) {
        this.emit("error", new McpError("Failed to parse JSON-RPC line: " + trimmed, "MCP_PARSE_ERROR", err));
      }
    });

    this.process.stderr.on("data", (chunk) => {
      this.emit("stderr", chunk.toString());
    });

    this.process.on("error", (err) => {
      this.emit("error", err);
      this._handleClose();
    });

    this.process.on("exit", (code, signal) => {
      this._handleClose(code, signal);
    });
  }

  send(message) {
    if (this.closed || !this.process || !this.process.stdin || this.process.stdin.destroyed) {
      throw new McpTransportClosedError("Cannot send message: stdio transport process is closed or not running");
    }

    const data = JSON.stringify(message) + "\n";
    this.process.stdin.write(data, "utf8");
  }

  _handleClose(code = null, signal = null) {
    if (this.closed) return;
    this.closed = true;

    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    this.emit("close", { code, signal });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;

    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    if (this.process && !this.process.killed) {
      try {
        this.process.kill("SIGTERM");
        // Give 1 second for graceful termination then SIGKILL
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            try {
              this.process.kill("SIGKILL");
            } catch (e) {}
          }
        }, 1000);
      } catch (err) {}
    }

    this.emit("close", { code: null, signal: "SIGTERM" });
  }
}

module.exports = {
  StdioTransport,
};
