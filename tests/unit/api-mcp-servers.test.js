import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/server
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body, init) => ({
      status: init?.status || 200,
      json: async () => body,
      body,
    }),
  },
}));

// Mock repositories
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
    getMcpServerByName: vi.fn(async (name) => {
      return servers.find((s) => s.name === name) || null;
    }),
    createMcpServer: vi.fn(async (data) => {
      const newServer = { id: "srv-" + Date.now(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      servers.push(newServer);
      return newServer;
    }),
    updateMcpServer: vi.fn(async (id, data) => {
      const idx = servers.findIndex((s) => s.id === id);
      if (idx === -1) return null;
      servers[idx] = { ...servers[idx], ...data, updatedAt: new Date().toISOString() };
      return servers[idx];
    }),
    deleteMcpServer: vi.fn(async (id) => {
      const idx = servers.findIndex((s) => s.id === id);
      if (idx === -1) return false;
      servers.splice(idx, 1);
      delete caches[id];
      return true;
    }),
    getMcpToolsCache: vi.fn(async (id) => {
      return caches[id] || [];
    }),
    _reset: () => {
      servers = [];
      caches = {};
    },
    _setCache: (id, tools) => {
      caches[id] = tools;
    }
  };
});

// Mock process manager
const mockPm = {
  getServerStatus: vi.fn(() => "running"),
  startServer: vi.fn(async () => {}),
  stopServer: vi.fn(async () => {}),
};
vi.mock("@/lib/mcp/processManager", () => ({
  getProcessManager: vi.fn(() => mockPm),
}));

import { GET as listServers, POST as createServer } from "@/app/api/mcp/servers/route";
import { GET as getServer, PUT as updateServer, DELETE as deleteServer } from "@/app/api/mcp/servers/[id]/route";
import { POST as restartServer } from "@/app/api/mcp/servers/[id]/restart/route";
import * as mcpRepo from "@/lib/db/repos/mcpRepo";

describe("MCP Servers REST API", () => {
  beforeEach(() => {
    mcpRepo._reset();
    vi.clearAllMocks();
  });

  it("lists servers with status and toolCount", async () => {
    await mcpRepo.createMcpServer({ id: "s1", name: "fs", transport: "stdio", command: "ls", enabled: true });
    mcpRepo._setCache("s1", [{ name: "read_file" }]);

    const req = new Request("http://localhost/api/mcp/servers");
    const res = await listServers(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.servers).toHaveLength(1);
    expect(json.servers[0].name).toBe("fs");
    expect(json.servers[0].toolCount).toBe(1);
    expect(json.servers[0].status).toBe("running");
  });

  it("validates server creation and calls pm.startServer", async () => {
    // Bad payload
    const badReq = new Request("http://localhost/api/mcp/servers", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    const badRes = await createServer(badReq);
    expect(badRes.status).toBe(400);

    // Good payload stdio
    const goodReq = new Request("http://localhost/api/mcp/servers", {
      method: "POST",
      body: JSON.stringify({
        name: "test-server",
        transport: "stdio",
        command: "node",
        args: ["app.js"],
        enabled: true,
      }),
    });
    const goodRes = await createServer(goodReq);
    expect(goodRes.status).toBe(201);
    const json = await goodRes.json();
    expect(json.server.name).toBe("test-server");
    expect(mockPm.startServer).toHaveBeenCalled();
  });

  it("gets single server details", async () => {
    const s = await mcpRepo.createMcpServer({ id: "s2", name: "srv-2", transport: "stdio", command: "node", enabled: true });
    mcpRepo._setCache(s.id, [{ name: "tool1" }]);

    const req = new Request(`http://localhost/api/mcp/servers/${s.id}`);
    const res = await getServer(req, { params: Promise.resolve({ id: s.id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.server.name).toBe("srv-2");
    expect(json.server.toolCount).toBe(1);
    expect(json.server.tools).toHaveLength(1);
  });

  it("updates server and restarts process when enabled", async () => {
    const s = await mcpRepo.createMcpServer({ id: "s3", name: "srv-3", transport: "stdio", command: "node", enabled: true });

    const req = new Request(`http://localhost/api/mcp/servers/${s.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "srv-3-renamed" }),
    });
    const res = await updateServer(req, { params: Promise.resolve({ id: s.id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.server.name).toBe("srv-3-renamed");
    expect(mockPm.stopServer).toHaveBeenCalledWith(s.id);
    expect(mockPm.startServer).toHaveBeenCalled();
  });

  it("stops process on server delete", async () => {
    const s = await mcpRepo.createMcpServer({ id: "s4", name: "srv-4", transport: "stdio", command: "node", enabled: true });

    const req = new Request(`http://localhost/api/mcp/servers/${s.id}`, {
      method: "DELETE",
    });
    const res = await deleteServer(req, { params: Promise.resolve({ id: s.id }) });
    expect(res.status).toBe(200);
    expect(mockPm.stopServer).toHaveBeenCalledWith(s.id);
  });

  it("handles restart endpoint", async () => {
    const s = await mcpRepo.createMcpServer({ id: "s5", name: "srv-5", transport: "stdio", command: "node", enabled: true });

    const req = new Request(`http://localhost/api/mcp/servers/${s.id}/restart`, {
      method: "POST",
    });
    const res = await restartServer(req, { params: Promise.resolve({ id: s.id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockPm.stopServer).toHaveBeenCalledWith(s.id);
    expect(mockPm.startServer).toHaveBeenCalled();
  });
});
