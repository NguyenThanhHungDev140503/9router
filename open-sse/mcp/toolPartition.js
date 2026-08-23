import { MCP_TOOL_PREFIX } from "../config/mcpConstants.js";
import { FORMATS } from "../translator/formats.js";

/**
 * Safely parse tool arguments to object.
 * Returns raw input if string is not valid JSON, or empty object if nullish.
 */
function parseToolArguments(args) {
  if (args == null) return {};
  if (typeof args === "object") return args;
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return args;
    }
  }
  return args;
}

/**
 * Parse namespaced tool name (mcp__{serverId}__{toolName}) into components.
 * Returns { serverId, toolName } or null if not a valid namespaced name.
 */
export function parseNamespacedToolName(name) {
  if (!name || typeof name !== "string") return null;
  if (!name.startsWith(MCP_TOOL_PREFIX)) return null;

  const parts = name.split("__");
  // Expected parts: ["mcp", serverId, ...toolNameParts]
  if (parts.length < 3) return null;
  if (parts[0] !== "mcp") return null;

  const serverId = parts[1];
  const toolName = parts.slice(2).join("__");

  if (!serverId || !toolName) return null;

  return { serverId, toolName };
}

/**
 * Check if a tool name is a valid MCP namespaced tool.
 */
export function isMcpToolName(name) {
  return parseNamespacedToolName(name) !== null;
}

/**
 * Extract normalized tool calls from an upstream non-streaming LLM response.
 * Supports OpenAI, Claude, Gemini, and OpenAI Responses API formats.
 *
 * Output normalized format:
 * Array<{ id: string, name: string, args: any, raw: any }>
 */
export function extractToolCallsFromResponse(response, sourceFormat) {
  if (!response || typeof response !== "object") return [];

  const calls = [];

  // OpenAI format: choices[0].message.tool_calls
  if (
    sourceFormat === FORMATS.OPENAI ||
    (!sourceFormat && Array.isArray(response?.choices?.[0]?.message?.tool_calls))
  ) {
    const toolCalls = response?.choices?.[0]?.message?.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        if (call?.type === "function" || call?.function) {
          calls.push({
            id: call.id || "",
            name: call.function?.name || "",
            args: parseToolArguments(call.function?.arguments),
            raw: call,
          });
        }
      }
    }
    return calls;
  }

  // Claude format: content[] with type === "tool_use"
  if (
    sourceFormat === FORMATS.CLAUDE ||
    (!sourceFormat && Array.isArray(response?.content))
  ) {
    const content = response?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === "tool_use") {
          calls.push({
            id: block.id || "",
            name: block.name || "",
            args: parseToolArguments(block.input),
            raw: block,
          });
        }
      }
    }
    return calls;
  }

  // Gemini format: candidates[0].content.parts[] with functionCall
  if (
    sourceFormat === FORMATS.GEMINI ||
    sourceFormat === FORMATS.GEMINI_CLI ||
    sourceFormat === FORMATS.VERTEX ||
    (!sourceFormat && Array.isArray(response?.candidates?.[0]?.content?.parts))
  ) {
    const parts = response?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (part?.functionCall) {
          calls.push({
            id: part.functionCall.id || "",
            name: part.functionCall.name || "",
            args: parseToolArguments(part.functionCall.args),
            raw: part,
          });
        }
      }
    }
    return calls;
  }

  // Responses API format: output[] with type === "function_call"
  if (
    sourceFormat === FORMATS.OPENAI_RESPONSES ||
    sourceFormat === FORMATS.OPENAI_RESPONSE ||
    (!sourceFormat && Array.isArray(response?.output))
  ) {
    const output = response?.output;
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item?.type === "function_call") {
          calls.push({
            id: item.call_id || item.id || "",
            name: item.name || "",
            args: parseToolArguments(item.arguments),
            raw: item,
          });
        }
      }
    }
    return calls;
  }

  return calls;
}

/**
 * Partition an array of normalized tool calls into MCP tool calls and Client-native tool calls.
 */
export function partitionToolCalls(toolCalls) {
  const mcpCalls = [];
  const clientCalls = [];

  if (!Array.isArray(toolCalls)) {
    return { mcpCalls, clientCalls };
  }

  for (const call of toolCalls) {
    const parsed = parseNamespacedToolName(call.name);
    if (parsed) {
      mcpCalls.push({
        id: call.id,
        name: call.name,
        serverId: parsed.serverId,
        toolName: parsed.toolName,
        args: call.args,
        raw: call.raw,
      });
    } else {
      clientCalls.push(call);
    }
  }

  return { mcpCalls, clientCalls };
}
