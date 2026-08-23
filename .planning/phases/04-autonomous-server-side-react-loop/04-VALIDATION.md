# Phase 4: Autonomous Server-Side ReAct Loop - Validation Strategy

**Created:** 2026-08-23
**Phase:** 04-autonomous-server-side-react-loop
**Status:** Active

---

## 1. Overview & Objectives

This validation strategy defines the automated test suite, verification checkpoints, and quality gates for Phase 4: Autonomous Server-Side ReAct Loop.

Primary objectives:
1. Validate tool call interception and partitioning (`mcp__*` vs client-native tools).
2. Validate format-aware context injection across OpenAI, Claude, Gemini, and Responses API formats.
3. Validate loop execution lifecycle, `MAX_ITERATIONS` capping (10), and soft landing on tool errors.
4. Validate cumulative token usage aggregation across multi-turn ReAct loops.
5. Validate seamless integration with `open-sse/handlers/chatCore.js` for both streaming and non-streaming modes.

---

## 2. Automated Test Matrix

All tests run in the `tests/unit/` suite via Vitest.

| Test File | Test Suite | Target Areas | Pass Criteria |
|-----------|------------|--------------|---------------|
| `tests/unit/mcp-tool-partition.test.js` | Tool Partitioning & Parser | `open-sse/mcp/toolPartition.js` | Accurately separates `mcp__*` tools from client native tools; parses namespaced IDs |
| `tests/unit/mcp-context-injector.test.js` | Format Context Injection | `open-sse/mcp/contextInjector.js` | Formats assistant turns and tool results for OpenAI, Claude, Gemini, Responses formats |
| `tests/unit/mcp-tool-loop.test.js` | ReAct Loop Engine | `open-sse/mcp/toolLoop.js` | Multi-turn loop execution, tool error soft landing, max iterations limit, token accumulation |
| `tests/unit/mcp-chat-core-integration.test.js` | ChatCore ReAct Integration | `open-sse/handlers/chatCore.js` | Non-streaming and streaming silent buffering with final turn delivery |

---

## 3. Core Test Scenarios

### Scenario 1: Pure MCP Tool Turn
- **Input:** LLM returns 1+ `mcp__*` tool call.
- **Action:** Gateway executes tool on `McpProcessManager`, injects `tool_result` into request body in `sourceFormat`, and calls LLM again.
- **Assertion:** Loop executes turn 2; final response contains synthesis.

### Scenario 2: Pure Client-Native Tool Turn
- **Input:** LLM returns tool calls like `read_file`, `edit_file` (no `mcp__*` prefix).
- **Action:** Loop terminates immediately.
- **Assertion:** Client-native tool calls yielded directly to client.

### Scenario 3: Mixed Tool Turn
- **Input:** LLM returns both `mcp__*` and client-native tools.
- **Action:** Gateway executes `mcp__*` tools first, feeds context back to LLM.
- **Assertion:** Gateway tools resolved; remaining client tools returned to client.

### Scenario 4: Tool Execution Failure / Timeout
- **Input:** MCP tool fails (server dead / timeout).
- **Action:** Error is wrapped in `tool_result` (`isError: true` or error text) and fed back to LLM.
- **Assertion:** No unhandled rejection; LLM explains failure naturally.

### Scenario 5: Iteration Cap (`MAX_ITERATIONS = 10`)
- **Input:** Mock LLM that continuously loops calling `mcp__*` tools.
- **Action:** Gateway halts after turn 10.
- **Assertion:** Loop exits gracefully without infinite recursion; returns last available response or error explanation.

### Scenario 6: Cumulative Token Usage
- **Input:** 3-turn ReAct sequence with turn usages `[100, 20]`, `[150, 30]`, `[200, 50]`.
- **Assertion:** Final response usage reports `prompt_tokens: 450`, `completion_tokens: 100`, `total_tokens: 550`.

---

## 4. Nyquist & Regression Gates

1. **Unit Test Pass:** `cd tests && npx vitest run unit/mcp-tool-*.test.js` exits 0.
2. **Regression Check:** `node tests/__baseline__/verify-no-regression.mjs` confirms no breaking changes to baseline translators or handlers.
3. **Lint Check:** `npx eslint .` passes without errors.
