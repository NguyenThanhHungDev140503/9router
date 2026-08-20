# Phase 2: MCP Process Manager & JSON-RPC Client - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-20
**Phase:** 2-MCP Process Manager & JSON-RPC Client
**Areas discussed:** Transport v1, Chính sách spawn, Crash & restart, Timeout & lỗi tool, JSON-RPC lifecycle, Giới hạn tài nguyên, Quan sát & audit

---

## Transport v1

| Option | Description | Selected |
|--------|-------------|----------|
| Stdio only | Complete stdio and defer remote transports | |
| Stdio + SSE | Add legacy remote SSE transport | |
| Stdio + SSE + HTTP | Support all persisted transport types | ✓ |

**User's choice:** Complete all transports in Phase 2, later clarified as stdio + current Streamable HTTP + legacy HTTP+SSE compatibility.
**Notes:** Lazy connection reuse; public HTTPS default with admin allowlist for private/LAN endpoints; bounded reconnect for discovery/tool-list only.

---

## Chính sách spawn

| Option | Description | Selected |
|--------|-------------|----------|
| Host-managed allowlist | Registered command IDs and schema-bound configuration | ✓ |
| Admin absolute path | Admin supplies arbitrary executable path | |
| Built-in plugins only | Restrict to preset local plugins | |

**User's choice:** Host-managed allowlist, host argument templates, minimal allowlisted environment, validate/test/explicit-enable before spawning.
**Notes:** Secrets never enter logs or API responses.

---

## Shared Process Isolation

| Option | Description | Selected |
|--------|-------------|----------|
| Shared per server config | One manager-owned child per MCP server configuration | ✓ |
| Per gateway session | One child for each client/chat session | |
| Hybrid isolation modes | Shared by default with per-session configuration | |

**User's choice:** One child per MCP server configuration, shared gateway-wide.
**Notes:** `stdioSseBridge.js` broadcasts raw frames to UI sessions and cannot be reused as manager transport. Manager responses route only by JSON-RPC request ID; notifications stay manager-owned. Shared servers must be stateless or safe for multi-tenant use.

---

## Crash & restart

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded backoff | Per-server exponential backoff and failure budget | ✓ |
| Infinite retry | Restart forever at fixed interval | |
| No retry | Require manual restart | |

**User's choice:** Isolate crashes per server; return retryable structured error for interrupted calls; refresh discovery and tool cache before injection.
**Notes:** Do not replay tool calls after a crash.

---

## Timeout & lỗi tool

| Option | Description | Selected |
|--------|-------------|----------|
| Per-operation defaults | Separate timeout budgets, sanitized errors, cancellation | ✓ |
| Single timeout | Same timeout for every MCP operation | |
| Per-server only | No system defaults | |

**User's choice:** 15-second discovery/list, 60-second call, five-minute cap; cancel then restart stuck stdio process; circuit-break repeated timeouts.
**Notes:** Tool errors use sanitized gateway envelope; raw server errors are never forwarded.

---

## JSON-RPC lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Per-session handshake | Initialize/discover after new connection or recovery | ✓ |
| Handshake per call | Reinitialize before every operation | |
| Test-only handshake | Initialize only through admin test | |

**User's choice:** Per-session compatibility handshake, UUID request IDs, current-version preference with legacy fallback, asynchronous known notifications.
**Notes:** User requested clarification of JSON-RPC request/response correlation before choosing.

---

## Giới hạn tài nguyên

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded resources | Configurable process/call/output/queue caps | ✓ |
| Unlimited | No manager-enforced caps | |
| Minimal hard caps | Small fixed limits | |

**User's choice:** Default 20 stdio processes, 32 global calls, four calls per server, 50 queued calls per server, 1 MiB raw result, and 50,000 LLM text characters.
**Notes:** Overflow becomes retryable; output includes truncation marker.

---

## Quan sát & audit

| Option | Description | Selected |
|--------|-------------|----------|
| Sanitized structured audit | Persist metadata, protect raw debug data | ✓ |
| Full request/response audit | Persist raw payloads by default | |
| Console only | Do not persist operations | |

**User's choice:** Structured metadata, administrator-only debug access, state machine, 30-day metadata retention, and 24-hour debug retention.
**Notes:** API clients and LLM context receive sanitized errors only.

---

## the agent's Discretion

No areas were delegated.

## Deferred Ideas

None.
