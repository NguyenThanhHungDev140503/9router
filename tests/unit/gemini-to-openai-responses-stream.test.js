import { describe, expect, it } from "vitest";
import { ToolLedger } from "../../open-sse/translator/concerns/toolLedger.js";
import { geminiToOpenAIResponse } from "../../open-sse/translator/response/gemini-to-openai.js";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.js";
import { chatCompletionToResponses, parseSSEToOpenAIResponse } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("Gemini tool ledger → OpenAI Responses stream", () => {
  it("restores original tool names and keeps provider-index fallback IDs stable", () => {
    const ledger = new ToolLedger();
    const providerName = ledger.registerTool("search weather", { description: "Search" });
    const state = { toolLedger: ledger };
    const chunk = (index) => geminiToOpenAIResponse({
      response: {
        responseId: "gemini-resp",
        modelVersion: "gemini-test",
        candidates: [{ content: { parts: [{ functionCall: { name: providerName, index, args: { q: "x" } } }] } }]
      }
    }, state);

    const first = chunk(3)[1].choices[0].delta.tool_calls[0];
    const second = chunk(3)[0].choices[0].delta.tool_calls[0];
    expect(first).toMatchObject({ index: 0, function: { name: "search weather" } });
    expect(first.id).toMatch(/^call_[0-9a-f]{32}$/);
    expect(second.id).toBe(first.id);
  });

  it("emits custom Responses events with event/data envelope", () => {
    const ledger = new ToolLedger();
    ledger.registerTool("exec", { isCustom: true });
    const state = initState(FORMATS.OPENAI_RESPONSES);
    state.toolLedger = ledger;
    const chunks = [
      { id: "chatcmpl-1", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_exec", function: { name: "exec", arguments: '{"input":"return 1;"}' } }] }, finish_reason: null }] },
      { id: "chatcmpl-1", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
    ];
    const events = chunks.flatMap((chunk) => openaiToOpenAIResponsesResponse(chunk, state));
    expect(events.find((event) => event.event === "response.output_item.added").data.item.type).toBe("custom_tool_call");
    expect(events.find((event) => event.event === "response.custom_tool_call_input.delta").data.delta).toBe("return 1;");
    expect(events.find((event) => event.event === "response.custom_tool_call_input.done").data.input).toBe("return 1;");
  });

  it("allocates unique ledger IDs for atomic Gemini calls without provider index", () => {
    const ledger = new ToolLedger();
    const state = { toolLedger: ledger };
    const makeChunk = () => geminiToOpenAIResponse({
      response: {
        responseId: "gemini-atomic",
        candidates: [{ content: { parts: [{ functionCall: { name: "exec", args: { input: "x" } } }] } }]
      }
    }, state);
    const first = makeChunk()[1].choices[0].delta.tool_calls[0].id;
    const second = makeChunk()[0].choices[0].delta.tool_calls[0].id;
    expect(first).toMatch(/^call_[0-9a-f]{32}$/);
    expect(second).toMatch(/^call_[0-9a-f]{32}$/);
    expect(second).not.toBe(first);
  });

  it("restores names and custom classification in forced Chat SSE JSON conversion", () => {
    const ledger = new ToolLedger();
    const providerName = ledger.registerTool("exec", { isCustom: true });
    const parsed = parseSSEToOpenAIResponse([
      `data: ${JSON.stringify({ id: "chatcmpl-forced", choices: [{ delta: { tool_calls: [{ index: 0, function: { name: providerName, arguments: '{"input":"return 1;"}' } }] } }] })}`,
      "data: [DONE]",
    ].join("\n"), "gemini-test", ledger);
    const response = chatCompletionToResponses(parsed, null, ledger);
    expect(response.output[0]).toMatchObject({
      type: "custom_tool_call",
      name: "exec",
      input: "return 1;"
    });
  });
});
