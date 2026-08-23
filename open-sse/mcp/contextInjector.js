import { FORMATS } from "../translator/formats.js";

/**
 * Format assistant tool call message based on source format.
 */
export function formatAssistantToolCallMessage(mcpCalls, sourceFormat) {
  if (!Array.isArray(mcpCalls) || mcpCalls.length === 0) return null;

  // OpenAI format
  if (
    sourceFormat === FORMATS.OPENAI ||
    !sourceFormat
  ) {
    return {
      role: "assistant",
      content: null,
      tool_calls: mcpCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: typeof call.args === "string" ? call.args : JSON.stringify(call.args || {}),
        },
      })),
    };
  }

  // Claude format
  if (sourceFormat === FORMATS.CLAUDE) {
    return {
      role: "assistant",
      content: mcpCalls.map((call) => ({
        type: "tool_use",
        id: call.id,
        name: call.name,
        input: typeof call.args === "object" ? call.args : (JSON.parse(call.args || "{}") || {}),
      })),
    };
  }

  // Gemini format
  if (
    sourceFormat === FORMATS.GEMINI ||
    sourceFormat === FORMATS.GEMINI_CLI ||
    sourceFormat === FORMATS.VERTEX
  ) {
    return {
      role: "model",
      parts: mcpCalls.map((call) => ({
        functionCall: {
          name: call.name,
          args: typeof call.args === "object" ? call.args : (JSON.parse(call.args || "{}") || {}),
        },
      })),
    };
  }

  return null;
}

/**
 * Format tool result message based on source format.
 */
export function formatToolResultMessage(results, sourceFormat) {
  if (!Array.isArray(results) || results.length === 0) return [];

  // OpenAI format: one message per tool result with role: "tool"
  if (
    sourceFormat === FORMATS.OPENAI ||
    !sourceFormat
  ) {
    return results.map((res) => ({
      role: "tool",
      tool_call_id: res.toolCallId,
      content: typeof res.content === "string" ? res.content : JSON.stringify(res.content),
    }));
  }

  // Claude format: single user message with content blocks of type: "tool_result"
  if (sourceFormat === FORMATS.CLAUDE) {
    return [
      {
        role: "user",
        content: results.map((res) => ({
          type: "tool_result",
          tool_use_id: res.toolCallId,
          content: typeof res.content === "string" ? res.content : JSON.stringify(res.content),
          is_error: Boolean(res.isError),
        })),
      },
    ];
  }

  // Gemini format: single user message with parts of functionResponse
  if (
    sourceFormat === FORMATS.GEMINI ||
    sourceFormat === FORMATS.GEMINI_CLI ||
    sourceFormat === FORMATS.VERTEX
  ) {
    return [
      {
        role: "user",
        parts: results.map((res) => ({
          functionResponse: {
            name: res.name,
            response: {
              output: res.content,
              error: Boolean(res.isError),
            },
          },
        })),
      },
    ];
  }

  return [];
}

/**
 * Append ReAct assistant call and tool result messages into the context body
 * according to source format.
 */
export function appendReActTurnToContext(body, mcpCalls, results, sourceFormat) {
  if (!body || typeof body !== "object") return body;
  const cloned = { ...body };

  // OpenAI Responses API format: uses cloned.input
  if (
    sourceFormat === FORMATS.OPENAI_RESPONSES ||
    sourceFormat === FORMATS.OPENAI_RESPONSE
  ) {
    const input = Array.isArray(cloned.input) ? [...cloned.input] : [];
    for (const call of mcpCalls) {
      input.push({
        type: "function_call",
        call_id: call.id,
        name: call.name,
        arguments: typeof call.args === "string" ? call.args : JSON.stringify(call.args || {}),
      });
    }
    for (const res of results) {
      input.push({
        type: "function_call_output",
        call_id: res.toolCallId,
        output: typeof res.content === "string" ? res.content : JSON.stringify(res.content),
      });
    }
    cloned.input = input;
    return cloned;
  }

  // Gemini format: uses cloned.contents
  if (
    sourceFormat === FORMATS.GEMINI ||
    sourceFormat === FORMATS.GEMINI_CLI ||
    sourceFormat === FORMATS.VERTEX
  ) {
    const contents = Array.isArray(cloned.contents) ? [...cloned.contents] : [];
    const assistantMsg = formatAssistantToolCallMessage(mcpCalls, sourceFormat);
    const resultMsgs = formatToolResultMessage(results, sourceFormat);

    if (assistantMsg) contents.push(assistantMsg);
    if (resultMsgs.length > 0) contents.push(...resultMsgs);

    cloned.contents = contents;
    return cloned;
  }

  // OpenAI / Claude / standard messages formats: uses cloned.messages
  const messages = Array.isArray(cloned.messages) ? [...cloned.messages] : [];
  const assistantMsg = formatAssistantToolCallMessage(mcpCalls, sourceFormat);
  const resultMsgs = formatToolResultMessage(results, sourceFormat);

  if (assistantMsg) messages.push(assistantMsg);
  if (resultMsgs.length > 0) messages.push(...resultMsgs);

  cloned.messages = messages;
  return cloned;
}
