import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToServer(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    command: row.command || null,
    args: parseJson(row.args, []),
    env: parseJson(row.env, {}),
    url: row.url || null,
    enabled: Boolean(row.enabled),
    isShared: Boolean(row.isShared),
    userId: row.userId ? String(row.userId) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validateServerPayload(data, isCreate = false) {
  if (isCreate && (!data.name || typeof data.name !== "string" || !data.name.trim())) {
    throw new Error("MCP server name is required and must be non-empty string");
  }
  if (data.transport && !["stdio", "sse", "http"].includes(data.transport)) {
    throw new Error("MCP server transport must be one of: stdio, sse, http");
  }
  if (data.command !== undefined && data.command !== null && typeof data.command !== "string") {
    throw new Error("MCP server command must be a string or null");
  }
  if (data.args !== undefined && data.args !== null && !Array.isArray(data.args)) {
    throw new Error("MCP server args must be an array");
  }
  if (data.env !== undefined && data.env !== null && (typeof data.env !== "object" || Array.isArray(data.env))) {
    throw new Error("MCP server env must be a key-value object");
  }
}

function rowToCache(row) {
  if (!row) return null;
  return {
    serverId: row.serverId,
    tools: parseJson(row.tools, []),
    updatedAt: row.updatedAt,
  };
}

export function resolvePrivateFirst(rows, userId) {
  const byName = new Map();
  for (const row of rows) {
    if (!byName.has(row.name) || (userId && String(row.userId) === String(userId))) {
      byName.set(row.name, row);
    }
  }
  return [...byName.values()];
}

export async function getMcpServers(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.userId) {
    if (filter.includeShared) {
      where.push("(userId = ? OR isShared = 1)");
      params.push(String(filter.userId));
    } else {
      where.push("userId = ?");
      params.push(String(filter.userId));
    }
  } else if (filter.includeShared) {
    where.push("isShared = 1");
  }
  if (filter.enabled !== undefined) {
    where.push("enabled = ?");
    params.push(filter.enabled ? 1 : 0);
  }
  const sql = `SELECT * FROM mcpServers${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY createdAt ASC`;
  const rows = db.all(sql, params);
  const mapped = rows.map(rowToServer);
  if (filter.userId) {
    return resolvePrivateFirst(mapped, filter.userId);
  }
  return mapped;
}

export async function getAccessibleMcpServers({ userId = null, enabled = undefined } = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (userId) {
    where.push("(userId = ? OR isShared = 1)");
    params.push(String(userId));
  } else {
    where.push("isShared = 1");
  }
  if (enabled !== undefined) {
    where.push("enabled = ?");
    params.push(enabled ? 1 : 0);
  }
  const sql = `SELECT * FROM mcpServers WHERE ${where.join(" AND ")} ORDER BY createdAt ASC`;
  const rows = db.all(sql, params);
  return resolvePrivateFirst(rows.map(rowToServer), userId);
}

export async function getEnabledMcpServers(filter = {}) {
  return getAccessibleMcpServers({ userId: filter.userId, enabled: true });
}

export async function getMcpServerById(id, access = null) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM mcpServers WHERE id = ?`, [id]);
  const server = rowToServer(row);
  if (!server) return null;
  if (!access) return server;

  const userId = access.userId !== undefined && access.userId !== null ? String(access.userId) : null;
  const isAdmin = Boolean(access.isAdmin);

  if (isAdmin) return server;

  if (access.mutation) {
    if (userId && String(server.userId) === userId) return server;
    return null;
  }

  if (server.isShared || (userId && String(server.userId) === userId)) {
    return server;
  }

  return null;
}

export async function getMcpServerByName(name, access = null) {
  const db = await getAdapter();
  const userId = access?.userId !== undefined && access?.userId !== null ? String(access.userId) : null;
  if (userId) {
    const privateRow = db.get(`SELECT * FROM mcpServers WHERE name = ? AND userId = ?`, [name, userId]);
    if (privateRow) return rowToServer(privateRow);
    const sharedRow = db.get(`SELECT * FROM mcpServers WHERE name = ? AND isShared = 1`, [name]);
    if (sharedRow) return rowToServer(sharedRow);
    return null;
  }
  const row = db.get(`SELECT * FROM mcpServers WHERE name = ?`, [name]);
  return rowToServer(row);
}

export async function createMcpServer(data) {
  validateServerPayload(data, true);

  const db = await getAdapter();
  const now = new Date().toISOString();
  const server = {
    id: data.id || uuidv4(),
    name: data.name.trim(),
    transport: data.transport || "stdio",
    command: data.command || null,
    args: data.args || [],
    env: data.env || {},
    url: data.url || null,
    enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
    isShared: data.isShared !== undefined ? (data.isShared ? 1 : 0) : 0,
    userId: data.userId ? String(data.userId) : null,
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO mcpServers (id, name, transport, command, args, env, url, enabled, isShared, userId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      server.id,
      server.name,
      server.transport,
      server.command,
      stringifyJson(server.args),
      stringifyJson(server.env),
      server.url,
      server.enabled,
      server.isShared,
      server.userId,
      server.createdAt,
      server.updatedAt,
    ]
  );

  return {
    ...server,
    enabled: Boolean(server.enabled),
    isShared: Boolean(server.isShared),
  };
}

export async function updateMcpServer(id, data, access = null) {
  validateServerPayload(data, false);

  const db = await getAdapter();
  const existing = await getMcpServerById(id, access ? { ...access, mutation: true } : null);
  if (!existing) return null;

  const now = new Date().toISOString();
  let isSharedValue = existing.isShared ? 1 : 0;
  if (data.isShared !== undefined) {
    if (access && !access.isAdmin) {
      // non-admin cannot change isShared
    } else {
      isSharedValue = data.isShared ? 1 : 0;
    }
  }

  const updated = {
    ...existing,
    ...data,
    isShared: Boolean(isSharedValue),
    updatedAt: now,
  };

  db.run(
    `UPDATE mcpServers
     SET name = ?, transport = ?, command = ?, args = ?, env = ?, url = ?, enabled = ?, isShared = ?, updatedAt = ?
     WHERE id = ?`,
    [
      updated.name,
      updated.transport,
      updated.command || null,
      stringifyJson(updated.args || []),
      stringifyJson(updated.env || {}),
      updated.url || null,
      updated.enabled ? 1 : 0,
      isSharedValue,
      updated.updatedAt,
      id,
    ]
  );

  return {
    ...updated,
    enabled: Boolean(updated.enabled),
    isShared: Boolean(updated.isShared),
  };
}

export async function deleteMcpServer(id, access = null) {
  const db = await getAdapter();
  if (access) {
    const existing = await getMcpServerById(id, { ...access, mutation: true });
    if (!existing) return false;
  }
  db.run(`DELETE FROM mcpToolsCache WHERE serverId = ?`, [id]);
  db.run(`DELETE FROM mcpServers WHERE id = ?`, [id]);
  return true;
}

export async function getMcpToolsCache(serverId) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM mcpToolsCache WHERE serverId = ?`, [serverId]);
  return rowToCache(row);
}

export async function getAllMcpToolsCache() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM mcpToolsCache`);
  return rows.map(rowToCache);
}

export async function saveMcpToolsCache(serverId, tools) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const toolsJson = stringifyJson(tools || []);

  db.run(
    `INSERT INTO mcpToolsCache (serverId, tools, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(serverId) DO UPDATE SET
       tools = excluded.tools,
       updatedAt = excluded.updatedAt`,
    [serverId, toolsJson, now]
  );

  return {
    serverId,
    tools: tools || [],
    updatedAt: now,
  };
}

export async function deleteMcpToolsCache(serverId) {
  const db = await getAdapter();
  db.run(`DELETE FROM mcpToolsCache WHERE serverId = ?`, [serverId]);
  return true;
}
