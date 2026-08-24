# Design Specification: OpenAI Responses to Gemini/Antigravity Tool Translator

- **Target Systems:** OpenAI Responses API (`/v1/responses`), Gemini / Antigravity Gateway Provider
- **Scope:** Complete bidirectional tool translation (custom tools, MCP function declarations, multi-turn call_id preservation, error status propagation, hosted tool rejection).

---

## 1. Context & Motivation

Codex CLI calls `/v1/responses` with:
1. Standard OpenAI function definitions in `tools` (`type: "function"`, including harness-managed MCP declarations).
2. Freeform custom tools in `additional_tools` or `tools` with `type: "custom"`.
3. Multi-turn conversation containing `function_call` / `custom_tool_call` assistant items and `function_call_output` / `custom_tool_call_output` tool results.

Antigravity/Gemini backends require:
1. Strict function names: Regex `^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$` (max length 64).
2. Standardized `functionDeclarations`, `functionCall` parts, and `functionResponse` parts.
3. `functionResponse` requires an exact `id` matching `functionCall.id` and provider function name matching declared tool name.
4. Machine-readable error marker: `response: { result: ..., isError: true }`.

---

## 2. Core Components & Architecture

### 2.1. Request-Scoped ToolLedger
Location: `open-sse/translator/concerns/toolLedger.js`

Class `ToolLedger` provides a deterministic, collision-safe registry per request:
- Constant `MAX_GEMINI_FUNCTION_NAME_LENGTH = 64`.
- `registerTool(originalName, { isCustom = false, kind = "function", description, parameters })`:
  - Validates and sanitizes name matching regex `^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$`.
  - Collision resolution: If sanitized name matches an existing different `originalName` or exceeds 64 characters, iteratively searches with SHA-256 hash slice and numeric attempt suffix (`${prefix}_${suffix}`) until an unallocated slot is found, throwing if attempt reaches 999.
  - Stores two-way index: `originalToProvider` and `providerToOriginal`.
  - Records tool metadata (`isCustom`, `kind`, `description`, `parameters`).
- `getProviderName(originalName)`: Returns sanitized provider name, auto-registering `originalName` safely if not previously registered.
- `getOriginalName(providerName)`: Returns original name.
- `isCustom(nameOrProviderName)`: Checks if tool is custom.
- `registerCall({ callId, providerName, originalName, isError = false })`: Tracks call metadata.
- `getCall(callId)`: Retrieves call metadata.
- `generateFallbackCallId()`: Generates `call_${randomUUID().replace(/-/g, "")}` (strictly matching `^call_[a-f0-9]{32}$`).

### 2.2. Capability Policy & Hosted Tool Rejection
Location: `open-sse/translator/concerns/toolErrors.js`

- `UnsupportedHostedToolError(toolType)` with `status = 400`.
- Rejection Layer:
  - Native OpenAI Responses/Codex passthrough bypasses Chat translation and forwards original hosted tool descriptors unchanged.
  - When the request enters Chat translation, ingestion in `openai-responses.js` records hosted tools in `_hostedTools`; it does not silently convert or drop them.
  - Provider translation to Gemini/Antigravity (`openai-to-gemini.js`) checks `_hostedTools` and throws `UnsupportedHostedToolError` when targeting Gemini/Antigravity backend.
- `chatCore.js` catches `UnsupportedHostedToolError` during request translation and immediately returns `createErrorResult(400, err.message)`.

### 2.3. Request Translation Pipeline
1. `openaiResponsesToOpenAIRequest(model, body, stream, credentials)`:
   - Instantiates `const toolLedger = new ToolLedger()`.
   - Registers all tools in `toolLedger` (marking custom tools).
   - Preserves hosted tool descriptors in `result._hostedTools`; native Responses/Codex passthrough forwards original body before Chat conversion. Reads tools from both `tools` and top-level `additional_tools`.
   - Preserves tool result error flag `is_error: Boolean(item.is_error || item.status === "error")` on Chat `role: "tool"` messages.
   - Attaches `result._toolLedger = toolLedger`.
2. `openaiToGeminiBase` / `openaiToGeminiCLIRequest`:
   - Checks `body._hostedTools`: If non-empty, throws `UnsupportedHostedToolError(body._hostedTools[0].type)`.
   - Reads `body._toolLedger` (or creates fallback ledger).
   - Generates Gemini `functionDeclarations` using `toolLedger.getProviderName(tool.name)`.
   - Maps assistant tool calls to `functionCall` parts with sanitized names and calls `toolLedger.registerCall`.
   - Collects tool responses preserving error flag:
     ```javascript
     toolResponses[msg.tool_call_id] = {
       content: msg.content,
       isError: Boolean(msg.is_error || msg.status === "error")
     };
     ```
   - Maps tool outputs to `functionResponse` parts with matching `id` and `response: { result: parsedResp, ...(isError ? { isError: true } : {}) }`; JSON `null` remains `null`, not parse-failure text.
   - Re-attaches `result._toolLedger = body._toolLedger` on returned Gemini payload.

### 2.4. Response & SSE Stream Translation Pipeline
1. `geminiToOpenAIResponse(chunk, state)`:
   - Consumes `state.toolLedger`.
   - Emits tool call with `name = state.toolLedger ? state.toolLedger.getOriginalName(rawName) : rawName`.
   - Uses `functionCall.id || resolveFallbackCallId(state, providerCallIndex)`. `resolveFallbackCallId` caches IDs by stable provider call index when present; without a provider index, each complete Gemini `functionCall` part is treated as one atomic call. Format strictly matches `^call_[a-f0-9]{32}$`, including no-ledger paths; late provider IDs replace provisional indexed fallbacks before lifecycle events emit.
2. `openaiToOpenAIResponsesResponse(chunk, state)` & SSE event emitters:
   - Emits `{ event: "response.output_item.added", data: { item: { type: state.toolLedger?.isCustom(fnName) ? "custom_tool_call" : "function_call", ... } } }`.
   - Emits `response.function_call_arguments.delta` for function tools.
   - Emits `response.custom_tool_call_input.delta` / `response.custom_tool_call_input.done` for custom tools, with exact call IDs and original names.
3. Handler Plumbing:
   - `chatCore.js`: Extracts `const toolLedger = translatedBody?._toolLedger; if (translatedBody?._toolLedger) delete translatedBody._toolLedger;`.
   - Explicitly passes `toolLedger` into:
     - `handleStreamingResponse({ ..., toolLedger })`
     - `handleNonStreamingResponse({ ..., toolLedger })`
     - `handleForcedSSEToJson({ ..., toolLedger })`
   - State objects in all handlers carry `toolLedger` into translators and transformers.
   - Forced-SSE-to-JSON conversion preserves ledger names, custom classification, and fallback IDs.
   - `responsesTransformer.js` emits only `custom_tool_call_input.delta` / `.done` for custom tools, buffers split arguments, and handles late provider IDs.

---

## 3. Verification & Testing Contracts

1. **Unit Tests**:
   - `tests/unit/tool-ledger.test.js`: Name sanitization (preserves `_`, fixes non-alphanumeric, max length 64), bounded collision safety without overwrites, auto-registration on `getProviderName`, `call_<32 hex UUID>` regex, custom tool metadata.
   - `tests/unit/openai-responses-to-gemini-request.test.js`: Tool translation, multi-turn message & output translation with `is_error` and `status: "error"`, `_toolLedger` propagation on returned Gemini object, hosted tool rejection throwing `UnsupportedHostedToolError(400)` in Gemini adapter.
   - `tests/unit/gemini-to-openai-responses-stream.test.js`: Gemini chunks to OpenAI Responses SSE events (`event: "response.output_item.added"` with `custom_tool_call` vs `function_call`, `custom_tool_call_input` deltas/done, fallback IDs keyed by stable provider index), plus forced-SSE-to-JSON test.
2. **Regression Tests**:
   - `tests/translator/bugs-antigravity.test.js`
   - `tests/translator/bugs-codexCli-responses.test.js`
