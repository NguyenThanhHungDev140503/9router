# Codex Antigravity Tool Translator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement robust bidirectional tool translation between OpenAI Responses API and Gemini/Antigravity provider backend using a request-scoped ToolLedger.

**Architecture:** A request-scoped ToolLedger handles function name sanitization (max 64 chars), progressive collision resolution without map overwriting, custom tool metadata, and call_id tracking. Responses API handler creates the ledger and preserves hosted tool descriptors. Provider adapter for Gemini rejects hosted tools with HTTP 400, translates declarations/calls/responses preserving error status, and propagates the ledger reference. Handlers carry the ledger in pipeline state. Response adapters translate Gemini chunks back to OpenAI Responses SSE events (`event: ...` envelope) and JSON objects with original names and preserved call IDs.

**Tech Stack:** Node.js, Vitest / Bun test runner, SSE / Fetch streaming, JSON Schema.

---

### Task 1: Revert divergence and implement ToolLedger concern with unit tests

**Files:**
- Create: `open-sse/translator/concerns/toolLedger.js`
- Create: `tests/unit/tool-ledger.test.js`
- Modify: `open-sse/translator/request/antigravity-to-openai.js` (revert uncommitted diff)
- Modify: `open-sse/translator/response/openai-to-antigravity.js` (revert uncommitted diff)
- Modify: `open-sse/utils/stream.js` (revert uncommitted diff)
- Delete: `tests/translator/codex-antigravity-tools.test.js`

- [x] **Step 1: Revert uncommitted changes in incorrect files**
```bash
git restore open-sse/translator/request/antigravity-to-openai.js open-sse/translator/response/openai-to-antigravity.js open-sse/utils/stream.js
rm -f tests/translator/codex-antigravity-tools.test.js
```

- [x] **Step 2: Write failing unit tests for ToolLedger**
Write `tests/unit/tool-ledger.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { ToolLedger, MAX_GEMINI_FUNCTION_NAME_LENGTH } from "../../open-sse/translator/concerns/toolLedger.js";

describe("ToolLedger", () => {
  it("sanitizes valid and invalid function names according to Gemini spec", () => {
    const ledger = new ToolLedger();
    expect(ledger.registerTool("read_file")).toBe("read_file");
    expect(ledger.registerTool("mcp__filesystem__read_file")).toBe("mcp__filesystem__read_file");
    expect(ledger.registerTool("mcp/filesystem/read_file")).toBe("mcp_filesystem_read_file");
    expect(ledger.registerTool("123tool")).toMatch(/^_[0-9a-zA-Z]/);
  });

  it("handles long name truncation with progressive collision-safe hashing up to 64 chars", () => {
    const ledger = new ToolLedger();
    const longNameA = "a".repeat(80) + "_alpha";
    const longNameB = "a".repeat(80) + "_beta";

    const nameA = ledger.registerTool(longNameA);
    const nameB = ledger.registerTool(longNameB);

    expect(nameA.length).toBeLessThanOrEqual(MAX_GEMINI_FUNCTION_NAME_LENGTH);
    expect(nameB.length).toBeLessThanOrEqual(MAX_GEMINI_FUNCTION_NAME_LENGTH);
    expect(nameA).not.toBe(nameB);
    expect(ledger.getOriginalName(nameA)).toBe(longNameA);
    expect(ledger.getOriginalName(nameB)).toBe(longNameB);
  });

  it("auto registers and sanitizes when calling getProviderName for unregistered tools", () => {
    const ledger = new ToolLedger();
    const sanitized = ledger.getProviderName("tool/special:name");
    expect(sanitized).toBe("tool_special_name");
    expect(ledger.getOriginalName(sanitized)).toBe("tool/special:name");
  });

  it("tracks custom tools correctly", () => {
    const ledger = new ToolLedger();
    const sanitized = ledger.registerTool("exec", { isCustom: true });
    expect(ledger.isCustom("exec")).toBe(true);
    expect(ledger.isCustom(sanitized)).toBe(true);
  });

  it("registers and retrieves calls and generates exact fallback call_id", () => {
    const ledger = new ToolLedger();
    ledger.registerCall({ callId: "call_123", providerName: "exec", originalName: "exec", isError: false });
    expect(ledger.getCall("call_123")).toEqual({
      providerName: "exec",
      originalName: "exec",
      isError: false
    });

    const fallbackId = ledger.generateFallbackCallId();
    expect(fallbackId).toMatch(/^call_[a-f0-9]{32}$/);
  });
});
```

- [x] **Step 3: Run test to verify it fails**
```bash
bun test tests/unit/tool-ledger.test.js
```
Expected: FAIL (Cannot find module `toolLedger.js`)

- [x] **Step 4: Implement ToolLedger**
Create `open-sse/translator/concerns/toolLedger.js`:
```javascript
import { createHash, randomUUID } from "node:crypto";

export const MAX_GEMINI_FUNCTION_NAME_LENGTH = 64;

export class ToolLedger {
  constructor() {
    this.originalToProvider = new Map();
    this.providerToOriginal = new Map();
    this.toolMeta = new Map();
    this.calls = new Map();
  }

  registerTool(originalName, options = {}) {
    if (!originalName || typeof originalName !== "string") return "_unknown";
    if (this.originalToProvider.has(originalName)) {
      return this.originalToProvider.get(originalName);
    }

    const { isCustom = false, kind = "function", description = "", parameters = null } = options;

    let clean = originalName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    if (!/^[a-zA-Z_]/.test(clean)) {
      clean = "_" + clean;
    }

    let finalName = clean;
    if (finalName.length > MAX_GEMINI_FUNCTION_NAME_LENGTH || this.providerToOriginal.has(finalName)) {
      const fullHash = createHash("sha256").update(originalName).digest("hex");
      let found = false;
      for (let attempt = 0; attempt < 999; attempt++) {
        const hashSlice = attempt === 0 ? fullHash.slice(0, 8) : `${fullHash.slice(0, 8)}_${attempt}`;
        const maxPrefixLen = Math.max(1, MAX_GEMINI_FUNCTION_NAME_LENGTH - (hashSlice.length + 1));
        const prefix = clean.slice(0, maxPrefixLen);
        const candidate = `${prefix}_${hashSlice}`;
        if (!this.providerToOriginal.has(candidate) || this.providerToOriginal.get(candidate) === originalName) {
          finalName = candidate;
          found = true;
          break;
        }
      }
      if (!found) {
        throw new Error(`Unable to allocate provider name for ${originalName}`);
      }
    }

    this.originalToProvider.set(originalName, finalName);
    this.providerToOriginal.set(finalName, originalName);
    this.toolMeta.set(originalName, { isCustom, kind, description, parameters });
    return finalName;
  }

  getProviderName(originalName) {
    if (!this.originalToProvider.has(originalName)) {
      return this.registerTool(originalName);
    }
    return this.originalToProvider.get(originalName);
  }

  getOriginalName(providerName) {
    return this.providerToOriginal.get(providerName) || providerName;
  }

  isCustom(nameOrProviderName) {
    const original = this.providerToOriginal.get(nameOrProviderName) || nameOrProviderName;
    return Boolean(this.toolMeta.get(original)?.isCustom);
  }

  registerCall({ callId, providerName, originalName, isError = false }) {
    this.calls.set(callId, { providerName, originalName, isError });
  }

  getCall(callId) {
    return this.calls.get(callId);
  }

  generateFallbackCallId() {
    return `call_${randomUUID().replace(/-/g, "")}`;
  }
}
```

- [x] **Step 5: Run test to verify it passes**
```bash
bun test tests/unit/tool-ledger.test.js
```
Expected: PASS

- [x] **Step 6: Commit Task 1**
```bash
git add open-sse/translator/concerns/toolLedger.js tests/unit/tool-ledger.test.js
git commit -m "feat(translator): implement request-scoped ToolLedger with tests"
```

---

### Task 2: OpenAI Responses Request Translation & Capability Rejection

**Files:**
- Create: `open-sse/translator/concerns/toolErrors.js`
- Modify: `open-sse/translator/request/openai-responses.js`
- Modify: `open-sse/translator/request/openai-to-gemini.js`
- Modify: `open-sse/handlers/chatCore.js`
- Create: `tests/unit/openai-responses-to-gemini-request.test.js`

- [x] **Step 1: Write failing unit test for Responses -> Gemini request translation and hosted tools rejection**
Write `tests/unit/openai-responses-to-gemini-request.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses.js";
import { openaiToGeminiCLIRequest } from "../../open-sse/translator/request/openai-to-gemini.js";
import { UnsupportedHostedToolError } from "../../open-sse/translator/concerns/toolErrors.js";

describe("OpenAI Responses -> Gemini Request Translation", () => {
  it("rejects hosted tools (mcp, web_search, computer, code_interpreter, request_user_input) when targeting Gemini", () => {
    const hostedTypes = ["mcp", "web_search", "computer", "code_interpreter", "request_user_input"];
    for (const type of hostedTypes) {
      const body = {
        model: "gemini-2.5-pro",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
        tools: [{ type }]
      };
      const chatReq = openaiResponsesToOpenAIRequest("gemini-2.5-pro", body, false, null);
      expect(() => openaiToGeminiCLIRequest("gemini-2.5-pro", chatReq, false)).toThrow(UnsupportedHostedToolError);
    }
  });

  it("translates function and custom tools to Gemini functionDeclarations and propagates _toolLedger", () => {
    const body = {
      model: "gemini-2.5-pro",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
      tools: [
        { type: "function", name: "mcp__filesystem__read_file", description: "read file", parameters: { type: "object", properties: { path: { type: "string" } } } },
        { type: "custom", name: "exec", description: "run command", format: { syntax: "bash" } }
      ]
    };
    const chatReq = openaiResponsesToOpenAIRequest("gemini-2.5-pro", body, false, null);
    expect(chatReq._toolLedger).toBeDefined();

    const geminiReq = openaiToGeminiCLIRequest("gemini-2.5-pro", chatReq, false);
    expect(geminiReq._toolLedger).toBe(chatReq._toolLedger);
    const fns = geminiReq.tools[0].functionDeclarations;
    expect(fns.find(f => f.name === "mcp__filesystem__read_file")).toBeDefined();
    expect(fns.find(f => f.name === "exec")).toBeDefined();
  });

  it("translates multi-turn tool outputs with is_error and status: error preserved", () => {
    const body = {
      model: "gemini-2.5-pro",
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "run it" }] },
        { type: "function_call", call_id: "call_123", name: "exec", arguments: "{\"cmd\":\"ls\"}" },
        { type: "function_call_output", call_id: "call_123", output: "Permission denied", is_error: true },
        { type: "function_call", call_id: "call_456", name: "read_file", arguments: "{\"path\":\"bad\"}" },
        { type: "function_call_output", call_id: "call_456", output: "File not found", status: "error" }
      ],
      tools: [
        { type: "function", name: "exec", description: "exec", parameters: { type: "object" } },
        { type: "function", name: "read_file", description: "read", parameters: { type: "object" } }
      ]
    };
    const chatReq = openaiResponsesToOpenAIRequest("gemini-2.5-pro", body, false, null);
    const geminiReq = openaiToGeminiCLIRequest("gemini-2.5-pro", chatReq, false);
    const userTurn = geminiReq.contents.find(c => c.role === "user" && c.parts.some(p => p.functionResponse));
    expect(userTurn).toBeDefined();

    const resp1 = userTurn.parts.find(p => p.functionResponse?.id === "call_123")?.functionResponse;
    expect(resp1).toBeDefined();
    expect(resp1.response.isError).toBe(true);

    const resp2 = userTurn.parts.find(p => p.functionResponse?.id === "call_456")?.functionResponse;
    expect(resp2).toBeDefined();
    expect(resp2.response.isError).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**
```bash
bun test tests/unit/openai-responses-to-gemini-request.test.js
```
Expected: FAIL

- [x] **Step 3: Implement toolErrors.js, update openai-responses.js and chatCore.js**
Create `open-sse/translator/concerns/toolErrors.js`:
```javascript
export class UnsupportedHostedToolError extends Error {
  constructor(toolType) {
    super(`Hosted tool type "${toolType}" is not supported by Gemini/Antigravity.`);
    this.name = "UnsupportedHostedToolError";
    this.status = 400;
  }
}
```

In `open-sse/translator/request/openai-responses.js`:
- Import `ToolLedger`.
- Check `body.tools` and `additionalTools`: Record hosted tool declarations in `result._hostedTools` (without throwing at this stage to permit passthroughs):
```javascript
const hostedTypes = new Set(["mcp", "web_search", "computer", "code_interpreter", "request_user_input"]);
const hosted = responseTools.filter(t => hostedTypes.has(t?.type));
if (hosted.length > 0) {
  result._hostedTools = hosted;
}
```
- Instantiate `const toolLedger = new ToolLedger();`.
- Register each tool in `toolLedger`.
- In `FUNCTION_CALL_OUTPUT` / `CUSTOM_TOOL_CALL_OUTPUT`, preserve `is_error: Boolean(item.is_error || item.status === "error")` on the `role: "tool"` message.
- Attach `result._toolLedger = toolLedger;`.

In `open-sse/handlers/chatCore.js`:
- Wrap `translateRequest` call in try/catch to intercept `UnsupportedHostedToolError` and return 400 immediately:
```javascript
try {
  translatedBody = translateRequest(
    sourceFormat,
    targetFormat,
    upstreamModel,
    body,
    stream,
    credentials,
    provider,
    reqLogger,
    stripList,
    connectionId,
    clientTool
  );
} catch (err) {
  if (err instanceof UnsupportedHostedToolError || err.name === "UnsupportedHostedToolError") {
    return createErrorResult(err.status || 400, err.message);
  }
  throw err;
}
const toolLedger = translatedBody?._toolLedger;
if (translatedBody?._toolLedger) delete translatedBody._toolLedger;
```

- Native Responses/Codex passthrough test: verify hosted tool descriptors remain in the original outbound Responses body and do not enter Chat translation.

- [x] **Step 4: Update openai-to-gemini.js**
- In `openaiToGeminiBase`, check `body._hostedTools`:
```javascript
if (Array.isArray(body._hostedTools) && body._hostedTools.length > 0) {
  throw new UnsupportedHostedToolError(body._hostedTools[0].type);
}
```
- Use `body._toolLedger` (or create fallback ledger) to register tools and translate assistant tool calls.
- Collect tool responses preserving error flag:
```javascript
const toolResponses = {};
if (body.messages && Array.isArray(body.messages)) {
  for (const msg of body.messages) {
    if (msg.role === ROLE.TOOL && msg.tool_call_id) {
      toolResponses[msg.tool_call_id] = {
        content: msg.content,
        isError: Boolean(msg.is_error || msg.status === "error")
      };
    }
  }
}
```
- In tool response translation:
```javascript
const tr = toolResponses[fid];
const parsedValue = tryParseJSON(tr.content);
const parsedResp = parsedValue === null && String(tr.content).trim() !== "null" ? tr.content : parsedValue;
const callMeta = ledger?.getCall(fid);
// Register every assistant tool call before later tool output lookup.
ledger?.registerCall({ callId: fid, providerName, originalName: name });
const providerName = callMeta?.providerName || (ledger ? ledger.getProviderName(name) : sanitizeGeminiFunctionName(name));
toolParts.push({
  functionResponse: {
    id: fid,
    name: providerName,
    response: {
      result: parsedResp,
      ...(tr.isError ? { isError: true } : {})
    }
  }
});
```
- Re-attach `result._toolLedger = body._toolLedger;` before returning.

- [x] **Step 5: Run test to verify it passes**
```bash
bun test tests/unit/openai-responses-to-gemini-request.test.js
```
Expected: PASS

- [x] **Step 6: Commit Task 2**
```bash
git add open-sse/translator/concerns/toolErrors.js open-sse/translator/request/openai-responses.js open-sse/translator/request/openai-to-gemini.js open-sse/handlers/chatCore.js tests/unit/openai-responses-to-gemini-request.test.js
git commit -m "feat(translator): add hosted tool rejection and responses request to gemini translation"
```

---

### Task 3: Gemini Response & SSE Streaming Translation for Responses API

**Files:**
- Modify: `open-sse/translator/response/gemini-to-openai.js`
- Modify: `open-sse/translator/response/openai-responses.js`
- Modify: `open-sse/handlers/chatCore.js`
- Modify: `open-sse/handlers/chatCore/streamingHandler.js`
- Modify: `open-sse/handlers/chatCore/nonStreamingHandler.js`
- Modify: `open-sse/handlers/chatCore/sseToJsonHandler.js`
- Modify: `open-sse/handlers/responsesHandler.js`
- Modify: `open-sse/transformer/streamToJsonConverter.js`
- Create: `tests/unit/gemini-to-openai-responses-stream.test.js`

- [x] **Step 1: Write failing unit test for Gemini chunk stream -> OpenAI Responses SSE events & non-streaming JSON**
Write `tests/unit/gemini-to-openai-responses-stream.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { ToolLedger } from "../../open-sse/translator/concerns/toolLedger.js";
import { geminiToOpenAIResponse } from "../../open-sse/translator/response/gemini-to-openai.js";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.js";
import { initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("Gemini Response -> OpenAI Responses Stream Translation", () => {
  it("restores original tool name and reuses fallback ID for repeated stable provider index", () => {
    const ledger = new ToolLedger();
    ledger.registerTool("mcp__filesystem__read_file");
    ledger.registerTool("exec", { isCustom: true });

    const state = { ...initState(FORMATS.OPENAI), toolLedger: ledger };
    const chunk1 = {
      candidates: [{
        content: {
          parts: [{ functionCall: { index: 0, name: "mcp__filesystem__read_file", args: { path: "/tmp" } } }]
        }
      }]
    };
    const openAIChunks1 = geminiToOpenAIResponse(chunk1, state);
    expect(openAIChunks1).toBeDefined();
    const tc1 = openAIChunks1.find(c => c.choices?.[0]?.delta?.tool_calls)?.choices[0].delta.tool_calls[0];
    expect(tc1.function.name).toBe("mcp__filesystem__read_file");
    expect(tc1.id).toMatch(/^call_[a-f0-9]{32}$/);

    const chunk2 = {
      candidates: [{
        content: {
          parts: [{ functionCall: { index: 1, name: "exec", args: { cmd: "ls" } } }]
        }
      }]
    };
    const openAIChunks2 = geminiToOpenAIResponse(chunk2, state);
    const tc2 = openAIChunks2.find(c => c.choices?.[0]?.delta?.tool_calls)?.choices[0].delta.tool_calls[0];
    expect(tc2.function.name).toBe("exec");
    expect(tc2.id).not.toBe(tc1.id);

    const repeated = geminiToOpenAIResponse({ candidates: [{ content: { parts: [{ functionCall: { index: 0, name: "mcp__filesystem__read_file", args: { path: "/tmp" } } }] } }] }, state);
    const repeatedCall = repeated.find(c => c.choices?.[0]?.delta?.tool_calls)?.choices[0].delta.tool_calls[0];
    expect(repeatedCall.id).toBe(tc1.id);
  });

  it("emits custom_tool_call vs function_call SSE event types in Responses format", () => {
    const ledger = new ToolLedger();
    ledger.registerTool("exec", { isCustom: true });
    ledger.registerTool("read_file", { isCustom: false });

    const state = { ...initState(FORMATS.OPENAI_RESPONSES), toolLedger: ledger, responseId: "resp_123" };
    const customChunk = {
      choices: [{ delta: { tool_calls: [{ id: "call_abc", index: 0, type: "function", function: { name: "exec", arguments: "{\"input\":\"ls\"}" } }] } }]
    };
    const sseEventsCustom = openaiToOpenAIResponsesResponse(customChunk, state);
    expect(sseEventsCustom?.some(e => e.event === "response.output_item.added" && e.data?.item?.type === "custom_tool_call")).toBe(true);

    const funcChunk = {
      choices: [{ delta: { tool_calls: [{ id: "call_def", index: 1, type: "function", function: { name: "read_file", arguments: "{\"path\":\"a.txt\"}" } }] } }]
    };
    const sseEventsFunc = openaiToOpenAIResponsesResponse(funcChunk, state);
    expect(sseEventsFunc?.some(e => e.event === "response.output_item.added" && e.data?.item?.type === "function_call")).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**
```bash
bun test tests/unit/gemini-to-openai-responses-stream.test.js
```
Expected: FAIL

- [x] **Step 3: Update gemini-to-openai.js and openai-responses.js**
- In `gemini-to-openai.js`:
```javascript
const rawName = functionCall.name;
const fcName = state.toolLedger ? state.toolLedger.getOriginalName(rawName) : (state.toolNameMap?.get(rawName) || rawName);
const fcArgs = functionCall.args || {};
const toolCallIndex = state.functionIndex++;
const callId = functionCall.id || (state.toolLedger ? state.toolLedger.generateFallbackCallId() : ("call_" + randomUUID().replace(/-/g, "")));
const toolCall = {
  id: callId,
  index: toolCallIndex,
  type: OPENAI_BLOCK.FUNCTION,
  function: { name: fcName, arguments: JSON.stringify(fcArgs) },
};
```

- In `openai-responses.js`:
Check `state.toolLedger?.isCustom(name)` to emit `custom_tool_call` item type and arguments.

- [x] **Step 4: Update Handlers to pass toolLedger**
- In `open-sse/handlers/chatCore.js`:
  - Preserve native Responses/Codex passthrough before Chat translation.
  - Pass `toolLedger` into `handleStreamingResponse({ ..., toolLedger })`, `handleNonStreamingResponse({ ..., toolLedger })`, and `handleForcedSSEToJson({ ..., toolLedger })`.
  - Delete both translator metadata fields before executor: `delete translatedBody._toolLedger; delete translatedBody._hostedTools;`.
- In `open-sse/handlers/chatCore/streamingHandler.js`: Pass `toolLedger` into `buildTransformStream` / `createStreamController`.
- In `open-sse/handlers/chatCore/nonStreamingHandler.js`: Pass `toolLedger` into translator state.
- In `open-sse/handlers/chatCore/sseToJsonHandler.js`: Pass `toolLedger` into JSON transform options.
- In `open-sse/handlers/responsesHandler.js`: Pass `toolLedger` into response stream controller.
- In `open-sse/transformer/streamToJsonConverter.js`: Preserve tool calls and original names via ledger.

- [x] **Step 5: Run test to verify it passes**
```bash
bun test tests/unit/gemini-to-openai-responses-stream.test.js
```
Expected: PASS

- [x] **Step 6: Commit Task 3**
```bash
git add open-sse/translator/response/gemini-to-openai.js open-sse/translator/response/openai-responses.js open-sse/handlers/chatCore.js open-sse/handlers/chatCore/streamingHandler.js open-sse/handlers/chatCore/nonStreamingHandler.js open-sse/handlers/chatCore/sseToJsonHandler.js open-sse/handlers/responsesHandler.js open-sse/transformer/streamToJsonConverter.js tests/unit/gemini-to-openai-responses-stream.test.js
git commit -m "feat(translator): implement gemini response and SSE streaming for responses api"
```

---

### Task 4: Full Integration Verification and Regression Testing

**Files:**
- Modify: `docs/superpowers/specs/2026-08-21-codex-antigravity-tool-translator-design.md`
- Modify: `docs/superpowers/plans/2026-08-21-codex-antigravity-tool-translator.md`
- Test: `tests/unit/tool-ledger.test.js`
- Test: `tests/unit/openai-responses-to-gemini-request.test.js`
- Test: `tests/unit/gemini-to-openai-responses-stream.test.js`
- Test: `tests/translator/bugs-antigravity.test.js`
- Test: `tests/translator/bugs-codexCli-responses.test.js`

- [x] **Step 1: Run all unit and regression tests**
```bash
bun test tests/unit/tool-ledger.test.js tests/unit/openai-responses-to-gemini-request.test.js tests/unit/gemini-to-openai-responses-stream.test.js tests/translator/bugs-antigravity.test.js tests/translator/bugs-codexCli-responses.test.js
```
Result: 35 tests passed. `bugs-codexCli-responses.test.js` still reports one pre-existing Bun incompatibility: `it.fails is not a function`.

- [x] **Step 2: Check git diff and lint/formatting clean**
```bash
git diff --check
```

- [x] **Step 3: Commit doc tracking and finalized plan**
```bash
git add -f docs/superpowers/specs/2026-08-21-codex-antigravity-tool-translator-design.md docs/superpowers/plans/2026-08-21-codex-antigravity-tool-translator.md
git commit -m "docs: complete codex antigravity tool translator design and plan"
```
