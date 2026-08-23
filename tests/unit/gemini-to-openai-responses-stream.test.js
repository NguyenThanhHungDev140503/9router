import { describe, expect, it } from "vitest";
import { ToolLedger } from "../../open-sse/translator/concerns/toolLedger.js";
import { geminiToOpenAIResponse } from "../../open-sse/translator/response/gemini-to-openai.js";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.js";
import { chatCompletionToResponses, parseSSEToOpenAIResponse } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { createResponsesApiTransformStream } from "../../open-sse/transformer/responsesTransformer.js";
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

  it("uses ledger fallback ID in forced Chat SSE JSON conversion", () => {
    const ledger = new ToolLedger();
    const parsed = parseSSEToOpenAIResponse(
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "search", arguments: "{}" } }] } }] })}`,
      "gemini-test",
      ledger
    );
    const response = chatCompletionToResponses(parsed, null, ledger);
    expect(response.output[0].call_id).toMatch(/^call_[0-9a-f]{32}$/);
  });

  it("emits only custom tool input events and keeps ctc classification across split name/id", async () => {
    const ledger = new ToolLedger();
    ledger.registerTool("exec", { isCustom: true });
    const firstChunk = {
      id: "chatcmpl-custom",
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "call_exec",
            function: { arguments: "{\"input\":\"return " }
          }]
        }
      }]
    };
    const secondChunk = {
      id: "chatcmpl-custom",
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: { name: "exec", arguments: "1;\"}" }
          }]
        },
        finish_reason: "tool_calls"
      }]
    };
    const sse = [
      `data: ${JSON.stringify(firstChunk)}`,
      `data: ${JSON.stringify(secondChunk)}`,
      "data: [DONE]"
    ].join("\n\n") + "\n\n";
    const input = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      }
    });
    const output = await new Response(input.pipeThrough(createResponsesApiTransformStream(null, ledger))).text();
    const events = output.trim().split("\n\n").filter((block) => !block.includes("data: [DONE]")).map((block) => {
      const data = block.split("\n").find((line) => line.startsWith("data:"));
      return JSON.parse(data.slice(5));
    });
    expect(events.find((event) => event.type === "response.output_item.added").item).toMatchObject({
      id: "ctc_call_exec",
      type: "custom_tool_call",
      name: "exec"
    });
    expect(events.some((event) => event.type === "response.function_call_arguments.delta")).toBe(false);
    expect(events.find((event) => event.type === "response.custom_tool_call_input.delta").delta).toBe("return 1;");
    expect(events.find((event) => event.type === "response.custom_tool_call_input.done").input).toBe("return 1;");
  });

  it("uses a stable ledger fallback for indexed tool calls without provider IDs", async () => {
    const ledger = new ToolLedger();
    const chunk = {
      id: "chatcmpl-indexed-fallback",
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            function: { name: "search", arguments: "{\"q\":\"x\"}" }
          }]
        },
        finish_reason: "tool_calls"
      }]
    };
    const sse = `data: ${JSON.stringify(chunk)}\n\n`;
    const input = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      }
    });
    const output = await new Response(input.pipeThrough(createResponsesApiTransformStream(null, ledger))).text();
    const events = output.trim().split("\n\n").filter((block) => !block.includes("data: [DONE]")).map((block) => {
      const data = block.split("\n").find((line) => line.startsWith("data:"));
      return JSON.parse(data.slice(5));
    });
    const added = events.find((event) => event.type === "response.output_item.added");
    const argumentDelta = events.find((event) => event.type === "response.function_call_arguments.delta");
    const argumentDone = events.find((event) => event.type === "response.function_call_arguments.done");
    const itemDone = events.find((event) => event.type === "response.output_item.done");

    expect(added.item).toMatchObject({
      type: "function_call",
      name: "search"
    });
    expect(added.item.call_id).toMatch(/^call_[0-9a-f]{32}$/);
    expect(argumentDelta.delta).toBe("{\"q\":\"x\"}");
    expect(argumentDone.arguments).toBe("{\"q\":\"x\"}");
    expect(itemDone.item).toMatchObject({
      type: "function_call",
      call_id: added.item.call_id,
      arguments: "{\"q\":\"x\"}"
    });
  });

  it("uses a valid fallback for indexed tool calls without a ledger", async () => {
    const chunk = {
      id: "chatcmpl-no-ledger-fallback",
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: { name: "search", arguments: "{}" }
          }]
        },
        finish_reason: "tool_calls"
      }]
    };
    const input = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
        controller.close();
      }
    });
    const output = await new Response(input.pipeThrough(createResponsesApiTransformStream())).text();
    const events = output.trim().split("\n\n").filter((block) => !block.includes("data: [DONE]")).map((block) => {
      const data = block.split("\n").find((line) => line.startsWith("data:"));
      return JSON.parse(data.slice(5));
    });
    const added = events.find((event) => event.type === "response.output_item.added");
    expect(added.item.call_id).toMatch(/^call_[0-9a-f]{32}$/);
  });

  it("buffers indexed arguments until name arrives, then emits one complete delta", async () => {
    const firstChunk = {
      id: "chatcmpl-split-args",
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: { arguments: "{\"q\":\"x\"}" }
          }]
        }
      }]
    };
    const secondChunk = {
      id: "chatcmpl-split-args",
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: { name: "search" }
          }]
        },
        finish_reason: "tool_calls"
      }]
    };
    const sse = [
      `data: ${JSON.stringify(firstChunk)}`,
      `data: ${JSON.stringify(secondChunk)}`,
      "data: [DONE]"
    ].join("\n\n") + "\n\n";
    const input = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      }
    });
    const output = await new Response(input.pipeThrough(createResponsesApiTransformStream())).text();
    const events = output.trim().split("\n\n").filter((block) => !block.includes("data: [DONE]")).map((block) => {
      const data = block.split("\n").find((line) => line.startsWith("data:"));
      return JSON.parse(data.slice(5));
    });
    const deltas = events.filter((event) => event.type === "response.function_call_arguments.delta");
    const done = events.find((event) => event.type === "response.function_call_arguments.done");
    expect(deltas).toHaveLength(1);
    expect(deltas[0].delta).toBe("{\"q\":\"x\"}");
    expect(done.arguments).toBe("{\"q\":\"x\"}");
  });
});
