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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validateServerPayload(data, isCreate = false) {
  if (isCreate && (!data.name || typeof data.name !== 'string' || !data.name.trim())) {
    throw new Error('MCP server name is required and must be non-empty string');
  }
  if (data.transport && !['stdio', 'sse', 'http'].includes(data.transport)) {
    throw new Error('MCP server transport must be one of: stdio, sse, http');
  }
  if (data.command !== undefined && data.command !== null && typeof data.command !== 'string') {
    throw new Error('MCP server command must be a string or null');
  }
  if (data.args !== undefined && data.args !== null && !Array.isArray(data.args)) {
    throw new Error('MCP server args must be an array');
  }
  if (data.env !== undefined && data.env !== null && (typeof data.env !== 'object' || Array.isArray(data.env))) {
    throw new Error('MCP server env must be a key-value object');
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

export async function getMcpServers() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM mcpServers ORDER BY createdAt ASC`);
  return rows.map(rowToServer);
}

export async function getEnabledMcpServers() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM mcpServers WHERE enabled = 1 ORDER BY createdAt ASC`);
  return rows.map(rowToServer);
}

export async function getMcpServerById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM mcpServers WHERE id = ?`, [id]);
  return rowToServer(row);
}

export async function getMcpServerByName(name) {
  const db = await getAdapter();
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
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO mcpServers (id, name, transport, command, args, env, url, enabled, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      server.id,
      server.name,
      server.transport,
      server.command,
      stringifyJson(server.args),
      stringifyJson(server.env),
      server.url,
      server.enabled,
      server.createdAt,
      server.updatedAt,
    ]
  );

  return {
    ...server,
    enabled: Boolean(server.enabled),
  };
}

export async function updateMcpServer(id, data) {
  validateServerPayload(data, false);

  const db = await getAdapter();
  const existing = await getMcpServerById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    ...data,
    updatedAt: now,
  };

  db.run(
    `UPDATE mcpServers
     SET name = ?, transport = ?, command = ?, args = ?, env = ?, url = ?, enabled = ?, updatedAt = ?
     WHERE id = ?`,
    [
      updated.name,
      updated.transport,
      updated.command || null,
      stringifyJson(updated.args || []),
      stringifyJson(updated.env || {}),
      updated.url || null,
      updated.enabled ? 1 : 0,
      updated.updatedAt,
      id,
    ]
  );

  return {
    ...updated,
    enabled: Boolean(updated.enabled),
  };
}

export async function deleteMcpServer(id) {
  const db = await getAdapter();
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
