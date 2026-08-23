# Phase 4: Autonomous Server-Side ReAct Loop - Research

**Date:** 2026-08-23
**Status:** Complete

---

## 1. Executive Summary

Phase 4 introduces the autonomous server-side ReAct tool loop to 9Router. When an upstream LLM emits tool calls prefixed with `mcp__<serverId>__<toolName>`, 9Router intercepts them server-side, executes the requested MCP tools via `McpProcessManager`, injects the resulting `tool_result` into the conversation history matching the client's native `sourceFormat`, and continues the multi-turn conversation with the LLM until no more gateway MCP tool calls remain or `MAX_ITERATIONS` (10) is reached.

Key Architectural Decisions:
- **Core Orchestrator (`open-sse/mcp/toolLoop.js`)**: Decoupled from Next.js server glue; driven from `open-sse/handlers/chatCore.js`.
- **Silent Buffering on Streaming**: Intermediate turns execute non-streaming or buffered SSE to capture `mcp__*` tool calls; only the final turn stream (or final client-native tool calls) is piped directly to the client.
- **Strict Prefix Tool Partitioning**: `mcp__*` -> Server-side Gateway MCP tools. All others -> Client-native tools (e.g. `read_file`, `edit_file`, `bash`).
- **Execute MCP First in Mixed Calls**: If LLM returns both `mcp__*` and client tools, execute MCP tools on gateway, update context, and let LLM synthesize the next step before yielding client tools.
- **Native `sourceFormat` Context Injection**: History updates match client source format directly (OpenAI: role `assistant` tool_calls + role `tool`; Claude: assistant `tool_use` + user `tool_result`; Gemini: model `functionCall` + user `functionResponse`; Responses API: `function_call` + `function_call_output`).
- **Soft Land on Errors & Cap**: Errors/timeouts or reaching iteration 10 format error results as `tool_result` and allow LLM one final turn for graceful natural explanation.
- **Cumulative Usage Accounting**: Aggregates `prompt_tokens` and `completion_tokens` across all intermediate turns into the final response and telemetry logging.

---

## 2. Component Analysis & Existing Architecture

### 2.1 Request & Response Flow in `chatCore.js`
- `handleChatCore` parses format, injects tools/skills via `applyInboundInjection(body, sourceFormat)`, translates body via `translateRequest`, executes with `executor.execute()`, and handles response via `handleNonStreamingResponse`, `handleStreamingResponse`, or `handleForcedSSEToJson`.
- For ReAct orchestration:
  1. If injected tools are active or `mcp__*` tools exist in request, `chatCore` can delegate execution to `runToolLoop` in `open-sse/mcp/toolLoop.js`.
  2. `runToolLoop` loops calling the upstream executor turn-by-turn.
  3. During intermediate turns, responses are collected and inspected for `mcp__*` tool calls.
  4. If `mcp__*` tool calls exist:
     - Execute each MCP tool call via `getProcessManager().callServerTool(serverId, toolName, args)`.
     - Convert results into format-native messages (`injectToolResultsToSourceBody`).
     - Accumulate token usage.
     - Repeat turn.
  5. If no `mcp__*` tool calls exist (or max iterations reached):
     - Return final response (streaming or non-streaming) directly to client.

### 2.2 MCP Process Manager (`src/lib/mcp/processManager.js`)
- `getProcessManager()` singleton manages server sessions.
- `callServerTool(serverId, toolName, args, meta)`:
  - Takes `serverId`, `toolName`, `args`.
  - Checks session status (`running`). If not running, throws `McpError("Server is not running: " + serverId, "MCP_SERVER_NOT_RUNNING")`.
  - Calls `client.callTool(toolName, args, meta)` over JSON-RPC 2.0.
  - Returns MCP result object: `{ content: [{ type: "text", text: "..." }], isError: boolean }`.
- In `toolLoop.js`, namespaced tool name `mcp__<serverId>__<toolName>` is parsed using `parseNamespacedToolName(name)`:
  - Split or regex on `__`: `const parts = name.split("__"); const serverId = parts[1]; const toolName = parts.slice(2).join("__");`

### 2.3 Format-Aware Tool Result Shapes

#### 1. OpenAI Chat Completions (`openai`, `antigravity`, `ollama`, etc.)
- **Assistant turn**:
  ```json
  {
    "role": "assistant",
    "content": null,
    "tool_calls": [
      {
        "id": "call_123",
        "type": "function",
        "function": { "name": "mcp__filesystem__read_file", "arguments": "{\"path\":\"/foo\"}" }
      }
    ]
  }
  ```
- **Tool Result turn**:
  ```json
  {
    "role": "tool",
    "tool_call_id": "call_123",
    "content": "file contents..."
  }
  ```

#### 2. Claude (`claude`)
- **Assistant turn**:
  ```json
  {
    "role": "assistant",
    "content": [
      { "type": "tool_use", "id": "toolu_123", "name": "mcp__filesystem__read_file", "input": { "path": "/foo" } }
    ]
  }
  ```
- **Tool Result turn**:
  ```json
  {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_123",
        "content": "file contents..."
      }
    ]
  }
  ```

#### 3. Gemini / Vertex (`gemini`, `gemini-cli`, `vertex`)
- **Assistant turn (role: "model")**:
  ```json
  {
    "role": "model",
    "parts": [
      {
        "functionCall": {
          "name": "mcp__filesystem__read_file",
          "args": { "path": "/foo" }
        }
      }
    ]
  }
  ```
- **Tool Result turn (role: "user")**:
  ```json
  {
    "role": "user",
    "parts": [
      {
        "functionResponse": {
          "name": "mcp__filesystem__read_file",
          "response": { "result": "file contents..." }
        }
      }
    ]
  }
  ```

#### 4. OpenAI Responses API (`openai-responses`, `openai-response`)
- **Input turn items**:
  ```json
  {
    "type": "function_call",
    "call_id": "call_123",
    "name": "mcp__filesystem__read_file",
    "arguments": "{\"path\":\"/foo\"}"
  }
  ```
- **Output result item**:
  ```json
  {
    "type": "function_call_output",
    "call_id": "call_123",
    "output": "file contents..."
  }
  ```

---

## 3. Detailed Requirements Breakdown

- **MCP-REACT-01 (Detection & Interception)**:
  - Must inspect response from LLM (whether parsed JSON or collected SSE stream).
  - Extract tool calls and check `name.startsWith("mcp__")`.
  - Parse `serverId` and `toolName` reliably from `mcp__<serverId>__<toolName>`.

- **MCP-REACT-02 (Tool Partitioning & Native Separation)**:
  - If a turn contains ONLY client-native tools (no `mcp__*`), do not intercept; return directly to client.
  - If a turn contains ONLY `mcp__*` tools, execute on gateway and loop.
  - If a turn contains MIXED tools (`mcp__*` and client tools): Execute MCP tools first, inject results, send back to LLM for next turn (which will produce final text or client tools).

- **MCP-REACT-03 (Tool Execution & Context Feeding)**:
  - Call `McpProcessManager.callServerTool(serverId, toolName, args)`.
  - Handle MCP response: extract text/json from `content` blocks.
  - Handle errors (timeout, crash, unknown server, RPC error): format error string into `tool_result` with error flag/message.
  - Append assistant message and tool result message directly to `body.messages` / `body.contents` / `body.input` according to `sourceFormat`.

- **MCP-REACT-04 (Multi-Turn Loop & Limits)**:
  - `MAX_ITERATIONS = 10` constant.
  - Track `currentIteration`.
  - If `currentIteration >= MAX_ITERATIONS`: stop loop, invoke LLM one final time (disabling further MCP tools or instructing completion), or return graceful message.
  - Accumulate token usage (`prompt_tokens`, `completion_tokens`, `total_tokens`) across all turns.

- **MCP-REACT-05 (Seamless Pipeline Integration)**:
  - Integrates cleanly into `open-sse/handlers/chatCore.js`.
  - Works transparently for both `stream: true` (silent buffering during intermediate turns, live stream on final turn) and `stream: false` (JSON response with cumulative tokens).
  - Preserves token saver pipelines (RTK, Caveman, Ponytail, Headroom) on each turn.

---

## 4. Architecture & Implementation Plan

### 4.1 Module Structure
```
open-sse/
└── mcp/
    ├── toolLoop.js               # Main ReAct loop entry point (runToolLoop)
    ├── toolExtractor.js          # Extracts tool calls from responses across formats
    ├── toolResultFormatter.js    # Injects tool_results into source-format bodies
    ├── toolExecutor.js           # Wraps McpProcessManager tool execution with error traps
    └── usageAccumulator.js       # Tracks and sums token usage across turns
```

### 4.2 Helper Logic Details

1. **`toolExtractor.js`**:
   - `extractToolCallsFromResponse(responseBody, targetFormat)`: Extracts tool calls into unified structure: `[{ id, name, args, raw }]`.
   - `partitionToolCalls(toolCalls)`: Splits into `{ mcpCalls: [...], clientCalls: [...] }`. `mcpCalls`: `name.startsWith("mcp__")`. `clientCalls`: all others.

2. **`toolExecutor.js`**:
   - `executeMcpToolCall({ id, name, args })`: Parses `name` -> `mcp__{serverId}__{toolName}`. Calls `processManager.callServerTool(serverId, toolName, args)`. Returns `{ id, name, content, isError }`.
   - Catches errors and returns `{ id, name, content: `Error executing ${name}: ${err.message}`, isError: true }`.

3. **`toolResultFormatter.js`**:
   - `injectTurnToSourceBody({ body, sourceFormat, assistantToolCalls, toolResults })`: Creates assistant message with tool calls in `sourceFormat`. Creates tool response message(s) in `sourceFormat`. Returns cloned updated `body`.

4. **`toolLoop.js`**:
   - Orchestrates the iterative calling of LLM upstream -> extract tool calls -> partition -> execute MCP -> inject -> repeat until terminal condition -> return final response.

---

## 5. Validation Architecture

### 5.1 Test Strategy & Coverage
Create comprehensive unit and integration tests in `tests/unit/mcp-tool-loop.test.js`:
1. **Tool Call Partitioning & Namespacing**:
   - Test partitioning purely MCP tools, purely client-native tools, and mixed tools.
   - Verify parsing of serverId and toolName with various name structures.
2. **Format-Native Context Injection**:
   - Test OpenAI format: assistant `tool_calls` + tool `role: "tool"`.
   - Test Claude format: assistant `tool_use` + user `tool_result`.
   - Test Gemini format: model `functionCall` + user `functionResponse`.
   - Test Responses API format: `function_call` + `function_call_output`.
3. **Execution & Error Handling (Soft Landing)**:
   - Successful tool execution feeds output back.
   - Failed tool execution (server down, timeout) returns error string in `tool_result` without throwing unhandled exceptions.
4. **Loop Boundary & `MAX_ITERATIONS`**:
   - Completes after 1 turn when no MCP tools called.
   - Loops for multiple turns (e.g. 3 turns) when MCP tools called sequentially.
   - Enforces limit when LLM calls MCP tools infinitely, capping at 10 iterations.
5. **Token Usage Aggregation**:
   - Cumulative tokens across multiple turns sum up properly in final result.
6. **Streaming & Non-Streaming Integration**:
   - Non-streaming returns full response with updated history and combined usage.
   - Streaming buffers intermediate turns silently and pipes the final answer SSE.

### 5.2 Nyquist Validation Rules
- All newly created files must be covered by vitest tests in `tests/unit/`.
- No regressions against existing test suite (`tests/__baseline__/verify-no-regression.mjs`).
- Pass all strict linting and export checks.

---

## 6. Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| **Streaming intermediate tool calls leak to client** | Use non-streaming / silent buffering for intermediate turns. Only pipe the final turn to client SSE stream. |
| **Double token counting or undercounting** | Implement dedicated `UsageAccumulator` that sums tokens per iteration and attaches total to final response and DB logger. |
| **Format corruption during multi-turn translation** | Inject turn history into `body` using client's native `sourceFormat`, so that `translateRequest` at each turn executes the standard translator logic. |
| **Infinite tool loop due to model repeating failed calls** | Strict `MAX_ITERATIONS = 10` cap with fallback to final explanation turn. |
| **Process Manager dependency failure** | Fail-safe try/catch in `toolExecutor.js` formatting MCP errors into standard `tool_result` messages. |
