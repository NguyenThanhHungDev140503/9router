---
phase: 03-format-aware-inbound-injection
plan: 03
subsystem: mcp-injection
tags: [mcp, chatcore, request-pipeline, fail-open, vitest, openai, claude, gemini, responses-api]
requires:
  - phase: 03-format-aware-inbound-injection
    provides: Format-specific tool injectors, inbound selection, and retry-idempotent skill prompt injection
provides:
  - Repository-backed fail-open MCP and skill injection before chat request translation
  - Copy-on-write retry composition that preserves client-owned tools and system text
  - ChatCore integration coverage across native request formats and exception fallback
affects: [04-react-tool-loop, inbound-chat-routing]
tech-stack:
  added: []
  patterns: [single fail-open repository boundary, pre-translation request injection, sanitized count-only diagnostics]
key-files:
  created:
    - open-sse/mcp/inboundInjectionPipeline.js
    - tests/unit/mcp-chat-core-injection.test.js
  modified:
    - open-sse/handlers/chatCore.js
key-decisions:
  - "ChatCore invokes inbound injection after source format and bypass detection, before provider mutation, passthrough dispatch, and translateRequest."
  - "The pipeline adapts selected flat tool candidates into injector cache rows without duplicating selection or conversion logic."
  - "Injection failures log only configured reason codes and collection counts, then return the exact original request body."
patterns-established:
  - "Repository reads, selection, format conversion, and skill prompts meet at one async fail-open boundary."
  - "Namespaced MCP calls remain model-visible tool metadata; Phase 4 retains all server-side execution and response interception."
requirements-completed: [MCP-INJECT-01, MCP-INJECT-02, MCP-INJECT-03, MCP-INJECT-04]
duration: 15 min
completed: 2026-08-21
---

# Phase 3 Plan 03: ChatCore Pipeline Integration and Fail-Open Resilience Summary

**Cached enabled MCP schemas and selected skill prompts now enter every supported inbound request format before `chatCore` translation, with copy-on-write retry safety and fail-open fallback.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-21T18:23:00Z
- **Completed:** 2026-08-21T18:38:11Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- Added `applyInboundInjection` as sole enabled-repository/cache boundary; no MCP process start or tool call occurs.
- Wired injected request body into `handleChatCore` immediately after source-format and bypass decisions, before provider mutation and `translateRequest`.
- Added 10 focused contracts for four native formats, header restriction, collision ownership, retry idempotency, immutable inputs, sanitised fail-open logs, and thrown-injector fallback.

## Task Commits

1. **Task 1: Write failing chatCore inbound-injection integration tests** — `0f188ffa` (test)
2. **Task 2: Build repository-backed fail-open pipeline and wire chatCore** — `97c82842` (feat)
3. **Task 3: Prove full Phase 3 regression boundary** — `bef57653` (test)

## Files Created/Modified

- `open-sse/mcp/inboundInjectionPipeline.js` — read-only enabled configuration/cache boundary, selection composition, format injection, and count-only fail-open diagnostics.
- `open-sse/handlers/chatCore.js` — invokes inbound pipeline before translation or passthrough construction.
- `tests/unit/mcp-chat-core-injection.test.js` — hermetic repository/translator/executor integration contracts.

## Decisions Made

- Injection happens after bypass decision so bypass requests keep existing early-return behavior.
- Flat output from `selectInboundMcp` becomes injector-compatible cache rows only at composition boundary.
- Failure diagnostics contain fixed reason code and row counts only; no body, headers, schemas, or skill prompts enter logs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted selected tool candidate shape for format injector**
- **Found during:** Task 2
- **Issue:** `selectInboundMcp` returns `{ serverId, tool }` candidates while `createFormatInjector().inject()` expects cache rows containing `tools`.
- **Fix:** Pipeline maps selected candidates to one-tool cache rows before invoking existing format strategy.
- **Files modified:** `open-sse/mcp/inboundInjectionPipeline.js`
- **Verification:** All four native format composition cases inject exactly one `mcp__repo__search` tool.
- **Committed in:** `97c82842`

**2. [Rule 3 - Blocking] Used project-correct Vitest filter paths**
- **Found during:** Tasks 1–3
- **Issue:** `npm --prefix tests` resolves test filters from `tests/`; planned `tests/unit/...` paths target a nonexistent nested directory.
- **Fix:** Used equivalent `unit/mcp-*.test.js` filters.
- **Files modified:** None.
- **Verification:** Focused suite passed 10 tests; Phase 3 suites passed 41 tests.
- **Committed in:** No code change.

**3. [Rule 1 - Bug] Corrected stale SDK state and traceability records**
- **Found during:** Executor state updates
- **Issue:** SDK plan progression left Plan 03-03 unchecked, the active-plan field stale, frontmatter progress at 29%, and the MCP injection traceability row pending despite all four requirements being complete.
- **Fix:** Updated executor state records to reflect 3/3 Phase 3 plans, 56% plan progress, verification readiness, and complete MCP injection traceability.
- **Files modified:** `.planning/STATE.md`, `.planning/REQUIREMENTS.md`
- **Verification:** State and roadmap now agree that Phase 3 has 3/3 completed plans.
- **Committed in:** Plan metadata commit.

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking).
**Impact on plan:** Corrected composition interface and verification invocation. No scope expansion.

## Issues Encountered

- Full `npm --prefix tests test` remains red from unrelated pre-existing suite/environment failures: missing `is-inside-container`, missing `sql.js`, tests resolving `tests/src/...`, DB concurrency expectations, and existing translator/provider expectation drift. Focused Plan 03 suite passed; no unrelated files changed.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 may consume `mcp__{server}__{tool}` model calls at its own response-interception boundary.
- No Phase 4 process-manager, client-tool execution, or response handling code changed.

## Self-Check: PASSED

- Found planned source, handler, test, and summary files.
- Found task commits `0f188ffa`, `97c82842`, and `bef57653`.

---
*Phase: 03-format-aware-inbound-injection*
*Completed: 2026-08-21*
