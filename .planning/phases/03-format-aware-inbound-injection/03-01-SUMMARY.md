---
phase: 03-format-aware-inbound-injection
plan: 01
subsystem: mcp-injection
tags: [mcp, json-schema, openai, claude, gemini, responses-api, vitest]
requires:
  - phase: 01-database-repositories
    provides: MCP tool cache rows with serverId and canonical inputSchema tools
provides:
  - Canonical MCP tool namespacing, schema minification, and collision-safe copy-on-write merging
  - Native OpenAI-compatible, Claude, Gemini, and Responses API injector strategies
affects: [03-02-skill-injection, 03-03-chatcore-integration, 04-react-tool-loop]
tech-stack:
  added: []
  patterns: [format-strategy registry, immutable request injection, cached-schema sanitization]
key-files:
  created:
    - open-sse/mcp/injector.js
    - open-sse/mcp/injectors/baseFormatInjector.js
    - open-sse/mcp/injectors/openAiInjector.js
    - open-sse/mcp/injectors/claudeInjector.js
    - open-sse/mcp/injectors/geminiInjector.js
    - open-sse/mcp/injectors/responsesInjector.js
    - tests/unit/mcp-format-injector.test.js
  modified: []
key-decisions:
  - "Antigravity routes through OpenAiInjector; only Gemini emits functionDeclarations."
  - "Client tools remain structurally shared and MCP candidates append only after namespace collision checks."
  - "Cached schemas are copied and minified before provider conversion; malformed schemas use a safe empty object schema."
patterns-established:
  - "New request formats add one BaseFormatInjector subclass and registry entry instead of caller branches."
  - "MCP cache data is untrusted input: sanitize names, remove annotation metadata, never mutate or log raw schema text."
requirements-completed: [MCP-INJECT-01, MCP-INJECT-02, MCP-INJECT-03]
duration: 15 min
completed: 2026-08-21
---

# Phase 3 Plan 01: MCP Tool Schema Conversion and Namespacing Summary

**Canonical cached MCP tools now convert into collision-safe OpenAI-compatible, Claude, Gemini, and Responses API schemas without mutating client requests.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-21T18:00:00Z
- **Completed:** 2026-08-21T18:15:00Z
- **Tasks:** 3/3
- **Files modified:** 7

## Accomplishments

- Added deterministic `mcp__{server}__{tool}` names with empty/duplicate/client collision rejection.
- Added immutable format strategies for OpenAI-compatible aliases, Claude, Gemini, and Responses API.
- Added 16 Vitest contracts for native shapes, schema minification, malformed cache input, and retry safety.

## Task Commits

1. **Task 1: Write failing format-conversion contract tests** — `123c0fed` (test)
2. **Task 2: Implement BaseFormatInjector registry and copy-on-write conversions** — `66b0daf1` (feat)
3. **Task 3: Prove schema-safety edge cases and refactor only after green** — `fcffaf94` (test)

## Files Created/Modified

- `open-sse/mcp/injector.js` — canonical normalization, schema minification, collision checks, format registry.
- `open-sse/mcp/injectors/baseFormatInjector.js` — shared immutable conversion/merge contract.
- `open-sse/mcp/injectors/openAiInjector.js` — OpenAI Chat tool wrapper for OpenAI-compatible aliases.
- `open-sse/mcp/injectors/claudeInjector.js` — Claude `input_schema` tool shape.
- `open-sse/mcp/injectors/geminiInjector.js` — Gemini `functionDeclarations` tool shape.
- `open-sse/mcp/injectors/responsesInjector.js` — flat OpenAI Responses function-tool shape.
- `tests/unit/mcp-format-injector.test.js` — conversion and security contract coverage.

## Decisions Made

- Antigravity uses OpenAI-compatible function wrappers despite its separate request format identifier.
- Gemini alone receives `functionDeclarations`.
- Invalid cached schemas become `{ type: "object", properties: {} }`; invalid names and collisions are skipped.

## TDD Gate Compliance

PASSED — RED `test(03-01)` commit `123c0fed` precedes GREEN `feat(03-01)` commit `66b0daf1`.

## Verification

- PASS: `npm --prefix tests test -- unit/mcp-format-injector.test.js` — 1 file, 16 tests.
- PASS: `cd tests && npm test -- unit/mcp-*.test.js` — 7 files, 51 tests.
- Expected command-path defect: `npm --prefix tests test -- tests/unit/mcp-format-injector.test.js` resolves from `tests/` and finds no test file. Correct focused path uses `unit/mcp-format-injector.test.js`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected focused Vitest filter path**
- **Found during:** Task 1
- **Issue:** Planned `npm --prefix tests` command resolves test filters from `tests/`, so `tests/unit/mcp-format-injector.test.js` matched no files.
- **Fix:** Used equivalent correct focused command `npm --prefix tests test -- unit/mcp-format-injector.test.js`.
- **Files modified:** None.
- **Verification:** 16 focused tests passed; 51 relevant MCP tests passed.
- **Committed in:** No code change.

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** No product scope change. Verification used project-correct Vitest path.

## Issues Encountered

- Required `npx ctx7@latest library "OpenAI API" ...` lookup emitted no library ID (`clean — nothing to commit`), so no Context7 docs command could run without guessing an ID. Native fixture keys were verified against current project translator contracts.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `createFormatInjector` ready for 03-03 `chatCore` wiring.
- 03-02 can add selection and skill injection without duplicating format conversion.

## Self-Check: PASSED

- Found all seven planned source/test files.
- Found task commits `123c0fed`, `66b0daf1`, and `fcffaf94`.

---
*Phase: 03-format-aware-inbound-injection*
*Completed: 2026-08-21*
