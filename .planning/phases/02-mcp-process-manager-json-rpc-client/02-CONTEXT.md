# Phase 2: MCP Process Manager & JSON-RPC Client - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the 9Router server-side MCP client and process manager. It must negotiate MCP protocol compatibility, execute `tools/list` and `tools/call`, manage local stdio child processes and remote MCP transports, and fail safely under configuration errors, crashes, timeouts, and resource pressure.

</domain>

<decisions>
## Implementation Decisions

### Transport and remote connectivity
- **D-01:** Implement stdio, Streamable HTTP, and legacy HTTP+SSE compatibility in Phase 2. Treat Streamable HTTP as the preferred remote transport.
- **D-02:** Open remote connections lazily, reuse them while enabled, and clean them up when a server is disabled or 9Router shuts down.
- **D-03:** Allow public HTTPS endpoints by default. Private, LAN, loopback, and internal endpoints require an explicit admin-managed allowlist.
- **D-04:** Reconnect remote transports with bounded exponential backoff and jitter. Retry `initialize`/discovery and `tools/list`, but never automatically replay `tools/call`.

### Stdio spawn policy
- **D-05:** Only launch host-managed allowlisted executables. Database configuration selects a registered command ID rather than an arbitrary shell command.
- **D-06:** Host configuration owns argument templates. Database values fill only schema-validated placeholders.
- **D-07:** Spawn with a minimal environment and an allowlist of environment variable keys. Keep secrets out of logs and API responses.
- **D-08:** Validate configuration when saved. An admin must run a test and explicitly enable a server before it can spawn.
- **D-09:** Run one stdio child per MCP server configuration, shared gateway-wide. Only allow shared servers that are stateless or safe for multi-tenant use.

### Crash recovery and tool cache
- **D-10:** Isolate failures per MCP server. A failed server reaches `Error` and its tools stop being injected; all other servers continue.
- **D-11:** Restart crashed stdio processes with exponential backoff and a failure budget. Default policy: five crashes in ten minutes reaches `Error`.
- **D-12:** If a process crashes during `tools/call`, return a structured retryable error and restart in the background. Do not replay the call.
- **D-13:** After recovery, run discovery/initialization and `tools/list` successfully before re-injecting tools. Retain stale cache only for admin display.

### Timeout and error contract
- **D-14:** Defaults: 15 seconds for discovery/initialization and `tools/list`; 60 seconds for `tools/call`. Admins may lower defaults; no operation may exceed a five-minute hard cap.
- **D-15:** Return a sanitized gateway error envelope with `code`, `message`, `server`, `tool`, and `retryable`. Never expose raw stderr, environment values, or internal URLs.
- **D-16:** On tool-call timeout, send MCP cancellation, wait five seconds, then restart only a still-blocked stdio server. Abort HTTP/SSE work without affecting other servers.
- **D-17:** Apply a per-server circuit breaker. Default: three timeouts in ten minutes reaches `Error`, stops tool injection, and schedules health checks with backoff.

### JSON-RPC lifecycle and compatibility
- **D-18:** Run discovery/initialization once per new connection or legacy session, then repeat after restart or reconnect.
- **D-19:** 9Router generates UUID string request IDs for all outbound JSON-RPC requests and resolves pending work through a request-ID map.
- **D-20:** Support negotiated MCP protocol versions. Prefer current Streamable HTTP; fall back to legacy initialization and HTTP+SSE only when server capability detection requires it.
- **D-21:** Process recognized server notifications asynchronously for state and cache updates. Safely ignore unknown notifications.
- **D-22:** The manager must not broadcast JSON-RPC frames to UI clients. It routes responses only by request ID; server notifications remain manager-owned state/cache events.

### Resource limits
- **D-23:** Enforce a host-configurable stdio process cap with a default of 20. Stop processes only when idle.
- **D-24:** Limit concurrent `tools/call` work to 32 globally and four per server. Overflow is retryable.
- **D-25:** Cap raw tool output at 1 MiB and text forwarded to the LLM at 50,000 characters, with an explicit truncation marker.
- **D-26:** Queue at most 50 calls per server before returning a retryable overload error.

### Observability and audit
- **D-27:** Persist structured operation metadata by default: server, transport, method, request ID, duration, status, and sanitized error code. Raw arguments/results require opt-in debug capture and redaction.
- **D-28:** Track `Stopped`, `Starting`, `Ready`, `Degraded`, and `Error`, including last healthy time, sanitized error, and next retry time.
- **D-29:** Restrict audit and debug details to dashboard administrators. Client APIs and LLM context receive only sanitized errors.
- **D-30:** Retain metadata for 30 days and debug captures for 24 hours with automatic deletion. Host configuration may reduce retention but not exceed the hard cap.

### the agent's Discretion
No implementation decisions were delegated. Planner may choose internal module boundaries, data structures, exact backoff values within stated policies, and test fixture design.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and MCP design
- `.planning/ROADMAP.md` — Phase 2 goal, requirements, and success criteria.
- `.planning/REQUIREMENTS.md` — MCP-PROC-01 through MCP-PROC-03 and v1 scope.
- `docs/SERVER_SIDE_MCP_SKILLS_EXPLAINER.md` — intended MCP gateway flow and source-code integration map.

### Existing implementation patterns
- `src/lib/mcp/stdioSseBridge.js` — legacy UI bridge only. Its broadcast model must not be reused by `McpProcessManager`.
- `src/shared/utils/ssrfGuard.js` — existing public-address validation for outbound remote endpoints; extend for explicit admin allowlists without weakening defaults.
- `src/lib/db/repos/mcpRepo.js` — persisted MCP server transport/configuration fields established in Phase 1.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/mcp/stdioSseBridge.js`: reuse only child-process framing/cleanup ideas. Do not reuse its shared-session broadcast design.
- `src/shared/utils/ssrfGuard.js`: private/loopback/internal network blocking for remote MCP endpoint validation.
- `src/lib/db/repos/mcpRepo.js`: MCP server records already validate `stdio`, `sse`, and `http` transport values.

### Established Patterns
- 9Router uses fail-open behavior for noncritical gateway optimizations, but this manager must expose structured errors and isolate individual MCP failures.
- `open-sse/` is an ESM protocol engine while the existing stdio bridge is CommonJS. New Phase 2 modules must respect their importing boundary.
- Existing SQLite repositories are the source of persisted server configuration and tool-cache synchronization.

### Integration Points
- Phase 2 adds `src/lib/mcp/client.js` and `src/lib/mcp/processManager.js`.
- Phase 3 consumes synchronized tool schemas for request injection.
- Phase 4 calls `processManager.executeToolCall()` inside the server-side ReAct loop.

</code_context>

<specifics>
## Specific Ideas

- MCP communication is JSON-RPC 2.0 over stdio or remote HTTP transports.
- Pending outbound requests need request-ID correlation so concurrent responses can arrive out of order without resolving the wrong operation.
- Current MCP transport direction favors Streamable HTTP; legacy HTTP+SSE remains compatibility-only.
- A shared child process is intentional only at MCP-server-config scope. UI clients never receive raw shared JSON-RPC frames.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 2 scope.

</deferred>

---

*Phase: 2-MCP Process Manager & JSON-RPC Client*
*Context gathered: 2026-08-20*
