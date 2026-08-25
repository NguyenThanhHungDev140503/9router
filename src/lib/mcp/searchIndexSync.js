import { globalToolIndex } from "../../../open-sse/mcp/search/toolIndex.js";
import { getEnabledMcpServers, getAllMcpToolsCache } from "../db/repos/mcpRepo.js";
import { getEnabledSkills } from "../db/repos/skillsRepo.js";

/**
 * Triggers an asynchronous rebuild of the global in-memory tool & skill search index.
 * Fail-safe: catches and logs any errors via console.warn without throwing.
 */
export async function triggerSearchIndexRebuild() {
  try {
    const [servers, toolCache, skills] = await Promise.all([
      getEnabledMcpServers(),
      getAllMcpToolsCache(),
      getEnabledSkills(),
    ]);

    globalToolIndex.buildIndex({
      servers,
      toolCache,
      skills,
    });
  } catch (err) {
    console.warn("[MCP_SEARCH_INDEX] Failed to rebuild search index:", err?.message || err);
  }
}
