import { describe, it, expect } from "vitest";
import {
  parseNamespacedToolName,
  isMcpToolName,
  extractToolCallsFromResponse,
  partitionToolCalls,
} from "../../open-sse/mcp/toolPartition.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("mcp/toolPartition", () => {
  describe("parseNamespacedToolName", () => {
    it("should parse valid namespaced tool names", () => {
      expect(parseNamespacedToolName("mcp__filesystem__read_file")).toEqual({
        serverId: "filesystem",
        toolName: "read_file",
      });
      expect(parseNamespacedToolName("mcp__git_server__git_diff")).toEqual({
        serverId: "git_server",
        toolName: "git_diff",
      });
      expect(parseNamespacedToolName("mcp__server_a__tool_b_c")).toEqual({
        serverId: "server_a",
        toolName: "tool_b_c",
      });
    });

    it("should return null for non-MCP names or invalid structures", () => {
      expect(parseNamespacedToolName("read_file")).toBeNull();
      expect(parseNamespacedToolName("mcp__onlyone")).toBeNull();
      expect(parseNamespacedToolName("mcp____")).toBeNull();
      expect(parseNamespacedToolName("")).toBeNull();
      expect(parseNamespacedToolName(null)).toBeNull();
      expect(parseNamespacedToolName(undefined)).toBeNull();
    });
  });

  describe("isMcpToolName", () => {
    it("should return true for valid MCP tool names", () => {
      expect(isMcpToolName("mcp__filesystem__read_file")).toBe(true);
    });

    it("should return false for invalid or client tool names", () => {
      expect(isMcpToolName("read_file")).toBe(false);
      expect(isMcpToolName("mcp__invalid")).toBe(false);
      expect(isMcpToolName(null)).toBe(false);
    });
  });

  describe("extractToolCallsFromResponse", () => {
    it("should extract tool calls from OpenAI response shape", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "mcp__fs__read",
                    arguments: JSON.stringify({ path: "/tmp/test" }),
                  },
                },
                {
                  id: "call_456",
                  type: "function",
                  function: {
                    name: "client_search",
                    arguments: { query: "hello" },
                  },
                },
              ],
            },
          },
        ],
      };

      const calls = extractToolCallsFromResponse(response, FORMATS.OPENAI);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({
        id: "call_123",
        name: "mcp__fs__read",
        args: { path: "/tmp/test" },
        raw: response.choices[0].message.tool_calls[0],
      });
      expect(calls[1]).toEqual({
        id: "call_456",
        name: "client_search",
        args: { query: "hello" },
        raw: response.choices[0].message.tool_calls[1],
      });
    });

    it("should extract tool calls from Claude response shape", () => {
      const response = {
        content: [
          { type: "text", text: "I will use a tool" },
          {
            type: "tool_use",
            id: "toolu_123",
            name: "mcp__fs__read",
            input: { path: "/tmp/test" },
          },
        ],
      };

      const calls = extractToolCallsFromResponse(response, FORMATS.CLAUDE);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        id: "toolu_123",
        name: "mcp__fs__read",
        args: { path: "/tmp/test" },
        raw: response.content[1],
      });
    });

    it("should extract tool calls from Gemini response shape", () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    id: "fc_123",
                    name: "mcp__fs__read",
                    args: { path: "/tmp/test" },
                  },
                },
              ],
            },
          },
        ],
      };

      const calls = extractToolCallsFromResponse(response, FORMATS.GEMINI);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        id: "fc_123",
        name: "mcp__fs__read",
        args: { path: "/tmp/test" },
        raw: response.candidates[0].content.parts[0],
      });
    });

    it("should extract tool calls from Responses API response shape", () => {
      const response = {
        output: [
          {
            type: "function_call",
            call_id: "call_resp_123",
            name: "mcp__fs__read",
            arguments: JSON.stringify({ path: "/tmp/test" }),
          },
        ],
      };

      const calls = extractToolCallsFromResponse(response, FORMATS.OPENAI_RESPONSES);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        id: "call_resp_123",
        name: "mcp__fs__read",
        args: { path: "/tmp/test" },
        raw: response.output[0],
      });
    });

    it("should auto-detect format if format is omitted or generic", () => {
      const response = {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "c1",
                  function: { name: "mcp__a__b", arguments: "{}" },
                },
              ],
            },
          },
        ],
      };
      const calls = extractToolCallsFromResponse(response);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe("mcp__a__b");
    });

    it("should return empty array for responses without tool calls", () => {
      expect(extractToolCallsFromResponse(null)).toEqual([]);
      expect(extractToolCallsFromResponse({})).toEqual([]);
      expect(extractToolCallsFromResponse({ choices: [{ message: { content: "hi" } }] })).toEqual([]);
    });
  });

  describe("partitionToolCalls", () => {
    it("should partition mixed tool calls into mcpCalls and clientCalls", () => {
      const calls = [
        { id: "1", name: "mcp__server1__tool1", args: { a: 1 } },
        { id: "2", name: "client_tool", args: { b: 2 } },
        { id: "3", name: "mcp__server2__tool2", args: { c: 3 } },
      ];

      const { mcpCalls, clientCalls } = partitionToolCalls(calls);

      expect(mcpCalls).toHaveLength(2);
      expect(mcpCalls[0]).toEqual({
        id: "1",
        name: "mcp__server1__tool1",
        serverId: "server1",
        toolName: "tool1",
        args: { a: 1 },
      });
      expect(mcpCalls[1]).toEqual({
        id: "3",
        name: "mcp__server2__tool2",
        serverId: "server2",
        toolName: "tool2",
        args: { c: 3 },
      });

      expect(clientCalls).toHaveLength(1);
      expect(clientCalls[0]).toEqual({
        id: "2",
        name: "client_tool",
        args: { b: 2 },
      });
    });
  });
});
