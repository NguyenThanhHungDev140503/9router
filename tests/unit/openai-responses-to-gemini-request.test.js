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

  it("preserves provider functionResponse names and JSON null results", () => {
    const originalName = "mcp/filesystem/read_file";
    const chat = openaiResponsesToOpenAIRequest("gemini", {
      tools: [{ type: "function", name: originalName, parameters: { type: "object" } }],
      input: [
        { type: "function_call", call_id: "call_null", name: originalName, arguments: "{}" },
        { type: "function_call_output", call_id: "call_null", output: "null" },
      ],
    }, true, null);

    const gemini = openaiToGeminiRequest("gemini", chat, true);
    const response = gemini.contents
      .flatMap((content) => content.parts)
      .find((part) => part.functionResponse)?.functionResponse;

    expect(response.name).toBe("mcp_filesystem_read_file");
    expect(response.response.result).toBeNull();
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

  it("includes top-level additional_tools and rejects hosted entries", () => {
    const chat = openaiResponsesToOpenAIRequest("gemini", {
      additional_tools: [
        { type: "function", name: "top_level", parameters: { type: "object" } },
        { type: "web_search_preview" },
      ],
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "search" }] }],
    }, true, null);

    expect(chat.tools).toHaveLength(1);
    expect(chat.tools[0].function.name).toBe("top_level");
    expect(chat._hostedTools).toEqual([{ type: "web_search_preview" }]);
    expect(() => openaiToGeminiRequest("gemini", chat, true)).toThrow(UnsupportedHostedToolError);
  });

  it("flattens namespace tools sent by Codex Responses API", () => {
    const chat = openaiResponsesToOpenAIRequest("gemini", {
      tools: [
        {
          type: "namespace",
          name: "developer",
          tools: [
            { type: "function", name: "exec_command", description: "Run shell command", parameters: { type: "object" } },
            { type: "function", name: "read_file", description: "Read file contents", parameters: { type: "object" } },
          ],
        },
      ],
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "list files" }] }],
    }, true, null);

    expect(chat.tools).toHaveLength(2);
    expect(chat.tools.map((t) => t.function.name)).toEqual(["exec_command", "read_file"]);
    expect(chat._hostedTools).toBeUndefined();

    const gemini = openaiToGeminiRequest("gemini", chat, true);
    const declarations = gemini.tools[0].functionDeclarations;
    expect(declarations.map((t) => t.name)).toEqual(["exec_command", "read_file"]);
  });
});
