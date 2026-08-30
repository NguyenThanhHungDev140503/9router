# 9Router Core Engine & Test Failure Investigation

This document analyzes the request/response routing pipeline and details the root causes and recommended fixes for 4 test suites with failing/unresolved tests:
1. `tests/translator/bugs-toClaude-context.test.js`
2. `tests/unit/combo-autoswitch.test.js`
3. `tests/unit/force-stream-config.test.js`
4. `tests/unit/image-fetch-hardening.test.js`

---

## 1. Pipeline Review: Core Architecture

The 9Router engine mediates between client API formats (OpenAI Chat Completions, Anthropic Claude Messages, Google Gemini/Gemini CLI, OpenAI Responses API, Antigravity, Kiro, Cursor, CommandCode, Ollama) and upstream LLM providers.

### 1.1 Request Lifecycle (`open-sse/handlers/chatCore.js`)
1. **Format Detection & Session Tagging**:
   - `detectFormat(body)` identifies the incoming payload structure (`openai`, `claude`, `gemini`, `openai-responses`, etc.).
   - `resolveSessionId` computes a stable session seed for request tagging.
2. **Provider & Transport Resolution**:
   - `PROVIDER_ID_TO_ALIAS` maps aliases.
   - `getModelTargetFormat`, `resolveTransport`, and `getModelSupportedFormats` resolve the exact upstream target format (`targetFormat`).
3. **Pre-translation Hooks & Token Optimization**:
   - RTK filters (`open-sse/rtk/`): In-place compression of `tool_result` blocks.
   - Headroom proxy (`open-sse/rtk/headroom.js`): External compression proxy.
   - Caveman / Ponytail: System-level prompt injections for concise responses.
   - Modality stripping (`open-sse/translator/concerns/modality.js`).
4. **Translation Layer (`open-sse/translator/index.js`)**:
   - `translateRequest(sourceFormat, targetFormat, model, body, ...)`
   - **Direct Route**: If a direct translator is registered (`${sourceFormat}:${targetFormat}`), it executes directly to avoid lossy intermediate conversions.
   - **Hub-and-Spoke (OpenAI Bridge)**: If no direct route exists, translates `sourceFormat → openai → targetFormat`.
   - Normalization hooks: Thinking extraction and application (`applyThinking`), cache control preservation, tool cloaking.
5. **Executor Invocation (`open-sse/executors/`)**:
   - `getExecutor(provider)` locates either a specialized executor (e.g., `AntigravityExecutor`, `KiroExecutor`, `CodexExecutor`, `CursorExecutor`, `GeminiCLIExecutor`) or falls back to `DefaultExecutor` (standard OpenAI-compatible upstream).
   - Handles network transport, authentication/token refresh (`refreshWithRetry`), binary EventStreams, or Protobuf RPCs.
6. **Response Processing (`chatCore/streamingHandler.js` & `chatCore/nonStreamingHandler.js`)**:
   - Streaming: SSE chunks are transformed back to `sourceFormat` via `translateResponse(targetFormat, sourceFormat, chunk, state)` inside a TransformStream.
   - Non-Streaming / Force SSE-to-JSON: Aggregates or converts JSON responses (`openAICompletionToClaudeMessage`, `openAICompletionToResponses`, etc.).

---

## 2. Analysis of Unresolved Tests & Root Causes

### 2.1 `tests/translator/bugs-toClaude-context.test.js`

#### Test Failure
- `OpenAI → Claude context mapping > assistant reasoning_content becomes a thinking block` (Line 20-34) fails with `AssertionError: reasoning_content lost: expected '{"model":"m",...}' to contain 'my hidden reasoning'`.

#### Root Cause
- In `open-sse/translator/request/openai-to-claude.js` around line 255 (`getContentBlocksFromMessage` for `msg.role === ROLE.ASSISTANT`):
  - When `msg.role === ROLE.ASSISTANT`, it inspects `msg.content` (if array, checks `OPENAI_BLOCK.TEXT`, `CLAUDE_BLOCK.TOOL_USE`, `CLAUDE_BLOCK.THINKING`; if string, adds text) and `msg.tool_calls`.
  - It **completely ignores** `msg.reasoning_content` (or `msg.reasoning`) present on assistant messages in OpenAI-compatible payloads (e.g. DeepSeek, Qwen, GLM).
  - As a result, previous turns' reasoning content is dropped when sending conversation history to Anthropic/Claude models, rather than being wrapped as `{ type: "thinking", thinking: msg.reasoning_content }`.

#### Recommended Fix
- In `open-sse/translator/request/openai-to-claude.js`:
  ```javascript
  if (msg.role === ROLE.ASSISTANT) {
    if (typeof msg.reasoning_content === "string" && msg.reasoning_content) {
      blocks.push({
        type: CLAUDE_BLOCK.THINKING,
        thinking: msg.reasoning_content
      });
    }
    // continue existing content & tool_calls processing
  }
  ```

---

### 2.2 `tests/unit/combo-autoswitch.test.js`

#### Test Failures
1. `detectRequiredCapabilities > web_search tool -> search`
   - Expects `r.has("search")` to be `true` when request contains tool `{ type: "web_search" }`.
   - Result: `false`.
2. `reorderByCapabilities > keeps order when no model matches`
   - Line 71: `expect(out).toBe(models)`.
   - Result: `toBe` (referential equality) fails because `reorderByCapabilities` constructs a new sorted array instead of returning the original array reference.

#### Root Causes
1. **Disabled Search Detection**:
   - In `open-sse/services/combo.js` (lines 181-183):
     ```javascript
     // search: temporarily disabled in auto-switch (feature not wired yet).
     return required;
     ```
   - The tool scan for `web_search` or `{ type: "web_search" }` was omitted/commented out from `detectRequiredCapabilities`.
2. **Referential Equality on No-Op Sort**:
   - In `open-sse/services/combo.js` `reorderByCapabilities(models, required)`:
     ```javascript
     return models
       .map((m, i) => ({ m, i, t: tierOf(m) }))
       .sort((a, b) => a.t - b.t || a.i - b.i)
       .map((x) => x.m);
     ```
   - Even when all models evaluate to the same tier (e.g., tier 2), it returns a newly allocated array `.map(...)`, breaking `expect(out).toBe(models)`. If no model matches required capabilities (all tier 2) or if order is unchanged, returning the original `models` reference is expected.

#### Recommended Fix
1. Enable `search` tool detection in `detectRequiredCapabilities`:
   ```javascript
   if (Array.isArray(body.tools)) {
     for (const tool of body.tools) {
       if (tool?.type === "web_search" || tool?.function?.name === "web_search") {
         required.add("search");
       }
     }
   }
   ```
2. In `reorderByCapabilities`, check if any model satisfies tier 0 or tier 1:
   ```javascript
   const items = models.map((m, i) => ({ m, i, t: tierOf(m) }));
   const hasMatch = items.some(item => item.t < 2);
   if (!hasMatch) return models;
   return items.sort((a, b) => a.t - b.t || a.i - b.i).map(x => x.m);
   ```

---

### 2.3 `tests/unit/force-stream-config.test.js`

#### Test Failures
- `keeps forced-stream providers streaming for JSON clients when body.stream is undefined`
- `keeps forced-stream providers streaming for JSON clients when body.stream is false`
- Error: `[vitest] No "formatHeadroomSizeLog" export is defined on the "../../open-sse/rtk/headroom.js" mock. Did you forget to return it from "vi.mock"?`

#### Root Cause
- In `open-sse/handlers/chatCore.js`, `formatHeadroomSizeLog` was imported from `../rtk/headroom.js`:
  ```javascript
  import { compressWithHeadroom, formatHeadroomLog, formatHeadroomSizeLog, isHeadroomPhantomSavings } from "../rtk/headroom.js";
  ```
- The test mock in `tests/unit/force-stream-config.test.js` (lines 71-74) only provided:
  ```javascript
  vi.mock("../../open-sse/rtk/headroom.js", () => ({
    compressWithHeadroom: vi.fn(async () => null),
    formatHeadroomLog: vi.fn(() => ""),
  }));
  ```
- Vitest throws during module import because `chatCore.js` imports `formatHeadroomSizeLog` and `isHeadroomPhantomSavings`, which were missing from the hoisted mock object.

#### Recommended Fix
- Update `tests/unit/force-stream-config.test.js` mock definition to include missing exports:
  ```javascript
  vi.mock("../../open-sse/rtk/headroom.js", () => ({
    compressWithHeadroom: vi.fn(async () => null),
    formatHeadroomLog: vi.fn(() => ""),
    formatHeadroomSizeLog: vi.fn(() => ""),
    isHeadroomPhantomSavings: vi.fn(() => false),
  }));
  ```

---

### 2.4 `tests/unit/image-fetch-hardening.test.js`

#### Test Failure
- `fetchImageAsBase64 hardening > accepts valid PNG from public host`
- `AssertionError: expected null not to be null` (Line 58).

#### Root Cause
- In `open-sse/translator/concerns/image.js` lines 92-98:
  ```javascript
  const dispatcher = new Agent({
    connect: { lookup: (_h, _o, cb) => cb(null, [{ address: pinnedIps[0].address, family: pinnedIps[0].family }]) },
  });
  const response = await fetch(imageUrl, { signal: fetchSignal, redirect: "manual", dispatcher });
  ```
- In Node.js / undici / vitest environment:
  - `globalThis.fetch` is mocked in the test (`mockFetchOnce`).
  - However, `undici.Agent` validation: `pinnedIps[0]` from the mocked `node:dns/promises.lookup` in the test returned `{ address: "93.184.216.34" }` (without `family: 4`).
  - Undici's custom connect lookup callback `cb(null, [{ address, family }])` fails or throws inside undici / fetch if `family` is undefined, or `dispatcher` is ignored by mock while the lookup callback throws, triggering the `catch` block which returns `null`.
  - In `image.js`, `resolvePinnedIps` calls `lookup(hostname, { all: true })`. `node:dns/promises` returns `{ address, family }`. The test mock returned `{ address: "93.184.216.34" }` missing `family: 4`.

#### Recommended Fix
1. In `open-sse/translator/concerns/image.js`: Guard default family if missing:
   ```javascript
   const family = pinnedIps[0].family || (pinnedIps[0].address.includes(":") ? 6 : 4);
   const dispatcher = new Agent({
     connect: { lookup: (_h, _o, cb) => cb(null, [{ address: pinnedIps[0].address, family }]) },
   });
   ```
2. In `tests/unit/image-fetch-hardening.test.js`: Update mock DNS default:
   ```javascript
   lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
   ```
   Note: `lookup(hostname, { all: true })` returns an array of address objects. Ensuring array format with `family` satisfies both real runtime and test mocking.

---

## 3. Summary of Recommendations

| Suite | Component | Root Cause | Fix Summary |
|---|---|---|---|
| `bugs-toClaude-context.test.js` | `openai-to-claude.js` | Missing handling of `msg.reasoning_content` on assistant turns | Map `msg.reasoning_content` to `{ type: "thinking", thinking: msg.reasoning_content }` |
| `combo-autoswitch.test.js` | `combo.js` | 1. `web_search` omitted in `detectRequiredCapabilities`<br>2. `reorderByCapabilities` breaks referential identity on no-op | 1. Parse `web_search` in tools<br>2. Return original `models` when no model matches capability |
| `force-stream-config.test.js` | `force-stream-config.test.js` | Vitest `vi.mock` missing `formatHeadroomSizeLog` & `isHeadroomPhantomSavings` | Add missing exported mock functions to `headroom.js` mock |
| `image-fetch-hardening.test.js` | `image.js` & test mock | `dns.lookup({ all: true })` expects array with `family`; undici connect callback throws | Fallback `family` in `image.js` and return `[{ address, family: 4 }]` in mock |
