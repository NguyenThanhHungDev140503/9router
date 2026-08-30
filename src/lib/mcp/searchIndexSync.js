import { globalToolIndex } from "../../../open-sse/mcp/search/toolIndex.js";

/**
 * Triggers an asynchronous invalidation of the in-memory search index views.
 * Fail-safe: catches and logs any errors via console.warn without throwing.
 */
export async function triggerSearchIndexRebuild() {
  try {
    if (globalToolIndex && typeof globalToolIndex.clear === "function") {
      globalToolIndex.clear();
    }
  } catch (err) {
    console.warn("[MCP_SEARCH_INDEX] Failed to rebuild search index:", err?.message || err);
  }
}
