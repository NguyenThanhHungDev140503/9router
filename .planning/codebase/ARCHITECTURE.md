# Architecture

**Analysis Date:** 2026-08-19

## Pattern Overview

**Overall:** Multi-layer AI Gateway & Dashboard Monolith with Decoupled SSE Routing Engine

**Key Characteristics:**
- **OpenAI-Compatible Gateway:** Single universal entry point (`/v1/*`) accepting standard OpenAI, Claude, Gemini, Cursor, or Responses API formatted requests.
- **Intermediate Format Hub-and-Spoke Translation:** Pivots any incoming client request through OpenAI intermediate representation to any target provider format, with direct non-lossy routes for fragile protocol pairs.
- **Fail-Open Optimization & Resilience:** Multi-account failover, combo sequential model fallback, and non-blocking token compression (RTK) that fails open on error without interrupting upstream requests.
- **Decoupled Engine Structure:** `src/` contains the Next.js web application and dashboard API; `open-sse/` is an independent, provider-agnostic protocol and routing engine.

## Layers

**1. Entry & Proxy Ingress Layer (`custom-server.js`, `src/proxy.js`, `src/dashboardGuard.js`):**
- Purpose: Inspect raw TCP socket IP, inject unforgeable peer trust headers (`x-9r-peer-token`), handle HTTP/2 cleartext (h2c) upgrades, enforce authentication guard, and route `/v1/*` paths to API handlers.
- Depends on: Node.js `http`, `crypto`.
- Used by: All incoming HTTP client traffic.

**2. API Routing & Controller Layer (`src/app/api/*`, `src/sse/handlers/*`):**
- Purpose: Expose Next.js App Router endpoints for dashboard CRUD, auth sessions, OAuth callbacks, and streaming endpoints (`/api/v1/chat/completions`, `/api/v1/messages`, `/api/v1/embeddings`, etc.).
- Contains: `src/sse/handlers/chat.js` (resolves combos, manages multi-account retry loop), `src/sse/handlers/embeddings.js`, `src/sse/handlers/imageGeneration.js`.
- Depends on: Database repositories, `open-sse` core handlers.
- Used by: Dashboard UI and external API clients (Claude Code, Cursor, Cline, OpenCode, Codex).

**3. Gateway Core & Pipeline Layer (`open-sse/handlers/*`, `open-sse/rtk/*`):**
- Purpose: Coordinate model resolution, token reduction (RTK filters), prompt injection (Caveman/Ponytail), executor dispatch, and token usage accounting.
- Contains: `open-sse/handlers/chatCore.js`, `open-sse/rtk/index.js`, `open-sse/rtk/headroom.js`.
- Depends on: Translator registry, Executor registry, Service helpers.
- Used by: `src/sse/handlers/*`.

**4. Translation & Protocol Normalization Layer (`open-sse/translator/*`, `open-sse/transformer/*`):**
- Purpose: Convert between disparate LLM vendor schemas (OpenAI Chat Completions, Anthropic Messages API, Google Gemini generateContent, Codex Responses API, Kiro EventStream, Cursor Protobuf).
- Structure: Direct translators (`request/<from>-to-<to>.js`, `response/<from>-to-<to>.js`) and OpenAI bridge fallback.
- Depends on: `open-sse/translator/schema/`, `open-sse/translator/concerns/`.
- Used by: `chatCore.js` and executors.

**5. Provider Execution Layer (`open-sse/executors/*`, `open-sse/providers/*`):**
- Purpose: Issue network requests to upstream AI servers with auth headers, custom signing, stream decoders, error parsing, and rate limit detection.
- Contains: `BaseExecutor` (`open-sse/executors/base.js`), `DefaultExecutor` (standard OpenAI compatible), and specialized executors (`kiro.js`, `cursor.js`, `antigravity.js`, `devin-cli.js`, etc.).
- Depends on: `undici`, `open-sse/config/`.
- Used by: Gateway core.

**6. State & Persistence Layer (`src/lib/db/*`, `src/lib/usageDb.js`):**
- Purpose: Manage local SQLite database connection with runtime adapter fallback, schema migrations, and entity repositories.
- Repositories: `src/lib/db/repos/` (settings, keys, providerConnections, combos, modelAliases, proxyPools).
- Depends on: `bun:sqlite` / `better-sqlite3` / `node:sqlite` / `sql.js`.

**7. Background Services & MITM Subsystem (`src/sse/services/*`, `src/mitm/*`):**
- Purpose: Background token refresh daemon (`backgroundTokenRefresh.js`), quota auto-ping (`quotaAutoPing.js`), and local transparent MITM proxy with dynamic SSL root CA generation.

## Data Flow

**Standard Chat Completion Request Cycle:**

1. **Client Request:** Client sends `POST /v1/chat/completions` (or `/v1/messages`) with Bearer token / API key.
2. **Server Ingress:** `custom-server.js` strips fake IP headers, marks trusted client IP via unforgeable `NINEROUTER_PEER_TOKEN`, Next.js rewrites to `src/app/api/v1/chat/completions/route.js`.
3. **Account & Combo Resolution:** `src/sse/handlers/chat.js` verifies API key, parses model name. If model is a Combo (e.g. `combo:smart-code`), expands candidate models; queries active accounts for provider ordered by priority.
4. **RTK Pre-Processing:** `open-sse/rtk/index.js` scans message history, compresses redundant `tool_result` content (git diffs, build outputs, file listings) without losing semantic meaning. Caveman/Ponytail prompts injected if enabled.
5. **Request Translation:** `open-sse/translator/index.js` transforms the normalized payload into provider-native format (e.g., OpenAI -> Anthropic or OpenAI -> Gemini).
6. **Upstream Streaming Execution:** Corresponding `Executor` sends request using `undici`. As upstream chunks arrive, `translateResponse` translates vendor stream events into standard SSE chunks back to the client.
7. **Failover & Retry:** If upstream returns 429 / quota error / auth expired, background refresh is triggered or executor attempts next priority account or fallback model in combo sequence.
8. **Usage & Detail Logging:** Final token counts, latency, and sanitized headers are recorded asynchronously to `usageDb.js` and `requestDetailsDb.js`.

## Key Abstractions

**Executor (`open-sse/executors/base.js`):**
- Purpose: Encapsulates provider communication, endpoint URL selection, auth header generation, and SSE stream consumption.
- Pattern: Strategy / Template Method pattern (`BaseExecutor` base class extended by specialized provider executors).

**Translator Registry (`open-sse/translator/index.js`):**
- Purpose: Self-registering matrix of bidirectional request/response translators.
- Pattern: Registry & Middleware pattern with explicit pair matching and direct route shortcuts.

**Database Adapter Chain (`src/lib/db/driver.js`):**
- Purpose: Universal SQLite database interface supporting multiple runtime environments without requiring compilation tools.
- Pattern: Adapter / Fallback Chain pattern.

**Repository Pattern (`src/lib/db/repos/*`):**
- Purpose: Abstract SQL queries and entity JSON serialization for settings, keys, and provider connections.

## Entry Points

**Web Dashboard & API Gateway:**
- Location: `custom-server.js` -> `src/app/layout.js` & `src/app/api/*`
- Triggers: `npm run start` / `npm run dev` on port 20128
- Responsibilities: HTTP server binding, session security, API routing.

**Background Token Refresh Scheduler:**
- Location: `src/sse/services/backgroundTokenRefresh.js`
- Triggers: Started upon server startup in `custom-server.js` / `initializeApp.js`
- Responsibilities: Periodic checks (every 60s) for expiring OAuth tokens (Grok, Kiro, Codex, Antigravity) with deduplication lock.

**MITM Proxy Server:**
- Location: `src/mitm/server.js`
- Triggers: Dashboard MITM toggle or CLI command
- Responsibilities: Transparent SSL forward proxy, cert generation, and IDE traffic interception.

**CLI Launcher:**
- Location: `cli/cli.js`
- Triggers: Command line invocation `9router start / status / stop`
- Responsibilities: Background daemon lifecycle, system tray integration, port conflict resolution.

## Error Handling

**Strategy:** Fail-open for optimization modules (RTK, Caveman, request detail loggers); strict structured errors for API endpoints; automatic failover for upstream provider errors.

**Patterns:**
- Try/catch wrappers with explicit fallback chains in model combos and multi-account dispatchers.
- Sanitized error responses formatted according to client protocol standards (`open-sse/utils/error.js`).

## Cross-Cutting Concerns

**Logging & Sanitization:**
- `src/lib/requestDetailsDb.js` sanitizes authorization tokens, API keys, passwords, and sensitive headers before logging.

**Security & SSRF Guard:**
- `src/shared/utils/ssrfGuard.js` validates outbound URLs to prevent loopback/internal network probing from user-defined provider endpoints.

---

*Architecture analysis: 2026-08-19*
*Update when major patterns change*
