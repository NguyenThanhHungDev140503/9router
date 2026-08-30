# Phase 2: MCP Process Manager & JSON-RPC Client - Pattern Map

**Mapped:** 2026-08-20  
**Files analyzed:** 15 planned create/modify files  
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `package.json` | config | batch | `package.json` | exact |
| `src/lib/mcp/client.js` | service | request-response | `src/lib/mcp/stdioSseBridge.js` | partial-match |
| `src/lib/mcp/processManager.js` | service | event-driven | `src/lib/mcp/stdioSseBridge.js`, `src/lib/headroom/process.js` | role-match |
| `src/lib/mcp/transportFactory.js` | utility | request-response | `src/lib/mcp/stdioSseBridge.js` | partial-match |
| `src/lib/mcp/policy.js` | utility | transform | `src/shared/utils/ssrfGuard.js` | partial-match |
| `src/lib/mcp/errors.js` | utility | transform | `src/lib/db/repos/requestDetailsRepo.js` | partial-match |
| `src/shared/utils/ssrfGuard.js` | utility | request-response | `src/shared/utils/ssrfGuard.js` | exact |
| `src/lib/db/schema.js` | model | CRUD | `src/lib/db/schema.js` | exact |
| `src/lib/db/migrations/003-mcp-process-policy.js` | migration | batch | `src/lib/db/migrations/002-mcp-skills.js` | exact |
| `src/lib/db/migrations/index.js` | config | batch | `src/lib/db/migrations/index.js` | exact |
| `src/lib/db/repos/mcpRepo.js` | model | CRUD | `src/lib/db/repos/mcpRepo.js` | exact |
| `tests/unit/mcp-client.test.js` | test | request-response | `tests/unit/base-executor-retry.test.js` | role-match |
| `tests/unit/mcp-process-manager.test.js` | test | event-driven | `tests/unit/base-executor-retry.test.js` | partial-match |
| `tests/unit/mcp-skills-db.test.js` | test | CRUD | `tests/unit/mcp-skills-db.test.js` | exact |
| `tests/unit/search-ssrf-guard.test.js` | test | request-response | `tests/unit/search-ssrf-guard.test.js` | exact |

`transportFactory.js`, `policy.js`, `errors.js`, migration `003`, and dedicated client/manager tests are research-recommended files. CONTEXT.md locks their behaviors, not filenames. Planner may merge internal helpers into required `client.js` and `processManager.js`, but must keep behavior and tests.

## Pattern Assignments

### `package.json` (config, batch)

**Analog:** `package.json`

**Dependency pattern** (lines 19-52):

```json
"dependencies": {
  "express": "^5.2.1",
  "undici": "^7.19.2",
  "uuid": "^13.0.0"
}
```

Add pinned runtime dependency `"@modelcontextprotocol/sdk": "1.30.0"` beside other runtime dependencies. Do not add a UUID package: `uuid` exists for DB IDs, while MCP request IDs use Node `crypto.randomUUID()`.

---

### `src/lib/mcp/client.js` (service, request-response)

**Analog:** `src/lib/mcp/stdioSseBridge.js` (partial only: child JSON-RPC framing). Do **not** copy CommonJS, broadcast, full `process.env`, or direct stdout parser.

**Frame serialization pattern** (lines 172-176):

```javascript
function sendToChild(name, jsonRpc) {
  const entry = getStore().get(name);
  if (!entry?.proc?.stdin?.writable) throw new Error(`Bridge not running: ${name}`);
  entry.proc.stdin.write(`${JSON.stringify(jsonRpc)}\n`);
}
```

Use SDK transport `.send(frame)` instead. Preserve one outbound JSON-RPC frame per request. Generate UUID-string IDs with `randomUUID()`, keep `Map<id, pending>`, resolve only matching responses, reject JSON-RPC error frames, and reject all pending requests when transport closes.

**Manager-owned message routing boundary** (lines 121-133):

```javascript
proc.stdout.on("data", (chunk) => {
  entry.buffer += chunk.toString("utf8");
  // ...
  const line = filterFrame(raw);
  for (const send of entry.sessions.values()) {
    try { send(`event: message\ndata: ${line}\n\n`); } catch { /* ignore broken pipe */ }
  }
});
```

Replace final loop with request-ID lookup plus asynchronous known-notification callback. Never forward frames to browser/SSE sessions.

**No exact client analog:** Existing MCP file has no lifecycle handshake, UUID request map, timeout/cancellation, paginated `tools/list`, or remote transport code. Use RESEARCH.md MCP examples for `initialize`, `notifications/initialized`, and pagination.

---

### `src/lib/mcp/processManager.js` (service, event-driven)

**Analogs:** `src/lib/mcp/stdioSseBridge.js`, `src/lib/headroom/process.js`

**Gateway-wide singleton registry** — `src/lib/mcp/stdioSseBridge.js` lines 99-102:

```javascript
const getStore = () => {
  if (!globalThis[G_KEY]) globalThis[G_KEY] = new Map();
  return globalThis[G_KEY];
};
```

Use same gateway-lifetime singleton idea with `Map<serverId, ServerEntry>`. Entry owns transport, client, state, queues, in-flight calls, crash/timeout windows, retry timer, tool cache metadata, and cleanup. Key by persisted server ID, not UI session or name.

**Existing-process reuse** — `src/lib/mcp/stdioSseBridge.js` lines 109-119:

```javascript
const store = getStore();
let entry = store.get(name);
if (entry?.proc && !entry.proc.killed && entry.proc.exitCode === null) return entry;

const plugin = findPlugin(name);
if (!plugin) throw new Error(`Unknown local plugin: ${name}`);

const proc = spawn(plugin.command, plugin.args, { stdio: ["pipe", "pipe", "pipe"], env: process.env });
entry = { proc, sessions: new Map(), buffer: "" };
store.set(name, entry);
```

Reuse “return live entry, otherwise create/store one” flow. Replace plugin lookup with host-owned command-ID registry, replace full environment with minimal allowlisted environment, and use SDK `StdioClientTransport` rather than raw child piping.

**Failure cleanup** — `src/lib/mcp/stdioSseBridge.js` lines 136-140 and 163-169:

```javascript
proc.on("exit", (code) => {
  console.log(`[mcp:${name}] exited`, code);
  store.delete(name);
});

for (const [name, entry] of store) {
  try { entry.proc.kill(); } catch { /* ignore */ }
  store.delete(name);
}
```

Keep best-effort cleanup shape. Manager changes behavior: mark only failed server `Degraded`/`Error`, reject active call with sanitized retryable error, retain stale tools only for admin state, schedule bounded restart, and close every local/remote entry on shutdown.

**Spawn startup timeout / cleanup** — `src/lib/headroom/process.js` lines 55-118:

```javascript
export async function startHeadroomProxy({ port = DEFAULT_PORT, codeAware = false, kompress = true } = {}) {
  const safePort = Number(port) > 0 && Number(port) < 65536 ? Number(port) : DEFAULT_PORT;
  const binary = findHeadroomBinary();
  // ...
  const child = spawn(binary, args, {
    detached: false,
    stdio: ["ignore", "ignore", "ignore"],
  });
  const startupTimer = setTimeout(() => {
    // cleanup failed startup
  }, STARTUP_TIMEOUT_MS);
}
```

Follow bounded timer plus cleanup discipline. Do not inherit detached/background process semantics. Timeouts: discovery/list default 15 seconds; call default 60 seconds; hard maximum five minutes. On call timeout, send MCP cancellation, wait five seconds, then restart only still-blocked stdio entry.

---

### `src/lib/mcp/transportFactory.js` (utility, request-response)

**Analog:** `src/lib/mcp/stdioSseBridge.js` (partial transport lifecycle match)

**Lifecycle dispatch pattern** — lines 109-142:

```javascript
function getOrSpawn(name) {
  const store = getStore();
  let entry = store.get(name);
  if (entry?.proc && !entry.proc.killed && entry.proc.exitCode === null) return entry;
  // validate input, create resource, register handlers, store resource
  return entry;
}
```

Factory must validate server transport and policy before resource creation, then return one raw SDK transport:

- `stdio`: `StdioClientTransport` with host-resolved executable, rendered validated args, minimal env, piped stderr, 1 MiB buffer.
- `http`: prefer `StreamableHTTPClientTransport`; validate public HTTPS or explicit allowlisted private target before connect.
- `sse`: use `SSEClientTransport` only as fresh legacy fallback after Streamable HTTP compatibility failure.

Factory returns transport ownership to manager. It must not own a UI session or broadcast frames.

---

### `src/lib/mcp/policy.js` (utility, transform)

**Analogs:** `src/shared/utils/ssrfGuard.js`, `src/lib/mcp/stdioSseBridge.js`

**Allowlist lookup pattern** — `src/lib/mcp/stdioSseBridge.js` lines 104-107:

```javascript
function findPlugin(name) {
  return LOCAL_STDIO_PLUGINS.find((p) => p.name === name) || null;
}
```

Replace `name` lookup with a host-owned command-ID registry. Registry supplies executable, argument templates, allowed environment keys, process class, and multi-tenant safety. DB supplies only `commandId` and schema-validated placeholder values. Never accept DB command/args as spawn inputs.

**Boundary validation pattern** — `src/shared/utils/ssrfGuard.js` lines 47-56:

```javascript
export function assertPublicUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("Blocked URL: internal host");
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new Error("Blocked URL: internal host");
  if (isBlockedIpv4(host)) throw new Error("Blocked URL: private IP");
  if (host.includes(":") && isBlockedIpv6(host)) throw new Error("Blocked URL: private IP");
}
```

Policy must extend this guard, not duplicate/weaken it. Allow public HTTPS by default. Require explicit admin allowlist for private/LAN/loopback/internal targets. Validate protocol and resolved remote addresses at connect time to prevent DNS rebinding.

---

### `src/lib/mcp/errors.js` (utility, transform)

**Analog:** `src/lib/db/repos/requestDetailsRepo.js`

**Sanitization pattern** (lines 61-69):

```javascript
function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const sensitiveKeys = ["authorization", "x-api-key", "cookie", "token", "api-key"];
  const sanitized = { ...headers };
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) delete sanitized[key];
  }
  return sanitized;
}
```

**Truncation pattern** (lines 80-85):

```javascript
function truncateField(obj, maxSize) {
  const str = JSON.stringify(obj || {});
  if (str.length > maxSize) {
    return { _truncated: true, _originalSize: str.length, _preview: str.substring(0, 200) };
  }
  return obj || {};
}
```

Expose stable errors only:

```javascript
{ code, message, server, tool, retryable }
```

Strip stderr, environment values, internal URLs, raw arguments, and raw results. Apply output caps: raw tool result 1 MiB, LLM-forwarded text 50,000 chars, explicit truncation marker.

---

### `src/shared/utils/ssrfGuard.js` (utility, request-response)

**Analog:** self

**Literal IP guard helpers** (lines 20-45):

```javascript
const BLOCKED_V4_RANGES = [
  [ipv4ToInt("0.0.0.0"), 8],
  [ipv4ToInt("10.0.0.0"), 8],
  [ipv4ToInt("127.0.0.0"), 8],
  [ipv4ToInt("169.254.0.0"), 16],
  [ipv4ToInt("172.16.0.0"), 12],
  [ipv4ToInt("192.168.0.0"), 16],
];
```

```javascript
function isBlockedIpv6(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  const v4Mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isBlockedIpv4(v4Mapped[1]);
  if (h === "::1" || h === "::") return true;
  return h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd");
}
```

Retain exports used by search callers. Add allowlist-aware policy API without changing `assertPublicUrl()` semantics.

---

### `src/lib/db/schema.js`, `src/lib/db/migrations/003-mcp-process-policy.js`, `src/lib/db/migrations/index.js`, `src/lib/db/repos/mcpRepo.js` (model/migration/config, CRUD/batch)

**Analogs:** `src/lib/db/schema.js`, `src/lib/db/migrations/002-mcp-skills.js`, `src/lib/db/migrations/index.js`, `src/lib/db/repos/mcpRepo.js`

**Table-definition pattern** — `src/lib/db/schema.js` lines 155-182:

```javascript
mcpServers: {
  columns: {
    id: "TEXT PRIMARY KEY",
    name: "TEXT NOT NULL UNIQUE",
    transport: "TEXT NOT NULL",
    command: "TEXT",
    args: "TEXT",
    env: "TEXT",
    url: "TEXT",
    enabled: "INTEGER NOT NULL DEFAULT 1",
    createdAt: "TEXT NOT NULL",
    updatedAt: "TEXT NOT NULL",
  },
  indexes: [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_mcpServers_name ON mcpServers(name);",
    "CREATE INDEX IF NOT EXISTS idx_mcpServers_enabled ON mcpServers(enabled);",
  ],
},
```

Add process-policy/server state and MCP operation metadata schema through migration. Replace unsafe free-form stdio record fields with `commandId` plus validated placeholder values; reject legacy free-form values. Persist 30-day sanitized operation metadata and 24-hour opt-in redacted debug captures. TTL cleanup must never exceed these caps.

**Migration pattern** — `src/lib/db/migrations/002-mcp-skills.js` lines 3-18:

```javascript
export default {
  version: 2,
  name: "mcp-skills",
  up(db) {
    const targetTables = ["mcpServers", "mcpToolsCache", "skills", "gatewayToolRules"];
    for (const name of targetTables) {
      const def = TABLES[name];
      if (def) {
        db.exec(buildCreateTableSql(name, def));
        for (const idx of def.indexes || []) {
          db.exec(idx);
        }
      }
    }
  },
};
```

**Registry pattern** — `src/lib/db/migrations/index.js` lines 1-10:

```javascript
import m001 from "./001-initial.js";
import m002 from "./002-mcp-skills.js";

export const MIGRATIONS = [m001, m002].sort((a, b) => a.version - b.version);
```

Append `m003`; preserve monotonic unique versions.

**Row mapping, validation, upsert pattern** — `src/lib/db/repos/mcpRepo.js` lines 5-18, 21-37, 169-187:

```javascript
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
```

```javascript
function validateServerPayload(data, isCreate = false) {
  if (isCreate && (!data.name || typeof data.name !== 'string' || !data.name.trim())) {
    throw new Error('MCP server name is required and must be non-empty string');
  }
  if (data.transport && !['stdio', 'sse', 'http'].includes(data.transport)) {
    throw new Error('MCP server transport must be one of: stdio, sse, http');
  }
}
```

```javascript
db.run(
  `INSERT INTO mcpToolsCache (serverId, tools, updatedAt)
   VALUES (?, ?, ?)
   ON CONFLICT(serverId) DO UPDATE SET
     tools = excluded.tools,
     updatedAt = excluded.updatedAt`,
  [serverId, toolsJson, now]
);
```

Keep async repository API, JSON column helpers, ISO timestamps, SQL parameters, boolean conversion, and cache upsert. Update validation before save: transport URL policy, host command ID, placeholder schema, enabled/tested gate. Cache publish only after initialize plus full paginated `tools/list` succeeds.

**Retention transaction pattern** — `src/lib/db/repos/requestDetailsRepo.js` lines 99-134:

```javascript
db.transaction(() => {
  for (const item of items) {
    db.run(
      `INSERT INTO requestDetails(id, timestamp, provider, model, connectionId, status, data)
       VALUES(?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET timestamp = excluded.timestamp, provider = excluded.provider,
       model = excluded.model, connectionId = excluded.connectionId, status = excluded.status, data = excluded.data`,
      [record.id, record.timestamp, record.provider, record.model, record.connectionId, record.status, stringifyJson(record)]
    );
  }
  const cnt = db.get(`SELECT COUNT(*) as c FROM requestDetails`);
  if (cnt && cnt.c > config.maxRecords) {
    db.run(`DELETE FROM requestDetails WHERE id IN (SELECT id FROM requestDetails ORDER BY timestamp ASC LIMIT ?)`, [cnt.c - config.maxRecords]);
  }
});
```

Use transaction and parameterized SQL for operation/debug retention cleanup. Do not log raw secrets by default.

---

### `tests/unit/mcp-client.test.js` and `tests/unit/mcp-process-manager.test.js` (test, request-response/event-driven)

**Analog:** `tests/unit/base-executor-retry.test.js`

**Mock-before-import pattern** (lines 1-24):

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

const { BaseExecutor } = await import("../../open-sse/executors/base.js");

beforeEach(() => fetchMock.mockReset());
```

Mock SDK transports and child lifecycle before dynamic import. Test outbound UUID string IDs, out-of-order response routing, JSON-RPC error mapping, timeout cancellation/pending cleanup, ignored unknown notification, and `initialize` then `notifications/initialized` then paginated `tools/list`.

Use fake timers for backoff, five-second cancellation grace, queues, global 32/per-server 4 concurrency caps, max 50 queue, crash/timeout circuit breakers, and shutdown cleanup. Assert `tools/call` is never replayed after crash/reconnect.

---

### `tests/unit/mcp-skills-db.test.js` (test, CRUD)

**Analog:** self

**Isolated SQLite test setup** (lines 1-24):

```javascript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-mcp-db-test-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
});
```

**CRUD assertions** (lines 26-67):

```javascript
const server = await db.createMcpServer({
  name: "test-mcp-server",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  env: { DEBUG: "1" },
  enabled: true,
});

const updated = await db.updateMcpServer(server.id, {
  enabled: false,
  command: "node",
});
expect(updated.enabled).toBe(false);
```

Replace free-form command fixture with host command ID and valid placeholder values. Add rejection assertions for arbitrary executable/args/env, untested enablement, disallowed private endpoint, and invalid retention/debug records.

---

### `tests/unit/search-ssrf-guard.test.js` (test, request-response)

**Analog:** self

**Table-driven blocked-address tests** (lines 21-47):

```javascript
it("rejects private IP override", () => {
  for (const ip of ["10.0.0.1", "192.168.1.1", "172.16.0.1"]) {
    const params = { providerOptions: { baseUrl: `http://${ip}` } };
    expect(() => resolveBaseUrl(CONFIG, params), `should reject ${ip}`).toThrow();
  }
});

it("rejects non-http protocols", () => {
  for (const proto of ["file:///etc/passwd", "gopher://127.0.0.1:70", "ftp://10.0.0.1"]) {
    expect(() => resolveBaseUrl(CONFIG, params), `should reject ${proto}`).toThrow();
  }
});
```

Retain tests for existing public-URL behavior. Add MCP-specific allowlist acceptance only for admin-managed approved private target; test loopback, IPv6, metadata, blocked hostname/suffix, and resolved-private/DNS-rebinding result rejection.

## Shared Patterns

### ESM imports and aliases

**Sources:** `src/lib/db/repos/mcpRepo.js` lines 1-3; `jsconfig.json` lines 2-11

```javascript
import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
```

```json
"paths": {
  "@/*": ["./src/*"],
  "open-sse": ["./open-sse"],
  "open-sse/*": ["./open-sse/*"]
},
"module": "ESNext"
```

Apply to all new `src/lib/mcp/*.js`. Do not copy `stdioSseBridge.js` CommonJS `require`/`module.exports`.

### Persistence and cache publication

**Source:** `src/lib/db/repos/mcpRepo.js` lines 157-193

```javascript
export async function saveMcpToolsCache(serverId, tools) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const toolsJson = stringifyJson(tools || []);
  // SQL upsert
}
```

Manager saves cache atomically only after successful initialize and all `tools/list` pages. `Ready` alone exposes fresh tools. `Degraded`/`Error` stale cache remains admin-only.

### Outbound URL validation

**Source:** `open-sse/handlers/search/callers.js` lines 78-93

```javascript
if (override) {
  let parsed;
  try {
    parsed = new URL(override);
  } catch {
    throw new Error(`Invalid baseUrl: ${override}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid baseUrl protocol: ${parsed.protocol}`);
  }
  assertPublicUrl(override);
}
```

Apply before remote MCP transport creation. Phase policy differs only through explicit admin allowlist; browser/client values never bypass guard.

### Sanitized observability and retention

**Source:** `src/lib/db/repos/requestDetailsRepo.js` lines 61-85, 88-160, 207-224

```javascript
if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
if (writeBuffer.length > 0) await flushToDatabase();
```

Use bounded metadata buffering/flush and shutdown cleanup. Persist server, transport, method, request ID, duration, status, sanitized error code. Raw debug data opt-in only, redacted, 24-hour TTL. Sanitized metadata TTL 30 days maximum.

### Process cleanup

**Source:** `src/lib/mcp/stdioSseBridge.js` lines 163-169

```javascript
for (const [name, entry] of store) {
  try { entry.proc.kill(); } catch { /* ignore */ }
  store.delete(name);
}
```

Apply shutdown cleanup to all transports. Manager must also clear retry timers, queues, listeners, and pending requests.

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|---|---|---|---|
| `src/lib/mcp/client.js` full JSON-RPC lifecycle | service | request-response | No existing UUID request-map client, cancellation, notifications, or MCP initialization flow. |
| Streamable HTTP to legacy SSE capability fallback | utility | request-response | Existing bridge supports only local stdio-to-UI SSE, not remote MCP transports. |
| Per-server circuit breaker and queue/concurrency limiter | service | event-driven | No close codebase analog combines crash window, timeout window, bounded queue, and readiness gate. |
| Host command registry / schema-validated placeholders | utility | transform | Existing preset plugin allowlist is close but no DB command-ID policy contract exists. |
| MCP operation/debug retention tables | model | CRUD | `requestDetailsRepo` has retention mechanics but no MCP operation schema or 24-hour debug-capture model. |

## Metadata

**Analog search scope:** `src/lib/mcp/`, `src/lib/headroom/`, `src/lib/db/`, `src/shared/utils/`, `open-sse/handlers/search/`, `tests/unit/`, root config  
**Files scanned:** 16  
**Pattern extraction date:** 2026-08-20
