# Phase 4: Autonomous Server-Side ReAct Loop - Context

**Gathered:** 2026-08-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the autonomous server-side ReAct tool loop in 9Router. When an upstream LLM emits tool calls prefixed with `mcp__*`, 9Router intercepts them server-side, executes the requested MCP tools via the Phase 2 `McpProcessManager`, formats the resulting `tool_result` into the request history matching the client's native `sourceFormat`, and continues the multi-turn conversation with the LLM until no more gateway MCP tool calls remain or `MAX_ITERATIONS` is reached.

</domain>

<decisions>
## Implementation Decisions

### Interception & Loop Location
- **D-01:** Place the ReAct loop orchestrator inside `open-sse/mcp/toolLoop.js` and drive it from `open-sse/handlers/chatCore.js`. Keeps the loop provider-agnostic, runtime-independent, and cleanly decoupled from Next.js server glue.
- **D-02:** Intermediate turns use **Silent Buffering**: when a client requests streaming (`stream: true`), intermediate ReAct execution turns (calling LLM, capturing `mcp__*` tool calls, running tools, injecting results) run buffered without emitting intermediate SSE chunks to the client. Only the final turn's stream (or client-native tool call stream) is piped directly to the client.

### Tool Partitioning & Mixed Calls
- **D-03:** Strict prefix rule: tool calls starting with `mcp__*` are recognized as Gateway MCP Tools; all other tool calls are Client Native Tools (e.g. `read_file`, `edit_file`, `bash`).
- **D-04:** In mixed turns where LLM emits both `mcp__*` tools and client native tools, **Execute MCP First**: execute all `mcp__*` tools on Gateway, inject results into history, and invoke the LLM for the next turn. Client native tools are only yielded back to the client once all server-side MCP tools in that sequence have completed.

### Context Feeding & Format Translation
- **D-05:** Tool result injection uses **Native SourceFormat Injection**: format intermediate `assistant` tool calls and `tool_result` messages directly matching the active request's `sourceFormat` (OpenAI: role `tool`, Claude: role `user` + type `tool_result`, Gemini: role `user` + `functionResponse`, Responses API: `item` blocks).
- **D-06:** Re-inject updated context messages into the next turn body, allowing the existing `applyInboundInjection` + `translateRequest` pipeline to seamlessly transform messages into upstream provider format.

### Error Handling, Limits & Telemetry
- **D-07:** Upper bound `MAX_ITERATIONS = 10`. When loop reaches `MAX_ITERATIONS` or when a tool encounters an error (timeout, process crash, JSON-RPC failure), apply **Soft Land via LLM**: format the error message into a standard `tool_result` and give the LLM one final turn to synthesize a graceful natural language explanation to the user.
- **D-08:** Token usage accounting uses **Cumulative Total Usage**: accumulate `prompt_tokens` and `completion_tokens` across all intermediate ReAct turns, and emit the combined aggregate usage in the final response and usage telemetry log (`saveRequestDetail` / `usageDb`).

### the agent's Discretion
- Internal helper modularization in `open-sse/mcp/toolLoop.js` (e.g., `executeMcpCalls`, `extractToolCalls`, `injectToolResults`).
- Exact payload shaping for intermediate non-streaming vs streaming upstream consumption.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and MCP Design
- `.planning/ROADMAP.md` — Phase 4 goal, requirements (MCP-REACT-01..05), and success criteria.
- `.planning/REQUIREMENTS.md` — MCP-REACT requirements matrix.
- `docs/SERVER_SIDE_MCP_SKILLS_EXPLAINER.md` — Autonomous ReAct loop flow and tool interception design.

### MCP Subsystem References
- `src/lib/mcp/processManager.js` — Process manager executing `executeToolCall(serverName, toolName, args)`.
- `open-sse/mcp/inboundInjectionPipeline.js` — Pre-request format-aware tool and skill injection pipeline.
- `open-sse/mcp/injector.js` — Namespacing conventions (`mcp__<server>__<tool>`).

### Core Handlers & Streaming Pipeline
- `open-sse/handlers/chatCore.js` — Main chat handler integrating the ReAct loop.
- `open-sse/handlers/chatCore/streamingHandler.js` — Streaming response pipeline.
- `open-sse/handlers/chatCore/nonStreamingHandler.js` — Non-streaming response pipeline.
- `src/sse/handlers/chat.js` — Application ingress and combo fallback loop.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/mcp/processManager.js`: Singleton instance providing `executeToolCall(serverName, toolName, args)` with built-in SSRF guards, timeout handling, and failure isolation.
- `open-sse/mcp/injector.js`: Contains namespacing helpers `parseNamespacedToolName(name)` (`mcp__{server}__{tool}`).
- `open-sse/translator/formats.js`: Format definitions (`FORMATS.OPENAI`, `FORMATS.CLAUDE`, `FORMATS.GEMINI`, `FORMATS.OPENAI_RESPONSES`).

### Established Patterns
- Fail-open and safe degradation for non-critical failures.
- Non-lossy, format-native message history appending.
- Request detail tracking via `saveRequestDetail` and `buildRequestDetail`.

### Integration Points
- `open-sse/handlers/chatCore.js`: Main entry point intercepting upstream LLM responses before piping to client.
- `open-sse/mcp/toolLoop.js`: New orchestration engine executing the ReAct turn loop.

</code_context>

<specifics>
## Specific Ideas

- Intercept `mcp__*` tool calls silently when streaming; client only sees final answer as a smooth stream.
- In mixed tool calls, execute MCP tools on server first, then let LLM continue turn to output client tools cleanly.
- Ensure token usage sums up all turns so dashboard usage logs reflect the true LLM token spend.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 4 scope.

</deferred>

---

*Phase: 04-autonomous-server-side-react-loop*
*Context gathered: 2026-08-23*
