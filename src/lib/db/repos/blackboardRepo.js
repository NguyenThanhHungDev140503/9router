import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { writeRepositoryAudit } from "./security.js";

const now = () => new Date().toISOString();
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;
const MAX_QUERY_LENGTH = 512;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_CONTENT_LENGTH = 16 * 1024;
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 64;
const MAX_SOURCE_LENGTH = 2_048;
const MAX_RELATION_LENGTH = 64;
const CATEGORIES = new Set(["fact", "code_snippet", "hypothesis", "critique", "solution"]);
const MUTABLE_FIELDS = new Set(["content", "tags", "category", "validityScore", "confidenceScore", "metadata", "source", "expiresAt"]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizePagination(input = {}) {
  if (!isPlainObject(input)) throw new TypeError("Pagination options must be a JSON object");
  const limit = input.limit ?? input.pageSize ?? 50;
  let offset = input.offset;
  if (offset === undefined && input.page !== undefined) {
    if (!Number.isInteger(input.page) || input.page < 1) {
      throw new RangeError("page must be a positive integer");
    }
    offset = (input.page - 1) * limit;
  }
  offset ??= 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    throw new RangeError(`offset must be an integer between 0 and ${MAX_OFFSET}`);
  }
  return { limit, offset };
}

function normalizeText(value, field, { required = false, maxLength } = {}) {
  if (value === null || value === undefined) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${field} is required`);
  if (maxLength !== undefined && normalized.length > maxLength) {
    throw new RangeError(`${field} exceeds maximum length of ${maxLength}`);
  }
  return normalized;
}

function normalizeScore(value, field, fallback) {
  const score = value === undefined ? fallback : value;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
    throw new RangeError(`${field} must be a finite number between 0 and 1`);
  }
  return score;
}

function normalizeTags(value, field = "tags") {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_TAGS) {
    throw new RangeError(`${field} must contain at most ${MAX_TAGS} tags`);
  }
  const tags = value.map((tag) => normalizeText(tag, `${field} item`, { required: true, maxLength: MAX_TAG_LENGTH }));
  return [...new Set(tags)];
}

function normalizeMetadata(value, field = "metadata") {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) throw new TypeError(`${field} must be a JSON object`);
  let serialized;
  try {
    serialized = stringifyJson(value);
  } catch {
    throw new TypeError(`${field} must be JSON serializable`);
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`${field} exceeds maximum payload size of ${MAX_PAYLOAD_BYTES} bytes`);
  }
  return value;
}

function parseTags(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string") : [];
}

function parseMetadata(value) {
  const parsed = parseJson(value, {});
  return isPlainObject(parsed) ? parsed : {};
}

function map(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseTags(row.tags),
    metadata: parseMetadata(row.metadata),
    validityScore: Number(row.validityScore),
    confidenceScore: Number(row.confidenceScore),
    revision: Number(row.revision || 0),
  };
}

function mapLink(row) {
  if (!row) return null;
  return { ...row, metadata: parseMetadata(row.metadata), weight: Number(row.weight) };
}

function mapRevision(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseTags(row.tags),
    revision: Number(row.revision),
    validityScore: Number(row.validityScore),
  };
}

function writeAudit(db, { entryId, swarmId, actorId, action, revision, snapshot }) {
  const serialized = stringifyJson(snapshot || {});
  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`audit snapshot exceeds maximum payload size of ${MAX_PAYLOAD_BYTES} bytes`);
  }
  db.run(
    "INSERT INTO blackboardAuditLog (id,entryId,swarmId,actorId,action,revision,snapshot,createdAt) VALUES (?,?,?,?,?,?,?,?)",
    [uuidv4(), entryId, swarmId || null, actorId, action, revision, serialized, now()],
  );
}

function normalizeActorId(actor) {
  if (!isPlainObject(actor)) throw new TypeError("Authenticated actor context is required");
  const actorId = actor.botId ?? actor.actorId ?? actor.id;
  if (typeof actor.principalId !== "string" || actor.principalId.trim() !== actorId) {
    throw new TypeError("Authenticated actor principalId must match botId");
  }
  return normalizeText(actorId, "actorId", { required: true, maxLength: 256 });
}

function unauthorizedActorError(actorId, action) {
  return new Error(`Actor ${actorId} is not authorized to ${action} blackboard entry`);
}

function actorRequiredError(action) {
  return new Error(`Actor authorization required to ${action} blackboard entry`);
}

function authorizeEntry(db, entry, actor, action) {
  const actorId = normalizeActorId(actor);
  if (actorId === undefined) {
    if (entry.authorBotId) throw actorRequiredError(action);
    return null;
  }

  const actorRecord = db.get("SELECT id,role,enabled FROM hermesBots WHERE id=?", [actorId]);
  if (!actorRecord || !actorRecord.enabled) throw unauthorizedActorError(actorId, action);
  if (!entry.authorBotId && actorRecord.role !== "coordinator") {
    throw unauthorizedActorError(actorId, action);
  }
  if (entry.authorBotId && entry.authorBotId !== actorId && actorRecord.role !== "coordinator") {
    throw unauthorizedActorError(actorId, action);
  }
  return actorRecord;
}

function authorizeSwarmActor(db, swarmId, actor) {
  const actorId = normalizeActorId(actor);
  if (actorId === undefined) return undefined;
  const actorRecord = db.get("SELECT id,role,enabled FROM hermesBots WHERE id=?", [actorId]);
  if (!actorRecord || !actorRecord.enabled) throw unauthorizedActorError(actorId, "write");
  if (swarmId) {
    const member = db.get(
      "SELECT 1 FROM swarmBots WHERE swarmId=? AND botId=? AND status='active' LIMIT 1",
      [swarmId, actorId],
    );
    if (!member) throw new Error("Actor is not authorized for swarm");
  }
  return actorRecord;
}

function authorizeReadActor(db, actor) {
  const actorId = normalizeActorId(actor);
  const bot = db.get("SELECT id FROM hermesBots WHERE id=? AND enabled=1", [actorId]);
  if (!bot) throw new Error("Actor is not authorized to read blackboard data");
  return actorId;
}

function authorizeReadScope(db, actor, swarmId) {
  const actorId = authorizeReadActor(db, actor);
  if (swarmId) {
    const member = db.get("SELECT 1 FROM swarmBots WHERE swarmId=? AND botId=? AND status='active'", [swarmId, actorId]);
    if (!member) throw new Error("Actor is not authorized for swarm");
  }
  return { actorId, coordinator: false };
}

function normalizeEntryUpdates(updates) {
  if (!isPlainObject(updates)) throw new TypeError("Blackboard updates must be a JSON object");
  for (const field of Object.keys(updates)) {
    if (field !== "actorId" && !MUTABLE_FIELDS.has(field)) throw new Error(`Unknown or immutable blackboard field: ${field}`);
  }
  const normalized = { ...updates };
  delete normalized.actorId;
  if ("content" in normalized) normalized.content = normalizeText(normalized.content, "Blackboard content", { required: true, maxLength: MAX_CONTENT_LENGTH });
  if ("tags" in normalized) normalized.tags = normalizeTags(normalized.tags);
  if ("category" in normalized) {
    if (typeof normalized.category !== "string" || !CATEGORIES.has(normalized.category)) {
      throw new Error(`Invalid blackboard category: ${normalized.category}`);
    }
  }
  if ("validityScore" in normalized) normalized.validityScore = normalizeScore(normalized.validityScore, "validityScore", 1);
  if ("confidenceScore" in normalized) normalized.confidenceScore = normalizeScore(normalized.confidenceScore, "confidenceScore", 0);
  if ("metadata" in normalized) normalized.metadata = normalizeMetadata(normalized.metadata);
  if ("source" in normalized) normalized.source = normalizeText(normalized.source, "source", { maxLength: MAX_SOURCE_LENGTH });
  if ("expiresAt" in normalized) normalized.expiresAt = normalizeText(normalized.expiresAt, "expiresAt", { maxLength: 128 });
  return normalized;
}

function normalizeLinkOptions(actorOrOptions, metadata) {
  if (isPlainObject(actorOrOptions) && !("id" in actorOrOptions) && !("actorId" in actorOrOptions) && metadata === undefined) {
    return { actor: null, metadata: actorOrOptions };
  }
  if (isPlainObject(actorOrOptions) && "metadata" in actorOrOptions) {
    return { actor: actorOrOptions.actor ?? actorOrOptions.actorId ?? actorOrOptions.id ?? null, metadata: actorOrOptions.metadata };
  }
  return { actor: actorOrOptions, metadata: metadata === undefined ? {} : metadata };
}

export async function getBlackboardEntries(filter = {}) {
  if (!isPlainObject(filter)) throw new TypeError("Blackboard filter must be a JSON object");
  const db = await getAdapter();
  const scope = authorizeReadScope(db, filter.actorId, filter.swarmId);
  const clauses = [];
  const args = [];
  for (const key of ["swarmId", "authorBotId", "category"]) {
    if (filter[key] !== undefined) {
      if (key === "category" && !CATEGORIES.has(filter[key])) throw new Error(`Invalid blackboard category: ${filter[key]}`);
      clauses.push(`${key}=?`);
      args.push(filter[key]);
    }
  }
  if (filter.swarmId === undefined) {
    clauses.push("authorBotId=?");
    args.push(scope.actorId);
  }
  if (filter.minScore !== undefined) {
    args.push(normalizeScore(filter.minScore, "minScore", 0));
    clauses.push("validityScore>=?");
  }
  const { limit, offset } = normalizePagination(filter);
  args.push(limit, offset);
  return db.all(
    `SELECT * FROM blackboard ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY updatedAt DESC, id ASC LIMIT ? OFFSET ?`,
    args,
  ).map(map);
}

export async function getBlackboardEntryById(id, actor) {
  const db = await getAdapter();
  const entry = map(db.get("SELECT * FROM blackboard WHERE id=?", [id]));
  if (!entry) return null;
  const scope = authorizeReadScope(db, actor, entry.swarmId);
  if (!entry.swarmId && entry.authorBotId !== scope.actorId) {
    throw new Error("Actor is not authorized to read blackboard entry");
  }
  return entry;
}

export async function createBlackboardEntry(data, actor) {
  if (!isPlainObject(data)) throw new TypeError("Blackboard data must be a JSON object");
  const db = await getAdapter();
  const actorId = normalizeActorId(actor);
  if (data.actorId !== undefined && normalizeActorId(data.actorId) !== actorId) {
    throw new Error("Blackboard actorId must match authenticated actor");
  }
  authorizeReadActor(db, actor);
  const actorRecord = authorizeSwarmActor(db, data.swarmId, actor);
  const authorBotId = normalizeText(data.authorBotId ?? (actorId === undefined ? null : actorId), "authorBotId", { maxLength: 256 });
  if (authorBotId && actorId === undefined) throw actorRequiredError("create");
  if (actorId !== undefined && authorBotId && actorId !== authorBotId && actorRecord?.role !== "coordinator") {
    throw unauthorizedActorError(actorId, "create");
  }
  const entry = {
    id: normalizeText(data.id || uuidv4(), "id", { required: true, maxLength: 256 }),
    swarmId: normalizeText(data.swarmId, "swarmId", { maxLength: 256 }),
    authorBotId,
    content: normalizeText(data.content, "Blackboard content", { required: true, maxLength: MAX_CONTENT_LENGTH }),
    tags: normalizeTags(data.tags),
    category: data.category || "fact",
    validityScore: normalizeScore(data.validityScore, "validityScore", 1),
    confidenceScore: normalizeScore(data.confidenceScore, "confidenceScore", 0),
    metadata: normalizeMetadata(data.metadata),
    source: normalizeText(data.source, "source", { maxLength: MAX_SOURCE_LENGTH }),
    revision: 0,
    createdAt: now(),
    updatedAt: now(),
    expiresAt: normalizeText(data.expiresAt, "expiresAt", { maxLength: 128 }),
  };
  if (!CATEGORIES.has(entry.category)) throw new Error(`Invalid blackboard category: ${entry.category}`);
  db.transaction(() => {
    db.run(
      "INSERT INTO blackboard (id,swarmId,authorBotId,content,tags,category,validityScore,confidenceScore,metadata,source,revision,createdAt,updatedAt,expiresAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [entry.id, entry.swarmId, entry.authorBotId, entry.content, stringifyJson(entry.tags), entry.category, entry.validityScore, entry.confidenceScore, stringifyJson(entry.metadata), entry.source, entry.revision, entry.createdAt, entry.updatedAt, entry.expiresAt],
    );
    writeAudit(db, { entryId: entry.id, swarmId: entry.swarmId, actorId, action: "create", revision: entry.revision, snapshot: entry });
  });
  return entry;
}

export async function updateBlackboardEntry(id, updates, expectedRevision, actor) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new RangeError("expectedRevision must be a non-negative integer");
  }
  const normalizedUpdates = normalizeEntryUpdates(updates);
  const db = await getAdapter();
  const actorId = normalizeActorId(actor);
  if (Object.prototype.hasOwnProperty.call(updates, "actorId") && normalizeActorId(updates.actorId) !== actorId) {
    throw new Error("Blackboard actorId must match authenticated actor");
  }
  let updated = null;
  db.transaction(() => {
    const existing = map(db.get("SELECT * FROM blackboard WHERE id=?", [id]));
    if (!existing) return;
    const effectiveActor = actor;
    const actorRecord = authorizeSwarmActor(db, existing.swarmId, effectiveActor);
    authorizeEntry(db, existing, effectiveActor, "update");
    const entry = { ...existing, ...normalizedUpdates, revision: existing.revision + 1, updatedAt: now() };
    const result = db.run(
      "UPDATE blackboard SET content=?,tags=?,category=?,validityScore=?,confidenceScore=?,metadata=?,source=?,updatedAt=?,expiresAt=?,revision=revision+1 WHERE id=? AND revision=?",
      [entry.content, stringifyJson(entry.tags), entry.category, entry.validityScore, entry.confidenceScore, stringifyJson(entry.metadata), entry.source, entry.updatedAt, entry.expiresAt, id, expectedRevision],
    );
    if ((result?.changes ?? 0) !== 1) throw new Error("Blackboard entry changed concurrently");
    db.run(
      "INSERT INTO blackboardRevisions (id,entryId,revision,content,tags,category,validityScore,authorBotId,changeType,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [uuidv4(), id, entry.revision, entry.content, stringifyJson(entry.tags), entry.category, entry.validityScore, actorRecord?.id || null, "update", entry.updatedAt],
    );
    writeAudit(db, {
      entryId: id,
      swarmId: entry.swarmId,
      actorId: actorRecord?.id || normalizeActorId(effectiveActor),
      action: "update",
      revision: entry.revision,
      snapshot: entry,
    });
    updated = map(db.get("SELECT * FROM blackboard WHERE id=?", [id]));
  });
  return updated;
}

export async function deleteBlackboardEntry(id, actor) {
  const db = await getAdapter();
  const existing = map(db.get("SELECT * FROM blackboard WHERE id=?", [id]));
  if (!existing) return false;
  authorizeSwarmActor(db, existing.swarmId, actor);
  authorizeEntry(db, existing, actor, "delete");
  const actorId = normalizeActorId(actor);
  let result;
  db.transaction(() => {
    writeAudit(db, { entryId: existing.id, swarmId: existing.swarmId, actorId, action: "delete", revision: existing.revision, snapshot: existing });
    result = db.run("DELETE FROM blackboard WHERE id=?", [id]);
  });
  return (result?.changes ?? 0) === 1;
}

export async function searchBlackboard(query, tags, category, minScore = 0, pagination = {}) {
  const normalizedQuery = query === undefined || query === null ? "" : normalizeText(query, "query", { maxLength: MAX_QUERY_LENGTH });
  const normalizedTags = tags === undefined || tags === null ? [] : normalizeTags(tags, "tags");
  if (category !== undefined && category !== null && !CATEGORIES.has(category)) {
    throw new Error(`Invalid blackboard category: ${category}`);
  }
  const db = await getAdapter();
  const scope = authorizeReadScope(db, pagination.actorId, pagination.swarmId);
  const clauses = ["(content LIKE ? OR tags LIKE ?)", "validityScore>=?"];
  const args = [`%${normalizedQuery}%`, `%${normalizedQuery}%`, normalizeScore(minScore, "minScore", 0)];
  if (category) {
    clauses.push("category=?");
    args.push(category);
  }
  const { limit, offset } = normalizePagination(pagination);
  clauses.push("authorBotId=?");
  args.push(scope.actorId);
  const rows = db.all(`SELECT * FROM blackboard WHERE ${clauses.join(" AND ")} ORDER BY validityScore DESC,updatedAt DESC,id ASC LIMIT ? OFFSET ?`, [...args, limit, offset]);
  return rows.filter((row) => normalizedTags.every((tag) => parseTags(row.tags).includes(tag))).map(map);
}

export async function linkBlackboardEntries(sourceId, targetId, relationType = "related", weight = 1, actorOrOptions, metadata) {
  const source = normalizeText(sourceId, "sourceId", { required: true, maxLength: 256 });
  const target = normalizeText(targetId, "targetId", { required: true, maxLength: 256 });
  const relation = normalizeText(relationType, "relationType", { required: true, maxLength: MAX_RELATION_LENGTH });
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
    throw new RangeError("weight must be a finite non-negative number");
  }
  const options = normalizeLinkOptions(actorOrOptions, metadata);
  const linkMetadata = normalizeMetadata(options.metadata, "link metadata");
  const db = await getAdapter();
  const sourceEntry = map(db.get("SELECT * FROM blackboard WHERE id=?", [source]));
  const targetEntry = map(db.get("SELECT * FROM blackboard WHERE id=?", [target]));
  if (!sourceEntry || !targetEntry) throw new Error("Both blackboard link endpoints must exist");
  if (sourceEntry.swarmId !== targetEntry.swarmId) throw new Error("Blackboard links cannot cross swarm boundaries");
  authorizeSwarmActor(db, sourceEntry.swarmId || targetEntry.swarmId, options.actor);
  authorizeEntry(db, sourceEntry, options.actor, "link");
  authorizeEntry(db, targetEntry, options.actor, "link");
  db.transaction(() => {
    db.run(
      "INSERT INTO blackboardLinks (id,sourceId,targetId,relationType,weight,metadata,createdAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT(sourceId,targetId,relationType) DO UPDATE SET weight=excluded.weight,metadata=excluded.metadata",
      [uuidv4(), source, target, relation, weight, stringifyJson(linkMetadata), now()],
    );
    writeRepositoryAudit(db, {
      actorId: normalizeActorId(options.actor),
      resourceType: "blackboardLink",
      resourceId: `${source}:${target}:${relation}`,
      swarmId: sourceEntry.swarmId,
      action: "upsert",
      snapshot: { weight, metadata: linkMetadata },
    });
  });
  return getBlackboardLinks(source, { actorId: options.actor });
}

export async function getBlackboardLinks(entryId, pagination = {}) {
  const db = await getAdapter();
  const entry = db.get("SELECT swarmId FROM blackboard WHERE id=?", [entryId]);
  if (!entry) return [];
  authorizeReadScope(db, pagination.actorId, entry.swarmId);
  const { limit, offset } = normalizePagination(pagination);
  return db.all(
    `SELECT l.* FROM blackboardLinks l
     JOIN blackboard source ON source.id=l.sourceId
     JOIN blackboard target ON target.id=l.targetId
     WHERE (l.sourceId=? OR l.targetId=?) AND source.swarmId=target.swarmId
     ORDER BY l.createdAt ASC,l.id ASC LIMIT ? OFFSET ?`,
    [entryId, entryId, limit, offset],
  ).map(mapLink);
}

export async function getBlackboardGraph(swarmId, pagination = {}) {
  const db = await getAdapter();
  authorizeReadScope(db, pagination.actorId, swarmId);
  const { limit, offset } = normalizePagination(pagination);
  const entries = await getBlackboardEntries({ swarmId, limit, offset, actorId: pagination.actorId });
  const links = db.all(
    `SELECT DISTINCT l.* FROM blackboardLinks l
     JOIN blackboard source ON source.id=l.sourceId
     JOIN blackboard target ON target.id=l.targetId
     WHERE source.swarmId=? AND target.swarmId=? AND source.swarmId=target.swarmId
     ORDER BY l.createdAt ASC,l.id ASC
     LIMIT ? OFFSET ?`,
    [swarmId, swarmId, limit, offset],
  ).map(mapLink);
  return { entries, links };
}

export async function getEntryRevisions(entryId, pagination = {}) {
  const db = await getAdapter();
  const entry = map(db.get("SELECT * FROM blackboard WHERE id=?", [entryId]));
  if (!entry) return [];
  const scope = authorizeReadScope(db, pagination.actorId, entry.swarmId);
  if (!entry.swarmId && entry.authorBotId !== scope.actorId) {
    throw new Error("Actor is not authorized to read blackboard revisions");
  }
  const { limit, offset } = normalizePagination(pagination);
  return db.all(
    "SELECT * FROM blackboardRevisions WHERE entryId=? ORDER BY revision ASC LIMIT ? OFFSET ?",
    [entryId, limit, offset],
  ).map(mapRevision);
}

export async function getEntryAuditLog(entryId, actor, options = {}) {
  const db = await getAdapter();
  const entry = map(db.get("SELECT * FROM blackboard WHERE id=?", [entryId]));
  if (!entry) {
    const actorId = authorizeReadActor(db, actor);
    const audit = db.get("SELECT swarmId,actorId FROM blackboardAuditLog WHERE entryId=? ORDER BY createdAt DESC LIMIT 1", [entryId]);
    if (!audit || audit.actorId !== actorId) {
      throw new Error("Actor is not authorized to read blackboard audit data");
    }
  } else {
    const scope = authorizeReadScope(db, actor, entry.swarmId);
    if (entry.authorBotId !== scope.actorId && entry.swarmId) {
      const role = db.get("SELECT role FROM hermesBots WHERE id=?", [scope.actorId])?.role;
      if (role !== "coordinator") {
        throw new Error("Actor is not authorized to read blackboard audit data");
      }
    } else if (entry.authorBotId !== scope.actorId) {
      throw new Error("Actor is not authorized to read blackboard audit data");
    }
  }
  const { limit, offset } = normalizePagination(options);
  return db.all(
    "SELECT * FROM blackboardAuditLog WHERE entryId=? ORDER BY createdAt ASC,id ASC LIMIT ? OFFSET ?",
    [entryId, limit, offset],
  ).map((row) => ({ ...row, snapshot: parseMetadata(row.snapshot), revision: Number(row.revision) }));
}
