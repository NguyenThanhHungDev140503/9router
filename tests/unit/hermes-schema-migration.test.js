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
});
