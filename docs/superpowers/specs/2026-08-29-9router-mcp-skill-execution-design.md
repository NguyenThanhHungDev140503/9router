# 9Router MCP Cross-Provider Tool Execution and Skill Injection Design

**Date:** 2026-08-29  
**Status:** Revised after provider-scope research; ready for code planning

## Problem

Cognee MCP is enabled, remote Streamable HTTP works, and cache has tools. Router can inject tools; upstream can return `mcp__fc08c97e-a72c-41b4-b85d-f568ad37f432__recall`. But Router parses raw upstream response with client `sourceFormat`. Cross-format calls can be missed, so `processManager.callServerTool()` never runs and no activity exists.

Skill injects instruction text only. Full Skill bodies increase input tokens on each ReAct turn.

MCP/Skill also lack provider-equivalent shared/private authorization. Current pipeline loads all enabled rows globally; process manager can start arbitrary enabled server UUIDs.

## Goals

1. Execute injected MCP function tools across OpenAI, Claude, Gemini, and Responses API paths.
2. Preserve client protocol compatibility.
3. Add provider-style private/shared ownership for MCP and Skill.
4. Make explicit `@server` and `$skill` failures observable without breaking chat.
5. Control Skill token cost.
6. Redact credentials, raw arguments, and raw results from persistent activity data.

## Non-goals

- Enable private-network MCP access globally.
- Change Cognee endpoint or MCP transport behavior.
- Make Skills execute tools autonomously.
- Add workspace/group ACLs. Existing provider sharing is global through `isShared`.
- Rewrite every provider adapter into a new streaming IR.

## Required authorization model

Mirror `providerConnections`.

| Scope | Storage | Access |
|---|---|---|
| Private | owner `userId`, `isShared=0` | Owner only. |
| Shared | owner `userId`, `isShared=1` | Any user reads/injects/executes. Owner or admin edits/deletes. Only admin changes sharing. |

Rules:

- Add `isShared INTEGER NOT NULL DEFAULT 0` to `mcpServers` and `skills`.
- `userId=NULL` is legacy only. Never means shared/global.
- Replace table-global `UNIQUE(name)` with `UNIQUE(userId, name)`.
- Private same-name MCP/Skill overrides shared same-name entry for that user.
- Resolve principal from verified API key/JWT. Never trust external identity headers.
- Thread `userId` and `isAdmin` through injection, selection, and execution.
- Selection returns authorized `allowedServerIds`.
- Tool executor rejects an upstream `mcp__<serverId>__<toolName>` outside `allowedServerIds`.
- `McpProcessManager` authorizes owner/shared access before lazy startup. No arbitrary enabled UUID startup.
- Replace process-wide global index with user-scoped index/view. Private schemas/prompts never enter another user's index.
- MCP/Skill CRUD and `/api/mcp/test` require authenticated context plus owner/shared checks. Ephemeral MCP config stays admin-only or gets strict SSRF/command policy.

## Architecture

```text
Verified API-key/JWT principal
  -> private/shared authorized MCP + Skill view
  -> client sourceFormat
  -> selection and injection
  -> upstream targetFormat
  -> raw upstream response
  -> format-agnostic tool detection
  -> authorized processManager.callServerTool
  -> append source-format ReAct context
  -> translate next turn to targetFormat
  -> client response
```

MCP names remain:

```text
mcp__<serverId>__<toolName>
```

## Design

### 1. Canonical MCP tool calls

Normalize raw responses into:

```js
{
  id: string,
  name: string,
  args: object,
  protocol: 'openai' | 'anthropic' | 'gemini' | 'responses',
  rawType: string
}
```

Support:

- OpenAI `choices[].message.tool_calls`
- Claude `content[].tool_use`
- Gemini `candidates[].content.parts[].functionCall`
- Responses `output[].function_call`

Detection order:

1. Actual raw response shape.
2. Executor `providerResponseFormat`.
3. `targetFormat` fallback.
4. Never client `sourceFormat` for raw upstream parsing.

`runToolLoop` executes only canonical MCP function calls:

```js
processManager.callServerTool(serverId, toolName, args, {
  userId,
  isAdmin,
  allowedServerIds,
})
```

`custom_tool_call` remains client-native in this phase. Never map its `input` to MCP arguments automatically.

### 2. ReAct continuation

Append canonical assistant tool calls and results in **source/client format**. Existing translator converts each next turn into `targetFormat`.

Do not append target-format messages directly into client-owned request body.

Preserve call IDs across append/translation.

### 3. Selection behavior

Explicit syntax remains:

```text
@cognee <request>
$skill-name <request>
```

Selection retains parsed explicit tokens and emits distinct reasons:

```text
server_not_found
server_disabled
server_unauthorized
server_no_cached_tools
server_tools_invalid
skill_not_found
skill_disabled
skill_unauthorized
selection_budget_exceeded
```

No automatic match returns fail-open chat plus debug event. Explicit selection failure returns fail-open chat plus warning event.

### 4. Skill budget

| Route | Content |
|---|---|
| Explicit `$skill-name` | Full `systemPrompt` |
| Automatic match | Compact deterministic manifest: name, description, triggers, keywords |
| `matchRules.mode="always"` | Full prompt, subject to budget |

Rules:

- Full Skill body stays only in system/instructions. Never duplicate into message history.
- Global Skill budget: 2,000 tokens/request.
- Explicit Skill has highest priority.
- Auto Skills downgrade to compact form or drop when budget ends.
- One declared token-estimation utility powers runtime and tests.
- Full explicit Skill exceeding hard budget is skipped with warning; never silently truncate instruction text.

### 5. Redacted observability

Events:

```text
mcp.selection
mcp.injection
mcp.tool_detection
mcp.tool_execution
skill.selection
skill.injection
```

Safe fields:

```text
requestId
hashedUserId
serverId / skillId
toolName
selectedCount
reason
sourceFormat
targetFormat
providerResponseFormat
detectedResponseShape
extractedToolCount
status
durationMs
errorCode
argumentKeyNames
```

Forbidden:

```text
Authorization headers
MCP credentials
raw arguments
raw tool results
full Skill prompt
```

Replace existing raw `args`/`result` activity storage before expanding execution.

### 6. Error behavior

| Condition | Chat | Event |
|---|---|---|
| No auto match | Existing fail-open | debug selection |
| Explicit no tool/Skill | Existing fail-open | warning with reason |
| Parser unknown shape | Existing final path | warning metadata |
| Unauthorized MCP UUID | Do not execute | authorization failure |
| Tool failure | Tool error enters model loop | execution failure |
| ReAct cap | Existing soft landing | warning turn count |

## Alternatives

### A. Parse by target format only

Small patch. Fragile when upstream shape differs.

### B. Shape-first normalizer at tool loop

Chosen. Small-medium scope. Fixes cross-provider parsing without rewriting all adapters.

### C. Full provider intermediate representation

Cleaner long term. High streaming/compatibility risk. Defer.

## Test plan

1. Normalize OpenAI, Claude, Gemini, Responses `function_call`.
2. OpenAI client + Claude raw response executes MCP.
3. OpenAI client + Gemini raw response executes MCP.
4. Native paths unchanged.
5. Unknown shape does not crash chat and logs redacted event.
6. `custom_tool_call` with MCP-looking name does not execute server-side.
7. Call IDs survive append and translation.
8. Explicit missing, disabled, unauthorized, empty-cache server/Skill events differ.
9. Full/compact Skill budget tests use deterministic estimator.
10. ReAct turns do not duplicate full Skill body.
11. Raw credential/args/results absent from activity/events.
12. User A cannot inspect, edit, test, inject, or execute User B private MCP/Skill.
13. Shared MCP/Skill is visible/executable by User B but mutable only by owner/admin.
14. Private same-name row overrides shared row.
15. Upstream UUID outside `allowedServerIds` is rejected.
16. Streaming client buffers MCP intermediate turn then streams final answer.

## Production verification

1. Confirm Cognee cache exists.
2. Owner request `@cognee` cross-format.
3. Confirm extracted count, execution event, redacted activity, final tool-informed answer.
4. Confirm unrelated user cannot see/call private Cognee.
5. Confirm shared Cognee works for non-owner and remains immutable to non-owner.
6. Test `$skill` explicit full and auto compact token accounting.

## Security notes

Cognee uses public HTTPS. Do not set `MCP_ALLOW_LOCAL_NETWORK=true` for this incident.

Rotate previously exposed production API key under separate explicit approval. Never put it in code, docs, logs, shell history, or commits.

## Rollout

1. Fix principal derivation and MCP/Skill management-route authorization.
2. Add shared/private migration, owner-scoped repos, and name-constraint migration.
3. Add user-scoped selection/index plus execution allowlist.
4. Add shape-first normalizer and format matrix tests.
5. Add redacted events/activity migration.
6. Run unit suite.
7. Deploy through existing CI/CD flow.
8. Verify owner/shared/unrelated Cognee paths live.
9. Monitor parser miss, authorization, and explicit selection warnings.
