import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-hermes-mig-"));
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

const tables = [
  "hermesBots",
  "hermesTasks",
  "hermesTaskSteps",
  "blackboard",
  "blackboardLinks",
  "blackboardRevisions",
  "swarmSessions",
  "swarmBots",
  "swarmPheromones",
  "swarmColonyIterations",
  "swarmConvergenceMetrics",
];

describe("Hermes and swarm schema migration", () => {
  it("creates all Hermes tables and indexes through the migration chain", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const { latestVersion } = await import("@/lib/db/migrations/index.js");
    const db = await getAdapter();

    expect(Number(db.get("SELECT value FROM _meta WHERE key = 'schemaVersion'").value)).toBe(latestVersion());
    const createdTables = db.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name);
    expect(createdTables).toEqual(expect.arrayContaining(tables));

    for (const table of tables) {
      expect(db.all(`PRAGMA table_info(${table})`).length).toBeGreaterThan(0);
      expect(db.all(`PRAGMA index_list(${table})`).length).toBeGreaterThan(0);
    }
    expect(db.all("PRAGMA index_list(hermesTaskSteps)").some((row) => row.name === "idx_hermesTaskSteps_task_step" && row.unique === 1)).toBe(true);
    expect(db.all("PRAGMA table_info(blackboard)").some((row) => row.name === "revision")).toBe(true);
  });

  it("enforces representative defaults and constraints", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const db = await getAdapter();

    db.run("INSERT INTO hermesBots (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)", ["bot-1", "worker", "now", "now"]);
    const bot = db.get("SELECT role, toolWhitelist, capabilityWeights, enabled FROM hermesBots WHERE id = ?", ["bot-1"]);
    expect(bot).toEqual({ role: "worker", toolWhitelist: "[]", capabilityWeights: "{}", enabled: 1 });

    expect(() => db.run("INSERT INTO hermesBots (id, name, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)", ["bot-2", "bad", "invalid", "now", "now"])).toThrow();
    expect(() => db.run("INSERT INTO hermesTasks (id, title, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)", ["task-1", "bad", "invalid", "now", "now"])).toThrow();
  });

  it("blocks migration instead of deleting duplicate legacy steps", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const { default: integrityMigration } = await import("@/lib/db/migrations/004-hermes-integrity.js");
    const db = await getAdapter();

    db.exec("DROP INDEX idx_hermesTaskSteps_task_step");
    db.run("INSERT INTO hermesTasks (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)", ["task-duplicate", "task", "now", "now"]);
    db.run("INSERT INTO hermesTaskSteps (id, taskId, stepIndex, createdAt) VALUES (?, ?, ?, ?)", ["step-1", "task-duplicate", 0, "now"]);
    db.run("INSERT INTO hermesTaskSteps (id, taskId, stepIndex, createdAt) VALUES (?, ?, ?, ?)", ["step-2", "task-duplicate", 0, "later"]);

    expect(() => integrityMigration.up(db)).toThrow("duplicate legacy records");

    expect(db.get("SELECT COUNT(*) AS count FROM hermesTaskSteps WHERE taskId = ? AND stepIndex = 0", ["task-duplicate"]).count).toBe(2);
  });

  it("upgrades a persisted version 3 database without losing blackboard data", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const db = await getAdapter();

    db.run(
      "INSERT INTO blackboard (id, content, tags, category, validityScore, confidenceScore, metadata, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["legacy-entry", "kept during upgrade", '["legacy"]', "fact", 0.75, 0.5, '{"origin":"v3"}', "before", "before"],
    );
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP INDEX IF EXISTS idx_hermesTaskSteps_task_step");
    db.exec("DROP INDEX IF EXISTS idx_blackboardRevisions_entry_revision");
    db.exec(`
      CREATE TABLE blackboard_v3 (
        id TEXT PRIMARY KEY,
        swarmId TEXT REFERENCES swarmSessions(id) ON DELETE CASCADE,
        authorBotId TEXT REFERENCES hermesBots(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        category TEXT NOT NULL DEFAULT 'fact' CHECK (category IN ('fact', 'code_snippet', 'hypothesis', 'critique', 'solution')),
        validityScore REAL NOT NULL DEFAULT 1.0 CHECK (validityScore >= 0 AND validityScore <= 1),
        confidenceScore REAL NOT NULL DEFAULT 0.0 CHECK (confidenceScore >= 0 AND confidenceScore <= 1),
        metadata TEXT NOT NULL DEFAULT '{}',
        source TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        expiresAt TEXT
      );
      INSERT INTO blackboard_v3 (id, swarmId, authorBotId, content, tags, category, validityScore, confidenceScore, metadata, source, createdAt, updatedAt, expiresAt)
      SELECT id, swarmId, authorBotId, content, tags, category, validityScore, confidenceScore, metadata, source, createdAt, updatedAt, expiresAt
      FROM blackboard;
      DROP TABLE blackboard;
      ALTER TABLE blackboard_v3 RENAME TO blackboard;
    `);
    db.exec("PRAGMA foreign_keys = ON");
    db.run("UPDATE _meta SET value = '3' WHERE key = 'schemaVersion'");
    db.run("UPDATE _meta SET value = '3' WHERE key = 'backupSchemaVersion'");

    expect(db.all("PRAGMA table_info(blackboard)").map((column) => column.name)).not.toContain("revision");
    expect(db.all("PRAGMA index_list(hermesTaskSteps)").map((index) => index.name)).not.toContain("idx_hermesTaskSteps_task_step");
    db.close?.();

    delete global._dbAdapter;
    vi.resetModules();

    const { getAdapter: getUpgradedAdapter } = await import("@/lib/db/driver.js");
    const { latestVersion } = await import("@/lib/db/migrations/index.js");
    const upgraded = await getUpgradedAdapter();

    expect(Number(upgraded.get("SELECT value FROM _meta WHERE key = 'schemaVersion'").value)).toBe(latestVersion());
    expect(upgraded.get("SELECT id, content, metadata, revision FROM blackboard WHERE id = ?", ["legacy-entry"])).toEqual({
      id: "legacy-entry",
      content: "kept during upgrade",
      metadata: '{"origin":"v3"}',
      revision: 0,
    });
    expect(upgraded.all("PRAGMA index_list(hermesTaskSteps)").some((index) => index.name === "idx_hermesTaskSteps_task_step" && index.unique === 1)).toBe(true);
    expect(upgraded.all("PRAGMA index_list(blackboardRevisions)").some((index) => index.name === "idx_blackboardRevisions_entry_revision" && index.unique === 1)).toBe(true);
  });
});
