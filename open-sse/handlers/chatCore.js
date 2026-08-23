function hasMcpToolDefinitions(body) {
  if (!body || typeof body !== "object") return false;
  const tools = body.tools || body.toolsDeclarations;
  if (Array.isArray(tools)) {
    for (const t of tools) {
      const name = t?.function?.name || t?.name;
      if (isMcpToolName(name)) return true;
    }
  }
  return false;
}

import { runToolLoop } from "../mcp/toolLoop.js";
import { isMcpToolName } from "../mcp/toolPartition.js";
import { detectFormat, getTargetFormat, resolveTransport } from "../services/provider.js";
import { translateRequest } from "../translator/index.js";
import { applyThinking, extractThinking, stripThinkingSuffix } from "../translator/concerns/thinkingUnified.js";
import { FORMATS } from "../translator/formats.js";
import { normalizeClaudePassthrough, anchorClaudeCache } from "../translator/formats/claude.js";
import { createStreamController } from "../utils/streamHandler.js";
import { refreshWithRetry } from "../services/tokenRefresh.js";
import { createRequestLogger } from "../utils/requestLogger.js";
import { getModelTargetFormat, getModelSupportedFormats, getModelStrip, getModelUpstreamId, getModelType, PROVIDER_ID_TO_ALIAS } from "../config/providerModels.js";
import { PROVIDERS } from "../config/providers.js";
import { createErrorResult, parseUpstreamError, formatProviderError } from "../utils/error.js";
import { HTTP_STATUS, TOKEN_SAVER_HEADER } from "../config/runtimeConfig.js";
import { handleBypassRequest } from "../utils/bypassHandler.js";
import { trackPendingRequest, appendRequestLog, saveRequestDetail } from "@/lib/usageDb.js";
import { getExecutor } from "../executors/index.js";
import { supportsGrokCliReasoningEffort } from "../config/grokCli.js";
import { buildRequestDetail, extractRequestConfig } from "./chatCore/requestDetail.js";
import { handleForcedSSEToJson } from "./chatCore/sseToJsonHandler.js";
import { handleNonStreamingResponse } from "./chatCore/nonStreamingHandler.js";
import { handleStreamingResponse, buildOnStreamComplete } from "./chatCore/streamingHandler.js";
import { detectClientTool, isNativePassthrough } from "../utils/clientDetector.js";
import { dedupeTools } from "../utils/toolDeduper.js";
import { injectCaveman } from "../rtk/caveman.js";
import { injectPonytail } from "../rtk/ponytail.js";
import { compressMessages, formatRtkLog } from "../rtk/index.js";
import { compressWithHeadroom, formatHeadroomLog, formatHeadroomSizeLog, isHeadroomPhantomSavings } from "../rtk/headroom.js";
import { compressWithPxpipe } from "../rtk/pxpipe.js";
import { getCapabilitiesForModel } from "../providers/capabilities.js";
import { stripUnsupportedModalities } from "../translator/concerns/modality.js";
import { prefetchRemoteImages } from "../translator/concerns/prefetch.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { applyInboundInjection } from "../mcp/inboundInjectionPipeline.js";

/**
 * Core chat handler - shared between SSE and Worker
 * @param {object} options.body - Request body
 * @param {object} options.modelInfo - { provider, model }
 * @param {object} options.credentials - Provider credentials
 * @param {string} options.sourceFormatOverride - Override detected source format (e.g. "openai-responses")
 */
/**
 * Remove translator-internal continuity fields from the outbound upstream
 * body. The Responses→Chat request translator stashes reasoning
 * `encrypted_content` on assistant messages so a later openai→responses
 * round-trip can restore the store=false continuity blob; that stash must
 * never reach an upstream provider. Chat-native proxies reject the unknown
 * assistant-message field and answer every turn with a literal "400" body
 * (observed with multi-turn Codex sessions via OpenAI-compatible nodes).
 */
export function stripContinuityFields(body) {
  if (!body || !Array.isArray(body.messages)) return body;
  for (const msg of body.messages) {
    if (msg && typeof msg === "object") {
      delete msg.encrypted_content;
      delete msg.reasoning_encrypted_content;
    }
  }
  return body;
}

export async function handleChatCore({ processManager, body, modelInfo, credentials, log, onCredentialsRefreshed, onRequestSuccess, onDisconnect, clientRawRequest, connectionId, userAgent, apiKey, ccFilterNaming, rtkEnabled, headroomEnabled, headroomUrl, headroomCompressUserMessages, cavemanEnabled, cavemanLevel, ponytailEnabled, ponytailLevel, pxpipeEnabled, pxpipeMinChars, pxpipeTimeoutMs, pxpipeTransform, onPxpipeEvent, sourceFormatOverride, providerThinking }) {
  const { provider, model } = modelInfo;
  const requestStartTime = Date.now();
  // Stable per-session color so all lines of one CLI conversation share a tag
  const sessionSeed = (() => {
    try {
      return resolveSessionId({ headers: clientRawRequest?.headers, body, connectionId, scope: provider });
    } catch {
      return connectionId || "";
    }
  })();
  const reqTag = log?.tagForSession ? log.tagForSession(sessionSeed) : (log?.nextTag ? log.nextTag() : "");

  const sourceFormat = sourceFormatOverride || detectFormat(body);

  // Check for bypass patterns (warmup, skip, cc naming)
  const bypassResponse = handleBypassRequest(body, model, userAgent, ccFilterNaming);
  if (bypassResponse) return bypassResponse;

  body = await applyInboundInjection({
    body,
    sourceFormat,
    headers: clientRawRequest?.headers,
    log,
  });

  const alias = PROVIDER_ID_TO_ALIAS[provider] || provider;
  const modelTargetFormat = getModelTargetFormat(alias, model);
  // Multi-endpoint providers: pick transport matching sourceFormat → zero translation.
  // Per-model guard: only use the transport when the model declares support for that
  // sourceFormat — opencode-go models differ in endpoint support (kimi/glm only do
  // /chat/completions), so without this guard a claude-format request would wrongly
  // route kimi to /messages.
  const modelSupportedFormats = getModelSupportedFormats(alias, model);
  const runtimeTransport = resolveTransport(provider, sourceFormat);
  // Per-model guard: when a model declares supportedFormats, only use the
  // sourceFormat-matched transport if that format is declared (opencode-go models
  // differ — kimi/glm only do /chat/completions). Undeclared models keep the
  // upstream default (use the transport), preserving behavior for glm/deepseek/...
  const useTransport = (!modelSupportedFormats || modelSupportedFormats.includes(sourceFormat)) ? runtimeTransport : null;
  const targetFormat = modelTargetFormat || useTransport?.format || getTargetFormat(provider, credentials);
  if (useTransport && credentials) credentials.runtimeTransport = useTransport;
  const stripList = getModelStrip(alias, model);
  const upstreamModel = getModelUpstreamId(alias, model);

  // Inject provider-level thinking config override (only if client hasn't set)
  // on/off → extended type (body.thinking), none/low/medium/high → effort type (body.reasoning_effort)
  if (providerThinking?.mode && providerThinking.mode !== "auto") {
    const mode = providerThinking.mode;
    if (mode === "on" && !body.thinking) {
      console.log("Injecting provider-level thinking config override: on");
      body = { ...body, thinking: { type: "enabled", budget_tokens: 10000 } };
    } else if (mode === "off" && !body.thinking) {
      body = { ...body, thinking: { type: "disabled" } };
    } else if (!body.reasoning_effort) {
      body = { ...body, reasoning_effort: mode };
    }
  }

  const clientRequestedStreaming = body.stream === true || sourceFormat === FORMATS.ANTIGRAVITY || sourceFormat === FORMATS.GEMINI || sourceFormat === FORMATS.GEMINI_CLI;
  const providerRequiresStreaming = PROVIDERS[provider]?.forceStream === true;
  let stream = providerRequiresStreaming ? true : (body.stream !== false);

  // Image generation models require non-streaming (Google v1internal:generateContent)
  const modelType = getModelType(alias, model);
  const isImageGenModel = modelType === "imageGen" || /image|imagen|image-generation/i.test(model);
  if (isImageGenModel && (provider === "antigravity" || provider === "gemini-cli")) {
    stream = false;
  }

  // DeepSeek-TUI: interactive TUI panel sends stream:true and needs SSE.
  // Non-interactive mode (-p flag) sends without stream and can't parse SSE.
  // Only force non-streaming when client didn't explicitly request it.
  const detectedTool = detectClientTool(clientRawRequest?.headers || {}, body);
  if (detectedTool === "deepseek-tui" && body.stream !== true) stream = false;

  // Check client Accept header preference for non-streaming requests
  // This fixes AI SDK compatibility where clients send Accept: application/json
  const acceptHeader = clientRawRequest?.headers?.accept || "";
  const clientPrefersJson = acceptHeader.includes("application/json");
  const clientPrefersSSE = acceptHeader.includes("text/event-stream");
  if (clientPrefersJson && !clientPrefersSSE && body.stream !== true && !providerRequiresStreaming) {
    stream = false;
  }

  const reqLogger = await createRequestLogger(sourceFormat, targetFormat, model);
  if (clientRawRequest) reqLogger.logClientRawRequest(clientRawRequest.endpoint, clientRawRequest.body, clientRawRequest.headers);
  reqLogger.logRawRequest(body);
  log?.debug?.("FORMAT", `${sourceFormat} → ${targetFormat} | stream=${stream}`);

  // Native passthrough: CLI tool and provider are the same ecosystem
  const clientTool = detectClientTool(clientRawRequest?.headers || {}, body);
  const passthrough = isNativePassthrough(clientTool, provider);

  if (credentials) credentials.rawHeaders = clientRawRequest?.headers || {};

  const streamController = createStreamController({
    onDisconnect: (reason) => {
      trackPendingRequest(model, provider, connectionId, false);
      if (onDisconnect) onDisconnect(reason);
    },
    onError: () => trackPendingRequest(model, provider, connectionId, false),
    log, provider, model, reqTag
  });

  const proxyOptions = {
    connectionProxyEnabled: credentials?.providerSpecificData?.connectionProxyEnabled === true,
    connectionProxyUrl: credentials?.providerSpecificData?.connectionProxyUrl || "",
    connectionNoProxy: credentials?.providerSpecificData?.connectionNoProxy || "",
    vercelRelayUrl: credentials?.providerSpecificData?.vercelRelayUrl || "",
  };

  if (proxyOptions.vercelRelayUrl) {
    const connectionName = credentials?.connectionName || credentials?.connectionId || "unknown";
    const poolId = credentials?.providerSpecificData?.connectionProxyPoolId || "none";
    log?.info?.("PROXY", `${provider.toUpperCase()} | ${model} | conn=${connectionName} | pool=${poolId} | vercel-relay=${proxyOptions.vercelRelayUrl}`);
  } else if (proxyOptions.connectionProxyEnabled && proxyOptions.connectionProxyUrl) {
    let maskedProxyUrl = proxyOptions.connectionProxyUrl;
    try {
      const parsed = new URL(proxyOptions.connectionProxyUrl);
      const host = parsed.hostname || "";
      const port = parsed.port ? `:${parsed.port}` : "";
      const protocol = parsed.protocol || "http:";
      maskedProxyUrl = `${protocol}//${host}${port}`;
    } catch { }

    const poolId = credentials?.providerSpecificData?.connectionProxyPoolId || "none";
    const connectionName = credentials?.connectionName || credentials?.connectionId || "unknown";
    log?.info?.("PROXY", `${provider.toUpperCase()} | ${model} | conn=${connectionName} | pool=${poolId} | url=${maskedProxyUrl}`);
  }

  if (proxyOptions.connectionProxyEnabled && proxyOptions.connectionNoProxy) {
    const connectionName = credentials?.connectionName || credentials?.connectionId || "unknown";
    log?.debug?.("PROXY", `${provider.toUpperCase()} | ${model} | conn=${connectionName} | no_proxy=${proxyOptions.connectionNoProxy}`);
  }

  const executor = getExecutor(provider);

  async function executeSingleTurn(turnBody, turnStream) {
    if (!passthrough) {
      const caps = getCapabilitiesForModel(provider, model);
      if (stripUnsupportedModalities(turnBody, sourceFormat, caps)) {
        log?.debug?.("MODALITY", `stripped unsupported media for ${provider}/${model}`);
      }
      try {
        const n = await prefetchRemoteImages(turnBody, sourceFormat, targetFormat, { signal: undefined });
        if (n > 0) log?.debug?.("MODALITY", `prefetched ${n} remote image(s) for ${targetFormat}`);
      } catch (e) { log?.warn?.("MODALITY", `image prefetch failed: ${e.message}`); }
    }

    let translatedBody;
    let toolNameMap;
    let customToolNames;
    if (passthrough) {
      log?.debug?.("PASSTHROUGH", `${clientTool} → ${provider} | native lossless`);
      translatedBody = { ...turnBody, model: stripThinkingSuffix(upstreamModel) };
      if (provider === "codex") {
        const suffixThinking = {};
        applyThinking(sourceFormat, upstreamModel, suffixThinking, provider);
        if (suffixThinking.reasoning_effort) {
          const reasoning = translatedBody.reasoning;
          translatedBody.reasoning = {
            ...(reasoning && typeof reasoning === "object" && !Array.isArray(reasoning) ? reasoning : {}),
            effort: suffixThinking.reasoning_effort,
          };
          delete translatedBody.reasoning_effort;
        }
      }
      if (clientTool === "claude") normalizeClaudePassthrough(translatedBody, translatedBody.model);
    } else {
      translatedBody = translateRequest(sourceFormat, targetFormat, upstreamModel, turnBody, turnStream, credentials, provider, reqLogger, stripList, connectionId, clientTool);
      if (!translatedBody) {
        throw new Error(`Failed to translate request for ${sourceFormat} → ${targetFormat}`);
      }
      toolNameMap = translatedBody._toolNameMap;
      delete translatedBody._toolNameMap;
      customToolNames = translatedBody._customToolNames;
      delete translatedBody._customToolNames;
      translatedBody.model = stripThinkingSuffix(upstreamModel);
      stripContinuityFields(translatedBody);
    }

    if (clientTool === "claude" && Array.isArray(translatedBody.tools)) {
      const { tools: deduped, stripped } = dedupeTools(translatedBody.tools);
      if (stripped.length > 0) {
        translatedBody.tools = deduped;
        log?.debug?.("TOOLDEDUP", `stripped ${stripped.length}: ${stripped.slice(0, 3).join(", ")}${stripped.length > 3 ? "..." : ""}`);
      }
    }

    const finalFormat = passthrough ? sourceFormat : targetFormat;
    const tokenSaverEnabled = clientRawRequest?.headers?.[TOKEN_SAVER_HEADER]?.toLowerCase() !== "off";

    const rtkStats = compressMessages(translatedBody, tokenSaverEnabled && rtkEnabled);
    const rtkLine = formatRtkLog(rtkStats);
    if (rtkLine) console.log(rtkLine);

    const headroomDiagnostics = {};
    const headroomStats = await compressWithHeadroom(translatedBody, {
      enabled: tokenSaverEnabled && headroomEnabled,
      url: headroomUrl,
      model: upstreamModel,
      format: finalFormat,
      compressUserMessages: headroomCompressUserMessages,
      diagnostics: headroomDiagnostics,
    });
    const headroomLine = formatHeadroomLog(headroomStats);
    const headroomSizeLine = formatHeadroomSizeLog(headroomDiagnostics);
    if (headroomLine) {
      log?.info?.("HEADROOM", `${headroomLine}${headroomSizeLine ? ` | ${headroomSizeLine}` : ""}`);
      if (isHeadroomPhantomSavings(headroomStats, headroomDiagnostics)) {
        log?.warn?.("HEADROOM", `reported token delta, but outbound JSON shrank <5%; provider may bill near-original payload | ${formatHeadroomSizeLog(headroomDiagnostics)}`);
      }
    } else if (tokenSaverEnabled && headroomEnabled) {
      log?.warn?.("HEADROOM", `skipped: ${headroomDiagnostics.reason || "compression unavailable"}${headroomDiagnostics.endpoint ? ` (${headroomDiagnostics.endpoint})` : ""}`);
    }

    const xf = [];
    if (tokenSaverEnabled && cavemanEnabled && cavemanLevel) {
      injectCaveman(translatedBody, finalFormat, cavemanLevel);
      xf.push(`CAVEMAN:${cavemanLevel}`);
    }

    if (tokenSaverEnabled && ponytailEnabled && ponytailLevel) {
      injectPonytail(translatedBody, finalFormat, ponytailLevel);
      xf.push(`PONYTAIL:${ponytailLevel}`);
    }

    let pxpipeSummary = null;
    if (pxpipeEnabled) {
      const pxpipeResult = await compressWithPxpipe(translatedBody, {
        enabled: true, format: finalFormat, model: upstreamModel,
        minChars: pxpipeMinChars, timeoutMs: pxpipeTimeoutMs, transform: pxpipeTransform,
      });
      pxpipeSummary = pxpipeResult.summary;
      if (pxpipeResult.body) translatedBody = pxpipeResult.body;
      if (pxpipeSummary?.applied) xf.push(`PXPIPE:${pxpipeSummary.imageCount}img`);
      try { onPxpipeEvent?.({ provider, model, ...pxpipeSummary }); } catch { }
    }

    if (xf.length && log?.line) log.line(reqTag, "⚙", xf.join(" · "));
    if (passthrough && clientTool === "claude") anchorClaudeCache(translatedBody);

    const result = await executor.execute({
      model,
      body: translatedBody,
      stream: turnStream,
      credentials,
      signal: streamController.signal,
      log,
      proxyOptions
    });

    return {
      result,
      translatedBody,
      toolNameMap,
      customToolNames,
      pxpipeSummary,
    };
  }

  const hasMcp = hasMcpToolDefinitions(body);

  if (processManager && hasMcp) {
    trackPendingRequest(model, provider, connectionId, true);
    appendRequestLog({ model, provider, connectionId, status: "PENDING" }).catch(() => { });

    try {
      let lastExecData = null;

      const executorFn = async (currentBody, isIntermediate) => {
        const turnStream = isIntermediate ? false : stream;
        const execData = await executeSingleTurn(currentBody, turnStream);
        lastExecData = execData;

        if (!execData.result.response.ok) {
          const err = new Error(`Provider returned error status ${execData.result.response.status}`);
          err.response = execData.result.response;
          throw err;
        }

        let parsedResponse = null;
        let usage = null;

        if (!turnStream) {
          const cloned = execData.result.response.clone();
          try {
            parsedResponse = await cloned.json();
            usage = parsedResponse.usage;
          } catch { }
        }

        return {
          rawResponse: execData.result.response,
          parsedResponse,
          usage,
        };
      };

      if (stream) {
        executorFn.yieldFinalTurn = async (currentBody, turnResult) => {
          const execData = await executeSingleTurn(currentBody, true);
          lastExecData = execData;
          if (!execData.result.response.ok) {
            const err = new Error(`Provider returned error status ${execData.result.response.status}`);
            err.response = execData.result.response;
            throw err;
          }
          return {
            rawResponse: execData.result.response,
            parsedResponse: null,
            usage: null,
          };
        };
      }

      const loopResult = await runToolLoop({
        initialBody: body,
        sourceFormat,
        processManager,
        signal: streamController.signal,
        executorFn,
      });

      const { result, translatedBody, toolNameMap, customToolNames, pxpipeSummary } = lastExecData;
      let providerResponse = result.response;
      let providerUrl = result.url;
      let providerHeaders = result.headers;
      let finalBody = result.transformedBody;
      let providerResponseFormat = result.responseFormat || targetFormat;
      reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);

      const sharedCtx = {
        provider, model, body: loopResult.finalBody, stream, translatedBody,
        finalBody, requestStartTime, connectionId, apiKey, clientRawRequest,
        onRequestSuccess, pxpipe: pxpipeSummary, reqTag, log,
      };
      const appendLog = (extra) => appendRequestLog({ model, provider, connectionId, ...extra }).catch(() => { });
      const trackDone = () => trackPendingRequest(model, provider, connectionId, false);

      if (!clientRequestedStreaming && providerRequiresStreaming) {
        const res = await handleForcedSSEToJson({
          ...sharedCtx, providerResponse, sourceFormat, targetFormat: providerResponseFormat,
          customToolNames, trackDone, appendLog,
        });
        if (res) { streamController.handleComplete(); return res; }
      }

      if (!stream) {
        const res = await handleNonStreamingResponse({
          ...sharedCtx, providerResponse, sourceFormat, targetFormat: providerResponseFormat,
          reqLogger, toolNameMap, customToolNames, trackDone, appendLog,
        });
        streamController.handleComplete();
        return res;
      }

      const { onStreamComplete, streamDetailId } = buildOnStreamComplete({ ...sharedCtx });
      return handleStreamingResponse({
        ...sharedCtx, providerResponse, sourceFormat, targetFormat: providerResponseFormat,
        userAgent, reqLogger, toolNameMap, customToolNames, streamController,
        onStreamComplete, streamDetailId,
      });
    } catch (error) {
      trackPendingRequest(model, provider, connectionId, false, true);
      appendRequestLog({ model, provider, connectionId, status: `FAILED ${error.name === "AbortError" ? 499 : HTTP_STATUS.BAD_GATEWAY}` }).catch(() => { });
      saveRequestDetail(buildRequestDetail({
        provider, model, connectionId,
        latency: { ttft: 0, total: Date.now() - requestStartTime },
        tokens: { prompt_tokens: 0, completion_tokens: 0 },
        request: extractRequestConfig(body, stream),
        providerRequest: null,
        response: { error: error.message || String(error), status: error.name === "AbortError" ? 499 : 502, thinking: null },
        status: "error"
      })).catch(() => { });

      if (error.name === "AbortError") {
        streamController.handleError(error);
        return createErrorResult(499, "Request aborted");
      }
      const errMsg = formatProviderError(error, provider, model, HTTP_STATUS.BAD_GATEWAY);
      if (log?.errorLine) {
        log.errorLine(reqTag, "✗", `ERROR 502 · ${provider}/${model} · ${Date.now() - requestStartTime}ms\n    ${errMsg}${error.stack ? `\n    ${error.stack}` : ""}`);
      }
      return createErrorResult(HTTP_STATUS.BAD_GATEWAY, errMsg);
    }
  }

  // Standard execution path
  trackPendingRequest(model, provider, connectionId, true);
  appendRequestLog({ model, provider, connectionId, status: "PENDING" }).catch(() => { });

  let execData;
  try {
    execData = await executeSingleTurn(body, stream);
  } catch (error) {
    trackPendingRequest(model, provider, connectionId, false, true);
    appendRequestLog({ model, provider, connectionId, status: `FAILED ${error.name === "AbortError" ? 499 : HTTP_STATUS.BAD_GATEWAY}` }).catch(() => { });
    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId,
      latency: { ttft: 0, total: Date.now() - requestStartTime },
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
      request: extractRequestConfig(body, stream),
      providerRequest: null,
      response: { error: error.message || String(error), status: error.name === "AbortError" ? 499 : 502, thinking: null },
      status: "error"
    })).catch(() => { });

    if (error.name === "AbortError") {
      streamController.handleError(error);
      return createErrorResult(499, "Request aborted");
    }
    const errMsg = formatProviderError(error, provider, model, HTTP_STATUS.BAD_GATEWAY);
    if (log?.errorLine) {
      log.errorLine(reqTag, "✗", `ERROR 502 · ${provider}/${model} · ${Date.now() - requestStartTime}ms\n    ${errMsg}${error.stack ? `\n    ${error.stack}` : ""}`);
    }
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, errMsg);
  }

  const { result, translatedBody, toolNameMap, customToolNames, pxpipeSummary } = execData;
  let providerResponse = result.response;
  let providerUrl = result.url;
  let providerHeaders = result.headers;
  let finalBody = result.transformedBody;
  let providerResponseFormat = result.responseFormat || targetFormat;
  reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);

  // Handle 401/403 - try token refresh (skip for noAuth providers)
  if (!executor.noAuth && (providerResponse.status === HTTP_STATUS.UNAUTHORIZED || providerResponse.status === HTTP_STATUS.FORBIDDEN)) {
    try {
      const newCredentials = await refreshWithRetry(async () => {
        const refreshResult = await executor.refreshCredentials(credentials, log);
        if (refreshResult?.refreshToken && refreshResult.refreshToken !== credentials.refreshToken) {
          if (refreshResult.accessToken) credentials.accessToken = refreshResult.accessToken;
          credentials.refreshToken = refreshResult.refreshToken;
        }
        return refreshResult;
      }, 3, log);
      if (newCredentials?.accessToken || newCredentials?.copilotToken) {
        if (log?.line) log.line(reqTag, "🔑", `TOKEN REFRESHED · ${provider}/${model}`);
        Object.assign(credentials, newCredentials);
        if (onCredentialsRefreshed) {
          try { await onCredentialsRefreshed(newCredentials); } catch (e) { log?.warn?.("TOKEN", `onCredentialsRefreshed failed: ${e.message}`); }
        }
        try {
          const retryExecData = await executeSingleTurn(body, stream);
          if (retryExecData.result.response.ok) {
            providerResponse = retryExecData.result.response;
            providerUrl = retryExecData.result.url;
            providerResponseFormat = retryExecData.result.responseFormat || targetFormat;
          }
        } catch { log?.warn?.("TOKEN", `${provider.toUpperCase()} | retry after refresh failed`); }
      } else {
        log?.warn?.("TOKEN", `${provider.toUpperCase()} | refresh failed`);
      }
    } catch (e) {
      log?.warn?.("TOKEN", `${provider.toUpperCase()} | refresh threw: ${e.message}`);
    }
  }

  // Provider returned error
  if (!providerResponse.ok) {
    trackPendingRequest(model, provider, connectionId, false, true);
    const { statusCode, message, resetsAtMs } = await parseUpstreamError(providerResponse, executor);
    appendRequestLog({ model, provider, connectionId, status: `FAILED ${statusCode}` }).catch(() => { });
    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId,
      latency: { ttft: 0, total: Date.now() - requestStartTime },
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
      request: extractRequestConfig(body, stream),
      providerRequest: finalBody || translatedBody || null,
      response: { error: message, status: statusCode, thinking: null },
      pxpipe: pxpipeSummary,
      status: "error"
    })).catch(() => { });

    const errMsg = formatProviderError(new Error(message), provider, model, statusCode);
    if (log?.errorLine) {
      const urlStr = providerUrl ? `\n    URL: ${providerUrl}` : "";
      log.errorLine(reqTag, "✗", `ERROR ${statusCode} · ${provider}/${model} · ${Date.now() - requestStartTime}ms${urlStr}\n    ${errMsg}`);
    }
    reqLogger.logError(new Error(message), finalBody || translatedBody);
    return createErrorResult(statusCode, errMsg, resetsAtMs);
  }

  const sharedCtx = { provider, model, body, stream, translatedBody, finalBody, requestStartTime, connectionId, apiKey, clientRawRequest, onRequestSuccess, pxpipe: pxpipeSummary, reqTag, log };
  const appendLog = (extra) => appendRequestLog({ model, provider, connectionId, ...extra }).catch(() => { });
  const trackDone = () => trackPendingRequest(model, provider, connectionId, false);

  // Provider forced streaming but client wants JSON
  if (!clientRequestedStreaming && providerRequiresStreaming) {
    const res = await handleForcedSSEToJson({ ...sharedCtx, providerResponse, sourceFormat, targetFormat: providerResponseFormat, customToolNames, trackDone, appendLog });
    if (res) { streamController.handleComplete(); return res; }
  }

  // True non-streaming response
  if (!stream) {
    const res = await handleNonStreamingResponse({ ...sharedCtx, providerResponse, sourceFormat, targetFormat: providerResponseFormat, reqLogger, toolNameMap, customToolNames, trackDone, appendLog });
    streamController.handleComplete();
    return res;
  }

  // Streaming response
  const { onStreamComplete, streamDetailId } = buildOnStreamComplete({ ...sharedCtx });
  return handleStreamingResponse({ ...sharedCtx, providerResponse, sourceFormat, targetFormat: providerResponseFormat, userAgent, reqLogger, toolNameMap, customToolNames, streamController, onStreamComplete, streamDetailId });
}

export function isTokenExpiringSoon(expiresAt, bufferMs = 5 * 60 * 1000) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() < bufferMs;
}
