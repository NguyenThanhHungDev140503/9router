import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { getAdapter } from "../driver.js";

function rowToUser(row, includePassword = false) {
  if (!row) return null;
  const user = {
    id: row.id,
    username: row.username,
    role: row.role || "user",
    isActive: row.is_active === 1 || row.is_active === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (includePassword) {
    user.passwordHash = row.password_hash;
  }
  return user;
}

export async function getUsers(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];

  if (filter.role) {
    where.push("role = ?");
    params.push(filter.role);
  }
  if (filter.isActive !== undefined) {
    where.push("is_active = ?");
    params.push(filter.isActive ? 1 : 0);
  }
  if (filter.search) {
    where.push("username LIKE ?");
    params.push(`%${filter.search}%`);
  }

  const sql = `SELECT * FROM users${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY createdAt ASC`;
  return db.all(sql, params).map((r) => rowToUser(r, false));
}

export async function getUserById(id, options = {}) {
  if (!id) return null;
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM users WHERE id = ?`, [id]);
  return rowToUser(row, options.includePassword === true);
}

export async function getUserByUsername(username, options = {}) {
  if (!username) return null;
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM users WHERE LOWER(username) = LOWER(?)`, [username]);
  return rowToUser(row, options.includePassword === true);
}

export async function createUser(data) {
  if (!data || !data.username || !data.password) {
    throw new Error("Username and password are required");
  }

  const trimmedUsername = data.username.trim();
  if (trimmedUsername.length < 2) {
    throw new Error("Username must be at least 2 characters");
  }

  const role = data.role === "admin" ? "admin" : "user";
  const isActive = data.isActive !== false ? 1 : 0;
  const passwordHash = await bcrypt.hash(data.password, 10);
  const now = new Date().toISOString();
  const id = data.id || uuidv4();

  const db = await getAdapter();
  db.run(
    `INSERT INTO users(id, username, password_hash, role, is_active, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [id, trimmedUsername, passwordHash, role, isActive, now, now]
  );

  return {
    id,
    username: trimmedUsername,
    role,
    isActive: isActive === 1,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateUser(id, data) {
  if (!id) throw new Error("User ID is required");
  const db = await getAdapter();

  let updated = null;
  await db.transaction(async () => {
    const existing = db.get(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!existing) return;

    let newUsername = existing.username;
    if (data.username !== undefined && data.username.trim()) {
      newUsername = data.username.trim();
    }

    let newPasswordHash = existing.password_hash;
    if (data.password) {
      newPasswordHash = bcrypt.hashSync(data.password, 10);
    }

    let newRole = existing.role;
    if (data.role) {
      if (existing.role === "admin" && data.role !== "admin") {
        // Prevent demoting the last active admin
        const adminCount = db.get(`SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_active = 1`)?.c || 0;
        if (adminCount <= 1) {
          throw new Error("Cannot demote the last active admin user");
        }
      }
      newRole = data.role === "admin" ? "admin" : "user";
    }

    let newIsActive = existing.is_active;
    if (data.isActive !== undefined) {
      if (existing.role === "admin" && data.isActive === false) {
        // Prevent deactivating the last active admin
        const adminCount = db.get(`SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_active = 1`)?.c || 0;
        if (adminCount <= 1) {
          throw new Error("Cannot deactivate the last active admin user");
        }
      }
      newIsActive = data.isActive ? 1 : 0;
    }

    const now = new Date().toISOString();
    db.run(
      `UPDATE users
       SET username = ?, password_hash = ?, role = ?, is_active = ?, updatedAt = ?
       WHERE id = ?`,
      [newUsername, newPasswordHash, newRole, newIsActive, now, id]
    );

    const row = db.get(`SELECT * FROM users WHERE id = ?`, [id]);
    updated = rowToUser(row, false);
  });

  return updated;
}

export async function deleteUser(id) {
  if (!id) throw new Error("User ID is required");
  const db = await getAdapter();

  let removed = null;
  db.transaction(() => {
    const existing = db.get(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!existing) return;

    if (existing.role === "admin") {
      const adminCount = db.get(`SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_active = 1`)?.c || 0;
      if (adminCount <= 1) {
        throw new Error("Cannot delete the last admin user");
      }
    }

    removed = rowToUser(existing, false);

    // Delete user's tenant records
    const tablesWithUserId = [
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

    for (const tbl of tablesWithUserId) {
      try {
        db.run(`DELETE FROM ${tbl} WHERE userId = ?`, [id]);
      } catch {}
    }

    db.run(`DELETE FROM users WHERE id = ?`, [id]);
  });

  return removed;
}

export async function validateUserCredentials(username, password) {
  if (!username || !password) return null;
  const user = await getUserByUsername(username, { includePassword: true });
  if (!user || !user.isActive) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function countUsers(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.role) {
    where.push("role = ?");
    params.push(filter.role);
  }
  if (filter.isActive !== undefined) {
    where.push("is_active = ?");
    params.push(filter.isActive ? 1 : 0);
  }
  const sql = `SELECT COUNT(*) as c FROM users${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  return db.get(sql, params)?.c || 0;
}
