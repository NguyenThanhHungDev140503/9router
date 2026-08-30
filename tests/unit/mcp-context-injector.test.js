import { describe, it, expect } from "vitest";
import {
  formatAssistantToolCallMessage,
  formatToolResultMessage,
  appendReActTurnToContext,
} from "../../open-sse/mcp/contextInjector.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("mcp/contextInjector", () => {
  const mcpCalls = [
    {
      id: "call_1",
      name: "mcp__fs__read",
      serverId: "fs",
      toolName: "read",
      args: { path: "/tmp/a.txt" },
    },
  ];

  const results = [
    {
      toolCallId: "call_1",
      name: "mcp__fs__read",
      content: "file contents",
      isError: false,
    },
  ];

  describe("OpenAI format", () => {
    it("should format assistant tool call and tool result messages for OpenAI format", () => {
      const assistantMsg = formatAssistantToolCallMessage(mcpCalls, FORMATS.OPENAI);
      expect(assistantMsg).toEqual({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "mcp__fs__read",
              arguments: JSON.stringify({ path: "/tmp/a.txt" }),
            },
          },
        ],
      });

      const resultMsgs = formatToolResultMessage(results, FORMATS.OPENAI);
      expect(resultMsgs).toEqual([
        {
          role: "tool",
          tool_call_id: "call_1",
          content: "file contents",
        },
      ]);
    });

    it("should append turn messages into context body for OpenAI", () => {
      const body = {
        messages: [{ role: "user", content: "read file" }],
      };
      const updated = appendReActTurnToContext(body, mcpCalls, results, FORMATS.OPENAI);
      expect(updated.messages).toHaveLength(3);
      expect(updated.messages[1].role).toBe("assistant");
      expect(updated.messages[2].role).toBe("tool");
    });
  });

  describe("Claude format", () => {
    it("should format assistant tool call and tool result messages for Claude format", () => {
      const assistantMsg = formatAssistantToolCallMessage(mcpCalls, FORMATS.CLAUDE);
      expect(assistantMsg).toEqual({
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "mcp__fs__read",
            input: { path: "/tmp/a.txt" },
          },
        ],
      });

      const resultMsgs = formatToolResultMessage(results, FORMATS.CLAUDE);
      expect(resultMsgs).toEqual([
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_1",
              content: "file contents",
              is_error: false,
            },
          ],
        },
      ]);
    });

    it("should append turn messages into context body for Claude", () => {
      const body = {
        messages: [{ role: "user", content: "read file" }],
      };
      const updated = appendReActTurnToContext(body, mcpCalls, results, FORMATS.CLAUDE);
      expect(updated.messages).toHaveLength(3);
      expect(updated.messages[1].content[0].type).toBe("tool_use");
      expect(updated.messages[2].content[0].type).toBe("tool_result");
    });
  });

  describe("Gemini format", () => {
    it("should format assistant tool call and tool result messages for Gemini format", () => {
      const assistantMsg = formatAssistantToolCallMessage(mcpCalls, FORMATS.GEMINI);
      expect(assistantMsg).toEqual({
        role: "model",
        parts: [
          {
            functionCall: {
              name: "mcp__fs__read",
              args: { path: "/tmp/a.txt" },
            },
          },
        ],
      });

      const resultMsgs = formatToolResultMessage(results, FORMATS.GEMINI);
      expect(resultMsgs).toEqual([
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: "mcp__fs__read",
                response: {
                  output: "file contents",
                  error: false,
                },
              },
            },
          ],
        },
      ]);
    });

    it("should append turn messages into context body contents for Gemini", () => {
      const body = {
        contents: [{ role: "user", parts: [{ text: "read file" }] }],
      };
      const updated = appendReActTurnToContext(body, mcpCalls, results, FORMATS.GEMINI);
      expect(updated.contents).toHaveLength(3);
      expect(updated.contents[1].role).toBe("model");
      expect(updated.contents[2].role).toBe("user");
    });
  });

  describe("Responses API format", () => {
    it("should append function_call and function_call_output items to input array", () => {
      const body = {
        input: [{ role: "user", content: "read file" }],
      };
      const updated = appendReActTurnToContext(body, mcpCalls, results, FORMATS.OPENAI_RESPONSES);
      expect(updated.input).toHaveLength(3);
      expect(updated.input[1].type).toBe("function_call");
      expect(updated.input[2].type).toBe("function_call_output");
      expect(updated.input[2].call_id).toBe("call_1");
      expect(updated.input[2].output).toBe("file contents");
    });
  });
});
