export const MAX_INJECTED_TOOLS = 30;
export const MCP_ACTIVATION_MODE = Object.freeze({
  AUTO: "auto",
  ALWAYS: "always",
  DISABLED: "disabled",
});
export const MCP_SEARCH_CONFIG = Object.freeze({
  MIN_SCORE_THRESHOLD: 1.2,
  MAX_INJECTED_TOOLS_DEFAULT: 5,
  MAX_INJECTED_SKILLS_DEFAULT: 3,
  BOOST: {
    triggers: 4.0,
    keywords: 3.0,
    name: 2.0,
    description: 1.0,
  },
});
export const MCP_SERVERS_HEADER = "x-mcp-servers";
export const MCP_SELECTION_REASON = Object.freeze({
  INVALID_INPUT: "invalid-input",
  NO_MATCH: "no-match",
  SELECTED: "selected",
});
export const MCP_SKILLS_GATEWAY_MARKER = "<!-- 9router:mcp-skills -->";
export const MCP_SKILLS_XML_OPEN = "<skills>";
export const MCP_SKILLS_XML_CLOSE = "</skills>";
export const MCP_SYSTEM_PROMPT_SEPARATOR = "\n\n";
export const MAX_REACT_ITERATIONS = 10;
export const MCP_TOOL_PREFIX = "mcp__";
