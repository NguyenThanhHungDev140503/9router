import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  events,
  executeMock,
  callServerToolMock,
} = vi.hoisted(() => ({
  events: [],
  executeMock: vi.fn(),
  callServerToolMock: vi.fn(),
}));

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn().mockResolvedValue(true),
  saveRequestDetail: vi.fn().mockResolvedValue(true),
  saveRequestUsage: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../src/lib/db/repos/mcpRepo.js", () => ({
  getEnabledMcpServers: vi.fn().mockResolvedValue([]),
  getAllMcpToolsCache: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/lib/db/repos/skillsRepo.js", () => ({
  getEnabledSkills: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../open-sse/services/provider.js", async () => {
  const actual = await vi.importActual("../../open-sse/services/provider.js");
  return {
    ...actual,
    detectFormat: vi.fn(() => "openai"),
    getTargetFormat: vi.fn(() => "openai"),
    resolveTransport: vi.fn(() => null),
  };
});

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: vi.fn(() => ({
    execute: executeMock,
  })),
}));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";

describe("mcp/chatCoreIntegration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events.length = 0;
  });

  it("should run multi-turn ReAct loop through chatCore when MCP tool is returned", async () => {
    const mockProcessManager = {
      callServerTool: callServerToolMock.mockResolvedValue({
        content: [{ type: "text", text: "result from mcp tool" }],
      }),
    };

    // Turn 1: returns MCP tool call (non-streaming)
    // Turn 2: returns final response (non-streaming)
    executeMock
      .mockResolvedValueOnce({
        response: new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      id: "call_turn1",
                      type: "function",
                      function: {
                        name: "mcp__fs__read",
                        arguments: JSON.stringify({ path: "/tmp/foo" }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
        transformedBody: {},
      })
      .mockResolvedValueOnce({
        response: new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Final output with tool result: result from mcp tool",
                },
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
        transformedBody: {},
      });

    const result = await handleChatCore({
      body: {
        model: "groq/llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "read /tmp/foo" }],
        tools: [
          {
            type: "function",
            function: {
              name: "mcp__fs__read",
              parameters: {},
            },
          },
        ],
        stream: false,
      },
      modelInfo: { provider: "groq", model: "llama-3.3-70b-versatile" },
      credentials: { apiKey: "test-key" },
      processManager: mockProcessManager,
    });

    expect(result.success).toBe(true);
    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(callServerToolMock).toHaveBeenCalledWith("fs", "read", { path: "/tmp/foo" });

    const json = await result.response.json();
    expect(json.choices[0].message.content).toContain("Final output with tool result");
  });

  it("should stream final turn when client requests stream: true (Silent Buffering intermediate turns)", async () => {
    const mockProcessManager = {
      callServerTool: callServerToolMock.mockResolvedValue({
        content: [{ type: "text", text: "buffered result" }],
      }),
    };

    // Create a mock stream for turn 2 streaming
    const sseStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Streamed"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    // Turn 1 (buffered probe): returns MCP tool call
    // Turn 2 (buffered probe): returns text without tool calls
    // Turn 2 (streaming execution): returns SSE stream
    executeMock
      .mockResolvedValueOnce({
        response: new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      id: "call_turn1",
                      type: "function",
                      function: {
                        name: "mcp__fs__read",
                        arguments: JSON.stringify({ path: "/tmp/foo" }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
        transformedBody: {},
      })
      .mockResolvedValueOnce({
        response: new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Final answer text",
                },
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
        transformedBody: {},
      })
      .mockResolvedValueOnce({
        response: new Response(sseStream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
        transformedBody: {},
      });

    const result = await handleChatCore({
      body: {
        model: "groq/llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "read /tmp/foo" }],
        tools: [
          {
            type: "function",
            function: {
              name: "mcp__fs__read",
              parameters: {},
            },
          },
        ],
        stream: true,
      },
      modelInfo: { provider: "groq", model: "llama-3.3-70b-versatile" },
      credentials: { apiKey: "test-key" },
      processManager: mockProcessManager,
    });

    expect(result.success).toBe(true);
    expect(executeMock).toHaveBeenCalledTimes(3);
    // Turn 1 stream parameter was false (Silent Buffering)
    expect(executeMock.mock.calls[0][0].stream).toBe(false);
    // Turn 2 probe stream parameter was false
    expect(executeMock.mock.calls[1][0].stream).toBe(false);
    // Turn 2 final stream parameter was true (Final Turn Streaming)
    expect(executeMock.mock.calls[2][0].stream).toBe(true);
    expect(result.response.headers.get("content-type")).toContain("text/event-stream");
  });
});
