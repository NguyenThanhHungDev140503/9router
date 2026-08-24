import { TABLES, buildCreateTableSql } from "../schema.js";

const HERMES_TABLES = [
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

export default {
  version: 3,
  name: "hermes-swarm",
  up(db) {
    for (const name of HERMES_TABLES) {
      const def = TABLES[name];
      if (!def) throw new Error(`Missing schema definition for ${name}`);
      db.exec(buildCreateTableSql(name, def));
      for (const index of def.indexes || []) db.exec(index);
    }
  },
};
