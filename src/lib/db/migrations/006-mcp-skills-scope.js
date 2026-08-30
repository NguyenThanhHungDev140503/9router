export default {
  version: 6,
  name: "006-mcp-skills-scope",
  up(adapter) {
    // 1. Rebuild mcpServers to remove column-level UNIQUE(name) and add isShared INTEGER NOT NULL DEFAULT 0
    try {
      adapter.run(`CREATE TABLE IF NOT EXISTS mcpServers_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport TEXT NOT NULL,
        command TEXT,
        args TEXT,
        env TEXT,
        url TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        isShared INTEGER NOT NULL DEFAULT 0,
        userId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );`);

      try {
        adapter.run(`INSERT INTO mcpServers_new (id, name, transport, command, args, env, url, enabled, isShared, userId, createdAt, updatedAt)
          SELECT id, name, transport, command, args, env, url, enabled, COALESCE(isShared, 0), userId, createdAt, updatedAt FROM mcpServers;`);
        adapter.run(`DROP TABLE mcpServers;`);
      } catch {
        try {
          adapter.run(`INSERT INTO mcpServers_new (id, name, transport, command, args, env, url, enabled, isShared, userId, createdAt, updatedAt)
            SELECT id, name, transport, command, args, env, url, enabled, 0, userId, createdAt, updatedAt FROM mcpServers;`);
          adapter.run(`DROP TABLE mcpServers;`);
        } catch {}
      }

      adapter.run(`ALTER TABLE mcpServers_new RENAME TO mcpServers;`);
    } catch {}

    // 2. Rebuild skills to remove column-level UNIQUE(name) and add isShared INTEGER NOT NULL DEFAULT 0
    try {
      adapter.run(`CREATE TABLE IF NOT EXISTS skills_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        systemPrompt TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        isShared INTEGER NOT NULL DEFAULT 0,
        matchRules TEXT,
        userId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );`);

      try {
        adapter.run(`INSERT INTO skills_new (id, name, description, systemPrompt, enabled, isShared, matchRules, userId, createdAt, updatedAt)
          SELECT id, name, description, systemPrompt, enabled, COALESCE(isShared, 0), matchRules, userId, createdAt, updatedAt FROM skills;`);
        adapter.run(`DROP TABLE skills;`);
      } catch {
        try {
          adapter.run(`INSERT INTO skills_new (id, name, description, systemPrompt, enabled, isShared, matchRules, userId, createdAt, updatedAt)
            SELECT id, name, description, systemPrompt, enabled, 0, matchRules, userId, createdAt, updatedAt FROM skills;`);
          adapter.run(`DROP TABLE skills;`);
        } catch {}
      }

      adapter.run(`ALTER TABLE skills_new RENAME TO skills;`);
    } catch {}

    // 3. Drop obsolete indexes if any
    try { adapter.run(`DROP INDEX IF EXISTS idx_mcpServers_name;`); } catch {}
    try { adapter.run(`DROP INDEX IF EXISTS idx_skills_name;`); } catch {}

    // 4. Create scoped unique indices and lookup indices
    try { adapter.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mcpServers_user_name ON mcpServers(userId, name);`); } catch {}
    try { adapter.run(`CREATE INDEX IF NOT EXISTS idx_mcpServers_enabled ON mcpServers(enabled);`); } catch {}
    try { adapter.run(`CREATE INDEX IF NOT EXISTS idx_mcpServers_is_shared ON mcpServers(isShared);`); } catch {}
    try { adapter.run(`CREATE INDEX IF NOT EXISTS idx_mcpServers_user_id ON mcpServers(userId);`); } catch {}

    try { adapter.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_user_name ON skills(userId, name);`); } catch {}
    try { adapter.run(`CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);`); } catch {}
    try { adapter.run(`CREATE INDEX IF NOT EXISTS idx_skills_is_shared ON skills(isShared);`); } catch {}
    try { adapter.run(`CREATE INDEX IF NOT EXISTS idx_skills_user_id ON skills(userId);`); } catch {}
  },
};
