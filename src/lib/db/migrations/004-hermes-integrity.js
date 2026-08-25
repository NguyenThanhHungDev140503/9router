import { TABLES } from "../schema.js";

function hasColumn(db, tableName, columnName) {
  return db.all(`PRAGMA table_info(${tableName})`).some((column) => column.name === columnName);
}

function getDuplicateGroups(db, tableName, columns) {
  const select = columns.join(", ");
  return db.all(`
    SELECT ${select}, COUNT(*) AS count
    FROM ${tableName}
    GROUP BY ${select}
    HAVING COUNT(*) > 1
  `);
}

function describeDuplicates(tableName, groups) {
  return `${tableName}: ${groups.slice(0, 5).map((group) => `${JSON.stringify(group)} `).join("")}${groups.length > 5 ? `(+${groups.length - 5} more)` : ""}`;
}

export default {
  version: 4,
  name: "hermes-integrity",
  up(db) {
    const duplicateSteps = getDuplicateGroups(db, "hermesTaskSteps", ["taskId", "stepIndex"]);
    const duplicateRevisions = getDuplicateGroups(db, "blackboardRevisions", ["entryId", "revision"]);
    if (duplicateSteps.length || duplicateRevisions.length) {
      const conflicts = [
        duplicateSteps.length && describeDuplicates("hermesTaskSteps", duplicateSteps),
        duplicateRevisions.length && describeDuplicates("blackboardRevisions", duplicateRevisions),
      ].filter(Boolean).join("; ");
      throw new Error(`[DB][migrate] hermes-integrity blocked: duplicate legacy records would violate new unique constraints. Resolve or archive conflicts before retrying. ${conflicts}`);
    }

    // Version 3 databases lack blackboard.revision. Fresh databases already
    // have it because migrations build tables from current TABLES.
    if (!hasColumn(db, "blackboard", "revision")) {
      db.exec("ALTER TABLE blackboard ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)");
    }

    // Seed current revision from existing audit history before enabling
    // optimistic locking. Existing rows without history remain at revision 0.
    db.exec(`
      UPDATE blackboard
      SET revision = COALESCE((
        SELECT MAX(r.revision)
        FROM blackboardRevisions r
        WHERE r.entryId = blackboard.id
      ), 0)
    `);

    for (const index of TABLES.hermesTaskSteps.indexes || []) db.exec(index);
    for (const index of TABLES.blackboard.indexes || []) db.exec(index);
    for (const index of TABLES.blackboardRevisions.indexes || []) db.exec(index);
  },
};
