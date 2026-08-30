import { describe, it, expect, vi } from "vitest";
import { executeToolCalls } from "../../open-sse/mcp/toolExecutor.js";
import { accumulateUsage, createZeroUsage } from "../../open-sse/mcp/usageAccumulator.js";

describe("mcp/toolExecutor", () => {
  it("should execute multiple tool calls in parallel using processManager", async () => {
    const mockProcessManager = {
      callServerTool: vi.fn().mockImplementation(async (serverId, toolName, args) => {
        if (toolName === "read") return { content: [{ type: "text", text: "read result" }] };
        if (toolName === "write") return { content: [{ type: "text", text: "write result" }] };
        throw new Error("unexpected tool");
      }),
    };

    const toolCalls = [
      { id: "call_1", name: "mcp__fs__read", serverId: "fs", toolName: "read", args: { path: "a" } },
      { id: "call_2", name: "mcp__fs__write", serverId: "fs", toolName: "write", args: { path: "b" } },
    ];

    const results = await executeToolCalls(mockProcessManager, toolCalls);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      toolCallId: "call_1",
      name: "mcp__fs__read",
      content: "read result",
      isError: false,
    });
    expect(results[1]).toEqual({
      toolCallId: "call_2",
      name: "mcp__fs__write",
      content: "write result",
      isError: false,
    });
    expect(mockProcessManager.callServerTool).toHaveBeenCalledTimes(2);
  });

  it("should trap execution errors and return soft error messages instead of throwing", async () => {
    const mockProcessManager = {
      callServerTool: vi.fn().mockRejectedValue(new Error("Server crashed or tool not found")),
    };

    const toolCalls = [
      { id: "call_err", name: "mcp__db__query", serverId: "db", toolName: "query", args: {} },
    ];

    const results = await executeToolCalls(mockProcessManager, toolCalls);

    expect(results).toHaveLength(1);
    expect(results[0].isError).toBe(true);
    expect(results[0].content).toContain("Error executing tool mcp__db__query");
    expect(results[0].content).toContain("Server crashed or tool not found");
  });

  it("passes userId, isAdmin, allowedServerIds into callServerTool", async () => {
    const mockProcessManager = {
      callServerTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] }),
    };

    const toolCalls = [
      { id: "call_1", name: "mcp__fs__read", serverId: "fs", toolName: "read", args: { path: "a" } },
    ];
    const meta = { userId: "user-1", isAdmin: false, allowedServerIds: new Set(["fs"]) };

    await executeToolCalls(mockProcessManager, toolCalls, meta);

    expect(mockProcessManager.callServerTool).toHaveBeenCalledWith(
      "fs",
      "read",
      { path: "a" },
      meta
    );
  });
});

describe("mcp/usageAccumulator", () => {
  it("should accumulate token usage correctly across multiple turns", () => {
    const total = createZeroUsage();
    expect(total).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });

    const turn1 = {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
      },
    };

    const turn2 = {
      usage: {
        input_tokens: 150,
        output_tokens: 30,
      },
    };

    accumulateUsage(total, turn1.usage);
    expect(total).toEqual({
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
    });

    accumulateUsage(total, turn2.usage);
    expect(total).toEqual({
      prompt_tokens: 250,
      completion_tokens: 50,
      total_tokens: 300,
    });
  });
});
