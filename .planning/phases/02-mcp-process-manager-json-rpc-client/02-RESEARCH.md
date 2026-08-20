# Phase 2: MCP Process Manager & JSON-RPC Client - Research

**Researched:** 2026-08-20  
**Domain:** Server-side MCP gateway client, child-process lifecycle, JSON-RPC routing  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Implement stdio, Streamable HTTP, and legacy HTTP+SSE compatibility in Phase 2. Treat Streamable HTTP as the preferred remote transport.
- **D-02:** Open remote connections lazily, reuse them while enabled, and clean them up when a server is disabled or 9Router shuts down.
- **D-03:** Allow public HTTPS endpoints by default. Private, LAN, loopback, and internal endpoints require an explicit admin-managed allowlist.
- **D-04:** Reconnect remote transports with bounded exponential backoff and jitter. Retry `initialize`/discovery and `tools/list`, but never automatically replay `tools/call`.
- **D-05:** Only launch host-managed allowlisted executables. Database configuration selects a registered command ID rather than an arbitrary shell command.
- **D-06:** Host configuration owns argument templates. Database values fill only schema-validated placeholders.
- **D-07:** Spawn with a minimal environment and an allowlist of environment variable keys. Keep secrets out of logs and API responses.
- **D-08:** Validate configuration when saved. An admin must run a test and explicitly enable a server before it can spawn.
- **D-09:** Run one stdio child per MCP server configuration, shared gateway-wide. Only allow shared servers that are stateless or safe for multi-tenant use.
- **D-10:** Isolate failures per MCP server. A failed server reaches `Error` and its tools stop being injected; all other servers continue.
- **D-11:** Restart crashed stdio processes with exponential backoff and a failure budget. Default policy: five crashes in ten minutes reaches `Error`.
- **D-12:** If a process crashes during `tools/call`, return a structured retryable error and restart in the background. Do not replay the call.
- **D-13:** After recovery, run discovery/initialization and `tools/list` successfully before re-injecting tools. Retain stale cache only for admin display.
- **D-14:** Defaults: 15 seconds for discovery/initialization and `tools/list`; 60 seconds for `tools/call`. Admins may lower defaults; no operation may exceed a five-minute hard cap.
- **D-15:** Return a sanitized gateway error envelope with `code`, `message`, `server`, `tool`, and `retryable`. Never expose raw stderr, environment values, or internal URLs.
- **D-16:** On tool-call timeout, send MCP cancellation, wait five seconds, then restart only a still-blocked stdio server. Abort HTTP/SSE work without affecting other servers.
- **D-17:** Apply a per-server circuit breaker. Default: three timeouts in ten minutes reaches `Error`, stops tool injection, and schedules health checks with backoff.
- **D-18:** Run discovery/initialization once per new connection or legacy session, then repeat after restart or reconnect.
- **D-19:** 9Router generates UUID string request IDs for all outbound JSON-RPC requests and resolves pending work through a request-ID map.
- **D-20:** Support negotiated MCP protocol versions. Prefer current Streamable HTTP; fall back to legacy initialization and HTTP+SSE only when server capability detection requires it.
- **D-21:** Process recognized server notifications asynchronously for state and cache updates. Safely ignore unknown notifications.
- **D-22:** The manager must not broadcast JSON-RPC frames to UI clients. It routes responses only by request ID; server notifications remain manager-owned state/cache events.
- **D-23:** Enforce a host-configurable stdio process cap with a default of 20. Stop processes only when idle.
- **D-24:** Limit concurrent `tools/call` work to 32 globally and four per server. Overflow is retryable.
- **D-25:** Cap raw tool output at 1 MiB and text forwarded to the LLM at 50,000 characters, with an explicit truncation marker.
- **D-26:** Queue at most 50 calls per server before returning a retryable overload error.
- **D-27:** Persist structured operation metadata by default: server, transport, method, request ID, duration, status, and sanitized error code. Raw arguments/results require opt-in debug capture and redaction.
- **D-28:** Track `Stopped`, `Starting`, `Ready`, `Degraded`, and `Error`, including last healthy time, sanitized error, and next retry time.
- **D-29:** Restrict audit and debug details to dashboard administrators. Client APIs and LLM context receive only sanitized errors.
- **D-30:** Retain metadata for 30 days and debug captures for 24 hours with automatic deletion. Host configuration may reduce retention but not exceed the hard cap.

### the agent's Discretion
No implementation decisions were delegated. Planner may choose internal module boundaries, data structures, exact backoff values within stated policies, and test fixture design.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 2 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-PROC-01 | Xây dựng `src/lib/mcp/client.js` thực thi giao thức JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`). | Use raw SDK transports plus 9Router UUID request map, lifecycle handshake, tool pagination/cache refresh. [VERIFIED: Model Context Protocol specification and SDK v1.30.0 package source] |
| MCP-PROC-02 | Xây dựng `src/lib/mcp/processManager.js` quản lý vòng đời tiến trình MCP con và kết nối SSE/HTTP. | Per-server entries, lazy connections, isolated state machine, bounded restart/circuit-breaker, shutdown cleanup. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| MCP-PROC-03 | Cơ chế timeout, error handling, và bảo mật. | Abort/cancellation, safe allowlisted spawn, SSRF validation, resource caps, sanitized errors, audit retention. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
</phase_requirements>

## Summary

Use `@modelcontextprotocol/sdk@1.30.0` transport classes, but do **not** use its high-level `Client` class. SDK v1.30.0 `Protocol.request()` increments numeric IDs internally, conflicting with locked D-19 UUID string IDs. `src/lib/mcp/client.js` must own JSON-RPC framing, UUID generation, pending-request map, timeout, cancellation, and notification dispatch; it delegates stdio, Streamable HTTP, and legacy SSE wire transport to SDK classes. [VERIFIED: SDK v1.30.0 package source `/tmp/mcp-sdk-inspect-130/package/dist/esm/shared/protocol.js`; CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.29.0/docs/client.md]

MCP lifecycle is strict: initialize first, receive result, send `notifications/initialized`, then perform `tools/list` and `tools/call`. Streamable HTTP is standard current remote transport; legacy HTTP+SSE is fallback only after Streamable HTTP initialization fails with a 4xx-style compatibility failure. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle.md; CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md]

Existing `stdioSseBridge.js` is unsafe for this phase: it broadcasts every child stdout frame to all UI sessions and inherits all `process.env`. New manager must be isolated, server-owned, non-broadcasting, and must construct minimal child environment. [VERIFIED: codebase grep `src/lib/mcp/stdioSseBridge.js`; CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]

**Primary recommendation:** Add SDK v1 transport dependency; build thin 9Router `McpJsonRpcClient` over its raw transports; build singleton `McpProcessManager` over per-server state entries. [VERIFIED: npm registry; VERIFIED: SDK v1.30.0 package source]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MCP JSON-RPC request correlation, timeouts, cancellation | API / Backend | — | Server owns shared connections, UUID request IDs, tool execution, and sanitized errors. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| Local stdio process spawning and restart | API / Backend | OS process layer | Node backend spawns allowlisted child processes and owns shutdown. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md] |
| Streamable HTTP and legacy SSE connection lifecycle | API / Backend | External MCP server | Gateway owns transport/session lifecycle; remote server owns its endpoint and session. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md] |
| Tool schema cache and operation metadata | Database / Storage | API / Backend | SQLite is persisted source/cache; manager updates only after successful discovery. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| Tool results forwarded to later LLM loop | API / Backend | — | Phase 4 consumes manager result; browser never receives raw MCP frames. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |

## Project Constraints (from AGENTS.md)

- GSS Orchestrator rules apply only when `.planning/GSS_STATE.json` exists and `loop_state` is not `DELIVERED`; file is absent in current workspace. [VERIFIED: codebase filesystem check]  
- Use `ctx7`/Context7 before library implementation research. This research used `npx ctx7@latest library` then versioned docs. [VERIFIED: AGENTS.md; VERIFIED: Context7 CLI output]  
- New server modules must preserve ESM imports. Existing `stdioSseBridge.js` is CommonJS; do not copy its module boundary or broadcast model. [VERIFIED: codebase grep `jsconfig.json`, `src/lib/mcp/stdioSseBridge.js`]  
- No project skill directories exist at `.codex/skills/` or `.agents/skills/`; no project skill rules apply. [VERIFIED: filesystem check]  

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` [VERIFIED: npm registry] | `1.30.0`, published 2026-07-27 | Raw `StdioClientTransport`, `StreamableHTTPClientTransport`, `SSEClientTransport`; MCP schemas and framing. | Official MCP SDK supplies current transport semantics, HTTP session handling, SSE parsing, protocol-version header support, and stdio framing. 9Router must not use SDK `Client` because it emits numeric request IDs. [VERIFIED: npm registry; VERIFIED: SDK v1.30.0 package source] |
| Node.js built-ins [VERIFIED: npm registry] | Node `22.22.1` available | `crypto.randomUUID`, timers, `AbortController`, process cleanup. | UUID IDs and manager state need no extra utility package. [VERIFIED: environment probe] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `uuid` [VERIFIED: codebase grep] | Existing dependency `^13.0.0` | Existing DB record ID utility only. | Do not add new UUID package for JSON-RPC. Use Node `crypto.randomUUID()` for D-19. [VERIFIED: codebase grep; CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| `src/shared/utils/ssrfGuard.js` [VERIFIED: codebase grep] | Project module | Base public-address validation. | Extend with explicit admin allowlist without weakening current private/loopback deny rules. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SDK transport classes plus custom JSON-RPC client | SDK high-level `Client` | Reject: v1.30.0 source increments numeric JSON-RPC IDs; violates D-19 UUID string ID lock. [VERIFIED: SDK v1.30.0 package source] |
| SDK transport classes | Hand-written stdio/HTTP/SSE transport | Reject: duplicates stream framing, session headers, HTTP request/SSE response handling, reconnect support, and legacy compatibility. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md] |

**Installation:**

```bash
npm install @modelcontextprotocol/sdk@1.30.0
```

**Version verification:**

```bash
npm view @modelcontextprotocol/sdk version time
# 1.30.0; published 2026-07-27T17:56:01.640Z
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@modelcontextprotocol/sdk` [VERIFIED: npm registry] | npm | Created 2024-11-11 | 204,522,255 downloads during 2026-07-21 through 2026-08-19 | `github.com/modelcontextprotocol/typescript-sdk` | `OK` | Approved; pin `1.30.0` for Phase 2. [VERIFIED: npm registry] |

**Packages removed due to slopcheck [SLOP] verdict:** none. [VERIFIED: slopcheck output]  
**Packages flagged as suspicious [SUS]:** none. [VERIFIED: slopcheck output]  
**Postinstall review:** npm metadata exposes no `postinstall` script. [VERIFIED: npm registry]  
**Install probe:** `slopcheck install` classified package `OK`; its delegated npm install later hit `ERR_SOCKET_TIMEOUT`, so package files were not changed by research. [VERIFIED: shell command output]  

## Architecture Patterns

### System Architecture Diagram

```text
SQLite enabled server config + host command registry
                    |
                    v
McpProcessManager singleton
  | validate config, cap processes/calls/queues, state machine
  | lazy start/connect; no UI frame broadcast
  +--> stdio entry ----> SDK StdioClientTransport ----> allowlisted child stdin/stdout
  +--> http entry -----> SDK StreamableHTTPClientTransport ----> MCP endpoint
  |                         |
  |                         +-- 4xx compatibility failure --> fresh legacy SSE transport
  |
  v
McpJsonRpcClient
  | UUID request ID + pending Map + per-request timeout
  | initialize --> initialized notification --> tools/list
  | tools/call --> result / sanitized retryable error
  v
cache + operation metadata
  | only Ready server tools visible to later phases
  +--> Phase 3 tool injection / Phase 4 executeToolCall()
```

Streamable HTTP sends each JSON-RPC message by POST and can receive either JSON or SSE; session and negotiated protocol-version headers belong to transport behavior. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md]

### Recommended Project Structure

```text
src/lib/mcp/
├── client.js           # McpJsonRpcClient: UUID IDs, pending map, init/list/call, cancellation
├── processManager.js   # singleton manager, state machine, queues, restart, shutdown
├── transportFactory.js # stdio / Streamable HTTP / legacy SSE selection and cleanup
├── policy.js           # host command registry, env/placeholder validation, limits, redaction
└── errors.js           # stable sanitized gateway error envelope
tests/unit/
├── mcp-client.test.js
└── mcp-process-manager.test.js
```

`transportFactory.js`, `policy.js`, and `errors.js` are planner-recommended boundaries, not locked filenames. [ASSUMED]

### Pattern 1: Transport adapter plus manager-owned JSON-RPC

**What:** Start SDK transport directly. Attach `onmessage`, `onerror`, and `onclose`. Let 9Router client serialize frames, generate `randomUUID()` IDs, and resolve only matching pending work. [VERIFIED: SDK v1.30.0 package source; CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
**When to use:** Every stdio, Streamable HTTP, and legacy SSE server connection. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]

```javascript
// Source: SDK transport API verified from @modelcontextprotocol/sdk@1.30.0.
import { randomUUID } from "node:crypto";

export class McpJsonRpcClient {
  constructor(transport, { onNotification = () => {} } = {}) {
    this.transport = transport;
    this.pending = new Map();
    transport.onmessage = (frame) => this.#receive(frame, onNotification);
  }

  async request(method, params, { timeoutMs }) {
    const id = randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
    try {
      return await new Promise(async (resolve, reject) => {
        this.pending.set(id, { resolve, reject, controller });
        await this.transport.send({ jsonrpc: "2.0", id, method, params });
      });
    } finally {
      clearTimeout(timer);
      this.pending.delete(id);
    }
  }

  #receive(frame, onNotification) {
    if (frame.id !== undefined) return this.pending.get(frame.id)?.resolve(frame);
    onNotification(frame); // known notifications schedule manager-owned refresh
  }
}
```

Production code must reject JSON-RPC error frames, race transport sends safely, send `notifications/cancelled` on timeout, and reject all pending work on close. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle.md]

### Pattern 2: Per-server state entry and readiness gate

**What:** Keep `Map<serverId, ServerEntry>`. Entry owns one connection/process, client, state, in-flight count, bounded queue, crash/timeout timestamp windows, retry timer, and cache metadata. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
**When to use:** Gateway singleton lives for process lifetime; entries start lazily and close on disable, deletion, idle policy, or app shutdown. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]

State transition:

```text
Stopped -> Starting -> Ready
Starting -> Error
Ready -> Degraded -> Starting
Ready/Degraded -> Error
any state -> Stopped
```

Only `Ready` adds fresh tool cache to injection. `Degraded` and `Error` retain stale cache for admin display only. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]

### Pattern 3: Discovery transaction

**What:** On each new/recovered transport: `initialize` with supported version, validate negotiated version, set HTTP protocol version, send `notifications/initialized`, verify `tools` capability, call paginated `tools/list`, then atomically publish cache and mark `Ready`. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle.md; CITED: https://modelcontextprotocol.io/specification/2025-06-18/server/tools.md]  
**When to use:** First connection, crash restart, remote reconnect, legacy fallback session. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]

### Anti-Patterns to Avoid

- **Reuse `stdioSseBridge.js`:** It broadcasts every child frame to all sessions and uses full `process.env`; violates D-07 and D-22. [VERIFIED: codebase grep `src/lib/mcp/stdioSseBridge.js`]  
- **Use SDK `Client`:** Its numeric incrementing ID counter violates D-19. [VERIFIED: SDK v1.30.0 package source]  
- **Spawn `shell: true` or DB-provided executable/args:** Makes command injection possible; host registry must resolve command ID and templates. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
- **Mark ready before full discovery:** Makes stale/invalid tool schema injectable after crash or reconnect. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
- **Retry `tools/call`:** Tool actions may be non-idempotent. Return retryable error; do not replay. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
- **Treat transport close as tool cancellation:** Explicit MCP cancellation is required; Streamable HTTP disconnect can occur without cancellation. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md]  

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| stdio line framing, max buffer, child shutdown | Custom `stdout` parser/process-kill sequence | `StdioClientTransport` [VERIFIED: npm registry] | SDK transport has newline framing, `maxBufferSize`, stderr piping, and close semantics. [VERIFIED: SDK v1.30.0 package source] |
| Streamable HTTP sessions, protocol-version headers, POST JSON/SSE response parsing | Custom `fetch` + SSE parser/session headers | `StreamableHTTPClientTransport` [VERIFIED: npm registry] | MCP requires POST/GET behavior, `Mcp-Session-Id`, protocol-version headers, and optional SSE. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md] |
| Legacy endpoint event / SSE delivery | Custom EventSource compatibility layer | `SSEClientTransport` [VERIFIED: npm registry] | Legacy HTTP+SSE stays compatibility-only. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md] |
| JSON-RPC request IDs and routing | SDK high-level request layer | 9Router `McpJsonRpcClient` | D-19 requires UUID strings; SDK v1 high-level layer uses incrementing numeric IDs. [VERIFIED: SDK v1.30.0 package source] |
| Executable authorization and argument templating | Free-form command validation regex | Host-owned command registry + schema-validated placeholders | Shell-safe syntax cannot establish executable trust. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |

**Key insight:** Reuse transport machinery; own gateway policy and request identity. [VERIFIED: SDK v1.30.0 package source; CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]

## Common Pitfalls

### Pitfall 1: SDK request-ID mismatch

**What goes wrong:** Planner calls `new Client().connect()` and `client.callTool()`, then wire IDs are numeric instead of UUID strings. [VERIFIED: SDK v1.30.0 package source]  
**Why it happens:** SDK `Protocol.request()` executes `this._requestMessageId++`. [VERIFIED: SDK v1.30.0 package source]  
**How to avoid:** Use SDK transport objects only; use custom request map in `client.js`. [VERIFIED: SDK v1.30.0 package source]  
**Warning signs:** Test captures outbound `initialize`, `tools/list`, and `tools/call` frames with non-string IDs. [VERIFIED: SDK v1.30.0 package source]

### Pitfall 2: Phase 1 data model contradicts locked spawn policy

**What goes wrong:** `mcpRepo` persists arbitrary `command`, `args`, and `env`; current CRUD allows `npx` and arbitrary CLI payloads. [VERIFIED: codebase grep `src/lib/db/repos/mcpRepo.js`; VERIFIED: codebase grep `tests/unit/mcp-skills-db.test.js`]  
**Why it happens:** Phase 1 schema was built before D-05 through D-08 locked policy. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
**How to avoid:** Phase 2 must include a migration/repository contract update: persisted stdio record selects `commandId` plus validated placeholder values; host config supplies executable, args template, allowed env keys, and process class. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
**Warning signs:** Any `spawn(server.command, server.args)` or `env: {...process.env, ...server.env}` survives review. [VERIFIED: codebase grep `src/lib/mcp/stdioSseBridge.js`]

### Pitfall 3: Ready cache after only partial recovery

**What goes wrong:** Stale tools are injected after a crash, failed protocol negotiation, or failed `tools/list`. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
**Why it happens:** Connection establishment and discovery are treated as separate best-effort operations. [ASSUMED]  
**How to avoid:** Publish tools and set `Ready` only after complete initialize and `tools/list`; preserve stale cache in admin-only view. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
**Warning signs:** `Ready` transition happens before cache write succeeds. [ASSUMED]

### Pitfall 4: Timeout leaks and duplicate effects

**What goes wrong:** Pending promise remains after timeout, blocked child remains alive, or a retry repeats mutating tool work. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle.md; CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
**Why it happens:** Timers, cancellation, process restart, and pending map cleanup are not one idempotent operation. [ASSUMED]  
**How to avoid:** One `settlePending(id, outcome)` removes map/timer once; timeout sends cancellation, waits five seconds, then restarts only still-blocked stdio entry; never retry `tools/call`. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
**Warning signs:** Pending map size grows; request ID receives second response; tool calls are automatically retried. [ASSUMED]

### Pitfall 5: SSRF DNS rebinding gap

**What goes wrong:** URL string validation permits hostname that resolves to private address after validation. [ASSUMED]  
**Why it happens:** Existing guard checks literals and blocked hostname/suffixes but does not show DNS resolution/pinned-address validation. [VERIFIED: codebase grep `src/shared/utils/ssrfGuard.js`]  
**How to avoid:** Add explicit allowlist policy for private destinations and validate resolved addresses at connection time; do not weaken current public-address guard. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
**Warning signs:** Manager uses remote URL directly without a policy object or recorded validation result. [ASSUMED]

## Code Examples

### Stdio transport with minimal environment

```javascript
// Source: @modelcontextprotocol/sdk v1.30.0 client/stdio API.
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: hostCommand.executable,   // resolved only from host registry
  args: hostCommand.renderArgs(values),
  env: buildMinimalAllowedEnv(hostCommand, secretValues),
  stderr: "pipe",
  maxBufferSize: 1024 * 1024,
});

await transport.start();
```

`StdioClientTransport` exposes `start()`, `send()`, `close()`, `pid`, piped stderr, and configurable `maxBufferSize`. [VERIFIED: SDK v1.30.0 package source]

### Initialize then list tools

```javascript
// Source: MCP lifecycle/tools specification; IDs created by McpJsonRpcClient.
const init = await rpc.request("initialize", {
  protocolVersion: SUPPORTED_PROTOCOL_VERSION,
  capabilities: {},
  clientInfo: { name: "9router", version: APP_VERSION },
}, { timeoutMs: 15_000 });

assertSupportedVersion(init.result.protocolVersion);
transport.setProtocolVersion?.(init.result.protocolVersion);
await rpc.notify("notifications/initialized");

const tools = await rpc.request("tools/list", {}, { timeoutMs: 15_000 });
```

Initialization must precede normal requests; client sends `notifications/initialized` after initialize response. `tools/list` supports pagination, so implementation must continue while `nextCursor` exists. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle.md; CITED: https://modelcontextprotocol.io/specification/2025-06-18/server/tools.md]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP+SSE transport | Streamable HTTP is standard; legacy SSE is compatibility fallback | MCP protocol 2025-03-26 replaced prior HTTP+SSE model | Try Streamable HTTP first; use fresh legacy connection only on compatibility failure. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md] |
| Hand-written client transport | Official TypeScript SDK transport classes | Current SDK v1.30.0 | Reuse protocol transport behavior; retain custom request layer only for D-19. [VERIFIED: npm registry; VERIFIED: SDK v1.30.0 package source] |

**Deprecated/outdated:**

- `SSEClientTransport`: deprecated by SDK docs; retain only compatibility fallback. [VERIFIED: SDK v1.30.0 package source]  
- `stdioSseBridge.js` shared UI broadcast: legacy bridge architecture only; do not use for gateway manager. [VERIFIED: codebase grep `src/lib/mcp/stdioSseBridge.js`; CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `transportFactory.js`, `policy.js`, and `errors.js` should be separate source files. | Architecture Patterns | Low; planner can fold boundaries into two required modules. |
| A2 | Existing literal-host SSRF guard misses DNS resolution/pinned-address validation. | Common Pitfalls | High; private target bypass risk requires direct implementation review. |
| A3 | One idempotent pending-settlement helper is best internal design. | Common Pitfalls | Medium; alternative implementation may still be correct if behavior matches. |

## Open Questions

1. **Where do host command registry and private-endpoint allowlist live?**
   - What we know: DB `command`, `args`, and `env` fields permit values prohibited by D-05 through D-07. [VERIFIED: codebase grep `src/lib/db/repos/mcpRepo.js`]  
   - What's unclear: Exact host configuration file/schema and admin persistence model are not specified. [ASSUMED]  
   - Recommendation: Plan Wave 0 policy contract plus migration before manager spawn code; reject legacy free-form stdio records. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]

2. **Where are D-27 through D-30 audit records stored?**
   - What we know: Existing Phase 1 MCP tables hold server config and tool cache only. [VERIFIED: codebase grep `src/lib/db/schema.js`]  
   - What's unclear: No operation-log/debug-capture table or cleanup job exists in reviewed MCP files. [VERIFIED: codebase grep `src/lib/db/schema.js`, `src/lib/db/repos/mcpRepo.js`]  
   - Recommendation: Plan migration plus repository/service for metadata, restricted debug capture, and TTL purge; do not defer locked D-27 through D-30. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]

3. **What operation defines “idle” for D-23?**
   - What we know: Default process cap is 20 and manager must stop only idle entries. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
   - What's unclear: Idle timeout/value is discretionary. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
   - Recommendation: Define `idle === queue empty && inFlight === 0 && no discovery/reconnect`; host config selects conservative timeout. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Manager/runtime, SDK v1 requires Node `>=18` | ✓ | `v22.22.1` | — [VERIFIED: environment probe; VERIFIED: npm registry] |
| npm | Install MCP SDK and test dependencies | ✓ | `9.2.0` | — [VERIFIED: environment probe] |
| `@modelcontextprotocol/sdk` | MCP transports | ✗ | `1.30.0` registry verified | Install pinned package during implementation; research install probe failed only with `ERR_SOCKET_TIMEOUT`. [VERIFIED: npm registry; VERIFIED: shell command output] |
| Vitest | Existing test runner | ✓ | Present under `tests/node_modules` | `npm --prefix tests test` | [VERIFIED: codebase grep `tests/package.json`, `tests/node_modules`] |

**Missing dependencies with no fallback:**

- `@modelcontextprotocol/sdk@1.30.0` must install before implementation. [VERIFIED: npm registry]

**Missing dependencies with fallback:**

- none. [VERIFIED: environment probe]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Dashboard-admin gate for configuration, test, enablement, audit/debug views. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| V3 Session Management | Yes | Per-server remote session lifecycle; close/terminate session on disable and app shutdown. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md] |
| V4 Access Control | Yes | Host command registry, explicit private-endpoint allowlist, admin-only audit/debug data. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| V5 Input Validation | Yes | Validate command ID, placeholder values, URL policy, tool names/arguments, output size, queue limits. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| V6 Cryptography | Yes | `crypto.randomUUID()` for request IDs; no custom crypto. [VERIFIED: environment probe; CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |

### Known Threat Patterns for Node/MCP Gateway

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Arbitrary command/argument execution | Elevation of Privilege | Host-owned command IDs/templates; `spawn` without shell; schema-validated placeholders. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| Full environment/secret exposure | Information Disclosure | Minimal env allowlist; redact logs, errors, metadata, and API models. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| Private endpoint access / SSRF | Elevation of Privilege | Public HTTPS default, explicit private allowlist, extend existing SSRF guard. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| Child crash or hung tool exhausts resources | Denial of Service | Per-request timeout, cancellation, bounded restart, circuit breaker, global/per-server concurrency and queue caps. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |
| Cross-request/frame disclosure | Information Disclosure | Pending map routes response by UUID only; manager owns notifications; never broadcast raw frames. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md] |

## Sources

### Primary (HIGH confidence)

- [Context7 `/modelcontextprotocol/typescript-sdk/v1.29.0`] — v1 import paths, stdio transport, cancellation. [VERIFIED: Context7 CLI]  
- `@modelcontextprotocol/sdk@1.30.0` npm metadata and inspected tarball — package version, exports, Node engine, numeric internal request IDs, transport APIs. [VERIFIED: npm registry]  
- https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle.md — initialization, shutdown, timeout/cancellation requirements. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle.md]  
- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md — stdio, Streamable HTTP, session headers, legacy SSE fallback. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports.md]  
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools.md — tool capability, `tools/list`, `tools/call`, list-changed notification. [CITED: https://modelcontextprotocol.io/specification/2025-06-18/server/tools.md]  
- `.planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md` — locked product/security/resource decisions. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md]  
- `src/lib/mcp/stdioSseBridge.js`, `src/lib/db/repos/mcpRepo.js`, `src/shared/utils/ssrfGuard.js`, `tests/package.json` — current code constraints. [VERIFIED: codebase grep]  

### Secondary (MEDIUM confidence)

- None. [VERIFIED: research log]

### Tertiary (LOW confidence)

- Internal module split and DNS-rebinding implementation gap listed in Assumptions Log. [ASSUMED]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — official SDK docs, registry metadata, and inspected v1.30.0 source agree. [VERIFIED: npm registry; VERIFIED: SDK v1.30.0 package source]  
- Architecture: HIGH — locked context defines lifecycle/resource policy; official MCP specification defines protocol mechanics. [CITED: .planning/phases/02-mcp-process-manager-json-rpc-client/02-CONTEXT.md; CITED: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle.md]  
- Pitfalls: HIGH — key pitfalls derive from inspected current bridge/repository and SDK source; DNS-rebinding nuance remains explicitly assumed. [VERIFIED: codebase grep; VERIFIED: SDK v1.30.0 package source]  

**Research date:** 2026-08-20  
**Valid until:** 2026-09-19
