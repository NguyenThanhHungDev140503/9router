import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import migration007 from "@/lib/db/migrations/007-usage-user-composite-indexes.js";

describe("Migration 007: Usage User Composite Indexes", () => {
  it("should create composite indexes with userId ASC then timestamp DESC", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE usageHistory (id INTEGER PRIMARY KEY, timestamp TEXT, userId TEXT);
      CREATE TABLE requestDetails (id TEXT PRIMARY KEY, timestamp TEXT, userId TEXT);
    `);

    migration007.up(db);

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
    expect(indexes).toContain("idx_uh_user_ts");
    expect(indexes).toContain("idx_rd_user_ts");
    for (const indexName of ["idx_uh_user_ts", "idx_rd_user_ts"]) {
      const columns = db.prepare(`PRAGMA index_xinfo(${indexName})`).all()
        .filter((row) => row.key)
        .sort((a, b) => a.seqno - b.seqno);
      expect(columns.map((row) => row.name)).toEqual(["userId", "timestamp"]);
      expect(columns.map((row) => row.desc)).toEqual([0, 1]);
    }
  });
});
