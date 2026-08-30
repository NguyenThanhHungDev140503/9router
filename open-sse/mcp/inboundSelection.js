import {
  MAX_INJECTED_TOOLS,
  MCP_ACTIVATION_MODE,
  MCP_SEARCH_CONFIG,
  MCP_SELECTION_REASON,
  MCP_SERVERS_HEADER,
} from "../config/mcpConstants.js";
import { FORMATS } from "../translator/formats.js";
import { matchExplicitMentions } from "./search/explicitMatcher.js";
import { globalToolIndex } from "./search/toolIndex.js";
import { ToolIndexManager } from "./search/toolIndex.js";

const VALID_MODES = new Set(Object.values(MCP_ACTIVATION_MODE));
const SKILL_MENTION_REGEX = /\$([a-zA-Z0-9_-]+)/g;
const SERVER_MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    : "";
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content.map((item) => {
    if (!isPlainObject(item)) return "";
    return typeof item.text === "string" ? item.text : "";
  }).filter(Boolean).join(" ");
}

function extractOpenAiText(body) {
  if (!Array.isArray(body.messages)) return "";
  return body.messages
    .filter((message) => isPlainObject(message) && message.role === "user")
    .map((message) => textFromContent(message.content))
    .filter(Boolean)
    .join(" ");
}

function extractGeminiText(body) {
  if (!Array.isArray(body.contents)) return "";
  return body.contents
    .filter((message) => isPlainObject(message) && message.role === "user")
    .flatMap((message) => Array.isArray(message.parts) ? message.parts : [])
    .map((part) => isPlainObject(part) && typeof part.text === "string" ? part.text : "")
    .filter(Boolean)
    .join(" ");
}

function extractResponsesText(body) {
  if (typeof body.input === "string") return body.input;
  if (!Array.isArray(body.input)) return "";

  return body.input
    .filter((item) => isPlainObject(item) && (item.type === "message" || item.role) && item.role === "user")
    .map((item) => textFromContent(item.content))
    .filter(Boolean)
    .join(" ");
}

export function extractUserPromptText(format, body) {
  if (!isPlainObject(body)) return "";
  if (format === FORMATS.GEMINI || format === FORMATS.GEMINI_CLI) return extractGeminiText(body);
  if (format === FORMATS.OPENAI_RESPONSES || format === FORMATS.OPENAI_RESPONSE) {
    return extractResponsesText(body);
  }
  return extractOpenAiText(body);
}

function modeFrom(candidate, rules = candidate?.matchRules) {
  const configured = candidate?.activationMode ?? candidate?.mode ?? rules?.mode;
  return VALID_MODES.has(configured) ? configured : MCP_ACTIVATION_MODE.AUTO;
}

function configuredTriggers(candidate, rules = candidate?.matchRules) {
  const sources = [
    candidate?.triggers,
    candidate?.keywords,
    rules?.triggers,
    rules?.keywords,
  ];
  const terms = sources.flatMap((source) => Array.isArray(source) ? source : []);

  if (typeof candidate?.name === "string") terms.push(candidate.name);
  if (typeof candidate?.description === "string") terms.push(candidate.description);

  return terms.map(normalizeText).filter(Boolean);
}

function lexicalMatch(normalizedPrompt, candidate, rules) {
  if (!normalizedPrompt) return false;
  return configuredTriggers(candidate, rules).some((term) => normalizedPrompt.includes(term));
}

function parseAllowedServerIds(headers) {
  if (headers == null) return null;

  let rawHeader;
  if (typeof headers.get === "function") {
    rawHeader = headers.get(MCP_SERVERS_HEADER);
  } else if (isPlainObject(headers)) {
    const key = Object.keys(headers).find((header) => header.toLocaleLowerCase() === MCP_SERVERS_HEADER);
    rawHeader = key ? headers[key] : undefined;
  } else {
    return undefined;
  }

  if (rawHeader == null) return null;
  if (typeof rawHeader !== "string") return undefined;

  return new Set(rawHeader
    .split(",")
    .map((serverId) => serverId.trim())
    .filter((serverId) => /^[A-Za-z0-9_-]+$/.test(serverId)));
}

function createCacheByServer(toolCache) {
  const cacheByServer = new Map();
  if (!Array.isArray(toolCache)) return cacheByServer;

  for (const row of toolCache) {
    if (!isPlainObject(row) || typeof row.serverId !== "string" || !Array.isArray(row.tools)) continue;
    const rows = cacheByServer.get(row.serverId) || [];
    rows.push(row);
    cacheByServer.set(row.serverId, rows);
  }
  return cacheByServer;
}

export function selectInboundMcp({
  format,
  body,
  servers = [],
  toolCache = [],
  skills = [],
  headers,
  indexManager,
} = {}) {
  try {
    if (!isPlainObject(body) || !Array.isArray(servers) || !Array.isArray(toolCache) || !Array.isArray(skills)) {
      return {
        tools: [],
        skills: [],
        allowedServerIds: new Set(),
        diagnostics: [],
        reason: MCP_SELECTION_REASON.INVALID_INPUT,
      };
    }

    const headerAllowedServerIds = parseAllowedServerIds(headers);
    if (headerAllowedServerIds === undefined) {
      return {
        tools: [],
        skills: [],
        allowedServerIds: new Set(),
        diagnostics: [],
        reason: MCP_SELECTION_REASON.INVALID_INPUT,
      };
    }

    const rawPrompt = extractUserPromptText(format, body);
    const normalizedPrompt = normalizeText(rawPrompt);

    // 1. Filter enabled servers respecting headerAllowedServerIds
    const enabledServers = servers.filter((s) => (
      isPlainObject(s)
      && s.enabled === true
      && typeof s.id === "string"
      && (!headerAllowedServerIds || headerAllowedServerIds.has(s.id))
    ));
    const enabledServerIds = new Set(enabledServers.map((s) => s.id));
    const cacheByServer = createCacheByServer(toolCache);

    // Diagnostics collection for explicit mentions
    const diagnostics = [];
    const serverMentions = [...rawPrompt.matchAll(SERVER_MENTION_REGEX)].map((m) => m[1]);
    for (const mention of serverMentions) {
      const lower = mention.toLocaleLowerCase();
      const candidate = servers.find(
        (s) => s?.name?.toLocaleLowerCase() === lower || s?.id?.toLocaleLowerCase() === lower
      );
      if (!candidate) {
        diagnostics.push({ target: mention, type: "server", reason: "server_not_found" });
      } else if (candidate.enabled === false) {
        diagnostics.push({ target: mention, type: "server", reason: "server_disabled" });
      } else if (headerAllowedServerIds && !headerAllowedServerIds.has(candidate.id)) {
        diagnostics.push({ target: mention, type: "server", reason: "server_unauthorized" });
      } else {
        const rows = cacheByServer.get(candidate.id) || [];
        const tools = rows.flatMap((r) => r.tools || []);
        if (tools.length === 0) {
          diagnostics.push({ target: mention, type: "server", reason: "server_no_cached_tools" });
        } else if (!tools.every((t) => isPlainObject(t) && typeof t.name === "string")) {
          diagnostics.push({ target: mention, type: "server", reason: "server_tools_invalid" });
        }
      }
    }

    const skillMentions = [...rawPrompt.matchAll(SKILL_MENTION_REGEX)].map((m) => m[1]);
    for (const mention of skillMentions) {
      const lower = mention.toLocaleLowerCase();
      const candidate = skills.find(
        (s) => s?.name?.toLocaleLowerCase() === lower || s?.id?.toLocaleLowerCase() === lower
      );
      if (!candidate) {
        diagnostics.push({ target: mention, type: "skill", reason: "skill_not_found" });
      } else if (candidate.enabled === false) {
        diagnostics.push({ target: mention, type: "skill", reason: "skill_disabled" });
      }
    }

    // 2. Filter enabled skills
    const enabledSkills = skills.filter((s) => (
      isPlainObject(s)
      && s.enabled !== false
      && (!isPlainObject(s.matchRules) || s.matchRules.mode !== MCP_ACTIVATION_MODE.DISABLED)
      && modeFrom(s, s.matchRules) !== MCP_ACTIVATION_MODE.DISABLED
    ));

    // 3. Match explicit fast-path mentions (@server, $skill)
    const explicitMatches = matchExplicitMentions(rawPrompt, {
      servers: enabledServers,
      skills: enabledSkills,
    });

    // 4. Collect ALWAYS & fast-path matches
    const selectedTools = [];
    const selectedToolKeys = new Set();
    const selectedSkills = [];
    const selectedSkillKeys = new Set();

    function addTool(serverId, tool) {
      if (!isPlainObject(tool) || !tool.name || selectedTools.length >= MCP_SEARCH_CONFIG.MAX_INJECTED_TOOLS_DEFAULT) return;
      const key = `${serverId}:${tool.name}`;
      if (selectedToolKeys.has(key)) return;
      selectedToolKeys.add(key);
      selectedTools.push({ serverId, tool });
    }

    function addSkill(skill) {
      if (!isPlainObject(skill) || !skill.name || selectedSkills.length >= MCP_SEARCH_CONFIG.MAX_INJECTED_SKILLS_DEFAULT) return;
      const key = skill.id || skill.name;
      if (selectedSkillKeys.has(key)) return;
      selectedSkillKeys.add(key);
      selectedSkills.push(skill);
    }

    // Explicit @server mentions
    for (const server of explicitMatches.servers) {
      for (const row of cacheByServer.get(server.id) || []) {
        for (const tool of row.tools) {
          addTool(server.id, tool);
        }
      }
    }

    // Explicit $skill mentions
    for (const skill of explicitMatches.skills) {
      addSkill(skill);
    }

    // 5. BM25 search for AUTO candidates
    const autoServers = enabledServers.filter((s) => modeFrom(s) === MCP_ACTIVATION_MODE.AUTO);
    const autoSkills = enabledSkills.filter((s) => modeFrom(s, s.matchRules) === MCP_ACTIVATION_MODE.AUTO);

    let searchTools = [];
    let searchSkills = [];

    if (rawPrompt && (autoServers.length > 0 || autoSkills.length > 0)) {
      const activeIndex = indexManager || new ToolIndexManager();
      if (!activeIndex.index) {
        activeIndex.buildIndex({
          servers: indexManager ? enabledServers : autoServers,
          toolCache,
          skills: indexManager ? enabledSkills : autoSkills,
        });
      }

      const searchResults = activeIndex.search(rawPrompt);
      for (const item of searchResults) {
        if (item.type === "tool" && item.serverId && item.raw) {
          searchTools.push({ serverId: item.serverId, tool: item.raw });
        } else if (item.type === "skill" && item.raw) {
          searchSkills.push(item.raw);
        }
      }

      // Fallback for lexical triggers on auto servers & auto skills when simple trigger matches
      for (const server of autoServers) {
        if (lexicalMatch(normalizedPrompt, server)) {
          for (const row of cacheByServer.get(server.id) || []) {
            for (const tool of row.tools) {
              searchTools.push({ serverId: server.id, tool });
            }
          }
        }
      }

      for (const skill of autoSkills) {
        if (lexicalMatch(normalizedPrompt, skill, skill.matchRules)) {
          searchSkills.push(skill);
        }
      }
    }

    // Maintain order according to enabledServers:
    for (const server of enabledServers) {
      if (modeFrom(server) === MCP_ACTIVATION_MODE.ALWAYS) {
        for (const row of cacheByServer.get(server.id) || []) {
          for (const tool of row.tools) {
            addTool(server.id, tool);
          }
        }
      } else if (modeFrom(server) === MCP_ACTIVATION_MODE.AUTO) {
        for (const { serverId, tool } of searchTools) {
          if (serverId === server.id) {
            addTool(serverId, tool);
          }
        }
      }
    }

    for (const skill of enabledSkills) {
      if (modeFrom(skill, skill.matchRules) === MCP_ACTIVATION_MODE.ALWAYS) {
        addSkill(skill);
      } else if (modeFrom(skill, skill.matchRules) === MCP_ACTIVATION_MODE.AUTO) {
        for (const s of searchSkills) {
          if ((s.id && s.id === skill.id) || s.name === skill.name) {
            addSkill(s);
          }
        }
      }
    }

    const reason = selectedTools.length === 0 && selectedSkills.length === 0
      ? MCP_SELECTION_REASON.NO_MATCH
      : MCP_SELECTION_REASON.SELECTED;

    return {
      tools: selectedTools,
      skills: selectedSkills,
      allowedServerIds: enabledServerIds,
      diagnostics,
      reason,
    };
  } catch {
    return {
      tools: [],
      skills: [],
      allowedServerIds: new Set(),
      diagnostics: [],
      reason: MCP_SELECTION_REASON.INVALID_INPUT,
    };
  }
}
