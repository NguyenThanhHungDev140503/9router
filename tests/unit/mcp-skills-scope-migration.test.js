import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-mcp-scope-mig-"));
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

describe("006-mcp-skills-scope migration", () => {
  it("keeps legacy owner rows private and permits duplicate names across different owners", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const { latestVersion } = await import("@/lib/db/migrations/index.js");
    const db = await getAdapter();

    expect(Number(db.get("SELECT value FROM _meta WHERE key = 'schemaVersion'").value)).toBe(latestVersion());

    const now = new Date().toISOString();
    // Insert server and skill for user-a
    db.run(
      "INSERT INTO mcpServers (id, name, transport, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      ["srv-id-1", "cognee", "stdio", "user-a", now, now]
    );
    db.run(
      "INSERT INTO skills (id, name, systemPrompt, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      ["skill-id-1", "review", "prompt a", "user-a", now, now]
    );

    const srv = db.get("SELECT id, name, userId, isShared FROM mcpServers WHERE id = ?", ["srv-id-1"]);
    expect(srv).toMatchObject({
      id: "srv-id-1",
      name: "cognee",
      userId: "user-a",
      isShared: 0,
    });

    const skill = db.get("SELECT id, name, userId, isShared FROM skills WHERE id = ?", ["skill-id-1"]);
    expect(skill).toMatchObject({
      id: "skill-id-1",
      name: "review",
      userId: "user-a",
      isShared: 0,
    });

    // Another user can create MCP / Skill with the same name
    expect(() => {
      db.run(
        "INSERT INTO mcpServers (id, name, transport, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        ["srv-id-2", "cognee", "stdio", "user-b", now, now]
      );
      db.run(
        "INSERT INTO skills (id, name, systemPrompt, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        ["skill-id-2", "review", "prompt b", "user-b", now, now]
      );
    }).not.toThrow();

    const srvCount = db.get("SELECT COUNT(*) AS count FROM mcpServers WHERE name = ?", ["cognee"]).count;
    expect(srvCount).toBe(2);

    const skillCount = db.get("SELECT COUNT(*) AS count FROM skills WHERE name = ?", ["review"]).count;
    expect(skillCount).toBe(2);
  });

  it("rejects duplicate MCP or Skill names for the same owner", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const db = await getAdapter();
    const now = new Date().toISOString();

    db.run(
      "INSERT INTO mcpServers (id, name, transport, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      ["srv-id-1", "my-server", "stdio", "user-a", now, now]
    );
    db.run(
      "INSERT INTO skills (id, name, systemPrompt, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      ["skill-id-1", "my-skill", "prompt", "user-a", now, now]
    );

    expect(() => {
      db.run(
        "INSERT INTO mcpServers (id, name, transport, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        ["srv-id-2", "my-server", "stdio", "user-a", now, now]
      );
    }).toThrow();

    expect(() => {
      db.run(
        "INSERT INTO skills (id, name, systemPrompt, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        ["skill-id-2", "my-skill", "prompt 2", "user-a", now, now]
      );
    }).toThrow();
  });
});
