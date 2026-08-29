# 9Router MCP Cross-Provider Tool Execution and Skill Injection Design

**Date:** 2026-08-29
**Status:** Approved for planning

## Problem

Cognee MCP server is enabled, remote Streamable HTTP endpoint works, and tool cache is populated. 9Router can inject tool definitions and upstream model can return a call such as:

```text
mcp__fc08c97e-a72c-41b4-b85d-f568ad37f432__recall
```

But Router may parse raw upstream response using client `sourceFormat`, not actual upstream `targetFormat`/response shape. When client and upstream formats differ, tool calls are missed. `processManager.callServerTool()` never runs. No MCP Activity record exists.

Skills have separate behavior: selection injects instruction text into system prompt; skills do not themselves execute MCP tools. Full instruction injection can increase input tokens on every ReAct turn.

## Goals

1. Execute injected MCP tools across OpenAI, Anthropic/Claude, Gemini, and Responses API paths.
2. Preserve current client protocol compatibility.
3. Make explicit `@server` and `$skill` failures observable without breaking chat requests.
4. Control Skill token cost.
5. Avoid logging secrets, authorization headers, or raw sensitive tool arguments/results.

## Non-goals

- Enable private-network MCP access globally.
- Change Cognee remote endpoint configuration.
- Change MCP transport protocol behavior.
- Make Skills execute tools autonomously.
- Rewrite all provider adapters into a new common streaming subsystem.

## Current architecture

```text
Client sourceFormat
  -> inbound selection
  -> MCP/Skill injection
  -> upstream targetFormat
  -> raw upstream response
  -> tool loop extraction
  -> processManager.callServerTool
  -> next ReAct turn
  -> client response
```

MCP tool names use server UUID namespace:

```text
mcp__<serverId>__<toolName>
```

Example Cognee namespace:

```text
mcp__fc08c97e-a72c-41b4-b85d-f568ad37f432__recall
```

## Design

### 1. Canonical internal tool-call representation

Add format-agnostic normalization at tool-loop boundary. Raw provider response is detected by response shape and normalized into internal entries:

```js
{
  id: string,
  name: string,
  arguments: object,
  protocol: 'openai' | 'anthropic' | 'gemini' | 'responses',
  rawType: string
}
```

Adapters extract tool calls from:

- OpenAI Chat Completions `tool_calls`
- Anthropic content blocks `tool_use`
- Gemini `functionCall`
- Responses API `function_call` and `custom_tool_call`

Normalization must prefer actual response shape. `targetFormat` is fallback metadata, not sole parser choice. `sourceFormat` must not control raw upstream parsing.

`runToolLoop` consumes only canonical calls. Tool execution dispatch stays through:

```js
processManager.callServerTool(serverId, toolName, args)
```

Tool results are serialized back into correct target/upstream conversation representation before next turn. Existing final response translation back to client remains unchanged.

### 2. Explicit MCP selection behavior

Explicit MCP syntax stays:

```text
@cognee <request>
```

When explicit server match exists but cache has zero tools, retain fail-open chat behavior and emit structured warning. Do not silently make request indistinguishable from normal chat.

Warning reason values:

```text
server_not_found
server_disabled
server_no_cached_tools
server_tools_invalid
selection_budget_exceeded
```

No change to automatic selection semantics in this phase, except observability.

### 3. Skill selection and token budget

Skill behavior remains prompt injection only.

| Selection route | Injected content |
|---|---|
| Explicit `$skill-name` | Full skill instruction |
| Automatic skill match | Compact manifest: name, description, triggers, short instruction summary |
| `alwaysInject=true` | Full instruction, subject to global budget |

Rules:

- Never duplicate Skill body into conversation history.
- Keep injected system instruction stable across ReAct turns.
- Default total Skill budget: 2,000 tokens per request.
- Explicit `$skill` has highest priority.
- Auto-selected Skills downgrade to compact manifest or drop when budget exhausted.
- Emit `skill_budget_exceeded` structured event with counts only.

### 4. Structured observability

Add request-correlated, redacted events:

```text
mcp.selection
mcp.injection
mcp.tool_detection
mcp.tool_execution
skill.selection
skill.injection
```

Fields:

```text
requestId
serverId / skillId
selected count
reason
sourceFormat
targetFormat
detectedResponseShape
extractedToolCount
status
durationMs
errorCode
```

Forbidden log fields:

```text
Authorization headers
MCP credentials
raw full tool arguments
raw full tool results
full injected Skill content
```

Safe metadata may include tool name and top-level argument key names only.

### 5. Error behavior

| Condition | Chat behavior | Observability |
|---|---|---|
| No automatic selection | Existing fail-open | debug selection event |
| Explicit `@server`, no tools | Existing fail-open | warning with reason |
| Tool call parser misses/unknown shape | Finish existing response path | warning with shape/type metadata |
| Tool execution failure | Return tool error into model loop where protocol supports it | execution failure event |
| ReAct max turn limit | Stop loop using existing guard | warning with turn count |

## Alternatives considered

### A. Parse solely by `targetFormat`

Small patch. Fragile if provider/proxy returns unexpected shape, retry path differs, or adapter behavior changes.

### B. Format-agnostic parser at tool-loop boundary

Chosen. Small-medium scope. Handles cross-provider response shape mismatch while preserving adapter/client behavior.

### C. Full provider intermediate representation

Clean long-term architecture. Large risk to streaming, translation, and compatibility. Defer.

## Test plan

Unit tests:

1. Normalize OpenAI `tool_calls`.
2. Normalize Anthropic `tool_use`.
3. Normalize Gemini `functionCall`.
4. Normalize Responses `function_call`.
5. Normalize Responses `custom_tool_call`.
6. OpenAI client + Claude upstream executes MCP call.
7. OpenAI client + Gemini upstream executes MCP call.
8. Native format paths stay unchanged.
9. Unknown raw response emits safe event and does not crash chat.
10. Explicit `@cognee` with no cached tools emits warning.
11. `$skill` full injection respects budget priority.
12. Auto Skill compact manifest respects global budget.
13. ReAct turns do not duplicate full Skill content.
14. Redaction tests ensure credentials/raw arguments absent from logs.

Production verification:

1. Confirm Cognee server has cached tools.
2. Send cross-format request with `@cognee`.
3. Confirm `mcp.tool_detection.extractedToolCount > 0`.
4. Confirm `mcp.tool_execution` success and Cognee Activity entry.
5. Confirm final model response contains tool-informed answer, not unexecuted client tool call.
6. Test explicit `$skill` and automatic Skill route; inspect injected token accounting and event records.

## Security notes

Cognee uses public HTTPS endpoint. Do not set `MCP_ALLOW_LOCAL_NETWORK=true` for this incident.

A production API key appeared during earlier investigation. Rotate it after this work under separate explicit approval. Do not include it in code, tests, logs, docs, shell history, or commits.

## Rollout

1. Add normalizer and tests behind no feature flag; behavior activates only for already-injected `mcp__` tools.
2. Add structured events with redaction.
3. Test local unit suite.
4. Deploy through existing CI/CD flow.
5. Validate live Cognee call and logs.
6. Monitor parser-miss and explicit-selection warnings.
