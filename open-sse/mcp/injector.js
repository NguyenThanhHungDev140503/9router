import { FORMATS } from "../translator/formats.js";
import { BaseFormatInjector } from "./injectors/baseFormatInjector.js";
import { ClaudeInjector } from "./injectors/claudeInjector.js";
import { GeminiInjector } from "./injectors/geminiInjector.js";
import { OpenAiInjector } from "./injectors/openAiInjector.js";
import { ResponsesInjector } from "./injectors/responsesInjector.js";

const OPENAI_COMPATIBLE_FORMATS = new Set([
  FORMATS.OPENAI,
  FORMATS.ANTIGRAVITY,
  FORMATS.OLLAMA,
  "deepseek",
  "groq",
  "mistral",
]);

const EMPTY_OBJECT_SCHEMA = Object.freeze({
  type: "object",
  properties: {},
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]));
}

function sanitizedSegment(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function namespaceToolName(serverId, toolName) {
  const server = sanitizedSegment(serverId);
  const tool = sanitizedSegment(toolName);
  return server && tool ? `mcp__${server}__${tool}` : null;
}

export function minifyToolSchema(schema) {
  if (!isPlainObject(schema)) return cloneJsonValue(EMPTY_OBJECT_SCHEMA);

  function minify(value) {
    if (Array.isArray(value)) return value.map(minify);
    if (!isPlainObject(value)) return value;

    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (
        key === "$schema" ||
        key === "$comment" ||
        key === "title" ||
        key === "examples" ||
        key === "example" ||
        key === "deprecated" ||
        key === "readOnly" ||
        key === "writeOnly" ||
        key.startsWith("x-")
      ) {
        continue;
      }
      result[key] = minify(child);
    }
    return result;
  }

  return minify(schema);
}

function extractClientToolNames(tools) {
  const names = new Set();

  for (const tool of tools) {
    if (!isPlainObject(tool)) continue;
    if (typeof tool.function?.name === "string") names.add(tool.function.name);
    if (typeof tool.name === "string") names.add(tool.name);
    if (Array.isArray(tool.functionDeclarations)) {
      for (const declaration of tool.functionDeclarations) {
        if (typeof declaration?.name === "string") names.add(declaration.name);
      }
    }
  }

  return names;
}

function cachedToolCandidates(cachedTools) {
  return cachedTools.flatMap((entry) => {
    if (!isPlainObject(entry)) return [];
    if (Array.isArray(entry.tools)) {
      return entry.tools.map((tool) => ({ serverId: entry.serverId, tool }));
    }
    return [{ serverId: entry.serverId, tool: entry }];
  });
}

function normalizeCandidates(cachedTools, clientToolNames) {
  const seenNames = new Set();

  return cachedToolCandidates(cachedTools).flatMap(({ serverId, tool }) => {
    if (!isPlainObject(tool)) return [];
    const name = namespaceToolName(serverId, tool.name);
    if (!name || seenNames.has(name) || clientToolNames.has(name)) return [];

    seenNames.add(name);
    return [{
      name,
      description: typeof tool.description === "string" ? tool.description : "",
      parameters: minifyToolSchema(tool.inputSchema),
    }];
  });
}

const injectorOptions = {
  normalizeCandidates,
  getClientToolNames: extractClientToolNames,
};

export function createFormatInjector(format) {
  if (format === FORMATS.CLAUDE) return new ClaudeInjector(injectorOptions);
  if (format === FORMATS.GEMINI) return new GeminiInjector(injectorOptions);
  if (format === FORMATS.OPENAI_RESPONSES || format === FORMATS.OPENAI_RESPONSE) {
    return new ResponsesInjector(injectorOptions);
  }
  if (OPENAI_COMPATIBLE_FORMATS.has(format)) return new OpenAiInjector(injectorOptions);
  return new OpenAiInjector(injectorOptions);
}

export { BaseFormatInjector };
