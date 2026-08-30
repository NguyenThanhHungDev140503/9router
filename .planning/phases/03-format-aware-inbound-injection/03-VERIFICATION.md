---
phase: 03-format-aware-inbound-injection
verified: 2026-08-22T01:37:07Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 3: Format-Aware Inbound Injection Verification Report

**Phase Goal:** Tự động chèn danh sách MCP Tools và nội dung Skill Prompt vào mọi Request Body gửi tới LLM.  
**Verified:** 2026-08-22T01:37:07Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | MCP cached for `filesystem` / `read_file` becomes `mcp__filesystem__read_file`. | ✓ VERIFIED | `namespaceToolName()` creates prefix at `open-sse/mcp/injector.js:41-45`; focused format suite passes namespace and collision tests. |
| 2 | OpenAI-compatible requests, including OpenAI-owned Antigravity, use OpenAI `tools[{type:"function",function}]`; Gemini alone uses `functionDeclarations`; Claude and Responses use native shapes. | ✓ VERIFIED | Registry maps `FORMATS.ANTIGRAVITY` to `OpenAiInjector` at `injector.js:8-15,126-133`; only `FORMATS.GEMINI` selects `GeminiInjector` at lines 127-128. Four native shape tests and Antigravity alias test pass. |
| 3 | Malformed, verbose, or colliding cached MCP tools cannot replace client tools or make invalid payloads. | ✓ VERIFIED | Schema copy/minification at `injector.js:47-75`; client/generated collision rejection at lines 104-118; format suite passes malformed-schema, schema-minification, and client-collision tests. |
| 4 | Enabled `always` tools/skills inject; `disabled` entries do not; unmatched `auto` selects zero tools. | ✓ VERIFIED | Mode selection at `inboundSelection.js:70-93,117-121`; enabled-server and cap join at lines 136-153; focused selection suite passes all mode and zero-match tests. |
| 5 | `x-mcp-servers` only narrows enabled configured servers. | ✓ VERIFIED | Header parser and allow-list intersection at `inboundSelection.js:95-115,140-144`; focused suite passes known/enabled-only restriction test. |
| 6 | Config owns strict maximum injected-tool cap of 30. | ✓ VERIFIED | Sole cap export `open-sse/config/mcpConstants.js:1`; consumer import and enforcement at `inboundSelection.js:1-6,147`; cap test passes. |
| 7 | Selected skills become one XML system prompt without changing client-owned content; retry/re-entry stays idempotent. | ✓ VERIFIED | Copy-on-write per format and exact marker dedupe at `skillPromptInjector.js:24-34,50-122`; focused skill and integration suites pass retention and retry tests. |
| 8 | Injection runs after source-format detection and bypass decision, before translation; no enabled/matching data retains original body. | ✓ VERIFIED | `chatCore.js:74-85` detects format, checks bypass, then awaits pipeline; first `translateRequest` use is line 193. Pipeline returns original body for empty selection at `inboundInjectionPipeline.js:52-63`. Integration tests pass ordering and no-op cases. |
| 9 | Injection fails open and Phase 4 MCP execution remains untouched. | ✓ VERIFIED | Pipeline catches repository and composition errors, logs reason/counts only, returns original body at `inboundInjectionPipeline.js:41-50,77-80`; no `McpProcessManager`, `callServerTool`, `McpClient`, or `callTool` occurrence in `chatCore.js` or `open-sse/mcp/`. |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `open-sse/mcp/injector.js` and `injectors/*.js` | Namespacing, schema conversion, format strategies | ✓ VERIFIED | 6 substantive strategy files; artifact check 7/7 passed; pipeline imports and calls registry. |
| `open-sse/config/mcpConstants.js` | Config-owned safety values | ✓ VERIFIED | Exports `MAX_INJECTED_TOOLS = 30`; selection imports value. |
| `open-sse/mcp/inboundSelection.js` | Enabled/config-only selection and restrictive header filter | ✓ VERIFIED | Artifact check 5/5 passed; pipeline feeds repository data into selector. |
| `open-sse/mcp/skillPromptInjector.js` | XML skill prompt copy-on-write injection | ✓ VERIFIED | Native OpenAI, Claude, Gemini, Responses branches; pipeline calls after tool conversion. |
| `open-sse/mcp/inboundInjectionPipeline.js` | Repository-backed fail-open composition boundary | ✓ VERIFIED | Reads only `getEnabledMcpServers`, `getAllMcpToolsCache`, `getEnabledSkills`; no execution API imports. |
| `open-sse/handlers/chatCore.js` | Pre-translation pipeline invocation | ✓ VERIFIED | One import and one invocation at lines 32 and 80-85. |
| Phase 3 unit tests | Behavioral contracts | ✓ VERIFIED | 4 files, 41 tests passed. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `injector.js` | format injectors | Registry | ✓ WIRED | `createFormatInjector()` returns Claude, Gemini, Responses, or OpenAI injector. |
| `inboundSelection.js` | `mcpConstants.js` | Imported cap | ✓ WIRED | `MAX_INJECTED_TOOLS` imported across multiline import, enforced at line 147. Automated regex false-negative only. |
| `inboundInjectionPipeline.js` | MCP/skill repositories | Read-only imports | ✓ WIRED | `Promise.all()` uses three allowed repository reads at lines 42-46. |
| `inboundInjectionPipeline.js` | injector and skill prompt helpers | Composition calls | ✓ WIRED | Tool injection precedes skill prompt injection at lines 65-74. |
| `chatCore.js` | inbound pipeline | Pre-translation await | ✓ WIRED | Source detection line 74; pipeline lines 80-85; translation line 193. Automated one-line regex false-negative only. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `inboundInjectionPipeline.js` | `servers`, `toolCache`, `skills` | Repository calls | `mcpRepo` queries enabled rows/cache; `skillsRepo` queries enabled rows | ✓ FLOWING |
| `chatCore.js` | `body` | `applyInboundInjection()` return | Selected schemas/prompts flow into `translateRequest()` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Format conversion, aliases, selection, cap, header restriction, prompt injection, retry, fail-open, ChatCore ordering | `npm --prefix tests test -- unit/mcp-format-injector.test.js unit/mcp-inbound-selection.test.js unit/mcp-skill-prompt-injector.test.js unit/mcp-chat-core-injection.test.js` | 4 files; 41 tests passed | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED. No Phase 3 declared probe and no `scripts/*/tests/probe-*.sh` file found.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| MCP-INJECT-01 | 03-01, 03-03 | Namespaced OpenAI MCP tools | ✓ SATISFIED | `namespaceToolName`, OpenAI injector, full pipeline test. |
| MCP-INJECT-02 | 03-01, 03-03 | Claude `input_schema` tools | ✓ SATISFIED | `ClaudeInjector` and native pipeline test. |
| MCP-INJECT-03 | 03-01, 03-03 | Gemini schema conversion | ✓ SATISFIED | `GeminiInjector` produces `functionDeclarations`; Antigravity follows locked OpenAI-compatible alias decision. |
| MCP-INJECT-04 | 03-02, 03-03 | Activated skill prompt injection | ✓ SATISFIED | Selection, XML injection, native format integration tests. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | — | No `TBD`, `FIXME`, `XXX`, placeholder, empty implementation, or execution-call pattern in Phase 3 implementation files | — | None |

### Full-Suite Baseline Failures

`npm --prefix tests test` exited 1: 27 failed files, 91 failed tests, 1839 passed, 14 skipped. Failures are outside Phase 3 files: missing `is-inside-container`/`sql.js`/`better-sqlite3`, tests resolving nonexistent `tests/src/...` paths, DB concurrency, OAuth, Cursor protobuf exports, translator expectations, provider endpoint expectations, and snapshots. All Phase 3 test files passed in focused execution. No Phase 3 implementation file appears in full-suite failure output.

### Human Verification Required

None. Phase behavior is covered by hermetic unit/integration tests; no visual, external-service, or real-time condition remains unverified.

---

_Verified: 2026-08-22T01:37:07Z_  
_Verifier: the agent (gsd-verifier)_
