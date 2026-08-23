import { describe, expect, it } from "vitest";
import { openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses.js";
import { openaiToGeminiRequest } from "../../open-sse/translator/request/openai-to-gemini.js";
import { UnsupportedHostedToolError } from "../../open-sse/translator/concerns/toolErrors.js";

describe("OpenAI Responses → Gemini request tools", () => {
  it("translates function and custom tools through request-scoped ToolLedger", () => {
    const chat = openaiResponsesToOpenAIRequest("gemini", {
      tools: [
        { type: "function", name: "mcp/filesystem/read_file", description: "Read file", parameters: { type: "object" } },
        { type: "custom", name: "mcp:filesystem:exec", description: "Run command" },
      ],
      input: [
        { type: "function_call", call_id: "call_read", name: "mcp/filesystem/read_file", arguments: "{\"path\":\"x\"}" },
        { type: "function_call_output", call_id: "call_read", output: "{\"ok\":true}" },
      ],
    }, true, null);

    const gemini = openaiToGeminiRequest("gemini", chat, true);
    const declarations = gemini.tools[0].functionDeclarations;

    expect(declarations.map((tool) => tool.name)).toEqual([
      "mcp_filesystem_read_file",
      "mcp_filesystem_exec",
    ]);
    expect(gemini.contents.flatMap((content) => content.parts).find((part) => part.functionCall)).toMatchObject({
      functionCall: {
        id: "call_read",
        name: "mcp_filesystem_read_file",
      },
    });
    expect(gemini._toolLedger).toBe(chat._toolLedger);
  });

  it("preserves Responses tool output errors in Gemini functionResponse", () => {
    const chat = openaiResponsesToOpenAIRequest("gemini", {
      tools: [{ type: "function", name: "search", parameters: { type: "object" } }],
      input: [
        { type: "function_call", call_id: "call_search", name: "search", arguments: "{}" },
        { type: "function_call_output", call_id: "call_search", output: "failed", status: "error" },
      ],
    }, true, null);

    const gemini = openaiToGeminiRequest("gemini", chat, true);
    const response = gemini.contents
      .flatMap((content) => content.parts)
      .find((part) => part.functionResponse)?.functionResponse;

    expect(response).toMatchObject({
      id: "call_search",
      name: "search",
      response: { isError: true, result: { result: "failed" } },
    });
  });

  it("rejects hosted tools only in Gemini adapter", () => {
    const chat = openaiResponsesToOpenAIRequest("gemini", {
      tools: [{ type: "web_search_preview" }],
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "search" }] }],
    }, true, null);

    expect(chat._hostedTools).toEqual([{ type: "web_search_preview" }]);
    expect(() => openaiToGeminiRequest("gemini", chat, true)).toThrow(UnsupportedHostedToolError);
    try {
      openaiToGeminiRequest("gemini", chat, true);
    } catch (error) {
      expect(error.status).toBe(400);
    }
  });
});
