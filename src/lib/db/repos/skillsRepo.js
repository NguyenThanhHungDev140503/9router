import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToSkill(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    systemPrompt: row.systemPrompt,
    enabled: Boolean(row.enabled),
    matchRules: parseJson(row.matchRules, {}),
    userId: row.userId || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToGatewayToolRule(row) {
  if (!row) return null;
  return {
    id: row.id,
    toolName: row.toolName,
    action: row.action,
    timeoutMs: Number(row.timeoutMs) || 30000,
    enabled: Boolean(row.enabled),
    userId: row.userId || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validateSkillPayload(data, isCreate = false) {
  if (isCreate && (!data.name || typeof data.name !== 'string' || !data.name.trim())) {
    throw new Error('Skill name is required and must be non-empty string');
  }
  if (data.systemPrompt !== undefined && typeof data.systemPrompt !== 'string') {
    throw new Error('Skill systemPrompt must be a string');
  }
}

function validateRulePayload(data, isCreate = false) {
  if (isCreate && (!data.toolName || typeof data.toolName !== 'string' || !data.toolName.trim())) {
    throw new Error('toolName is required and must be non-empty string');
  }
  if (data.action && !['auto_execute', 'block', 'passthrough_client'].includes(data.action)) {
    throw new Error('action must be auto_execute, block, or passthrough_client');
  }
}

export async function getSkills(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.userId) {
    where.push("userId = ?");
    params.push(filter.userId);
  }
  const sql = `SELECT * FROM skills${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY createdAt ASC`;
  const rows = db.all(sql, params);
  return rows.map(rowToSkill);
}

export async function getEnabledSkills(filter = {}) {
  const db = await getAdapter();
  const where = ["enabled = 1"];
  const params = [];
  if (filter.userId) {
    where.push("userId = ?");
    params.push(filter.userId);
  }
  const sql = `SELECT * FROM skills WHERE ${where.join(" AND ")} ORDER BY createdAt ASC`;
  const rows = db.all(sql, params);
  return rows.map(rowToSkill);
}

export async function getSkillById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM skills WHERE id = ?`, [id]);
  return rowToSkill(row);
}

export async function getSkillByName(name) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM skills WHERE name = ?`, [name]);
  return rowToSkill(row);
}

export async function createSkill(data) {
  validateSkillPayload(data, true);

  const db = await getAdapter();
  const now = new Date().toISOString();
  const skill = {
    id: data.id || uuidv4(),
    name: data.name.trim(),
    description: data.description || null,
    systemPrompt: data.systemPrompt || "",
    enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
    matchRules: data.matchRules || {},
    userId: data.userId || null,
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO skills (id, name, description, systemPrompt, enabled, matchRules, userId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      skill.id,
      skill.name,
      skill.description,
      skill.systemPrompt,
      skill.enabled,
      stringifyJson(skill.matchRules),
      skill.userId,
      skill.createdAt,
      skill.updatedAt,
    ]
  );

  return {
    ...skill,
    enabled: Boolean(skill.enabled),
  };
}

export async function updateSkill(id, data) {
  validateSkillPayload(data, false);

  const db = await getAdapter();
  const existing = await getSkillById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    ...data,
    updatedAt: now,
  };

  db.run(
    `UPDATE skills
     SET name = ?, description = ?, systemPrompt = ?, enabled = ?, matchRules = ?, updatedAt = ?
     WHERE id = ?`,
    [
      updated.name,
      updated.description || null,
      updated.systemPrompt,
      updated.enabled ? 1 : 0,
      stringifyJson(updated.matchRules || {}),
      updated.updatedAt,
      id,
    ]
  );

  return {
    ...updated,
    enabled: Boolean(updated.enabled),
  };
}

export async function deleteSkill(id) {
  const db = await getAdapter();
  db.run(`DELETE FROM skills WHERE id = ?`, [id]);
  return true;
}

// Gateway Tool Rules CRUD

export async function getGatewayToolRules(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.userId) {
    where.push("userId = ?");
    params.push(filter.userId);
  }
  const sql = `SELECT * FROM gatewayToolRules${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY createdAt ASC`;
  const rows = db.all(sql, params);
  return rows.map(rowToGatewayToolRule);
}

export async function getGatewayToolRuleById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM gatewayToolRules WHERE id = ?`, [id]);
  return rowToGatewayToolRule(row);
}

export async function getGatewayToolRuleByToolName(toolName) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM gatewayToolRules WHERE toolName = ?`, [toolName]);
  return rowToGatewayToolRule(row);
}

export async function createGatewayToolRule(data) {
  validateRulePayload(data, true);

  const db = await getAdapter();
  const now = new Date().toISOString();
  const rule = {
    id: data.id || uuidv4(),
    toolName: data.toolName.trim(),
    action: data.action || "auto_execute",
    timeoutMs: Number(data.timeoutMs) || 30000,
    enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
    userId: data.userId || null,
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO gatewayToolRules (id, toolName, action, timeoutMs, enabled, userId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rule.id,
      rule.toolName,
      rule.action,
      rule.timeoutMs,
      rule.enabled,
      rule.userId,
      rule.createdAt,
      rule.updatedAt,
    ]
  );

  return {
    ...rule,
    enabled: Boolean(rule.enabled),
  };
}

export async function updateGatewayToolRule(id, data) {
  validateRulePayload(data, false);

  const db = await getAdapter();
  const row = db.get(`SELECT * FROM gatewayToolRules WHERE id = ?`, [id]);
  const existing = rowToGatewayToolRule(row);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    ...data,
    updatedAt: now,
  };

  db.run(
    `UPDATE gatewayToolRules
     SET toolName = ?, action = ?, timeoutMs = ?, enabled = ?, updatedAt = ?
     WHERE id = ?`,
    [
      updated.toolName,
      updated.action,
      Number(updated.timeoutMs) || 30000,
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

export async function deleteGatewayToolRule(id) {
  const db = await getAdapter();
  db.run(`DELETE FROM gatewayToolRules WHERE id = ?`, [id]);
  return true;
}
