import { describe, it, expect, vi } from "vitest";
import { runToolLoop } from "../../open-sse/mcp/toolLoop.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("mcp/toolLoop", () => {
  it("should exit on Turn 1 if no tool calls are returned", async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      rawResponse: { choices: [{ message: { content: "Hello world" } }] },
      parsedResponse: { choices: [{ message: { content: "Hello world" } }] },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const result = await runToolLoop({
      initialBody: { messages: [{ role: "user", content: "hi" }] },
      sourceFormat: FORMATS.OPENAI,
      executorFn: mockExecutor,
      processManager: {},
    });

    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(result.turnsExecuted).toBe(1);
    expect(result.finalResponse.choices[0].message.content).toBe("Hello world");
    expect(result.cumulativeUsage.total_tokens).toBe(15);
  });

  it("should exit on Turn 1 if only client-native tool calls are returned", async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      rawResponse: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: { name: "client_weather", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
      parsedResponse: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: { name: "client_weather", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const result = await runToolLoop({
      initialBody: { messages: [{ role: "user", content: "weather" }] },
      sourceFormat: FORMATS.OPENAI,
      executorFn: mockExecutor,
      processManager: {},
    });

    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(result.turnsExecuted).toBe(1);
    expect(result.isClientToolCall).toBe(true);
  });

  it("should execute 2 turns when MCP tool is called on Turn 1 and final answer on Turn 2", async () => {
    const mockProcessManager = {
      callServerTool: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "file content abc" }],
      }),
    };

    const mockExecutor = vi
      .fn()
      .mockResolvedValueOnce({
        rawResponse: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "call_mcp_1",
                    type: "function",
                    function: {
                      name: "mcp__fs__read_file",
                      arguments: JSON.stringify({ path: "/tmp/abc.txt" }),
                    },
                  },
                ],
              },
            },
          ],
        },
        parsedResponse: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "call_mcp_1",
                    type: "function",
                    function: {
                      name: "mcp__fs__read_file",
                      arguments: JSON.stringify({ path: "/tmp/abc.txt" }),
                    },
                  },
                ],
              },
            },
          ],
        },
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      })
      .mockResolvedValueOnce({
        rawResponse: {
          choices: [{ message: { content: "Here is the content: file content abc" } }],
        },
        parsedResponse: {
          choices: [{ message: { content: "Here is the content: file content abc" } }],
        },
        usage: { prompt_tokens: 35, completion_tokens: 15, total_tokens: 50 },
      });

    const result = await runToolLoop({
      initialBody: { messages: [{ role: "user", content: "read abc.txt" }] },
      sourceFormat: FORMATS.OPENAI,
      executorFn: mockExecutor,
      processManager: mockProcessManager,
    });

    expect(mockExecutor).toHaveBeenCalledTimes(2);
    expect(mockProcessManager.callServerTool).toHaveBeenCalledWith("fs", "read_file", {
      path: "/tmp/abc.txt",
    });
    expect(result.turnsExecuted).toBe(2);
    expect(result.finalResponse.choices[0].message.content).toBe("Here is the content: file content abc");
    expect(result.cumulativeUsage.total_tokens).toBe(80);
  });

  it("should cap at MAX_REACT_ITERATIONS and perform soft landing explanation turn", async () => {
    const mockProcessManager = {
      callServerTool: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "same result" }],
      }),
    };

    // Infinite tool calling loop
    const toolCallResponse = {
      rawResponse: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "loop_call",
                  type: "function",
                  function: { name: "mcp__loop__tool", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
      parsedResponse: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "loop_call",
                  type: "function",
                  function: { name: "mcp__loop__tool", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    const finalLandingResponse = {
      rawResponse: {
        choices: [{ message: { content: "Reached maximum iterations." } }],
      },
      parsedResponse: {
        choices: [{ message: { content: "Reached maximum iterations." } }],
      },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    const mockExecutor = vi.fn().mockImplementation(async (body, isIntermediate) => {
      if (isIntermediate) {
        return toolCallResponse;
      }
      return finalLandingResponse;
    });

    const result = await runToolLoop({
      initialBody: { messages: [{ role: "user", content: "loop" }] },
      sourceFormat: FORMATS.OPENAI,
      executorFn: mockExecutor,
      processManager: mockProcessManager,
    });

    // 10 intermediate turns calling tool + 1 final soft landing explanation turn
    expect(mockExecutor).toHaveBeenCalledTimes(11);
    expect(result.turnsExecuted).toBe(11);
    expect(result.finalResponse.choices[0].message.content).toBe("Reached maximum iterations.");
  });

  it("should handle tool execution failures gracefully and give LLM next turn to explain", async () => {
    const mockProcessManager = {
      callServerTool: vi.fn().mockRejectedValue(new Error("Database connection refused")),
    };

    const mockExecutor = vi
      .fn()
      .mockResolvedValueOnce({
        rawResponse: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "c_fail",
                    type: "function",
                    function: { name: "mcp__db__query", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        },
        parsedResponse: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "c_fail",
                    type: "function",
                    function: { name: "mcp__db__query", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        },
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
      .mockResolvedValueOnce({
        rawResponse: {
          choices: [
            { message: { content: "Failed to connect to database: Database connection refused" } },
          ],
        },
        parsedResponse: {
          choices: [
            { message: { content: "Failed to connect to database: Database connection refused" } },
          ],
        },
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      });

    const result = await runToolLoop({
      initialBody: { messages: [{ role: "user", content: "query db" }] },
      sourceFormat: FORMATS.OPENAI,
      executorFn: mockExecutor,
      processManager: mockProcessManager,
    });

    expect(mockExecutor).toHaveBeenCalledTimes(2);
    expect(result.finalResponse.choices[0].message.content).toContain(
      "Failed to connect to database"
    );
  });
});
