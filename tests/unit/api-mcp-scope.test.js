import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body, init) => ({
      status: init?.status || 200,
      json: async () => body,
      body,
    }),
  },
}));

let mockSession = null;
vi.mock("@/lib/auth/dashboardSession.js", () => ({
  getDashboardAuthSession: vi.fn(async (tok) => mockSession),
}));

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-api-mcp-scope-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("MCP & Skills Scoped Repositories and APIs", () => {
  it("returns owner private rows before same-name shared rows in repository", async () => {
    const { createMcpServer, getAccessibleMcpServers } = await import("@/lib/db/repos/mcpRepo.js");
    const { createSkill, getAccessibleSkills } = await import("@/lib/db/repos/skillsRepo.js");

    await createMcpServer({
      id: "srv-shared",
      name: "cognee",
      transport: "stdio",
      command: "echo shared",
      userId: "admin-1",
      isShared: true,
    });
    const privateSrv = await createMcpServer({
      id: "srv-private-a",
      name: "cognee",
      transport: "stdio",
      command: "echo private",
      userId: "user-a",
      isShared: false,
    });

    const srvRows = await getAccessibleMcpServers({ userId: "user-a" });
    const cogneeServers = srvRows.filter((r) => r.name === "cognee");
    expect(cogneeServers).toHaveLength(1);
    expect(cogneeServers[0].id).toBe(privateSrv.id);
    expect(cogneeServers[0].command).toBe("echo private");

    // Another user gets shared row
    const userBServers = await getAccessibleMcpServers({ userId: "user-b" });
    const cogneeForB = userBServers.filter((r) => r.name === "cognee");
    expect(cogneeForB).toHaveLength(1);
    expect(cogneeForB[0].id).toBe("srv-shared");

    // Skills
    await createSkill({
      id: "skill-shared",
      name: "review",
      systemPrompt: "shared prompt",
      userId: "admin-1",
      isShared: true,
    });
    const privateSkill = await createSkill({
      id: "skill-private-a",
      name: "review",
      systemPrompt: "private prompt",
      userId: "user-a",
      isShared: false,
    });

    const skillRows = await getAccessibleSkills({ userId: "user-a" });
    const reviewSkills = skillRows.filter((s) => s.name === "review");
    expect(reviewSkills).toHaveLength(1);
    expect(reviewSkills[0].id).toBe(privateSkill.id);
    expect(reviewSkills[0].systemPrompt).toBe("private prompt");
  });

  it("does not let a non-owner mutate another user's shared row", async () => {
    const { createSkill, updateSkill, deleteSkill, getSkillById } = await import("@/lib/db/repos/skillsRepo.js");
    const { createMcpServer, updateMcpServer, deleteMcpServer } = await import("@/lib/db/repos/mcpRepo.js");

    const sharedSkill = await createSkill({
      id: "skill-shared-2",
      name: "writer",
      systemPrompt: "shared writer",
      userId: "admin-1",
      isShared: true,
    });

    const updated = await updateSkill(
      sharedSkill.id,
      { systemPrompt: "hacked" },
      { userId: "user-a", isAdmin: false, mutation: true }
    );
    expect(updated).toBeNull();

    const notDeleted = await deleteSkill(sharedSkill.id, { userId: "user-a", isAdmin: false, mutation: true });
    expect(notDeleted).toBe(false);

    const s = await getSkillById(sharedSkill.id, { userId: "user-a", isAdmin: false });
    expect(s.systemPrompt).toBe("shared writer");

    // Admin can mutate
    const adminUpdated = await updateSkill(
      sharedSkill.id,
      { systemPrompt: "admin updated" },
      { userId: "admin-1", isAdmin: true, mutation: true }
    );
    expect(adminUpdated).not.toBeNull();
    expect(adminUpdated.systemPrompt).toBe("admin updated");
  });

  it("enforces authentication and authorization on MCP and Skills API routes", async () => {
    const { POST: createServerRoute, GET: listServersRoute } = await import("@/app/api/mcp/servers/route.js");
    const { GET: getServerRoute, DELETE: deleteServerRoute } = await import("@/app/api/mcp/servers/[id]/route.js");
    const { POST: testMcpRoute } = await import("@/app/api/mcp/test/route.js");
    const { POST: createSkillRoute, GET: listSkillsRoute } = await import("@/app/api/skills/route.js");

    // 1. Unauthenticated request -> 401
    mockSession = null;
    const unauthReq = new Request("http://localhost/api/mcp/servers");
    const unauthRes = await listServersRoute(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 2. User A creates private server and skill
    mockSession = { id: "user-a", role: "user", username: "user-a" };
    const createReq = new Request("http://localhost/api/mcp/servers", {
      method: "POST",
      body: JSON.stringify({
        name: "private-a-server",
        transport: "stdio",
        command: "ls",
      }),
      headers: { "content-type": "application/json", cookie: "auth_token=tok" },
    });
    const createRes = await createServerRoute(createReq);
    expect(createRes.status).toBe(201);
    const createdServer = (await createRes.json()).server;

    // Non-admin attempting to create shared server -> 403
    const shareReq = new Request("http://localhost/api/mcp/servers", {
      method: "POST",
      body: JSON.stringify({
        name: "shared-attempt",
        transport: "stdio",
        command: "ls",
        isShared: true,
      }),
      headers: { "content-type": "application/json", cookie: "auth_token=tok" },
    });
    const shareRes = await createServerRoute(shareReq);
    expect(shareRes.status).toBe(403);

    // Non-admin attempting ephemeral test -> 403
    const testReq = new Request("http://localhost/api/mcp/test", {
      method: "POST",
      body: JSON.stringify({
        action: "ping",
        serverConfig: { name: "ephem", transport: "stdio", command: "whoami" },
      }),
      headers: { "content-type": "application/json", cookie: "auth_token=tok" },
    });
    const testRes = await testMcpRoute(testReq);
    expect(testRes.status).toBe(403);

    // 3. User B cannot access User A's private server -> 404
    mockSession = { id: "user-b", role: "user", username: "user-b" };
    const getOtherReq = new Request(`http://localhost/api/mcp/servers/${createdServer.id}`, {
      headers: { cookie: "auth_token=tok" },
    });
    const getOtherRes = await getServerRoute(getOtherReq, { params: Promise.resolve({ id: createdServer.id }) });
    expect(getOtherRes.status).toBe(404);

    const deleteOtherRes = await deleteServerRoute(getOtherReq, { params: Promise.resolve({ id: createdServer.id }) });
    expect(deleteOtherRes.status).toBe(404);
  });
});
