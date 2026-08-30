import { describe, it, expect } from "vitest";
import {
  extractToolCallsFromResponse,
  partitionToolCalls,
  parseNamespacedToolName,
} from "../../open-sse/mcp/toolPartition.js";
import {
  appendReActTurnToContext,
  formatAssistantToolCallMessage,
  formatToolResultMessage,
} from "../../open-sse/mcp/contextInjector.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("Cross-Provider ReAct Parser & Context Injector", () => {
  describe("Shape-First Response Parser", () => {
    it("extracts tool calls from OpenAI style response", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_abc123",
                  type: "function",
                  function: {
                    name: "mcp__filesystem__read_file",
                    arguments: JSON.stringify({ path: "/tmp/data.txt" }),
                  },
                },
              ],
            },
          },
        ],
      };

      const calls = extractToolCallsFromResponse(response);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe("mcp__filesystem__read_file");
      expect(calls[0].args).toEqual({ path: "/tmp/data.txt" });
      expect(calls[0].id).toBe("call_abc123");
    });

    it("extracts tool calls from Claude style response", () => {
      const response = {
        role: "assistant",
        content: [
          { type: "text", text: "I will read the file." },
          {
            type: "tool_use",
            id: "toolu_01A",
            name: "mcp__filesystem__read_file",
            input: { path: "/tmp/data.txt" },
          },
        ],
      };

      const calls = extractToolCallsFromResponse(response);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe("mcp__filesystem__read_file");
      expect(calls[0].args).toEqual({ path: "/tmp/data.txt" });
      expect(calls[0].id).toBe("toolu_01A");
    });

    it("extracts tool calls from Gemini style response", () => {
      const response = {
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: "mcp__filesystem__read_file",
                    args: { path: "/tmp/data.txt" },
                  },
                },
              ],
            },
          },
        ],
      };

      const calls = extractToolCallsFromResponse(response);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe("mcp__filesystem__read_file");
      expect(calls[0].args).toEqual({ path: "/tmp/data.txt" });
      expect(calls[0].id).toBeDefined();
    });

    it("extracts tool calls from OpenAI Responses style output", () => {
      const response = {
        output: [
          {
            type: "function_call",
            call_id: "resp_call_1",
            name: "mcp__filesystem__read_file",
            arguments: JSON.stringify({ path: "/tmp/data.txt" }),
          },
        ],
      };

      const calls = extractToolCallsFromResponse(response);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe("mcp__filesystem__read_file");
      expect(calls[0].args).toEqual({ path: "/tmp/data.txt" });
      expect(calls[0].id).toBe("resp_call_1");
    });

    it("extracts tool calls embedded in XML or Markdown text tags as fallback", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              content:
                'Let me check that:\n<tool_call>{"name": "mcp__filesystem__read_file", "arguments": {"path": "/etc/hosts"}}</tool_call>',
            },
          },
        ],
      };

      const calls = extractToolCallsFromResponse(response);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe("mcp__filesystem__read_file");
      expect(calls[0].args).toEqual({ path: "/etc/hosts" });
    });
  });

  describe("Partitioning & Namespacing", () => {
    it("partitions MCP calls from client native calls", () => {
      const toolCalls = [
        { id: "1", name: "mcp__filesystem__read_file", args: { path: "a" } },
        { id: "2", name: "client_custom_tool", args: { query: "b" } },
        { id: "3", name: "mcp__database__query", args: { sql: "SELECT 1" } },
      ];

      const { mcpCalls, clientCalls } = partitionToolCalls(toolCalls);
      expect(mcpCalls).toHaveLength(2);
      expect(clientCalls).toHaveLength(1);
      expect(mcpCalls[0].serverId).toBe("filesystem");
      expect(mcpCalls[0].toolName).toBe("read_file");
      expect(mcpCalls[1].serverId).toBe("database");
      expect(mcpCalls[1].toolName).toBe("query");
      expect(clientCalls[0].name).toBe("client_custom_tool");
    });
  });

  describe("Context Injection across Providers", () => {
    const mcpCalls = [
      { id: "call_1", name: "mcp__fs__read", serverId: "fs", toolName: "read", args: { p: "1" } },
    ];
    const results = [
      { toolCallId: "call_1", name: "mcp__fs__read", content: "file data", isError: false },
    ];

    it("appends OpenAI ReAct turn correctly", () => {
      const initialBody = {
        messages: [{ role: "user", content: "Read 1" }],
      };
      const updated = appendReActTurnToContext(initialBody, mcpCalls, results, FORMATS.OPENAI);
      expect(updated.messages).toHaveLength(3);
      expect(updated.messages[1].role).toBe("assistant");
      expect(updated.messages[1].tool_calls[0].function.name).toBe("mcp__fs__read");
      expect(updated.messages[2].role).toBe("tool");
      expect(updated.messages[2].tool_call_id).toBe("call_1");
      expect(updated.messages[2].content).toBe("file data");
    });

    it("appends Claude ReAct turn correctly", () => {
      const initialBody = {
        messages: [{ role: "user", content: "Read 1" }],
      };
      const updated = appendReActTurnToContext(initialBody, mcpCalls, results, FORMATS.CLAUDE);
      expect(updated.messages).toHaveLength(3);
      expect(updated.messages[1].role).toBe("assistant");
      expect(updated.messages[1].content[0].type).toBe("tool_use");
      expect(updated.messages[2].role).toBe("user");
      expect(updated.messages[2].content[0].type).toBe("tool_result");
      expect(updated.messages[2].content[0].tool_use_id).toBe("call_1");
    });

    it("appends Gemini ReAct turn correctly", () => {
      const initialBody = {
        contents: [{ role: "user", parts: [{ text: "Read 1" }] }],
      };
      const updated = appendReActTurnToContext(initialBody, mcpCalls, results, FORMATS.GEMINI);
      expect(updated.contents).toHaveLength(3);
      expect(updated.contents[1].role).toBe("model");
      expect(updated.contents[1].parts[0].functionCall.name).toBe("mcp__fs__read");
      expect(updated.contents[2].role).toBe("user");
      expect(updated.contents[2].parts[0].functionResponse.name).toBe("mcp__fs__read");
      expect(updated.contents[2].parts[0].functionResponse.response.output).toBe("file data");
    });
  });
});
