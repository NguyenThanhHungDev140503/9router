import {
  getAllMcpToolsCache,
  getEnabledMcpServers,
} from "../../src/lib/db/repos/mcpRepo.js";
import { getEnabledSkills } from "../../src/lib/db/repos/skillsRepo.js";
import { MCP_SELECTION_REASON } from "../config/mcpConstants.js";
import { createFormatInjector } from "./injector.js";
import { selectInboundMcp } from "./inboundSelection.js";
import { injectSkillsPrompt } from "./skillPromptInjector.js";
import { globalToolIndex } from "./search/toolIndex.js";

function countRows(value) {
  return Array.isArray(value) ? value.length : 0;
}

function logFailure(log, reason, { servers, toolCache, skills } = {}) {
  log?.warn?.("MCP_INJECTION", {
    reason,
    enabledServerCount: countRows(servers),
    toolCacheCount: countRows(toolCache),
    skillCount: countRows(skills),
  });
}

/**
 * Apply configured MCP tools and skills to one client-native request body.
 *
 * This is the request-flow fail-open boundary. It only reads enabled
 * configuration and cached tool schemas; it never starts processes or calls
 * tools. Any failure returns the exact caller-owned body reference.
 */
export async function applyInboundInjection({
  body,
  sourceFormat,
  headers,
  log,
} = {}) {
  let servers;
  let toolCache;
  let skills;

  try {
    [servers, toolCache, skills] = await Promise.all([
      getEnabledMcpServers(),
      getAllMcpToolsCache(),
      getEnabledSkills(),
    ]);
  } catch {
    logFailure(log, MCP_SELECTION_REASON.INVALID_INPUT);
    return body;
  }

  try {
    const selection = selectInboundMcp({
      format: sourceFormat,
      body,
      servers,
      toolCache,
      skills,
      headers,
      indexManager: globalToolIndex,
    });

    if (selection.tools.length === 0 && selection.skills.length === 0) return body;

    let injectedBody = body;
    if (selection.tools.length > 0) {
      const selectedToolRows = selection.tools.map(({ serverId, tool }) => ({
        serverId,
        tools: [tool],
      }));
      injectedBody = createFormatInjector(sourceFormat).inject(injectedBody, selectedToolRows);
    }
    if (selection.skills.length > 0) {
      injectedBody = injectSkillsPrompt(sourceFormat, injectedBody, selection.skills);
    }

    return injectedBody;
  } catch {
    logFailure(log, MCP_SELECTION_REASON.INVALID_INPUT, { servers, toolCache, skills });
    return body;
  }
}
