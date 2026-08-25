import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

const now = () => new Date().toISOString();
const jsonFields = ["toolWhitelist", "capabilityWeights", "config", "input", "output", "result"];
function mapRow(row) {
  if (!row) return null;
  const out = { ...row };
  for (const field of jsonFields) if (field in out) out[field] = parseJson(out[field], field === "toolWhitelist" ? [] : {});
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

export async function getBots() { const db = await getAdapter(); return db.all("SELECT * FROM hermesBots ORDER BY createdAt ASC").map(mapRow); }
export async function getBotById(id) { const db = await getAdapter(); return mapRow(db.get("SELECT * FROM hermesBots WHERE id = ?", [id])); }
export async function createBot(data) {
  if (!data?.name?.trim()) throw new Error("Bot name is required");
  const db = await getAdapter(), timestamp = now();
  const bot = { id: data.id || uuidv4(), name: data.name.trim(), role: data.role || "worker", systemPrompt: data.systemPrompt || "", comboId: data.comboId || null, toolWhitelist: data.toolWhitelist || [], capabilityWeights: data.capabilityWeights || {}, config: data.config || {}, enabled: data.enabled === undefined ? 1 : (data.enabled ? 1 : 0), createdAt: timestamp, updatedAt: timestamp };
  db.run("INSERT INTO hermesBots (id,name,role,systemPrompt,comboId,toolWhitelist,capabilityWeights,config,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [bot.id, bot.name, bot.role, bot.systemPrompt, bot.comboId, stringifyJson(bot.toolWhitelist), stringifyJson(bot.capabilityWeights), stringifyJson(bot.config), bot.enabled, bot.createdAt, bot.updatedAt]);
  return mapRow(bot);
}
export async function updateBot(id, changes) {
  const existing = await getBotById(id); if (!existing) return null;
  const db = await getAdapter(), bot = { ...existing, ...changes, updatedAt: now() };
  db.run("UPDATE hermesBots SET name=?,role=?,systemPrompt=?,comboId=?,toolWhitelist=?,capabilityWeights=?,config=?,enabled=?,updatedAt=? WHERE id=?", [bot.name, bot.role, bot.systemPrompt, bot.comboId || null, stringifyJson(bot.toolWhitelist || []), stringifyJson(bot.capabilityWeights || {}), stringifyJson(bot.config || {}), bot.enabled ? 1 : 0, bot.updatedAt, id]);
  return mapRow(bot);
}
export async function deleteBot(id) { const db = await getAdapter(); db.run("DELETE FROM hermesBots WHERE id = ?", [id]); return true; }

export async function getTasks(filter = {}) { const db = await getAdapter(), f = taskFilter(filter); return db.all(`SELECT * FROM hermesTasks ${f.where} ORDER BY priority DESC, createdAt ASC`, f.args).map(mapRow); }
export async function getTaskById(id) { const db = await getAdapter(); return mapRow(db.get("SELECT * FROM hermesTasks WHERE id = ?", [id])); }
export async function createTask(data) {
  if (!data?.title?.trim()) throw new Error("Task title is required");
  const db = await getAdapter(), timestamp = now(), task = { id: data.id || uuidv4(), parentTaskId: data.parentTaskId || null, swarmId: data.swarmId || null, assignedBotId: data.assignedBotId || null, title: data.title.trim(), description: data.description || null, input: data.input || {}, status: data.status || "pending", priority: data.priority || 0, retryCount: 0, maxRetries: data.maxRetries ?? 3, error: null, result: null, scheduledAt: data.scheduledAt || null, startedAt: null, completedAt: null, createdAt: timestamp, updatedAt: timestamp };
  db.run("INSERT INTO hermesTasks (id,parentTaskId,swarmId,assignedBotId,title,description,input,status,priority,retryCount,maxRetries,error,result,scheduledAt,startedAt,completedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [task.id, task.parentTaskId, task.swarmId, task.assignedBotId, task.title, task.description, stringifyJson(task.input), task.status, task.priority, task.retryCount, task.maxRetries, null, null, task.scheduledAt, null, null, timestamp, timestamp]);
  return mapRow(task);
}
export async function updateTaskStatus(id, status, result = null) {
  const db = await getAdapter(), timestamp = now();
  db.run("UPDATE hermesTasks SET status=?, result=?, startedAt=CASE WHEN ?='running' THEN COALESCE(startedAt, ?) ELSE startedAt END, completedAt=CASE WHEN ? IN ('completed','failed') THEN ? ELSE completedAt END, updatedAt=? WHERE id=?", [status, result == null ? null : stringifyJson(result), status, timestamp, status, timestamp, timestamp, id]);
  return getTaskById(id);
}
export async function claimNextPendingTask(botId) {
  const db = await getAdapter(); let task;
  db.transaction(() => { task = db.get("SELECT * FROM hermesTasks WHERE status='pending' ORDER BY priority DESC, createdAt ASC LIMIT 1"); if (task) db.run("UPDATE hermesTasks SET status='assigned', assignedBotId=?, updatedAt=? WHERE id=? AND status='pending'", [botId, now(), task.id]); });
  return task ? getTaskById(task.id) : null;
}
export async function failTask(id, error) { const db = await getAdapter(); db.run("UPDATE hermesTasks SET status='failed', error=?, retryCount=retryCount+1, completedAt=?, updatedAt=? WHERE id=?", [stringifyJson(error), now(), now(), id]); return getTaskById(id); }
export async function recordTaskStep(taskId, data = {}) {
  const stepIndex = data.stepIndex;
  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    throw new RangeError("stepIndex must be a non-negative integer");
  }
  const db = await getAdapter();
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
  db.run(
    "INSERT INTO hermesTaskSteps (id,taskId,stepIndex,name,status,input,output,error,startedAt,completedAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [step.id, taskId, step.stepIndex, step.name, step.status, stringifyJson(step.input), step.output == null ? null : stringifyJson(step.output), step.error == null ? null : stringifyJson(step.error), step.startedAt, step.completedAt, step.createdAt],
  );
  return mapRow(step);
}
export async function getTaskSteps(taskId) { const db = await getAdapter(); return db.all("SELECT * FROM hermesTaskSteps WHERE taskId=? ORDER BY stepIndex ASC", [taskId]).map(mapRow); }
