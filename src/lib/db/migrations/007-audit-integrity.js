export default {
  version: 7,
  name: "audit-integrity",
  up(db) {
    const invalid = [
      ["blackboardAuditLog", "entryId", 256],
      ["blackboardAuditLog", "swarmId", 256],
      ["blackboardAuditLog", "actorId", 256],
      ["repositoryAuditLog", "actorId", 256],
      ["repositoryAuditLog", "resourceType", 128],
      ["repositoryAuditLog", "resourceId", 512],
      ["repositoryAuditLog", "swarmId", 256],
    ].flatMap(([table, column, maxLength]) =>
      db.all(`SELECT id FROM ${table} WHERE ${column} IS NOT NULL AND (length(${column}) < 1 OR length(${column}) > ?)`, [maxLength])
        .map((row) => ({ table, column, id: row.id })),
    );
    const invalidSemantics = db.all(
      `SELECT id, action FROM repositoryAuditLog
       WHERE action NOT IN ('create', 'update', 'delete', 'status', 'claim', 'fail', 'requeue', 'add', 'remove', 'deposit', 'decay', 'upsert')
          OR json_valid(snapshot) = 0`,
    );
    const invalidBlackboardSnapshots = db.all(
      "SELECT id FROM blackboardAuditLog WHERE json_valid(snapshot) = 0",
    );
    if (invalid.length || invalidSemantics.length || invalidBlackboardSnapshots.length) {
      const details = invalid.slice(0, 5).map((row) => `${row.table}.${row.column}:${row.id}`).join(", ");
      const semanticDetails = invalidSemantics.slice(0, 5).map((row) => `repositoryAuditLog:${row.id}:${row.action}`).join(", ");
      const snapshotDetails = invalidBlackboardSnapshots.slice(0, 5).map((row) => `blackboardAuditLog:${row.id}:snapshot`).join(", ");
      throw new Error(`[DB][migrate] audit-integrity blocked: invalid audit data (${[details, semanticDetails, snapshotDetails].filter(Boolean).join(", ")}${invalid.length + invalidSemantics.length + invalidBlackboardSnapshots.length > 5 ? ", ..." : ""})`);
    }
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_blackboard_audit_lengths_insert
      BEFORE INSERT ON blackboardAuditLog
      WHEN length(NEW.entryId) NOT BETWEEN 1 AND 256
        OR length(NEW.actorId) NOT BETWEEN 1 AND 256
        OR (NEW.swarmId IS NOT NULL AND length(NEW.swarmId) NOT BETWEEN 1 AND 256)
      BEGIN SELECT RAISE(ABORT, 'invalid blackboard audit reference'); END;
      CREATE TRIGGER IF NOT EXISTS trg_blackboard_audit_lengths_update
      BEFORE UPDATE OF entryId, swarmId, actorId ON blackboardAuditLog
      WHEN length(NEW.entryId) NOT BETWEEN 1 AND 256
        OR length(NEW.actorId) NOT BETWEEN 1 AND 256
        OR (NEW.swarmId IS NOT NULL AND length(NEW.swarmId) NOT BETWEEN 1 AND 256)
      BEGIN SELECT RAISE(ABORT, 'invalid blackboard audit reference'); END;
      CREATE TRIGGER IF NOT EXISTS trg_blackboard_audit_snapshot_insert
      BEFORE INSERT ON blackboardAuditLog
      WHEN json_valid(NEW.snapshot) = 0
      BEGIN SELECT RAISE(ABORT, 'invalid blackboard audit snapshot'); END;
      CREATE TRIGGER IF NOT EXISTS trg_blackboard_audit_snapshot_update
      BEFORE UPDATE OF snapshot ON blackboardAuditLog
      WHEN json_valid(NEW.snapshot) = 0
      BEGIN SELECT RAISE(ABORT, 'invalid blackboard audit snapshot'); END;
      CREATE TRIGGER IF NOT EXISTS trg_repository_audit_lengths_insert
      BEFORE INSERT ON repositoryAuditLog
      WHEN length(NEW.actorId) NOT BETWEEN 1 AND 256
        OR length(NEW.resourceType) NOT BETWEEN 1 AND 128
        OR length(NEW.resourceId) NOT BETWEEN 1 AND 512
        OR (NEW.swarmId IS NOT NULL AND length(NEW.swarmId) NOT BETWEEN 1 AND 256)
      BEGIN SELECT RAISE(ABORT, 'invalid repository audit reference'); END;
      CREATE TRIGGER IF NOT EXISTS trg_repository_audit_lengths_update
      BEFORE UPDATE OF actorId, resourceType, resourceId, swarmId ON repositoryAuditLog
      WHEN length(NEW.actorId) NOT BETWEEN 1 AND 256
        OR length(NEW.resourceType) NOT BETWEEN 1 AND 128
        OR length(NEW.resourceId) NOT BETWEEN 1 AND 512
        OR (NEW.swarmId IS NOT NULL AND length(NEW.swarmId) NOT BETWEEN 1 AND 256)
      BEGIN SELECT RAISE(ABORT, 'invalid repository audit reference'); END;
      CREATE TRIGGER IF NOT EXISTS trg_repository_audit_semantics_insert
      BEFORE INSERT ON repositoryAuditLog
      WHEN NEW.action NOT IN ('create', 'update', 'delete', 'status', 'claim', 'fail', 'requeue', 'add', 'remove', 'deposit', 'decay', 'upsert')
        OR json_valid(NEW.snapshot) = 0
      BEGIN SELECT RAISE(ABORT, 'invalid repository audit semantics'); END;
      CREATE TRIGGER IF NOT EXISTS trg_repository_audit_semantics_update
      BEFORE UPDATE OF action, snapshot ON repositoryAuditLog
      WHEN NEW.action NOT IN ('create', 'update', 'delete', 'status', 'claim', 'fail', 'requeue', 'add', 'remove', 'deposit', 'decay', 'upsert')
        OR json_valid(NEW.snapshot) = 0
      BEGIN SELECT RAISE(ABORT, 'invalid repository audit semantics'); END;
    `);
  },
};
