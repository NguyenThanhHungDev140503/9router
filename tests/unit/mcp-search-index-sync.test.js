import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/repos/mcpRepo", () => ({
  getEnabledMcpServers: vi.fn(),
  getAllMcpToolsCache: vi.fn(),
}));

vi.mock("@/lib/db/repos/skillsRepo", () => ({
  getEnabledSkills: vi.fn(),
}));

import { triggerSearchIndexRebuild } from "@/lib/mcp/searchIndexSync";
import { getEnabledMcpServers, getAllMcpToolsCache } from "@/lib/db/repos/mcpRepo";
import { getEnabledSkills } from "@/lib/db/repos/skillsRepo";
import { globalToolIndex } from "../../open-sse/mcp/search/toolIndex.js";

describe("searchIndexSync", () => {
  let buildIndexSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    buildIndexSpy = vi.spyOn(globalToolIndex, "buildIndex").mockImplementation(() => {});
  });


  it("loads servers, tools cache, and skills then calls globalToolIndex.buildIndex", async () => {
    const servers = [{ id: "srv-1", name: "fetch", enabled: true }];
    const toolCache = [{ serverId: "srv-1", tools: [{ name: "get" }] }];
    const skills = [{ id: "sk-1", name: "test-skill", enabled: true }];

    getEnabledMcpServers.mockResolvedValue(servers);
    getAllMcpToolsCache.mockResolvedValue(toolCache);
    getEnabledSkills.mockResolvedValue(skills);

    await triggerSearchIndexRebuild();

    expect(getEnabledMcpServers).toHaveBeenCalledTimes(1);
    expect(getAllMcpToolsCache).toHaveBeenCalledTimes(1);
    expect(getEnabledSkills).toHaveBeenCalledTimes(1);
    expect(buildIndexSpy).toHaveBeenCalledWith({
      servers,
      toolCache,
      skills,
    });
  });

  it("is fail-safe and logs warning when repository call fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getEnabledMcpServers.mockRejectedValue(new Error("DB error"));

    await expect(triggerSearchIndexRebuild()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "[MCP_SEARCH_INDEX] Failed to rebuild search index:",
      "DB error"
    );
    warnSpy.mockRestore();
  });
});
