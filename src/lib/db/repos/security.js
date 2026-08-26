const MAX_PRINCIPAL_LENGTH = 256;

export function normalizeActor(actor) {
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
    throw new TypeError("Authenticated actor context is required");
  }
  const principalId = actor.principalId ?? actor.id ?? actor.actorId;
  if (typeof principalId !== "string" || !principalId.trim() || principalId.length > MAX_PRINCIPAL_LENGTH) {
    throw new TypeError("Authenticated actor principalId is required");
  }
  const permissions = new Set(Array.isArray(actor.permissions) ? actor.permissions : []);
  const roles = new Set(Array.isArray(actor.roles) ? actor.roles : actor.role ? [actor.role] : []);
  return { ...actor, principalId: principalId.trim(), permissions, roles };
}

export function requirePermission(actor, permission) {
  const normalized = normalizeActor(actor);
  if (!normalized.permissions.has(permission) && !normalized.permissions.has("*") && !normalized.roles.has("admin")) {
    throw new Error(`Actor ${normalized.principalId} lacks permission ${permission}`);
  }
  return normalized;
}

export function requirePayloadSize(value, field, maxBytes = 64 * 1024) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch { throw new TypeError(`${field} must be JSON serializable`); }
  if (encoded === undefined) throw new TypeError(`${field} must be JSON serializable`);
  if (Buffer.byteLength(encoded, "utf8") > maxBytes) throw new RangeError(`${field} exceeds maximum payload size of ${maxBytes} bytes`);
  return value;
}

export function pagination(options = {}, maxPageSize = 100) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Pagination options must be an object");
  const limit = options.limit ?? options.pageSize ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > maxPageSize) throw new RangeError(`limit must be an integer between 1 and ${maxPageSize}`);
  const offset = options.offset ?? ((options.page === undefined ? 1 : options.page) - 1) * limit;
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) throw new RangeError("offset must be an integer between 0 and 1000000");
  return { limit, offset };
}

export function writeRepositoryAudit(db, { actorId, resourceType, resourceId, swarmId = null, action, snapshot = {} }) {
  const encoded = JSON.stringify(snapshot);
  if (typeof encoded !== "string" || Buffer.byteLength(encoded, "utf8") > 64 * 1024) {
    throw new RangeError("audit snapshot exceeds maximum payload size");
  }
  db.run(
    "INSERT INTO repositoryAuditLog (id,actorId,resourceType,resourceId,swarmId,action,snapshot,createdAt) VALUES (?,?,?,?,?,?,?,?)",
    [randomUUID(), actorId, resourceType, resourceId, swarmId, action, encoded, new Date().toISOString()],
  );
}
import { randomUUID } from "node:crypto";
