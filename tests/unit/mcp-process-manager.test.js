import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpProcessManager } from "@/lib/mcp/processManager.js";

describe("McpProcessManager", () => {
  let pm;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      replaceMcpToolsCache: vi.fn().mockResolvedValue(true),
    };
    pm = new McpProcessManager({
      db: mockDb,
      allowAnyCommand: true,
      allowPrivateIps: true,
    });
  });

  afterEach(async () => {
    await pm.stopAll();
  });

  it("spawns stdio server, performs handshake and syncs tools to database", async () => {
    // Inline mock MCP server script replying to JSON-RPC stdio
    const script = `
      const readline = require("readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const req = JSON.parse(line);
        if (req.method === "initialize") {
          console.log(JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "test-process", version: "1.0.0" }
            }
          }));
        } else if (req.method === "notifications/initialized") {
          // ack
        } else if (req.method === "tools/list") {
          console.log(JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              tools: [
                { name: "calculator", description: "Calculator tool", inputSchema: { type: "object" } }
              ]
            }
          }));
        } else if (req.method === "tools/call") {
          console.log(JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            result: { content: [{ type: "text", text: "result = 42" }] }
          }));
        }
      });
    `;

    const serverConfig = {
      id: "srv-test-1",
      name: "Test Stdio Server",
      transport: "stdio",
      command: "node",
      args: ["-e", script],
    };

    await pm.startServer(serverConfig);
    expect(pm.getServerStatus("srv-test-1")).toBe("running");

    // Check DB sync was called
    expect(mockDb.replaceMcpToolsCache).toHaveBeenCalledWith("srv-test-1", [
      { name: "calculator", description: "Calculator tool", inputSchema: { type: "object" } },
    ]);

    // Call tool
    const res = await pm.callServerTool("srv-test-1", "calculator", { expr: "6 * 7" });
    expect(res.content[0].text).toBe("result = 42");

    // Stop server
    await pm.stopServer("srv-test-1");
    expect(pm.getServerStatus("srv-test-1")).toBe("offline");
  });

  it("handles server process crash and initiates auto-restart", async () => {
    // Process that exits quickly
    const script = `
      const readline = require("readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const req = JSON.parse(line);
        if (req.method === "initialize") {
          console.log(JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              serverInfo: { name: "crash-test", version: "1.0.0" }
            }
          }));
        } else if (req.method === "tools/list") {
          console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { tools: [] } }));
          setTimeout(() => {
            process.exit(1);
          }, 100);
        }
      });
    `;

    const serverConfig = {
      id: "srv-crash-1",
      name: "Crash Server",
      transport: "stdio",
      command: "node",
      args: ["-e", script],
    };

    const statusChanges = [];
    pm.on("statusChange", (evt) => {
      if (evt.serverId === "srv-crash-1") {
        statusChanges.push(evt.status);
      }
    });

    await pm.startServer(serverConfig);

    // Wait for crash event
    await vi.waitFor(() => {
      expect(statusChanges).toContain("crashed");
    }, { timeout: 3000 });

    const session = pm.getSession("srv-crash-1");
    expect(session.restartCount).toBe(1);

    await pm.stopServer("srv-crash-1");
  });

  it("throws error for unsupported transport type", async () => {
    const serverConfig = {
      id: "srv-bad-1",
      transport: "websocket",
    };

    await expect(pm.startServer(serverConfig)).rejects.toThrow(/Unsupported transport/);
  });
});
