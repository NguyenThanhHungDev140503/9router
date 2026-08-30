import { TABLES, buildCreateTableSql } from "../schema.js";

export default {
  version: 2,
  name: "mcp-skills",
  up(db) {
    const targetTables = ["mcpServers", "mcpToolsCache", "skills", "gatewayToolRules"];
    for (const name of targetTables) {
      const def = TABLES[name];
      if (def) {
        db.exec(buildCreateTableSql(name, def));
        for (const idx of def.indexes || []) {
          db.exec(idx);
        }
      }
    }
  },
};
