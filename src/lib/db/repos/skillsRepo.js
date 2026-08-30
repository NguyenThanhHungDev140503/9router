import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { resolvePrivateFirst } from "./mcpRepo.js";

function rowToSkill(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    systemPrompt: row.systemPrompt,
    enabled: Boolean(row.enabled),
    isShared: Boolean(row.isShared),
    matchRules: parseJson(row.matchRules, {}),
    userId: row.userId ? String(row.userId) : null,
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
    userId: row.userId ? String(row.userId) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validateSkillPayload(data, isCreate = false) {
  if (isCreate && (!data.name || typeof data.name !== "string" || !data.name.trim())) {
    throw new Error("Skill name is required and must be non-empty string");
  }
  if (data.systemPrompt !== undefined && typeof data.systemPrompt !== "string") {
    throw new Error("Skill systemPrompt must be a string");
  }
}

function validateRulePayload(data, isCreate = false) {
  if (isCreate && (!data.toolName || typeof data.toolName !== "string" || !data.toolName.trim())) {
    throw new Error("toolName is required and must be non-empty string");
  }
  if (data.action && !["auto_execute", "block", "passthrough_client"].includes(data.action)) {
    throw new Error("action must be auto_execute, block, or passthrough_client");
  }
}

export { resolvePrivateFirst };

export async function getSkills(filter = {}) {
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
  const sql = `SELECT * FROM skills${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY createdAt ASC`;
  const rows = db.all(sql, params);
  const mapped = rows.map(rowToSkill);
  if (filter.userId) {
    return resolvePrivateFirst(mapped, filter.userId);
  }
  return mapped;
}

export async function getAccessibleSkills({ userId = null, enabled = undefined } = {}) {
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
  const sql = `SELECT * FROM skills WHERE ${where.join(" AND ")} ORDER BY createdAt ASC`;
  const rows = db.all(sql, params);
  return resolvePrivateFirst(rows.map(rowToSkill), userId);
}

export async function getEnabledSkills(filter = {}) {
  return getAccessibleSkills({ userId: filter.userId, enabled: true });
}

export async function getSkillById(id, access = null) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM skills WHERE id = ?`, [id]);
  const skill = rowToSkill(row);
  if (!skill) return null;
  if (!access) return skill;

  const userId = access.userId !== undefined && access.userId !== null ? String(access.userId) : null;
  const isAdmin = Boolean(access.isAdmin);

  if (isAdmin) return skill;

  if (access.mutation) {
    if (userId && String(skill.userId) === userId) return skill;
    return null;
  }

  if (skill.isShared || (userId && String(skill.userId) === userId)) {
    return skill;
  }

  return null;
}

export async function getSkillByName(name, access = null) {
  const db = await getAdapter();
  const userId = access?.userId !== undefined && access?.userId !== null ? String(access.userId) : null;
  if (userId) {
    const privateRow = db.get(`SELECT * FROM skills WHERE name = ? AND userId = ?`, [name, userId]);
    if (privateRow) return rowToSkill(privateRow);
    const sharedRow = db.get(`SELECT * FROM skills WHERE name = ? AND isShared = 1`, [name]);
    if (sharedRow) return rowToSkill(sharedRow);
    return null;
  }
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
    isShared: data.isShared !== undefined ? (data.isShared ? 1 : 0) : 0,
    matchRules: data.matchRules || {},
    userId: data.userId ? String(data.userId) : null,
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO skills (id, name, description, systemPrompt, enabled, isShared, matchRules, userId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      skill.id,
      skill.name,
      skill.description,
      skill.systemPrompt,
      skill.enabled,
      skill.isShared,
      stringifyJson(skill.matchRules),
      skill.userId,
      skill.createdAt,
      skill.updatedAt,
    ]
  );

  return {
    ...skill,
    enabled: Boolean(skill.enabled),
    isShared: Boolean(skill.isShared),
  };
}

export async function updateSkill(id, data, access = null) {
  validateSkillPayload(data, false);

  const db = await getAdapter();
  const existing = await getSkillById(id, access ? { ...access, mutation: true } : null);
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
    `UPDATE skills
     SET name = ?, description = ?, systemPrompt = ?, enabled = ?, isShared = ?, matchRules = ?, updatedAt = ?
     WHERE id = ?`,
    [
      updated.name,
      updated.description || null,
      updated.systemPrompt,
      updated.enabled ? 1 : 0,
      isSharedValue,
      stringifyJson(updated.matchRules || {}),
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

export async function deleteSkill(id, access = null) {
  const db = await getAdapter();
  if (access) {
    const existing = await getSkillById(id, { ...access, mutation: true });
    if (!existing) return false;
  }
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
    params.push(String(filter.userId));
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
    userId: data.userId ? String(data.userId) : null,
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
