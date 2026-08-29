import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import migration006 from "@/lib/db/migrations/006-usage-user-composite-indexes.js";

describe("Migration 006: Usage User Composite Indexes", () => {
  it("should create composite indexes on usageHistory and requestDetails", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE usageHistory (id INTEGER PRIMARY KEY, timestamp TEXT, userId TEXT);
      CREATE TABLE requestDetails (id TEXT PRIMARY KEY, timestamp TEXT, userId TEXT);
    `);

    migration006.up(db);

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
    expect(indexes).toContain("idx_uh_user_ts");
    expect(indexes).toContain("idx_rd_user_ts");
  });
});
