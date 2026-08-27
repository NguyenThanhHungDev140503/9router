import { TABLES } from "../schema.js";

export default {
  version: 5,
  name: "blackboard-audit",
  up(db) {
    const invalid = [
      ["blackboard", "revision"],
      ["blackboardRevisions", "revision"],
      ["hermesTaskSteps", "stepIndex"],
      ["swarmColonyIterations", "iteration"],
      ["swarmConvergenceMetrics", "iteration"],
      ["swarmConvergenceMetrics", "sampleCount"],
    ].flatMap(([table, column]) =>
      db.all(`SELECT id, ${column} AS value FROM ${table} WHERE ${column} != CAST(${column} AS INTEGER) OR ${column} < 0`)
        .map((row) => ({ table, column, ...row })),
    );
    if (invalid.length) {
      const details = invalid.slice(0, 5).map((row) => `${row.table}.${row.column}=${row.value}`).join(", ");
      throw new Error(`[DB][migrate] blackboard-audit blocked: invalid integer fields (${details}${invalid.length > 5 ? ", ..." : ""})`);
    }
    db.exec("CREATE TABLE IF NOT EXISTS blackboardAuditLog (id TEXT PRIMARY KEY, entryId TEXT NOT NULL, swarmId TEXT, actorId TEXT NOT NULL CHECK (length(actorId) BETWEEN 1 AND 256), action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')), revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision = CAST(revision AS INTEGER)), snapshot TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(snapshot)), createdAt TEXT NOT NULL)");
    db.exec(`
      INSERT INTO blackboardAuditLog (id, entryId, swarmId, actorId, action, revision, snapshot, createdAt)
      SELECT lower(hex(randomblob(16))), b.id, b.swarmId, COALESCE(b.authorBotId, 'migration'), 'create', b.revision,
             json_object('id', b.id, 'swarmId', b.swarmId, 'authorBotId', b.authorBotId, 'content', b.content, 'tags', b.tags, 'category', b.category, 'revision', b.revision),
             COALESCE(b.createdAt, datetime('now'))
      FROM blackboard b
      WHERE NOT EXISTS (
        SELECT 1 FROM blackboardAuditLog a WHERE a.entryId=b.id AND a.action='create'
      )
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_blackboard_revision_integer_insert
      BEFORE INSERT ON blackboard
      WHEN NEW.revision != CAST(NEW.revision AS INTEGER)
      BEGIN SELECT RAISE(ABORT, 'blackboard revision must be integer'); END;
      CREATE TRIGGER IF NOT EXISTS trg_blackboard_revision_integer_update
      BEFORE UPDATE OF revision ON blackboard
      WHEN NEW.revision != CAST(NEW.revision AS INTEGER)
      BEGIN SELECT RAISE(ABORT, 'blackboard revision must be integer'); END;
      CREATE TRIGGER IF NOT EXISTS trg_task_step_index_integer_insert
      BEFORE INSERT ON hermesTaskSteps
      WHEN NEW.stepIndex != CAST(NEW.stepIndex AS INTEGER)
      BEGIN SELECT RAISE(ABORT, 'task stepIndex must be integer'); END;
      CREATE TRIGGER IF NOT EXISTS trg_task_step_index_integer_update
      BEFORE UPDATE OF stepIndex ON hermesTaskSteps
      WHEN NEW.stepIndex != CAST(NEW.stepIndex AS INTEGER)
      BEGIN SELECT RAISE(ABORT, 'task stepIndex must be integer'); END;
      CREATE TRIGGER IF NOT EXISTS trg_revision_integer_insert
      BEFORE INSERT ON blackboardRevisions
      WHEN NEW.revision != CAST(NEW.revision AS INTEGER)
      BEGIN SELECT RAISE(ABORT, 'revision must be integer'); END;
      CREATE TRIGGER IF NOT EXISTS trg_revision_integer_update
      BEFORE UPDATE OF revision ON blackboardRevisions
      WHEN NEW.revision != CAST(NEW.revision AS INTEGER)
      BEGIN SELECT RAISE(ABORT, 'revision must be integer'); END;
      CREATE TRIGGER IF NOT EXISTS trg_convergence_iteration_integer_insert
      BEFORE INSERT ON swarmConvergenceMetrics
      WHEN NEW.iteration != CAST(NEW.iteration AS INTEGER) OR NEW.sampleCount != CAST(NEW.sampleCount AS INTEGER)
      BEGIN SELECT RAISE(ABORT, 'convergence integer fields required'); END;
      CREATE TRIGGER IF NOT EXISTS trg_convergence_iteration_integer_update
      BEFORE UPDATE OF iteration, sampleCount ON swarmConvergenceMetrics
      WHEN NEW.iteration != CAST(NEW.iteration AS INTEGER) OR NEW.sampleCount != CAST(NEW.sampleCount AS INTEGER)
      BEGIN SELECT RAISE(ABORT, 'convergence integer fields required'); END;
    `);
    for (const index of TABLES.blackboardAuditLog.indexes || []) db.exec(index);
  },
};
