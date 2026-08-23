---
phase: 03-format-aware-inbound-injection
plan: 02
subsystem: mcp-injection
tags: [mcp, skills, xml, request-filtering, openai, claude, gemini, responses-api, vitest]
requires:
  - phase: 03-format-aware-inbound-injection
    provides: canonical MCP tool cache schemas and format identifiers from Plan 03-01
provides:
  - Pure enabled-server MCP tool and skill selection with lexical activation and restrictive header filtering
  - XML skill system prompts injected copy-on-write across OpenAI, Claude, Gemini, and Responses request bodies
affects: [03-03-chatcore-integration, 04-react-tool-loop]
tech-stack:
  added: []
  patterns: [config-owned safety cap, fail-open pure filtering, gateway-marked retry-idempotent prompt injection]
key-files:
  created:
    - open-sse/config/mcpConstants.js
    - open-sse/mcp/inboundSelection.js
    - open-sse/mcp/skillPromptInjector.js
    - tests/unit/mcp-inbound-selection.test.js
    - tests/unit/mcp-skill-prompt-injector.test.js
  modified: []
key-decisions:
  - "x-mcp-servers only narrows enabled configured servers; it cannot enable unknown or disabled servers."
  - "Gateway skill blocks use an exact marker plus XML wrapper for retry idempotency without treating client XML as gateway-owned."
  - "All MCP safety constants, including MAX_INJECTED_TOOLS = 30, live in open-sse/config/mcpConstants.js."
patterns-established:
  - "Selection returns raw cache candidates and selected skill records without repository access or request mutation."
  - "Prompt injectors return original request identity on empty, malformed, unsupported, or already gateway-injected inputs."
requirements-completed: [MCP-INJECT-04]
duration: 10 min
completed: 2026-08-21
---

# Phase 3 Plan 02: Skill Prompt Injection and Dynamic Filtering Summary

**Pure MCP candidate filtering now limits enabled server tools and injects one retry-safe XML skill prompt across OpenAI, Claude, Gemini, and Responses bodies.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-21T18:18:37Z
- **Completed:** 2026-08-21T18:29:04Z
- **Tasks:** 3/3
- **Files modified:** 5

## Accomplishments

- Added config-owned `MAX_INJECTED_TOOLS = 30`, deterministic activation-mode selection, lexical matching, and fail-open diagnostics.
- Restricted `x-mcp-servers` to enabled, configured server IDs; malformed or unknown entries cannot add injection targets.
- Added XML-safe skill-name rendering and copy-on-write system prompt placement for four inbound formats with exact gateway-marker retry deduplication.

## Task Commits

1. **Task 1: Write failing selection and header-filter contract tests** — `8ef13bf9` (test)
2. **Task 2: Centralize tool cap and implement pure selection** — `f6806185` (feat)
3. **Task 3: Write and implement XML skill prompt copy-on-write behavior** — `b4ae2967` (test), `5abfa4a3` (feat), `a49adaaf` (fix)

## Files Created/Modified

- `open-sse/config/mcpConstants.js` — MCP safety cap and gateway skill prompt constants.
- `open-sse/mcp/inboundSelection.js` — format-aware user-text extraction, activation matching, cache joining, cap enforcement, and restrictive header parsing.
- `open-sse/mcp/skillPromptInjector.js` — XML rendering and format-specific copy-on-write system instruction injection.
- `tests/unit/mcp-inbound-selection.test.js` — activation modes, lexical matching, header abuse, cap, and fail-open contracts.
- `tests/unit/mcp-skill-prompt-injector.test.js` — XML escaping, four-format placement, immutability, and retry-idempotency contracts.

## Decisions Made

- `x-mcp-servers` is an allow-list intersection only. No client header can activate a disabled or unknown server.
- XML prompt text stays literal; only untrusted XML attribute values are escaped.
- Gateway-owned marker detection requires exact marker-plus-XML wrapper content, preserving arbitrary client `<skills>` instructions.

## TDD Gate Compliance

PASSED — RED commits `8ef13bf9` and `b4ae2967` precede GREEN commits `f6806185` and `5abfa4a3`.

## Verification

- PASS: `npm --prefix tests test -- unit/mcp-inbound-selection.test.js` — 7 selection contracts.
- PASS: `npm --prefix tests test -- unit/mcp-inbound-selection.test.js unit/mcp-skill-prompt-injector.test.js` — 15 Plan 03-02 contracts.
- PASS: `npm --prefix tests test -- unit/mcp-format-injector.test.js unit/mcp-inbound-selection.test.js unit/mcp-skill-prompt-injector.test.js` — 31 relevant MCP contracts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected focused Vitest filter paths**
- **Found during:** Tasks 1 and 3
- **Issue:** `npm --prefix tests` runs Vitest from `tests/`, so planned `tests/unit/...` filters resolve to a nonexistent nested path.
- **Fix:** Used equivalent project-correct `unit/mcp-inbound-selection.test.js` and `unit/mcp-skill-prompt-injector.test.js` filters.
- **Files modified:** None.
- **Verification:** All 15 Plan 03-02 and 31 relevant MCP contracts passed.
- **Committed in:** No code change.

**2. [Rule 1 - Bug] Corrected incomplete SDK state mutation output**
- **Found during:** Executor state updates
- **Issue:** SDK commands advanced the plan counter but left the active plan, completed-plan checkbox, stopped-at fields, and frontmatter progress percentage stale or inconsistent.
- **Fix:** Corrected `.planning/STATE.md` to record Plan 03-02 completion and Plan 03-03 as next.
- **Files modified:** `.planning/STATE.md`
- **Verification:** State now reports 4/9 plans and 44% progress with Plan 03-03 active.
- **Committed in:** Plan metadata commit.

**3. [Rule 2 - Missing Critical] Moved inbound selection constants into config**
- **Found during:** Final AGENTS.md compliance review
- **Issue:** Activation-mode values, `x-mcp-servers`, and sanitized reason codes remained local selection-module constants, violating open-sse config-only constants policy.
- **Fix:** Exported them from `open-sse/config/mcpConstants.js` and imported them into selection logic.
- **Files modified:** `open-sse/config/mcpConstants.js`, `open-sse/mcp/inboundSelection.js`
- **Verification:** 15 focused selection/injector contracts passed.
- **Committed in:** `a49adaaf`

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing critical).
**Impact on plan:** No product scope change. Verification and executor state records now reflect actual execution.

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-03 can pass enabled repository cache records into `selectInboundMcp` and selected skills into `injectSkillsPrompt`.
- No Plan 03-03 files changed.

## Self-Check: PASSED

- Found all five planned source/test files and this summary.
- Found TDD task commits `8ef13bf9`, `f6806185`, `b4ae2967`, `5abfa4a3`, and compliance fix `a49adaaf`.

---
*Phase: 03-format-aware-inbound-injection*
*Completed: 2026-08-21*
