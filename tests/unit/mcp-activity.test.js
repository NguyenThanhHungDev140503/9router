import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { getProcessManager, McpProcessManager } from "../../src/lib/mcp/processManager.js";

describe("Mcp Activity & Logging System", () => {
  it("tracks tool execution in activity logs", async () => {
    const pm = new McpProcessManager();
    pm.logActivity({
      serverId: "srv-test-1",
      serverName: "test-server",
      toolName: "fetch_data",
      args: { query: "hello" },
      isError: false,
      durationMs: 42,
      result: { data: "ok" },
    });

    const logs = pm.getActivityLogs({ serverId: "srv-test-1" });
    assert.ok(logs.length >= 1, "Should have logged activity");
    assert.equal(logs[0].toolName, "fetch_data");
    assert.equal(logs[0].isError, false);
    assert.equal(logs[0].durationMs, 42);
  });

  it("filters activity logs by serverId and limits results", async () => {
    const pm = new McpProcessManager();
    for (let i = 0; i < 10; i++) {
      pm.logActivity({
        serverId: i % 2 === 0 ? "srv-even" : "srv-odd",
        toolName: `tool_${i}`,
        isError: i % 3 === 0,
      });
    }

    const evenLogs = pm.getActivityLogs({ serverId: "srv-even" });
    assert.equal(evenLogs.length, 5);

    const limitedLogs = pm.getActivityLogs({ limit: 3 });
    assert.equal(limitedLogs.length, 3);
  });
});
