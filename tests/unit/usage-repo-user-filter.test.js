import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;
let getUsageStats;
let getChartData;
let getRequestDetails;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-usage-user-filter-"));
  process.env.DATA_DIR = tempDir;

  const dbModule = await import("@/lib/db/index.js");
  const usageRepo = await import("@/lib/db/repos/usageRepo.js");
  const requestDetailsRepo = await import("@/lib/db/repos/requestDetailsRepo.js");
  db = await import("@/lib/db/driver.js");
  await dbModule.initDb();
  getUsageStats = usageRepo.getUsageStats;
  getChartData = usageRepo.getChartData;
  getRequestDetails = requestDetailsRepo.getRequestDetails;

  const adapter = await db.getAdapter();
  const now = new Date().toISOString();
  adapter.run("INSERT INTO users(id, username, password_hash, role, is_active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    "user-1", "alice", "unused", "user", 1, now, now,
  ]);
  adapter.run("INSERT INTO users(id, username, password_hash, role, is_active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    "user-2", "bob", "unused", "user", 1, now, now,
  ]);

  const usageRows = [
    ["user-1"],
    ["user-2"],
    [null],
    [""],
  ];
  for (const [userId] of usageRows) {
    adapter.run(
      `INSERT INTO usageHistory(timestamp, provider, model, userId, promptTokens, completionTokens, cost, status, tokens, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [now, "openai", "gpt-test", userId, 10, 5, 1, "ok", JSON.stringify({ prompt_tokens: 10, completion_tokens: 5 }), "{}"],
    );
  }
  adapter.run(
    `INSERT INTO requestDetails(id, timestamp, provider, model, userId, status, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["detail-user-1", now, "openai", "gpt-test", "user-1", "ok", JSON.stringify({ id: "detail-user-1", userId: "user-1" })],
  );
  adapter.run(
    `INSERT INTO requestDetails(id, timestamp, provider, model, userId, status, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["detail-unassigned", now, "openai", "gpt-test", null, "ok", JSON.stringify({ id: "detail-unassigned" })],
  );
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("usageRepo user filtering", () => {
  it("filters stats by specific userId", async () => {
    const stats = await getUsageStats("24h", { userId: "user-1" });

    expect(stats.totalRequests).toBe(1);
    expect(stats.totalPromptTokens).toBe(10);
    expect(stats.totalCompletionTokens).toBe(5);
  });

  it("filters stats and chart data by unassigned userId", async () => {
    const stats = await getUsageStats("24h", { userId: "unassigned" });
    const chart = await getChartData("24h", { userId: "unassigned" });

    expect(stats.totalRequests).toBe(2);
    expect(stats.totalPromptTokens).toBe(20);
    expect(chart.reduce((sum, bucket) => sum + bucket.tokens, 0)).toBe(30);
  });

  it("joins users table to provide username in request details", async () => {
    const assigned = await getRequestDetails({ userId: "user-1" });
    const unassigned = await getRequestDetails({ userId: "unassigned" });

    expect(assigned.details).toEqual([expect.objectContaining({ id: "detail-user-1", username: "alice" })]);
    expect(unassigned.details).toEqual([expect.objectContaining({ id: "detail-unassigned", username: null })]);
  });
});
