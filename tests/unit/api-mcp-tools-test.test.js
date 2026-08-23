import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body, init) => ({
      status: init?.status || 200,
      json: async () => body,
      body,
    }),
  },
}));

vi.mock("@/lib/db/repos/mcpRepo", () => {
  let servers = [];
  let caches = {};
  return {
    getMcpServers: vi.fn(async ({ enabled } = {}) => {
      if (enabled === undefined) return [...servers];
      return servers.filter((s) => s.enabled === enabled);
    }),
    getMcpServerById: vi.fn(async (id) => {
      return servers.find((s) => s.id === id) || null;
    }),
    getMcpToolsCache: vi.fn(async (id) => {
      return caches[id] || [];
    }),
    _reset: () => {
      servers = [];
      caches = {};
    },
    _setServers: (s) => {
      servers = s;
    },
    _setCache: (id, tools) => {
      caches[id] = tools;
    },
  };
});

const mockPm = {
  getServerStatus: vi.fn(() => "running"),
  syncServerTools: vi.fn(async () => [{ name: "t1" }]),
  callServerTool: vi.fn(async (serverId, toolName, args) => ({
    content: [{ type: "text", text: "called " + toolName }],
  })),
};

vi.mock("@/lib/mcp/processManager", () => {
  class MockMcpProcessManager {
    constructor() {}
    async startServer() {
      return {
        listTools: async () => ({ tools: [{ name: "ephemeral_tool" }] }),
      };
    }
    async callServerTool(serverId, toolName, args) {
      return {
        content: [{ type: "text", text: "ephemeral called " + toolName }],
      };
    }
    async stopAll() {}
  }
  return {
    getProcessManager: vi.fn(() => mockPm),
    McpProcessManager: MockMcpProcessManager,
  };
});

import { GET as getTools } from "@/app/api/mcp/tools/route";
import { POST as runTest } from "@/app/api/mcp/test/route";
import * as mcpRepo from "@/lib/db/repos/mcpRepo";

describe("MCP Tools & Test REST API", () => {
  beforeEach(() => {
    mcpRepo._reset();
    vi.clearAllMocks();
  });

  it("lists namespaced tools from active servers", async () => {
    mcpRepo._setServers([
      { id: "s1", name: "filesystem", enabled: true },
      { id: "s2", name: "github", enabled: false },
    ]);
    mcpRepo._setCache("s1", [
      { name: "read_file", description: "Read file", inputSchema: { type: "object" } },
    ]);
    mcpRepo._setCache("s2", [
      { name: "get_repo", description: "Get repo", inputSchema: { type: "object" } },
    ]);

    // default enabledOnly = true
    const req = new Request("http://localhost/api/mcp/tools");
    const res = await getTools(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tools).toHaveLength(1);
    expect(json.tools[0].namespacedName).toBe("mcp__filesystem__read_file");
    expect(json.tools[0].serverName).toBe("filesystem");

    // enabledOnly = false
    const reqAll = new Request("http://localhost/api/mcp/tools?enabledOnly=false");
    const resAll = await getTools(reqAll);
    const jsonAll = await resAll.json();
    expect(jsonAll.tools).toHaveLength(2);
  });

  it("pings a running server via action: ping", async () => {
    mcpRepo._setServers([{ id: "s1", name: "filesystem", enabled: true }]);

    const req = new Request("http://localhost/api/mcp/test", {
      method: "POST",
      body: JSON.stringify({ action: "ping", serverId: "s1" }),
    });
    const res = await runTest(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe("running");
    expect(mockPm.syncServerTools).toHaveBeenCalledWith("s1");
  });

  it("pings ephemeral server config via action: ping", async () => {
    const req = new Request("http://localhost/api/mcp/test", {
      method: "POST",
      body: JSON.stringify({
        action: "ping",
        serverConfig: { transport: "stdio", command: "node", args: ["test.js"] },
      }),
    });
    const res = await runTest(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe("connected");
  });

  it("executes a live tool call via action: call", async () => {
    mcpRepo._setServers([{ id: "s1", name: "filesystem", enabled: true }]);

    const req = new Request("http://localhost/api/mcp/test", {
      method: "POST",
      body: JSON.stringify({
        action: "call",
        serverId: "s1",
        toolName: "read_file",
        arguments: { path: "/tmp/foo" },
      }),
    });
    const res = await runTest(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.result.content[0].text).toContain("called read_file");
    expect(mockPm.callServerTool).toHaveBeenCalledWith("s1", "read_file", { path: "/tmp/foo" });
  });

  it("rejects invalid action or missing toolName", async () => {
    const req1 = new Request("http://localhost/api/mcp/test", {
      method: "POST",
      body: JSON.stringify({ action: "invalid" }),
    });
    const res1 = await runTest(req1);
    expect(res1.status).toBe(400);

    mcpRepo._setServers([{ id: "s1", name: "fs", enabled: true }]);
    const req2 = new Request("http://localhost/api/mcp/test", {
      method: "POST",
      body: JSON.stringify({ action: "call", serverId: "s1" }),
    });
    const res2 = await runTest(req2);
    expect(res2.status).toBe(400);
  });
});
