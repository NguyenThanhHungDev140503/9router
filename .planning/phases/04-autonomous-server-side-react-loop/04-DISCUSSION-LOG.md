# Phase 4: Autonomous Server-Side ReAct Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-23
**Phase:** 04-autonomous-server-side-react-loop
**Areas discussed:** Interception & Loop Location, Streaming Behavior, Tool Partitioning & Mixed Calls, Context Feeding & Format Translation, Error Handling & Limits, Usage & Token Aggregation

---

## Interception & Loop Location

| Option | Description | Selected |
|--------|-------------|----------|
| chatCore orchestrator | Đặt tại open-sse/mcp/toolLoop.js và điều phối từ open-sse/handlers/chatCore.js | ✓ |
| chat.js app-level loop | Đặt tại src/sse/handlers/chat.js | |
| External ReAct Runner | Tách riêng module ReAct runner độc lập bọc ngoài handleChatCore | |

**User's choice:** chatCore orchestrator
**Notes:** Keeps ReAct loop provider-agnostic, runtime-independent, and shared across SSE / Worker environments.

---

## Streaming Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Silent Buffering | Buffer intermediate turns, only stream final turn/tool response to client | ✓ |
| Synthetic Stream Events | Stream simulated tool call/result events to client in real-time | |
| Continuous Mixed Stream | Stream text of intermediate turns and continue stream across turns | |

**User's choice:** Silent Buffering
**Notes:** Client receives clean final response stream without intermediate protocol noise.

---

## Tool Partitioning & Mixed Calls

| Option | Description | Selected |
|--------|-------------|----------|
| Execute MCP First | Execute gateway MCP tools first, feed results to LLM, emit client-native tools when done | ✓ |
| Delegate All to Client | Pass all tools back to client without executing | |
| Partial Immediate Flush | Execute MCP in parallel and emit partial response | |

**User's choice:** Execute MCP First
**Notes:** Gateway resolves its own tools before delegating remaining client tools.

---

## Context Feeding & Format Translation

| Option | Description | Selected |
|--------|-------------|----------|
| Native SourceFormat Injection | Format assistant tool calls and tool_result according to active request sourceFormat | ✓ |
| Canonical OpenAI Intermediate | Normalize all message history to OpenAI Chat format internally | |

**User's choice:** Native SourceFormat Injection
**Notes:** Minimizes double-translation artifacts and stays true to the client's native message structure.

---

## Error Handling & Limits

| Option | Description | Selected |
|--------|-------------|----------|
| Soft Land via LLM | Feed error as tool_result to LLM for final natural language explanation | ✓ |
| Hard Abort on Error/Cap | Abort immediately with HTTP 500 error | |
| Strip Tools & Force Text | Strip tools and force text-only completion | |

**User's choice:** Soft Land via LLM
**Notes:** User gets helpful contextual explanation rather than an abrupt HTTP error.

---

## Usage & Token Aggregation

| Option | Description | Selected |
|--------|-------------|----------|
| Cumulative Total Usage | Accumulate prompt_tokens and completion_tokens across all intermediate turns | ✓ |
| Final Turn Usage Only | Only record tokens from the final turn | |
| Per-Turn Granular Logging | Log each turn as separate usage records | |

**User's choice:** Cumulative Total Usage
**Notes:** Accurate billing and telemetry reflecting full resource consumption.

---

## the agent's Discretion

Internal helper structure in `open-sse/mcp/toolLoop.js`, error code formatting, and buffer management helpers.

## Deferred Ideas

None — discussion stayed within Phase 4 scope.
