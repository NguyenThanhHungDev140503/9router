import { TABLES } from "../schema.js";

export default {
  version: 6,
  name: "repository-audit",
  up(db) {
    db.exec("CREATE TABLE IF NOT EXISTS repositoryAuditLog (id TEXT PRIMARY KEY, actorId TEXT NOT NULL CHECK (length(actorId) BETWEEN 1 AND 256), resourceType TEXT NOT NULL, resourceId TEXT NOT NULL, swarmId TEXT, action TEXT NOT NULL, snapshot TEXT NOT NULL DEFAULT '{}', createdAt TEXT NOT NULL)");
    for (const index of TABLES.repositoryAuditLog.indexes || []) db.exec(index);
  },
};
