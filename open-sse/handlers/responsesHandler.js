/**
 * Responses API Handler for Workers
 * Converts Chat Completions to Codex Responses API format
 */

import { handleChatCore } from "./chatCore.js";
import { convertResponsesApiFormat } from "../translator/formats/responsesApi.js";
import { convertResponsesStreamToJson } from "../transformer/streamToJsonConverter.js";
import { FORMATS } from "../translator/formats.js";
import { PROVIDERS } from "../config/providers.js";

/**
 * Handle /v1/responses request
 * @param {object} options
 * @param {object} options.body - Request body (Responses API format)
 * @param {object} options.modelInfo - { provider, model }
 * @param {object} options.credentials - Provider credentials
 * @param {object} options.log - Logger instance (optional)
 * @param {function} options.onCredentialsRefreshed - Callback when credentials are refreshed
 * @param {function} options.onRequestSuccess - Callback when request succeeds
 * @param {function} options.onDisconnect - Callback when client disconnects
 * @param {string} options.connectionId - Connection ID for usage tracking
 * @returns {Promise<{success: boolean, response?: Response, status?: number, error?: string}>}
 */
export async function handleResponsesCore({ body, modelInfo, credentials, log, onCredentialsRefreshed, onRequestSuccess, onDisconnect, connectionId }) {
  const provider = modelInfo?.provider;
  const nativeResponsesRoute = PROVIDERS[provider]?.format === FORMATS.OPENAI_RESPONSES
    && body && Object.prototype.hasOwnProperty.call(body, "input");
  // Keep native Codex/Responses requests untouched. Conversion drops hosted
  // descriptors and other Responses-only fields before native dispatch.
  const convertedBody = nativeResponsesRoute ? { ...body } : convertResponsesApiFormat(body);

  // Preserve client's stream preference (matches OpenClaw behavior)
  // Default to false if omitted: Boolean(undefined) = false
  const clientRequestedStreaming = convertedBody.stream === true;
  if (convertedBody.stream === undefined) {
    convertedBody.stream = false;
  }

  // Call chat core handler — force sourceFormat so streaming path knows this is a Responses API client
  const result = await handleChatCore({
    body: convertedBody,
    modelInfo,
    credentials,
    log,
    onCredentialsRefreshed,
    onRequestSuccess,
    onDisconnect,
    connectionId,
    sourceFormatOverride: "openai-responses"
  });

  if (!result.success || !result.response) {
    return result;
  }

  const response = result.response;
  const contentType = response.headers.get("Content-Type") || "";

  // Case 1: Client wants non-streaming, but got SSE (provider forced it, e.g., Codex)
  if (!clientRequestedStreaming && contentType.includes("text/event-stream")) {
    try {
      const jsonResponse = await convertResponsesStreamToJson(response.body, result.toolLedger);

      return {
        success: true,
        response: new Response(JSON.stringify(jsonResponse), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*"
          }
        })
      };
    } catch (error) {
      console.error("[Responses API] Stream-to-JSON conversion failed:", error);
      return {
        success: false,
        status: 500,
        error: "Failed to convert streaming response to JSON"
      };
    }
  }

  // handleChatCore already translated upstream SSE into Responses SSE.
  // Re-transforming it corrupts event framing and tool items.
  if (clientRequestedStreaming && contentType.includes("text/event-stream")) {
    delete result.toolLedger;
    return result;
  }

  // Case 3: Non-SSE response (error or non-streaming from provider) - return as-is
  delete result.toolLedger;
  return result;
}
