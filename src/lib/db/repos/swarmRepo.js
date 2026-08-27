import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { writeRepositoryAudit } from "./security.js";

const now = () => new Date().toISOString();
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_TEXT_LENGTH = 16 * 1024;
const MAX_PHEROMONE_VALUE = 1_000_000;
const SESSION_STATUSES = new Set(["pending", "running", "completed", "failed", "cancelled"]);
const ITERATION_PHASES = new Set(["exploration", "exploitation"]);
const SESSION_MUTABLE_FIELDS = new Set([
  "name",
  "strategy",
  "status",
  "targetObjective",
  "config",
  "result",
  "startedAt",
  "completedAt",
]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateText(value, field, { required = false } = {}) {
  if (typeof value !== "string" || (required && !value.trim())) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  if (value.length > MAX_TEXT_LENGTH) {
    throw new RangeError(`${field} exceeds maximum length of ${MAX_TEXT_LENGTH} characters`);
  }
  return value;
}

function serializePayload(value, field, fallback = null) {
  const payload = value === undefined ? fallback : value;
  let serialized;
  try {
    serialized = stringifyJson(payload);
  } catch {
    throw new TypeError(`${field} must be JSON serializable`);
  }
  if (typeof serialized !== "string") {
    throw new TypeError(`${field} must be JSON serializable`);
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`${field} exceeds maximum payload size of ${MAX_PAYLOAD_BYTES} bytes`);
  }
  return serialized;
}

function validateFiniteNumber(value, field, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${field} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function validateNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer`);
  }
  return value;
}

function normalizePagination(options = {}) {
  if (!isPlainObject(options)) throw new TypeError("Pagination options must be a JSON object");
  const limit = options.limit ?? options.pageSize ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }

  let offset = options.offset;
  if (offset === undefined && options.page !== undefined) {
    if (!Number.isInteger(options.page) || options.page < 1) {
      throw new RangeError("page must be a positive integer");
    }
    offset = (options.page - 1) * limit;
  }
  offset ??= 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    throw new RangeError(`offset must be an integer between 0 and ${MAX_OFFSET}`);
  }
  return { limit, offset };
}

function normalizeActorId(actor) {
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
    throw new TypeError("Authenticated actor context is required");
  }
  const actorId = actor.botId ?? actor.id;
  const principalId = actor.principalId;
  if (typeof principalId !== "string" || principalId.trim() !== actorId) {
    throw new TypeError("Authenticated actor principalId must match botId");
  }
  if (typeof actorId !== "string" || !actorId.trim()) {
    throw new TypeError("actorId is required");
  }
  return actorId.trim();
}

function authorizeActor(db, swarmId, actorId, bootstrapBotId = null) {
  const normalizedActorId = normalizeActorId(actorId);
  const member = db.get(
    "SELECT 1 FROM swarmBots WHERE swarmId=? AND botId=? AND status='active' LIMIT 1",
    [swarmId, normalizedActorId],
  );
  if (member) return normalizedActorId;

  if (bootstrapBotId && normalizedActorId === normalizeActorId(bootstrapBotId)) {
    const activeMember = db.get("SELECT 1 FROM swarmBots WHERE swarmId=? AND status='active' LIMIT 1", [swarmId]);
    if (!activeMember) return normalizedActorId;
  }

  throw new Error("Actor is not authorized for swarm");
}

function authorizeReadActor(db, actorId) {
  const normalized = normalizeActorId(actorId);
  const bot = db.get("SELECT id FROM hermesBots WHERE id=? AND enabled=1", [normalized]);
  if (!bot) throw new Error("Actor is not authorized to read swarm data");
  return normalized;
}

function authorizeCoordinator(db, actorId) {
  const normalized = authorizeReadActor(db, actorId);
  const bot = db.get("SELECT role FROM hermesBots WHERE id=?", [normalized]);
  if (!["coordinator"].includes(bot?.role)) throw new Error("Coordinator authorization required");
  return normalized;
}

function authorizeSessionRead(db, swarmId, actorId) {
  const normalized = authorizeReadActor(db, actorId);
  const member = db.get("SELECT 1 FROM swarmBots WHERE swarmId=? AND botId=? AND status='active'", [swarmId, normalized]);
  if (!member) throw new Error("Actor is not authorized for swarm");
  return normalized;
}

function map(row) {
  if (!row) return null;
  const out = { ...row };
  const defaults = {
    config: {},
    result: null,
    metadata: {},
    metrics: {},
  };
  for (const [field, fallback] of Object.entries(defaults)) {
    if (field in out) out[field] = parseJson(out[field], fallback);
  }
  return out;
}

function sessionChanges(updates) {
  if (!isPlainObject(updates)) throw new TypeError("Swarm session updates must be a JSON object");
  for (const field of Object.keys(updates)) {
    if (field !== "actorId" && !SESSION_MUTABLE_FIELDS.has(field)) {
      throw new Error(`Unknown or immutable swarm session field: ${field}`);
    }
  }
  const changes = {};
  if ("name" in updates) changes.name = validateText(updates.name, "name", { required: true });
  if ("strategy" in updates) changes.strategy = validateText(updates.strategy, "strategy", { required: true });
  if ("status" in updates) {
    if (!SESSION_STATUSES.has(updates.status)) throw new Error(`Invalid swarm status: ${updates.status}`);
    changes.status = updates.status;
  }
  if ("targetObjective" in updates) {
    changes.targetObjective = validateText(updates.targetObjective, "targetObjective", { required: true });
  }
  if ("config" in updates) {
    changes.config = updates.config;
    changes.configSerialized = serializePayload(updates.config, "config", {});
  }
  if ("result" in updates) {
    changes.result = updates.result;
    changes.resultSerialized = updates.result == null ? null : serializePayload(updates.result, "result");
  }
  for (const field of ["startedAt", "completedAt"]) {
    if (field in updates) changes[field] = updates[field] || null;
  }
  return changes;
}

export async function getSwarmSessions(filter = {}) {
  if (!isPlainObject(filter)) throw new TypeError("Swarm session filter must be a JSON object");
  const db = await getAdapter();
  const args = [];
  const where = [];
  const actorId = authorizeReadActor(db, filter.actorId);
  where.push("id IN (SELECT swarmId FROM swarmBots WHERE botId=? AND status='active')");
  args.push(actorId);
  for (const key of ["status", "strategy"]) {
    if (filter[key] !== undefined) {
      if (key === "status" && !SESSION_STATUSES.has(filter[key])) throw new Error(`Invalid swarm status: ${filter[key]}`);
      where.push(`${key}=?`);
      args.push(filter[key]);
    }
  }
  const { limit, offset } = normalizePagination(filter);
  return db
    .all(
      `SELECT * FROM swarmSessions ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    )
    .map(map);
}

export async function getSwarmSessionById(id, actorId) {
  const db = await getAdapter();
  authorizeSessionRead(db, id, actorId);
  return map(db.get("SELECT * FROM swarmSessions WHERE id=?", [id]));
}

export async function createSwarmSession(data, actorId) {
  if (!isPlainObject(data)) throw new TypeError("Swarm session data must be a JSON object");
  validateText(data.targetObjective, "targetObjective", { required: true });
  if (data.name !== undefined) validateText(data.name, "name", { required: true });
  if (data.strategy !== undefined) validateText(data.strategy, "strategy", { required: true });
  if (data.status !== undefined && !SESSION_STATUSES.has(data.status)) {
    throw new Error(`Invalid swarm status: ${data.status}`);
  }
  const db = await getAdapter();
  authorizeCoordinator(db, actorId);
  const timestamp = now();
  const configSerialized = serializePayload(data.config, "config", {});
  const session = {
    id: data.id || uuidv4(),
    name: data.name || "Swarm",
    strategy: data.strategy || "aco",
    status: data.status || "pending",
    targetObjective: data.targetObjective,
    config: data.config || {},
    result: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null,
  };
  db.transaction(() => {
    db.run(
      "INSERT INTO swarmSessions (id,name,strategy,status,targetObjective,config,result,createdAt,updatedAt,startedAt,completedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [session.id, session.name, session.strategy, session.status, session.targetObjective, configSerialized, null, timestamp, timestamp, null, null],
    );
    db.run(
      "INSERT INTO swarmBots (id,swarmId,botId,role,status,joinedAt,leftAt,metadata) VALUES (?,?,?,?,?,?,?,?)",
      [uuidv4(), session.id, actorId.id ?? actorId.botId, "coordinator", "active", timestamp, null, "{}"],
    );
    writeRepositoryAudit(db, { actorId: actorId.id ?? actorId.botId, resourceType: "swarmSession", resourceId: session.id, swarmId: session.id, action: "create", snapshot: session });
  });
  return map(session);
}

export async function updateSwarmSession(id, updates, actorId) {
  const existing = await getSwarmSessionById(id, actorId);
  if (!existing) return null;
  const db = await getAdapter();
  const actor = actorId === undefined && isPlainObject(updates) ? updates.actorId : actorId;
  authorizeCoordinator(db, actor);
  const changes = sessionChanges(updates);
  const session = { ...existing, ...changes, updatedAt: now() };
  db.transaction(() => {
    db.run(
      "UPDATE swarmSessions SET name=?,strategy=?,status=?,targetObjective=?,config=?,result=?,updatedAt=?,startedAt=?,completedAt=? WHERE id=?",
      [
        session.name,
        session.strategy,
        session.status,
        session.targetObjective,
        changes.configSerialized ?? serializePayload(session.config, "config", {}),
        changes.resultSerialized !== undefined
          ? changes.resultSerialized
          : session.result == null
            ? null
            : serializePayload(session.result, "result"),
        session.updatedAt,
        session.startedAt || null,
        session.completedAt || null,
        id,
      ],
    );
    writeRepositoryAudit(db, { actorId: actor.id ?? actor.botId, resourceType: "swarmSession", resourceId: id, swarmId: id, action: "update", snapshot: session });
  });
  return getSwarmSessionById(id, actor);
}

export async function deleteSwarmSession(id, actorId) {
  const db = await getAdapter();
  authorizeCoordinator(db, actorId);
  authorizeActor(db, id, actorId);
  db.transaction(() => {
    db.run("DELETE FROM swarmSessions WHERE id=?", [id]);
    writeRepositoryAudit(db, { actorId: actorId.id ?? actorId.botId, resourceType: "swarmSession", resourceId: id, swarmId: id, action: "delete" });
  });
  return true;
}

export async function addBotToSwarm(swarmId, botId, role = null, actorId) {
  let effectiveRole = role;
  let effectiveActorId = actorId;
  if (isPlainObject(role)) {
    effectiveActorId = role.actorId;
    effectiveRole = role.role ?? null;
  }
  const db = await getAdapter();
  const coordinatorId = authorizeCoordinator(db, effectiveActorId);
  const activeMember = db.get(
    "SELECT 1 FROM swarmBots WHERE swarmId=? AND botId=? AND status='active'",
    [swarmId, coordinatorId],
  );
  if (!activeMember) {
    throw new Error("Coordinator is not authorized for swarm");
  }
  const row = {
    id: uuidv4(),
    swarmId,
    botId: typeof botId === "string" && botId.trim() ? botId.trim() : (() => { throw new TypeError("botId is required"); })(),
    role: effectiveRole == null ? null : validateText(effectiveRole, "role", { required: true }),
    status: "active",
    joinedAt: now(),
  };
  db.transaction(() => {
    db.run(
      "INSERT INTO swarmBots (id,swarmId,botId,role,status,joinedAt,leftAt,metadata) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(swarmId,botId) DO UPDATE SET role=excluded.role,status='active',leftAt=NULL",
      [row.id, row.swarmId, row.botId, row.role, row.status, row.joinedAt, null, "{}"],
    );
    writeRepositoryAudit(db, { actorId: effectiveActorId.id ?? effectiveActorId.botId, resourceType: "swarmMembership", resourceId: row.id, swarmId, action: "add", snapshot: row });
  });
  return getSwarmBots(swarmId, { actorId: effectiveActorId });
}

export async function removeBotFromSwarm(swarmId, botId, actorId) {
  const db = await getAdapter();
  authorizeCoordinator(db, actorId);
  authorizeActor(db, swarmId, actorId);
  db.transaction(() => {
    db.run("UPDATE swarmBots SET status='removed',leftAt=? WHERE swarmId=? AND botId=?", [now(), swarmId, botId]);
    writeRepositoryAudit(db, { actorId: actorId.id ?? actorId.botId, resourceType: "swarmMembership", resourceId: `${swarmId}:${botId}`, swarmId, action: "remove" });
  });
  return true;
}

export async function getSwarmBots(swarmId, options = {}) {
  const db = await getAdapter();
  authorizeActor(db, swarmId, options.actorId);
  const { limit, offset } = normalizePagination(options);
  return db
    .all(
      "SELECT * FROM swarmBots WHERE swarmId=? AND status != 'removed' ORDER BY joinedAt ASC, id ASC LIMIT ? OFFSET ?",
      [swarmId, limit, offset],
    )
    .map(map);
}

export async function depositPheromone(swarmId, pathKey, amount, meta = {}, actorId) {
  validateText(pathKey, "pathKey", { required: true });
  validateFiniteNumber(amount, "amount", 0, MAX_PHEROMONE_VALUE);
  const metadataSerialized = serializePayload(meta, "metadata", {});
  const db = await getAdapter();
  authorizeActor(db, swarmId, actorId);
  const timestamp = now();
  db.transaction(() => {
    db.run(
      "INSERT INTO swarmPheromones (id,swarmId,pathKey,depositAmount,reinforcementValue,strength,metadata,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(swarmId,pathKey) DO UPDATE SET depositAmount=depositAmount+excluded.depositAmount,reinforcementValue=reinforcementValue+excluded.reinforcementValue,strength=strength+excluded.strength,metadata=excluded.metadata,updatedAt=excluded.updatedAt",
      [uuidv4(), swarmId, pathKey, amount, amount, amount, metadataSerialized, timestamp, timestamp],
    );
    writeRepositoryAudit(db, { actorId: actorId.id ?? actorId.botId, resourceType: "pheromone", resourceId: `${swarmId}:${pathKey}`, swarmId, action: "deposit", snapshot: meta });
  });
  return getPheromones(swarmId, { actorId });
}

export async function decayPheromones(swarmId, decayFactor, actorId) {
  validateFiniteNumber(decayFactor, "decayFactor", 0, 1);
  const db = await getAdapter();
  authorizeActor(db, swarmId, actorId);
  db.transaction(() => {
    db.run("UPDATE swarmPheromones SET strength=MAX(0,strength*(1-?)),updatedAt=? WHERE swarmId=?", [decayFactor, now(), swarmId]);
    writeRepositoryAudit(db, { actorId: actorId.id ?? actorId.botId, resourceType: "pheromone", resourceId: swarmId, swarmId, action: "decay", snapshot: { decayFactor } });
  });
  return getPheromones(swarmId, { actorId });
}

export async function getPheromones(swarmId, minStrength = 0, options = {}) {
  let effectiveMinStrength = minStrength;
  let paginationOptions = options;
  if (isPlainObject(minStrength)) {
    paginationOptions = minStrength;
    effectiveMinStrength = paginationOptions.minStrength ?? 0;
  }
  validateFiniteNumber(effectiveMinStrength, "minStrength", 0, MAX_PHEROMONE_VALUE);
  const db = await getAdapter();
  authorizeActor(db, swarmId, paginationOptions.actorId);
  const { limit, offset } = normalizePagination(paginationOptions);
  return db
    .all(
      "SELECT * FROM swarmPheromones WHERE swarmId=? AND strength>=? ORDER BY strength DESC, id ASC LIMIT ? OFFSET ?",
      [swarmId, effectiveMinStrength, limit, offset],
    )
    .map(map);
}

export async function recordColonyIteration(data, actorId) {
  if (!isPlainObject(data)) throw new TypeError("Colony iteration data must be a JSON object");
  validateNonNegativeInteger(data.iteration, "iteration");
  if (data.phase !== undefined && !ITERATION_PHASES.has(data.phase)) {
    throw new Error(`Invalid iteration phase: ${data.phase}`);
  }
  const explorationRate = data.explorationRate ?? 0.5;
  const exploitationRate = data.exploitationRate ?? 0.5;
  validateFiniteNumber(explorationRate, "explorationRate", 0, 1);
  validateFiniteNumber(exploitationRate, "exploitationRate", 0, 1);
  const metricsSerialized = serializePayload(data.metrics, "metrics", {});
  const db = await getAdapter();
  authorizeActor(db, data.swarmId, actorId === undefined ? data.actorId : actorId);
  const row = {
    id: data.id || uuidv4(),
    swarmId: data.swarmId,
    iteration: data.iteration,
    phase: data.phase || "exploration",
    explorationRate,
    exploitationRate,
    bestPath: data.bestPath == null ? null : validateText(data.bestPath, "bestPath"),
    metrics: data.metrics || {},
    startedAt: data.startedAt || null,
    completedAt: data.completedAt || null,
    createdAt: now(),
  };
  db.transaction(() => {
    db.run(
      "INSERT INTO swarmColonyIterations (id,swarmId,iteration,phase,explorationRate,exploitationRate,bestPath,metrics,startedAt,completedAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [row.id, row.swarmId, row.iteration, row.phase, row.explorationRate, row.exploitationRate, row.bestPath, metricsSerialized, row.startedAt, row.completedAt, row.createdAt],
    );
    writeRepositoryAudit(db, { actorId: actorId.id ?? actorId.botId, resourceType: "colonyIteration", resourceId: row.id, swarmId: row.swarmId, action: "create", snapshot: row });
  });
  return map(row);
}

export async function getColonyIterations(swarmId, options = {}) {
  const db = await getAdapter();
  authorizeActor(db, swarmId, options.actorId);
  const { limit, offset } = normalizePagination(options);
  return db
    .all(
      "SELECT * FROM swarmColonyIterations WHERE swarmId=? ORDER BY iteration ASC, id ASC LIMIT ? OFFSET ?",
      [swarmId, limit, offset],
    )
    .map(map);
}

export async function recordConvergenceMetric(data, actorId) {
  if (!isPlainObject(data)) throw new TypeError("Convergence metric data must be a JSON object");
  validateNonNegativeInteger(data.iteration, "iteration");
  const variance = data.variance ?? 0;
  const consensusScore = data.consensusScore ?? 0;
  const convergenceScore = data.convergenceScore ?? 0;
  const sampleCount = data.sampleCount ?? 0;
  validateFiniteNumber(variance, "variance", 0, MAX_PHEROMONE_VALUE);
  validateFiniteNumber(consensusScore, "consensusScore", 0, 1);
  validateFiniteNumber(convergenceScore, "convergenceScore", 0, 1);
  validateNonNegativeInteger(sampleCount, "sampleCount");
  const metadataSerialized = serializePayload(data.metadata, "metadata", {});
  const db = await getAdapter();
  authorizeActor(db, data.swarmId, actorId === undefined ? data.actorId : actorId);
  const row = {
    id: data.id || uuidv4(),
    swarmId: data.swarmId,
    iterationId: data.iterationId || null,
    iteration: data.iteration,
    variance,
    consensusScore,
    convergenceScore,
    converged: data.converged ? 1 : 0,
    sampleCount,
    metadata: data.metadata || {},
    createdAt: now(),
  };
  db.transaction(() => {
    db.run(
      "INSERT INTO swarmConvergenceMetrics (id,swarmId,iterationId,iteration,variance,consensusScore,convergenceScore,converged,sampleCount,metadata,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [row.id, row.swarmId, row.iterationId, row.iteration, row.variance, row.consensusScore, row.convergenceScore, row.converged, row.sampleCount, metadataSerialized, row.createdAt],
    );
    writeRepositoryAudit(db, { actorId: actorId.id ?? actorId.botId, resourceType: "convergenceMetric", resourceId: row.id, swarmId: row.swarmId, action: "create", snapshot: row });
  });
  return map(row);
}

export async function getConvergenceHistory(swarmId, options = {}) {
  const db = await getAdapter();
  authorizeActor(db, swarmId, options.actorId);
  const { limit, offset } = normalizePagination(options);
  return db
    .all(
      "SELECT * FROM swarmConvergenceMetrics WHERE swarmId=? ORDER BY iteration ASC, id ASC LIMIT ? OFFSET ?",
      [swarmId, limit, offset],
    )
    .map(map);
}
