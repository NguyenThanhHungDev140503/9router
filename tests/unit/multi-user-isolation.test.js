import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

describe("Multi-User Isolation Suite", () => {
  let tempDir;
  let db;
  let sseAuth;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-multiuser-test-"));
    process.env.DATA_DIR = tempDir;
    vi.resetModules();
    db = await import("@/lib/db/index.js");
    sseAuth = await import("@/sse/services/auth.js");
    await db.initDb();
  });

  afterAll(() => {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("isolates provider connections per user", async () => {
    const alice = await db.createUser({ username: "alice_conn", password: "pwd", role: "user" });
    const bob = await db.createUser({ username: "bob_conn", password: "pwd", role: "user" });

    // Create connection for Alice
    const connAlice = await db.createProviderConnection({
      provider: "openai",
      authType: "apikey",
      name: "Alice OpenAI Key",
      apiKey: "sk-alice-12345",
      userId: alice.id,
      isActive: true,
    });

    // Create connection for Bob
    const connBob = await db.createProviderConnection({
      provider: "openai",
      authType: "apikey",
      name: "Bob OpenAI Key",
      apiKey: "sk-bob-67890",
      userId: bob.id,
      isActive: true,
    });

    // Alice queries connections
    const aliceConns = await db.getProviderConnections({ userId: alice.id });
    expect(aliceConns.length).toBe(1);
    expect(aliceConns[0].id).toBe(connAlice.id);
    expect(aliceConns[0].name).toBe("Alice OpenAI Key");

    // Bob queries connections
    const bobConns = await db.getProviderConnections({ userId: bob.id });
    expect(bobConns.length).toBe(1);
    expect(bobConns[0].id).toBe(connBob.id);
    expect(bobConns[0].name).toBe("Bob OpenAI Key");

    // Admin queries all connections
    const allConns = await db.getProviderConnections();
    expect(allConns.some((c) => c.id === connAlice.id)).toBe(true);
    expect(allConns.some((c) => c.id === connBob.id)).toBe(true);
  });

  it("isolates API keys per user and resolves user from API key", async () => {
    const alice = await db.createUser({ username: "alice_key", password: "pwd", role: "user" });
    const bob = await db.createUser({ username: "bob_key", password: "pwd", role: "user" });

    const keyAlice = await db.createApiKey("Alice Key", "test-machine", { userId: alice.id });
    const keyBob = await db.createApiKey("Bob Key", "test-machine", { userId: bob.id });

    // Verify key queries are scoped
    const aliceKeys = await db.getApiKeys({ userId: alice.id });
    expect(aliceKeys.length).toBe(1);
    expect(aliceKeys[0].id).toBe(keyAlice.id);

    const bobKeys = await db.getApiKeys({ userId: bob.id });
    expect(bobKeys.length).toBe(1);
    expect(bobKeys[0].id).toBe(keyBob.id);

    // Gateway resolves user from API key
    const keyInfoAlice = await sseAuth.getApiKeyInfo(keyAlice.key);
    expect(keyInfoAlice).toBeDefined();
    expect(keyInfoAlice.userId).toBe(alice.id);

    const keyInfoBob = await sseAuth.getApiKeyInfo(keyBob.key);
    expect(keyInfoBob).toBeDefined();
    expect(keyInfoBob.userId).toBe(bob.id);
  });

  it("isolates provider credentials selection in gateway per user", async () => {
    const alice = await db.createUser({ username: "alice_gw", password: "pwd", role: "user" });
    const bob = await db.createUser({ username: "bob_gw", password: "pwd", role: "user" });

    const connAlice = await db.createProviderConnection({
      provider: "anthropic",
      authType: "apikey",
      name: "Alice Anthropic",
      apiKey: "sk-ant-alice",
      userId: alice.id,
      isActive: true,
    });

    const connBob = await db.createProviderConnection({
      provider: "anthropic",
      authType: "apikey",
      name: "Bob Anthropic",
      apiKey: "sk-ant-bob",
      userId: bob.id,
      isActive: true,
    });

    // Gateway gets credentials for Alice
    const credsAlice = await sseAuth.getProviderCredentials("anthropic", null, "claude-3-opus", {
      userId: alice.id,
    });
    expect(credsAlice).toBeDefined();
    expect(credsAlice.connectionId).toBe(connAlice.id);
    expect(credsAlice.apiKey).toBe("sk-ant-alice");

    // Gateway gets credentials for Bob
    const credsBob = await sseAuth.getProviderCredentials("anthropic", null, "claude-3-opus", {
      userId: bob.id,
    });
    expect(credsBob).toBeDefined();
    expect(credsBob.connectionId).toBe(connBob.id);
    expect(credsBob.apiKey).toBe("sk-ant-bob");
  });

  it("isolates combos, nodes, proxy pools, mcp, and skills per user", async () => {
    const user1 = await db.createUser({ username: "user1_iso", password: "pwd", role: "user" });
    const user2 = await db.createUser({ username: "user2_iso", password: "pwd", role: "user" });

    // Combos
    const combo1 = await db.createCombo({ name: "combo-u1", models: ["m1"], userId: user1.id });
    const combo2 = await db.createCombo({ name: "combo-u2", models: ["m2"], userId: user2.id });

    expect((await db.getCombos({ userId: user1.id })).map((c) => c.id)).toEqual([combo1.id]);
    expect((await db.getCombos({ userId: user2.id })).map((c) => c.id)).toEqual([combo2.id]);

    // Nodes
    const node1 = await db.createProviderNode({
      name: "node-1",
      prefix: "n1",
      apiType: "chat",
      baseUrl: "https://api.openai.com/v1",
      userId: user1.id,
    });
    const node2 = await db.createProviderNode({
      name: "node-2",
      prefix: "n2",
      apiType: "chat",
      baseUrl: "https://api.openai.com/v1",
      userId: user2.id,
    });

    expect((await db.getProviderNodes({ userId: user1.id })).map((n) => n.id)).toEqual([node1.id]);
    expect((await db.getProviderNodes({ userId: user2.id })).map((n) => n.id)).toEqual([node2.id]);

    // Proxy pools
    const pool1 = await db.createProxyPool({
      name: "pool-1",
      proxyUrl: "http://proxy1:8080",
      userId: user1.id,
    });
    const pool2 = await db.createProxyPool({
      name: "pool-2",
      proxyUrl: "http://proxy2:8080",
      userId: user2.id,
    });

    expect((await db.getProxyPools({ userId: user1.id })).map((p) => p.id)).toEqual([pool1.id]);
    expect((await db.getProxyPools({ userId: user2.id })).map((p) => p.id)).toEqual([pool2.id]);

    // MCP
    const mcp1 = await db.createMcpServer({
      name: "mcp-server-1",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      userId: user1.id,
    });
    const mcp2 = await db.createMcpServer({
      name: "mcp-server-2",
      transport: "stdio",
      command: "node",
      args: ["server2.js"],
      userId: user2.id,
    });

    expect((await db.getMcpServers({ userId: user1.id })).map((m) => m.id)).toEqual([mcp1.id]);
    expect((await db.getMcpServers({ userId: user2.id })).map((m) => m.id)).toEqual([mcp2.id]);

    // Skills
    const skill1 = await db.createSkill({
      name: "skill-1",
      systemPrompt: "You are skill 1",
      userId: user1.id,
    });
    const skill2 = await db.createSkill({
      name: "skill-2",
      systemPrompt: "You are skill 2",
      userId: user2.id,
    });

    expect((await db.getSkills({ userId: user1.id })).map((s) => s.id)).toEqual([skill1.id]);
    expect((await db.getSkills({ userId: user2.id })).map((s) => s.id)).toEqual([skill2.id]);
  });

  it("isolates usage history and request details per user", async () => {
    const userA = await db.createUser({ username: "user_usage_a", password: "pwd", role: "user" });
    const userB = await db.createUser({ username: "user_usage_b", password: "pwd", role: "user" });

    // Save usage for User A
    await db.saveRequestUsage({
      provider: "openai",
      model: "gpt-4o",
      userId: userA.id,
      tokens: { prompt_tokens: 100, completion_tokens: 50 },
      timestamp: new Date().toISOString(),
    });

    // Save usage for User B
    await db.saveRequestUsage({
      provider: "anthropic",
      model: "claude-3-sonnet",
      userId: userB.id,
      tokens: { prompt_tokens: 200, completion_tokens: 80 },
      timestamp: new Date().toISOString(),
    });

    // Query usage history
    const historyA = await db.getUsageHistory({ userId: userA.id });
    expect(historyA.length).toBe(1);
    expect(historyA[0].provider).toBe("openai");

    const historyB = await db.getUsageHistory({ userId: userB.id });
    expect(historyB.length).toBe(1);
    expect(historyB[0].provider).toBe("anthropic");
  });

  it("cascades tenant resources when a user is deleted", async () => {
    const user = await db.createUser({ username: "to_be_deleted", password: "pwd", role: "user" });

    await db.createProviderConnection({
      provider: "google",
      authType: "apikey",
      name: "Google Connection",
      apiKey: "test-google-key",
      userId: user.id,
    });

    await db.createApiKey("User Key", "machine-del", { userId: user.id });

    // Delete user
    await db.deleteUser(user.id);

    // Verify user and owned resources are deleted
    expect(await db.getUserById(user.id)).toBeNull();
    expect(await db.getProviderConnections({ userId: user.id })).toEqual([]);
    expect(await db.getApiKeys({ userId: user.id })).toEqual([]);
  });

  it("allows user to access shared provider connections when private connection is absent", async () => {
    const admin = await db.createUser({ username: "admin_shared_test", password: "pwd", role: "admin" });
    const user = await db.createUser({ username: "user_shared_test", password: "pwd", role: "user" });

    // Admin creates a shared connection
    const sharedConn = await db.createProviderConnection({
      provider: "groq",
      authType: "apikey",
      name: "Shared Groq Key",
      apiKey: "gsk-shared-12345",
      isShared: true,
      userId: admin.id,
      isActive: true,
    });

    // User has no private connection, gateway falls back to shared
    const creds = await sseAuth.getProviderCredentials("groq", null, "llama-3.3-70b", {
      userId: user.id,
    });
    expect(creds).toBeDefined();
    expect(creds.connectionId).toBe(sharedConn.id);
    expect(creds.apiKey).toBe("gsk-shared-12345");

    // User adds private connection, gateway prefers private
    const userConn = await db.createProviderConnection({
      provider: "groq",
      authType: "apikey",
      name: "User Private Groq Key",
      apiKey: "gsk-user-private",
      isShared: false,
      userId: user.id,
      isActive: true,
    });

    const userCreds = await sseAuth.getProviderCredentials("groq", null, "llama-3.3-70b", {
      userId: user.id,
    });
    expect(userCreds).toBeDefined();
    expect(userCreds.connectionId).toBe(userConn.id);
    expect(userCreds.apiKey).toBe("gsk-user-private");
  });

});
