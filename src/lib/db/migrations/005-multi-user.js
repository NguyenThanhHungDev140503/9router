import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

export default {
  version: 5,
  name: "005-multi-user",
  up(adapter) {
  adapter.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  adapter.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);`);
  adapter.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`);

  const existingUsers = adapter.all(`SELECT id, username, role FROM users LIMIT 1`);
  let adminId;
  if (!existingUsers || existingUsers.length === 0) {
    adminId = randomUUID();
    const now = new Date().toISOString();
    const defaultPassword = process.env.ADMIN_PASSWORD || process.env.DEFAULT_PASSWORD || "123456";
    const passwordHash = bcrypt.hashSync(defaultPassword, 10);
    adapter.run(
      `INSERT INTO users(id, username, password_hash, role, is_active, createdAt, updatedAt)
       VALUES(?, 'admin', ?, 'admin', 1, ?, ?)`,
      [adminId, passwordHash, now, now]
    );
  } else {
    adminId = existingUsers[0].id;
  }

  const tenantTables = [
    "providerConnections",
    "providerNodes",
    "proxyPools",
    "apiKeys",
    "combos",
    "usageHistory",
    "requestDetails",
    "mcpServers",
    "skills",
    "gatewayToolRules",
    "hermesBots",
    "swarmSessions",
  ];

  for (const table of tenantTables) {
    try { adapter.run(`ALTER TABLE ${table} ADD COLUMN userId TEXT;`); } catch {}
    try { adapter.run(`CREATE INDEX IF NOT EXISTS idx_${table}_user_id ON ${table}(userId);`); } catch {}
    try { adapter.run(`UPDATE ${table} SET userId = ? WHERE userId IS NULL`, [adminId]); } catch {}
  }

  try { adapter.run(`ALTER TABLE providerConnections ADD COLUMN isShared INTEGER DEFAULT 0;`); } catch {}
  try { adapter.run(`CREATE INDEX IF NOT EXISTS idx_pc_is_shared ON providerConnections(isShared);`); } catch {}
}

};
