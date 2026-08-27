import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToCombo(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    userId: row.userId || null,
    models: parseJson(row.models, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getCombos(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.userId) {
    where.push("userId = ?");
    params.push(filter.userId);
  }
  const sql = `SELECT * FROM combos${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY createdAt ASC`;
  const rows = db.all(sql, params);
  return rows.map(rowToCombo);
}

export async function getComboById(id, filter = {}) {
  const db = await getAdapter();
  const where = ["id = ?"];
  const params = [id];
  if (filter.userId) {
    where.push("userId = ?");
    params.push(filter.userId);
  }
  const row = db.get(`SELECT * FROM combos WHERE ${where.join(" AND ")}`, params);
  return rowToCombo(row);
}

export async function getComboByName(name, filter = {}) {
  const db = await getAdapter();
  const where = ["name = ?"];
  const params = [name];
  if (filter.userId) {
    where.push("userId = ?");
    params.push(filter.userId);
  }
  const row = db.get(`SELECT * FROM combos WHERE ${where.join(" AND ")}`, params);
  return rowToCombo(row);
}

export async function createCombo(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const combo = {
    id: uuidv4(),
    name: data.name,
    kind: data.kind || null,
    userId: data.userId || null,
    models: data.models || [],
    createdAt: now,
    updatedAt: now,
  };
  db.run(
    `INSERT INTO combos(id, name, kind, userId, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [combo.id, combo.name, combo.kind, combo.userId, stringifyJson(combo.models), combo.createdAt, combo.updatedAt]
  );
  return combo;
}

export async function updateCombo(id, data, filter = {}) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const where = ["id = ?"];
    const params = [id];
    if (filter.userId) {
      where.push("userId = ?");
      params.push(filter.userId);
    }
    const row = db.get(`SELECT * FROM combos WHERE ${where.join(" AND ")}`, params);
    if (!row) return;
    const merged = { ...rowToCombo(row), ...data, updatedAt: new Date().toISOString() };
    db.run(
      `UPDATE combos SET name = ?, kind = ?, userId = ?, models = ?, updatedAt = ? WHERE id = ?`,
      [merged.name, merged.kind, merged.userId || null, stringifyJson(merged.models || []), merged.updatedAt, id]
    );
    result = merged;
  });
  return result;
}

export async function deleteCombo(id, filter = {}) {
  const db = await getAdapter();
  const where = ["id = ?"];
  const params = [id];
  if (filter.userId) {
    where.push("userId = ?");
    params.push(filter.userId);
  }
  const res = db.run(`DELETE FROM combos WHERE ${where.join(" AND ")}`, params);
  return (res?.changes ?? 0) > 0;
}
