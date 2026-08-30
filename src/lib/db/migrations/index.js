// Migration registry — append new entries when schema changes.
// Each migration: { version: number, name: string, up(db): void }
// Versions MUST be unique and monotonically increasing.
import m001 from "./001-initial.js";
import m002 from "./002-mcp-skills.js";
import m003 from "./003-hermes-swarm.js";
import m004 from "./004-hermes-integrity.js";
import m005 from "./005-multi-user.js";
import m006 from "./006-mcp-skills-scope.js";
import m007 from "./007-usage-user-composite-indexes.js";

export const MIGRATIONS = [m001, m002, m003, m004, m005, m006, m007].sort((a, b) => a.version - b.version);

export function latestVersion() {
  return MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;
}
