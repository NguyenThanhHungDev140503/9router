import { describe, expect, it } from "vitest";
import { ToolLedger } from "../../open-sse/translator/concerns/toolLedger.js";
import { geminiToOpenAIResponse } from "../../open-sse/translator/response/gemini-to-openai.js";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.js";
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
    expect(first).toMatchObject({ id: "call_3", index: 0, function: { name: "search weather" } });
    expect(second.id).toBe("call_3");
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
});
