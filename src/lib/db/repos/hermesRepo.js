import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { requirePermission, requirePayloadSize, pagination, writeRepositoryAudit } from "./security.js";

const now = () => new Date().toISOString();
const BOT_ROLES = new Set(["coordinator", "worker", "specialist", "evaluator", "synthesizer"]);
const TASK_STATUSES = new Set(["pending", "assigned", "running", "completed", "failed"]);
const BOT_MUTABLE_FIELDS = new Set([
  "name",
  "role",
  "systemPrompt",
  "comboId",
  "toolWhitelist",
  "capabilityWeights",
  "config",
  "enabled",
]);
const jsonDefaults = {
  toolWhitelist: [],
  capabilityWeights: {},
  config: {},
  input: {},
  output: null,
  result: null,
  error: null,
};

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonObject(value, field) {
  if (!isPlainObject(value)) throw new TypeError(`${field} must be a JSON object`);
  return value;
}

function normalizeStringArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new TypeError(`${field} must be an array of non-empty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function normalizeText(value, field, maxLength = 16 * 1024) {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  if (value.length > maxLength) throw new RangeError(`${field} exceeds maximum length of ${maxLength}`);
  return value;
}

function normalizeId(value, field) {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new TypeError(`${field} must be a non-empty string <= 256 chars`);
  return value.trim();
}

function validateBotField(field, value) {
  switch (field) {
    case "name":
      if (typeof value !== "string" || !value.trim()) throw new Error("Bot name is required");
      return value.trim();
    case "role":
      if (typeof value !== "string" || !BOT_ROLES.has(value)) throw new Error(`Invalid bot role: ${value}`);
      return value;
    case "systemPrompt":
      if (typeof value !== "string") throw new TypeError("systemPrompt must be a string");
      return value;
    case "comboId":
      if (value === null || value === undefined || value === "") return null;
      if (typeof value !== "string") throw new TypeError("comboId must be a string or null");
      return value.trim() || null;
    case "toolWhitelist":
      return normalizeStringArray(value, "toolWhitelist");
    case "capabilityWeights":
      return validateJsonObject(value, "capabilityWeights");
    case "config":
      return validateJsonObject(value, "config");
    case "enabled":
      if (typeof value !== "boolean" && value !== 0 && value !== 1) {
        throw new TypeError("enabled must be a boolean");
      }
      return Boolean(value);
    default:
      throw new Error(`Unknown or immutable bot field: ${field}`);
  }
}

function validateBotChanges(changes = {}) {
  if (!isPlainObject(changes)) throw new TypeError("Bot changes must be a JSON object");
  for (const field of Object.keys(changes)) {
    if (!BOT_MUTABLE_FIELDS.has(field)) throw new Error(`Unknown or immutable bot field: ${field}`);
  }
  return Object.fromEntries(Object.entries(changes).map(([field, value]) => [field, validateBotField(field, value)]));
}

function mapRow(row) {
  if (!row) return null;
  const out = { ...row };
  for (const [field, fallback] of Object.entries(jsonDefaults)) {
    if (field in out) out[field] = parseJson(out[field], fallback);
  }
  if ("enabled" in out) out.enabled = Boolean(out.enabled);
  return out;
}
function taskFilter(filter = {}) {
  const clauses = [], args = [];
  for (const key of ["status", "swarmId", "assignedBotId", "parentTaskId"]) {
    if (filter[key] !== undefined) { clauses.push(`${key} = ?`); args.push(filter[key]); }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", args };
}

function isPrivilegedActor(actorCtx) {
  return actorCtx.permissions.has("*") || actorCtx.roles.has("admin");
}

function authorizeTaskMutation(db, task, actorCtx, action) {
  if (isPrivilegedActor(actorCtx)) return;
  const bot = db.get("SELECT id,role,enabled FROM hermesBots WHERE id=?", [actorCtx.principalId]);
  if (!bot?.enabled) throw new Error(`Actor ${actorCtx.principalId} is not authorized to ${action} task`);
  if (task.assignedBotId === actorCtx.principalId) return;
  if (bot.role === "coordinator" && task.swarmId) {
    const member = db.get(
      "SELECT 1 FROM swarmBots WHERE swarmId=? AND botId=? AND status='active'",
      [task.swarmId, actorCtx.principalId],
    );
    if (member) return;
  }
  throw new Error(`Actor ${actorCtx.principalId} is not authorized to ${action} task`);
}

function authorizeTaskRead(db, task, actorCtx) {
  if (isPrivilegedActor(actorCtx)) return;
  if (task.assignedBotId === actorCtx.principalId) return;
  if (task.swarmId) {
    const member = db.get(
      "SELECT 1 FROM swarmBots WHERE swarmId=? AND botId=? AND status='active'",
      [task.swarmId, actorCtx.principalId],
    );
    if (member) return;
  }
  throw new Error(`Actor ${actorCtx.principalId} is not authorized to read task`);
}

function requireBotAdmin(actorCtx) {
  if (!isPrivilegedActor(actorCtx)) throw new Error("Bot administration requires admin authorization");
}

function taskBotCapabilities(db, botId) {
  const bot = db.get("SELECT capabilityWeights,toolWhitelist FROM hermesBots WHERE id=? AND enabled=1", [botId]);
  if (!bot) throw new Error("Claim bot is not enabled");
  const weights = parseJson(bot.capabilityWeights, {});
  const whitelist = parseJson(bot.toolWhitelist, []);
  return new Set([
    ...Object.entries(isPlainObject(weights) ? weights : {})
      .filter(([, value]) => typeof value === "number" ? value > 0 : Boolean(value))
      .map(([name]) => name),
    ...(Array.isArray(whitelist) ? whitelist : []),
  ]);
}

async function getBotByIdRaw(id) {
  const db = await getAdapter();
  return mapRow(db.get("SELECT * FROM hermesBots WHERE id = ?", [id]));
}

export async function getBots(actor, options = {}) {
  const actorCtx = requirePermission(actor, "hermes:read");
  const db = await getAdapter();
  const { limit, offset } = pagination(options);
  if (!isPrivilegedActor(actorCtx)) {
    return db.all("SELECT * FROM hermesBots WHERE id=? LIMIT ? OFFSET ?", [actorCtx.principalId, limit, offset]).map(mapRow);
  }
  return db.all("SELECT * FROM hermesBots ORDER BY createdAt ASC, id ASC LIMIT ? OFFSET ?", [limit, offset]).map(mapRow);
}
export async function getBotById(id, actor) {
  const actorCtx = requirePermission(actor, "hermes:read");
  if (!isPrivilegedActor(actorCtx) && actorCtx.principalId !== id) {
    throw new Error("Actor is not authorized to read bot");
  }
  return getBotByIdRaw(id);
}
export async function createBot(data, actor) {
  const actorCtx = requirePermission(actor, "hermes:write");
  requireBotAdmin(actorCtx);
  if (!isPlainObject(data)) throw new TypeError("Bot data must be a JSON object");
  const botFields = validateBotChanges({
    name: data.name,
    role: data.role || "worker",
    systemPrompt: data.systemPrompt || "",
    comboId: data.comboId || null,
    toolWhitelist: data.toolWhitelist || [],
    capabilityWeights: data.capabilityWeights || {},
    config: data.config || {},
    enabled: data.enabled === undefined ? true : data.enabled,
  });
  const db = await getAdapter(), timestamp = now();
  for (const [field, value] of [["systemPrompt", data.systemPrompt || ""], ["toolWhitelist", botFields.toolWhitelist], ["capabilityWeights", botFields.capabilityWeights], ["config", botFields.config]]) {
    requirePayloadSize(value, field);
  }
  const bot = { id: normalizeId(data.id || uuidv4(), "Bot ID"), ...botFields, enabled: botFields.enabled ? 1 : 0, createdAt: timestamp, updatedAt: timestamp };
  db.transaction(() => {
    db.run("INSERT INTO hermesBots (id,name,role,systemPrompt,comboId,toolWhitelist,capabilityWeights,config,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [bot.id, bot.name, bot.role, bot.systemPrompt, bot.comboId, stringifyJson(bot.toolWhitelist), stringifyJson(bot.capabilityWeights), stringifyJson(bot.config), bot.enabled, bot.createdAt, bot.updatedAt]);
    writeRepositoryAudit(db, { actorId: actorCtx.principalId, resourceType: "hermesBot", resourceId: bot.id, action: "create", snapshot: bot });
  });
  return mapRow(bot);
}
export async function updateBot(id, changes = {}, actor) {
  const actorCtx = requirePermission(actor, "hermes:write");
  requireBotAdmin(actorCtx);
  const existing = await getBotByIdRaw(id); if (!existing) return null;
  const normalizedChanges = validateBotChanges(changes);
  for (const [field, value] of Object.entries(normalizedChanges)) requirePayloadSize(value, field);
  const db = await getAdapter(), bot = { ...existing, ...normalizedChanges }, timestamp = now();
  db.transaction(() => {
    const write = db.run("UPDATE hermesBots SET name=?,role=?,systemPrompt=?,comboId=?,toolWhitelist=?,capabilityWeights=?,config=?,enabled=?,updatedAt=? WHERE id=?", [
      bot.name,
      bot.role,
      bot.systemPrompt,
      bot.comboId,
      stringifyJson(bot.toolWhitelist),
      stringifyJson(bot.capabilityWeights),
      stringifyJson(bot.config),
      bot.enabled ? 1 : 0,
      timestamp,
      id,
    ]);
    if ((write?.changes ?? 0) !== 1) throw new Error("Bot changed concurrently");
    writeRepositoryAudit(db, { actorId: actorCtx.principalId, resourceType: "hermesBot", resourceId: id, action: "update", snapshot: bot });
  });
  return getBotByIdRaw(id);
}
export async function deleteBot(id, actor) {
  const actorCtx = requirePermission(actor, "hermes:write");
  requireBotAdmin(actorCtx);
  const db = await getAdapter();
  db.transaction(() => {
    db.run("DELETE FROM hermesBots WHERE id = ?", [id]);
    writeRepositoryAudit(db, { actorId: actorCtx.principalId, resourceType: "hermesBot", resourceId: id, action: "delete" });
  });
  return true;
}

export async function getTasks(filter = {}, actor) {
  const actorCtx = requirePermission(actor, "hermes:read");
  const db = await getAdapter(), f = taskFilter(filter), { limit, offset } = pagination(filter);
  if (!isPrivilegedActor(actorCtx)) {
    f.where = f.where ? `${f.where} AND ` : "WHERE ";
    f.where += "(assignedBotId=? OR swarmId IN (SELECT swarmId FROM swarmBots WHERE botId=? AND status='active'))";
    f.args.push(actorCtx.principalId, actorCtx.principalId);
  }
  return db.all(`SELECT * FROM hermesTasks ${f.where} ORDER BY priority DESC, createdAt ASC LIMIT ? OFFSET ?`, [...f.args, limit, offset]).map(mapRow);
}
async function getTaskByIdRaw(id) {
  const db = await getAdapter();
  return mapRow(db.get("SELECT * FROM hermesTasks WHERE id = ?", [id]));
}
export async function getTaskById(id, actor) {
  const actorCtx = requirePermission(actor, "hermes:read");
  const task = await getTaskByIdRaw(id);
  if (task) {
    const db = await getAdapter();
    authorizeTaskRead(db, task, actorCtx);
  }
  return task;
}
export async function createTask(data, actor) {
  const actorCtx = requirePermission(actor, "hermes:write");
  if (!data?.title?.trim()) throw new Error("Task title is required");
  if (data.status !== undefined && data.status !== "pending") {
    throw new Error("Tasks must be created with pending status");
  }
  if (data.maxRetries !== undefined && (!Number.isInteger(data.maxRetries) || data.maxRetries < 0)) {
    throw new RangeError("maxRetries must be a non-negative integer");
  }
  let input = data.input === undefined ? {} : data.input;
  requirePayloadSize(input, "task input");
  if (data.requiredCapabilities !== undefined || data.capabilities !== undefined) {
    const requested = data.requiredCapabilities ?? data.capabilities;
    if (!isPlainObject(input)) throw new TypeError("input must be a JSON object when capabilities are specified");
    input = { ...input };
    input.requiredCapabilities = normalizeStringArray(requested, "requiredCapabilities");
  }
  requirePayloadSize(input, "task input");
  for (const [field, value] of [["Task ID", data.id || uuidv4()], ["parentTaskId", data.parentTaskId], ["swarmId", data.swarmId], ["assignedBotId", data.assignedBotId], ["scheduledAt", data.scheduledAt]]) {
    if (value !== undefined && value !== null) normalizeId(value, field);
  }
  const db = await getAdapter(), timestamp = now(), task = { id: normalizeId(data.id || uuidv4(), "Task ID"), parentTaskId: data.parentTaskId || null, swarmId: data.swarmId || null, assignedBotId: data.assignedBotId || null, title: normalizeText(data.title.trim(), "Task title"), description: data.description == null ? null : normalizeText(data.description, "Task description"), input, status: data.status || "pending", priority: data.priority || 0, retryCount: 0, maxRetries: data.maxRetries ?? 3, error: null, result: null, scheduledAt: data.scheduledAt || null, startedAt: null, completedAt: null, createdAt: timestamp, updatedAt: timestamp };
  if (!isPrivilegedActor(actorCtx)) {
    if (task.assignedBotId && task.assignedBotId !== actorCtx.principalId) {
      throw new Error("Actor may only assign tasks to own bot");
    }
    if (task.swarmId) {
      const member = db.get("SELECT 1 FROM swarmBots WHERE swarmId=? AND botId=? AND status='active'", [task.swarmId, actorCtx.principalId]);
      if (!member) throw new Error("Actor is not authorized for swarm");
      if (task.assignedBotId) {
        const assignedMember = db.get("SELECT 1 FROM swarmBots WHERE swarmId=? AND botId=? AND status='active'", [task.swarmId, task.assignedBotId]);
        if (!assignedMember) throw new Error("Assigned bot is not a member of swarm");
      }
    }
  }
  db.transaction(() => {
    db.run("INSERT INTO hermesTasks (id,parentTaskId,swarmId,assignedBotId,title,description,input,status,priority,retryCount,maxRetries,error,result,scheduledAt,startedAt,completedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [task.id, task.parentTaskId, task.swarmId, task.assignedBotId, task.title, task.description, stringifyJson(task.input), task.status, task.priority, task.retryCount, task.maxRetries, null, null, task.scheduledAt, null, null, timestamp, timestamp]);
    writeRepositoryAudit(db, { actorId: actorCtx.principalId, resourceType: "hermesTask", resourceId: task.id, swarmId: task.swarmId, action: "create", snapshot: task });
  });
  return mapRow(task);
}
export async function updateTaskStatus(id, status, result = null, actor) {
  const actorCtx = requirePermission(actor, "hermes:write");
  if (result !== null) requirePayloadSize(result, "task result");
  if (!TASK_STATUSES.has(status)) throw new Error(`Invalid task status: ${status}`);
  if (status === "pending") return requeueTask(id, actor);

  const db = await getAdapter();
  let updated = null;
  db.transaction(() => {
    const existing = mapRow(db.get("SELECT * FROM hermesTasks WHERE id = ?", [id]));
    if (!existing) return;
    authorizeTaskMutation(db, existing, actorCtx, "update");
    const allowedTransitions = {
      pending: new Set(["pending", "assigned", "running", "failed"]),
      assigned: new Set(["assigned", "running", "failed", "pending"]),
      running: new Set(["running", "completed", "failed"]),
      failed: new Set(["failed"]),
      completed: new Set(["completed"]),
    };
    if (!allowedTransitions[existing.status]?.has(status)) {
      throw new Error(`Invalid task transition: ${existing.status} -> ${status}`);
    }
    if (existing.status === "completed" && status !== "completed") {
      throw new Error("Cannot transition completed task");
    }
    if (existing.status === "failed" && status !== "failed") {
      throw new Error("Failed task must be requeued before transition");
    }
    if (status === "assigned" && !existing.assignedBotId) {
      throw new Error("Assigned task requires assignedBotId");
    }

    const timestamp = now();
    const isCompleted = status === "completed";
    const isRunning = status === "running";
    const write = db.run(
      "UPDATE hermesTasks SET status=?, result=?, error=?, startedAt=?, completedAt=?, updatedAt=? WHERE id=? AND status=?",
      [
        status,
        isCompleted && result != null ? stringifyJson(result) : null,
        status === "failed" || isCompleted ? existing.error : null,
        status === "failed" || isRunning || isCompleted ? existing.startedAt || timestamp : null,
        isCompleted ? timestamp : null,
        timestamp,
        id,
        existing.status,
      ],
    );
    if ((write?.changes ?? 0) !== 1) throw new Error("Task changed concurrently");
    updated = mapRow(db.get("SELECT * FROM hermesTasks WHERE id = ?", [id]));
    writeRepositoryAudit(db, { actorId: actorCtx.principalId, resourceType: "hermesTask", resourceId: id, swarmId: updated?.swarmId, action: "status", snapshot: updated });
  });
  return updated;
}

function normalizeCapabilities(capabilities) {
  if (capabilities === undefined || capabilities === null) return null;
  if (Array.isArray(capabilities)) return new Set(normalizeStringArray(capabilities, "capabilities"));
  if (isPlainObject(capabilities)) {
    return new Set(Object.entries(capabilities).filter(([, enabled]) => Boolean(enabled)).map(([name]) => name));
  }
  throw new TypeError("capabilities must be an array or JSON object");
}

function taskRequirements(task) {
  const input = task?.input;
  if (!isPlainObject(input)) return [];
  const required = input.requiredCapabilities ?? input.capabilities ?? [];
  if (!Array.isArray(required)) return [];
  return required
    .filter((capability) => typeof capability === "string" && capability.trim())
    .map((capability) => capability.trim());
}

function supportsTask(task, capabilities) {
  if (capabilities === null) return true;
  return taskRequirements(task).every((capability) => capabilities.has(capability));
}

export async function claimNextPendingTask(botId, capabilities, actor) {
  const actorCtx = requirePermission(actor, "hermes:write");
  const normalizedBotId = normalizeId(botId, "botId");
  if (!isPrivilegedActor(actorCtx) && actorCtx.principalId !== normalizedBotId) {
    throw new Error("Actor may only claim tasks for own bot");
  }
  const db = await getAdapter();
  const storedCapabilities = taskBotCapabilities(db, normalizedBotId);
  const requestedCapabilities = normalizeCapabilities(capabilities);
  const availableCapabilities = requestedCapabilities === null
    ? storedCapabilities
    : new Set([...requestedCapabilities].filter((capability) => storedCapabilities.has(capability)));
  let claimed = null;
  db.transaction(() => {
    const candidates = db.all("SELECT * FROM hermesTasks WHERE status='pending' ORDER BY priority DESC, createdAt ASC");
    for (const candidate of candidates) {
      const task = mapRow(candidate);
      if (!supportsTask(task, availableCapabilities)) continue;
      const write = db.run(
        "UPDATE hermesTasks SET status='assigned', assignedBotId=?, updatedAt=? WHERE id=? AND status='pending'",
        [botId, now(), task.id],
      );
      if ((write?.changes ?? 0) !== 1) continue;
      claimed = mapRow(db.get("SELECT * FROM hermesTasks WHERE id = ?", [task.id]));
      writeRepositoryAudit(db, { actorId: actorCtx.principalId, resourceType: "hermesTask", resourceId: task.id, swarmId: claimed.swarmId, action: "claim", snapshot: claimed });
      break;
    }
  });
  return claimed;
}

function parseFailureInput(input) {
  if (isPlainObject(input) && (Object.prototype.hasOwnProperty.call(input, "error") || Object.prototype.hasOwnProperty.call(input, "shouldRetry"))) {
    return { error: input.error ?? null, shouldRetry: input.shouldRetry === true };
  }
  return { error: input, shouldRetry: false };
}

export async function failTask(id, failure = null, actor) {
  const actorCtx = requirePermission(actor, "hermes:write");
  requirePayloadSize(failure, "task error");
  const { error, shouldRetry } = parseFailureInput(failure);
  const db = await getAdapter();
  let updated = null;
  db.transaction(() => {
    const existing = mapRow(db.get("SELECT * FROM hermesTasks WHERE id = ?", [id]));
    if (!existing) return;
    authorizeTaskMutation(db, existing, actorCtx, "fail");
    if (existing.status === "completed") throw new Error("Cannot fail completed task");
    if (existing.status === "failed" && !shouldRetry) {
      updated = existing;
      return;
    }

    const nextRetryCount = Math.min(existing.retryCount + 1, existing.maxRetries);
    const retry = shouldRetry && nextRetryCount < existing.maxRetries;
    const timestamp = now();
    const write = db.run(
      "UPDATE hermesTasks SET status=?, assignedBotId=?, error=?, result=?, retryCount=?, startedAt=?, completedAt=?, updatedAt=? WHERE id=? AND status=?",
      [
        retry ? "pending" : "failed",
        retry ? null : existing.assignedBotId,
        retry ? null : stringifyJson(error),
        null,
        nextRetryCount,
        null,
        retry ? null : timestamp,
        timestamp,
        id,
        existing.status,
      ],
    );
    if ((write?.changes ?? 0) !== 1) throw new Error("Task changed concurrently");
    updated = mapRow(db.get("SELECT * FROM hermesTasks WHERE id = ?", [id]));
    writeRepositoryAudit(db, { actorId: actorCtx.principalId, resourceType: "hermesTask", resourceId: id, swarmId: updated?.swarmId, action: "fail", snapshot: updated });
  });
  return updated;
}

export async function requeueTask(id, actor) {
  const actorCtx = requirePermission(actor, "hermes:write");
  const db = await getAdapter();
  let updated = null;
  db.transaction(() => {
    const existing = mapRow(db.get("SELECT * FROM hermesTasks WHERE id = ?", [id]));
    if (!existing) return;
    authorizeTaskMutation(db, existing, actorCtx, "requeue");
    if (existing.status === "pending") {
      updated = existing;
      return;
    }
    if (existing.status === "completed") {
      throw new Error("Cannot requeue completed task");
    }
    const write = db.run(
      "UPDATE hermesTasks SET status='pending', assignedBotId=NULL, error=NULL, result=NULL, startedAt=NULL, completedAt=NULL, updatedAt=? WHERE id=? AND status=?",
      [now(), id, existing.status],
    );
    if ((write?.changes ?? 0) !== 1) throw new Error("Task changed concurrently");
    updated = mapRow(db.get("SELECT * FROM hermesTasks WHERE id = ?", [id]));
    writeRepositoryAudit(db, {
      actorId: actorCtx.principalId,
      resourceType: "hermesTask",
      resourceId: id,
      swarmId: updated?.swarmId,
      action: "requeue",
      snapshot: updated,
    });
  });
  return updated;
}
export async function recordTaskStep(taskId, data = {}, actor) {
  const actorCtx = requirePermission(actor, "hermes:write");
  requirePayloadSize(data, "task step");
  const stepIndex = data.stepIndex;
  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    throw new RangeError("stepIndex must be a non-negative integer");
  }
  const db = await getAdapter();
  const task = mapRow(db.get("SELECT * FROM hermesTasks WHERE id=?", [taskId]));
  if (!task) throw new Error("Task not found");
  authorizeTaskMutation(db, task, actorCtx, "record step");
  requirePayloadSize(data.input ?? {}, "task step input");
  if (data.output != null) requirePayloadSize(data.output, "task step output");
  if (data.error != null) requirePayloadSize(data.error, "task step error");
  const step = {
    id: data.id || uuidv4(),
    taskId,
    stepIndex,
    name: data.name || null,
    status: data.status || "pending",
    input: data.input || {},
    output: data.output ?? null,
    error: data.error ?? null,
    startedAt: data.startedAt || null,
    completedAt: data.completedAt || null,
    createdAt: now(),
  };
  db.transaction(() => {
    db.run(
      "INSERT INTO hermesTaskSteps (id,taskId,stepIndex,name,status,input,output,error,startedAt,completedAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [step.id, taskId, step.stepIndex, step.name, step.status, stringifyJson(step.input), step.output == null ? null : stringifyJson(step.output), step.error == null ? null : stringifyJson(step.error), step.startedAt, step.completedAt, step.createdAt],
    );
    writeRepositoryAudit(db, { actorId: actorCtx.principalId, resourceType: "hermesTaskStep", resourceId: step.id, action: "create", snapshot: step });
  });
  return mapRow(step);
}
export async function getTaskSteps(taskId, actor, options = {}) {
  const actorCtx = requirePermission(actor, "hermes:read");
  const db = await getAdapter();
  const task = mapRow(db.get("SELECT * FROM hermesTasks WHERE id=?", [taskId]));
  if (!task) return [];
  authorizeTaskRead(db, task, actorCtx);
  const { limit, offset } = pagination(options);
  return db.all("SELECT * FROM hermesTaskSteps WHERE taskId=? ORDER BY stepIndex ASC LIMIT ? OFFSET ?", [taskId, limit, offset]).map(mapRow);
}
