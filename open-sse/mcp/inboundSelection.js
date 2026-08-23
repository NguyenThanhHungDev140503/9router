import {
  MAX_INJECTED_TOOLS,
  MCP_ACTIVATION_MODE,
  MCP_SELECTION_REASON,
  MCP_SERVERS_HEADER,
} from "../config/mcpConstants.js";
import { FORMATS } from "../translator/formats.js";

const VALID_MODES = new Set(Object.values(MCP_ACTIVATION_MODE));

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

function selectedByMode(candidate, normalizedPrompt, rules) {
  const mode = modeFrom(candidate, rules);
  return mode === MCP_ACTIVATION_MODE.ALWAYS
    || (mode === MCP_ACTIVATION_MODE.AUTO && lexicalMatch(normalizedPrompt, candidate, rules));
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

function selectTools(servers, toolCache, allowedServerIds, normalizedPrompt) {
  const selected = [];
  const cacheByServer = createCacheByServer(toolCache);

  for (const server of servers) {
    if (!isPlainObject(server) || server.enabled !== true || typeof server.id !== "string") continue;
    if (allowedServerIds && !allowedServerIds.has(server.id)) continue;
    if (!selectedByMode(server, normalizedPrompt)) continue;

    for (const row of cacheByServer.get(server.id) || []) {
      for (const tool of row.tools) {
        if (!isPlainObject(tool) || selected.length >= MAX_INJECTED_TOOLS) continue;
        selected.push({ serverId: server.id, tool });
      }
    }
  }

  return selected;
}

function selectSkills(skills, normalizedPrompt) {
  if (!Array.isArray(skills)) return [];

  return skills.filter((skill) => (
    isPlainObject(skill)
    && skill.enabled !== false
    && isPlainObject(skill.matchRules)
    && selectedByMode(skill, normalizedPrompt, skill.matchRules)
  ));
}

export function selectInboundMcp({
  format,
  body,
  servers,
  toolCache,
  skills,
  headers,
} = {}) {
  try {
    if (!isPlainObject(body) || !Array.isArray(servers) || !Array.isArray(toolCache) || !Array.isArray(skills)) {
      return { tools: [], skills: [], reason: MCP_SELECTION_REASON.INVALID_INPUT };
    }

    const allowedServerIds = parseAllowedServerIds(headers);
    if (allowedServerIds === undefined) {
      return { tools: [], skills: [], reason: MCP_SELECTION_REASON.INVALID_INPUT };
    }

    const normalizedPrompt = normalizeText(extractUserPromptText(format, body));
    const tools = selectTools(servers, toolCache, allowedServerIds, normalizedPrompt);
    const selectedSkills = selectSkills(skills, normalizedPrompt);
    const reason = tools.length === 0 && selectedSkills.length === 0
      ? MCP_SELECTION_REASON.NO_MATCH
      : MCP_SELECTION_REASON.SELECTED;

    return { tools, skills: selectedSkills, reason };
  } catch {
    return { tools: [], skills: [], reason: MCP_SELECTION_REASON.INVALID_INPUT };
  }
}
