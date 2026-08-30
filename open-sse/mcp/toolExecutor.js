/**
 * Execute multiple MCP tool calls in parallel using processManager.
 * Traps errors per-tool call so a single tool crash returns a soft error
 * rather than killing the entire turn.
 *
 * Output format:
 * Array<{
 *   toolCallId: string,
 *   name: string,
 *   content: string,
 *   isError: boolean
 * }>
 */
export function formatToolContent(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;

  // Standard MCP CallToolResult shape: { content: [{ type: "text", text: "..." }], isError: boolean }
  if (Array.isArray(result.content)) {
    const textParts = result.content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c?.type === "text" && typeof c.text === "string") return c.text;
        if (c?.text) return String(c.text);
        return JSON.stringify(c);
      })
      .filter(Boolean);
    if (textParts.length > 0) {
      return textParts.join("\n");
    }
  }

  if (typeof result === "object") {
    return JSON.stringify(result);
  }

  return String(result);
}

export async function executeToolCalls(processManager, mcpCalls, meta = {}) {
  if (!Array.isArray(mcpCalls) || mcpCalls.length === 0) {
    return [];
  }

  const executionPromises = mcpCalls.map(async (call) => {
    try {
      if (!processManager || typeof processManager.callServerTool !== "function") {
        throw new Error("MCP processManager unavailable or missing callServerTool method");
      }

      const rawResult = await processManager.callServerTool(
        call.serverId,
        call.toolName,
        call.args || {},
        meta
      );

      const isError = Boolean(rawResult?.isError);
      const content = formatToolContent(rawResult);

      return {
        toolCallId: call.id,
        name: call.name,
        content,
        isError,
      };
    } catch (err) {
      return {
        toolCallId: call.id,
        name: call.name,
        content: "Error executing tool " + call.name + ": " + (err.message || String(err)),
        isError: true,
      };
    }
  });

  return Promise.all(executionPromises);
}
