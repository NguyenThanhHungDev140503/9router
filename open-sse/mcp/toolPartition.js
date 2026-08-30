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

function extractTextFromResponse(response) {
  if (!response || typeof response !== "object") return "";

  if (typeof response.choices?.[0]?.message?.content === "string") {
    return response.choices[0].message.content;
  }

  if (typeof response.content === "string") {
    return response.content;
  }

  if (Array.isArray(response.content)) {
    return response.content
      .map((item) => (typeof item === "string" ? item : (item?.type === "text" ? item.text : "")))
      .filter(Boolean)
      .join("\n");
  }

  if (Array.isArray(response.candidates?.[0]?.content?.parts)) {
    return response.candidates[0].content.parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function extractEmbeddedToolCallsFromText(text) {
  if (!text || typeof text !== "string") return [];

  const calls = [];
  const patterns = [
    /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g,
    /```(?:tool_call|json:tool_call)\s*([\s\S]*?)\s*```/g,
  ];

  for (const regex of patterns) {
    const matches = [...text.matchAll(regex)];
    for (const match of matches) {
      const rawJson = match[1]?.trim();
      if (!rawJson) continue;
      try {
        const parsed = JSON.parse(rawJson);
        const name = parsed.name || parsed.tool || parsed.tool_name;
        if (name && typeof name === "string") {
          calls.push({
            id: parsed.id || ("call_" + Math.random().toString(36).slice(2, 9)),
            name,
            args: parseToolArguments(parsed.arguments ?? parsed.args ?? parsed.parameters ?? {}),
            raw: parsed,
          });
        }
      } catch {}
    }
  }

  return calls;
}

/**
 * Extract normalized tool calls from an upstream non-streaming LLM response.
 * Supports OpenAI, Claude, Gemini, OpenAI Responses API formats, and embedded text tag fallbacks.
 *
 * Output normalized format:
 * Array<{ id: string, name: string, args: any, raw: any }>
 */
export function extractToolCallsFromResponse(response, sourceFormat) {
  if (!response || typeof response !== "object") return [];

  const calls = [];

  // 1. OpenAI format: choices[0].message.tool_calls
  const openAiToolCalls = response?.choices?.[0]?.message?.tool_calls;
  if (Array.isArray(openAiToolCalls) && openAiToolCalls.length > 0) {
    for (const call of openAiToolCalls) {
      if (call?.type === "function" || call?.function) {
        calls.push({
          id: call.id || ("call_" + Math.random().toString(36).slice(2, 9)),
          name: call.function?.name || "",
          args: parseToolArguments(call.function?.arguments),
          raw: call,
        });
      }
    }
    if (calls.length > 0) return calls;
  }

  // 2. Claude format: content[] with type === "tool_use"
  if (Array.isArray(response?.content)) {
    for (const block of response.content) {
      if (block?.type === "tool_use") {
        calls.push({
          id: block.id || ("call_" + Math.random().toString(36).slice(2, 9)),
          name: block.name || "",
          args: parseToolArguments(block.input),
          raw: block,
        });
      }
    }
    if (calls.length > 0) return calls;
  }

  // 3. Gemini format: candidates[0].content.parts[] with functionCall
  const geminiParts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(geminiParts)) {
    for (const part of geminiParts) {
      if (part?.functionCall) {
        calls.push({
          id: part.functionCall.id || ("call_" + Math.random().toString(36).slice(2, 9)),
          name: part.functionCall.name || "",
          args: parseToolArguments(part.functionCall.args),
          raw: part,
        });
      }
    }
    if (calls.length > 0) return calls;
  }

  // 4. Responses API format: output[] with type === "function_call"
  if (Array.isArray(response?.output)) {
    for (const item of response.output) {
      if (item?.type === "function_call") {
        calls.push({
          id: item.call_id || item.id || ("call_" + Math.random().toString(36).slice(2, 9)),
          name: item.name || "",
          args: parseToolArguments(item.arguments),
          raw: item,
        });
      }
    }
    if (calls.length > 0) return calls;
  }

  // 5. Embedded text fallback (<tool_call>{...}</tool_call>)
  const textContent = extractTextFromResponse(response);
  if (textContent) {
    const embeddedCalls = extractEmbeddedToolCallsFromText(textContent);
    if (embeddedCalls.length > 0) {
      return embeddedCalls;
    }
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
