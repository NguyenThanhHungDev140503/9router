import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

describe("MCP & Skills DB Repository", () => {
  let tempDir;
  let db;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-mcp-db-test-"));
    process.env.DATA_DIR = tempDir;
    vi.resetModules();
    db = await import("@/lib/db/index.js");
    await db.initDb();
  });

  afterAll(() => {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("creates, reads, updates, and deletes MCP servers", async () => {
    const server = await db.createMcpServer({
      name: "test-mcp-server",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: { DEBUG: "1" },
      enabled: true,
    });

    expect(server.id).toBeDefined();
    expect(server.name).toBe("test-mcp-server");
    expect(server.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]);
    expect(server.env).toEqual({ DEBUG: "1" });
    expect(server.enabled).toBe(true);

    const fetched = await db.getMcpServerById(server.id);
    expect(fetched).toMatchObject({
      id: server.id,
      name: "test-mcp-server",
      transport: "stdio",
    });

    const byName = await db.getMcpServerByName("test-mcp-server");
    expect(byName?.id).toBe(server.id);

    const updated = await db.updateMcpServer(server.id, {
      enabled: false,
      command: "node",
    });
    expect(updated.enabled).toBe(false);
    expect(updated.command).toBe("node");

    const enabledServers = await db.getEnabledMcpServers();
    expect(enabledServers.some((s) => s.id === server.id)).toBe(false);

    const allServers = await db.getMcpServers();
    expect(allServers.some((s) => s.id === server.id)).toBe(true);

    await db.deleteMcpServer(server.id);
    const afterDelete = await db.getMcpServerById(server.id);
    expect(afterDelete).toBeNull();
  });

  it("handles MCP tools cache CRUD and cascading delete", async () => {
    const server = await db.createMcpServer({
      name: "cache-test-server",
      transport: "sse",
      url: "http://localhost:8000/sse",
    });

    const sampleTools = [
      {
        name: "test_tool",
        description: "Test tool description",
        inputSchema: { type: "object", properties: { q: { type: "string" } } },
      },
    ];

    const cached = await db.saveMcpToolsCache(server.id, sampleTools);
    expect(cached.serverId).toBe(server.id);
    expect(cached.tools).toHaveLength(1);
    expect(cached.tools[0].name).toBe("test_tool");

    const fetchedCache = await db.getMcpToolsCache(server.id);
    expect(fetchedCache.tools).toEqual(sampleTools);

    const allCaches = await db.getAllMcpToolsCache();
    expect(allCaches.some((c) => c.serverId === server.id)).toBe(true);

    // Test delete cache directly
    await db.deleteMcpToolsCache(server.id);
    expect(await db.getMcpToolsCache(server.id)).toBeNull();

    // Re-save and test cascading delete with deleteMcpServer
    await db.saveMcpToolsCache(server.id, sampleTools);
    await db.deleteMcpServer(server.id);
    expect(await db.getMcpToolsCache(server.id)).toBeNull();
  });

  it("creates, reads, updates, and deletes Custom Skills", async () => {
    const skill = await db.createSkill({
      name: "code-reviewer",
      description: "Automated code reviewer prompt",
      systemPrompt: "You are an expert code reviewer.",
      enabled: true,
      matchRules: { providers: ["anthropic", "openai"] },
    });

    expect(skill.id).toBeDefined();
    expect(skill.name).toBe("code-reviewer");
    expect(skill.systemPrompt).toBe("You are an expert code reviewer.");
    expect(skill.matchRules).toEqual({ providers: ["anthropic", "openai"] });

    const fetched = await db.getSkillById(skill.id);
    expect(fetched.name).toBe("code-reviewer");

    const byName = await db.getSkillByName("code-reviewer");
    expect(byName?.id).toBe(skill.id);

    const updated = await db.updateSkill(skill.id, {
      enabled: false,
      systemPrompt: "Updated prompt",
    });
    expect(updated.enabled).toBe(false);
    expect(updated.systemPrompt).toBe("Updated prompt");

    const enabledSkills = await db.getEnabledSkills();
    expect(enabledSkills.some((s) => s.id === skill.id)).toBe(false);

    await db.deleteSkill(skill.id);
    expect(await db.getSkillById(skill.id)).toBeNull();
  });

  it("creates, reads, updates, and deletes Gateway Tool Rules", async () => {
    const rule = await db.createGatewayToolRule({
      toolName: "mcp__filesystem__delete_file",
      action: "block",
      timeoutMs: 15000,
      enabled: true,
    });

    expect(rule.id).toBeDefined();
    expect(rule.toolName).toBe("mcp__filesystem__delete_file");
    expect(rule.action).toBe("block");
    expect(rule.timeoutMs).toBe(15000);

    const fetched = await db.getGatewayToolRuleByToolName("mcp__filesystem__delete_file");
    expect(fetched.id).toBe(rule.id);

    const updated = await db.updateGatewayToolRule(rule.id, {
      action: "auto_execute",
      timeoutMs: 45000,
    });
    expect(updated.action).toBe("auto_execute");
    expect(updated.timeoutMs).toBe(45000);

    const allRules = await db.getGatewayToolRules();
    expect(allRules.some((r) => r.id === rule.id)).toBe(true);

    await db.deleteGatewayToolRule(rule.id);
    expect(await db.getGatewayToolRuleByToolName("mcp__filesystem__delete_file")).toBeNull();
  });
});
