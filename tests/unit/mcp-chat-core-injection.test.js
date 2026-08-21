import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  events,
  executeMock,
  getAllMcpToolsCacheMock,
  getEnabledMcpServersMock,
  getEnabledSkillsMock,
  translateRequestMock,
} = vi.hoisted(() => ({
  events: [],
  executeMock: vi.fn(),
  getAllMcpToolsCacheMock: vi.fn(),
  getEnabledMcpServersMock: vi.fn(),
  getEnabledSkillsMock: vi.fn(),
  translateRequestMock: vi.fn(),
}));

vi.mock("../../src/lib/db/repos/mcpRepo.js", () => ({
  getEnabledMcpServers: getEnabledMcpServersMock,
  getAllMcpToolsCache: getAllMcpToolsCacheMock,
}));

vi.mock("../../src/lib/db/repos/skillsRepo.js", () => ({
  getEnabledSkills: getEnabledSkillsMock,
}));

vi.mock("../../open-sse/services/provider.js", async () => {
  const actual = await vi.importActual("../../open-sse/services/provider.js");
  return {
    ...actual,
    detectFormat: vi.fn((body) => {
      events.push(`detect:${body.__format || "openai"}`);
      return body.__format || "openai";
    }),
    getTargetFormat: vi.fn(() => "openai"),
    resolveTransport: vi.fn(() => null),
  };
});

vi.mock("../../open-sse/translator/index.js", () => ({
  translateRequest: (...args) => {
    events.push(`translate:${args[0]}`);
    return translateRequestMock(...args);
  },
}));

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: vi.fn(() => ({
    noAuth: true,
    execute: executeMock,
  })),
}));

vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: vi.fn(async () => ({
    logClientRawRequest: vi.fn(),
    logRawRequest: vi.fn(),
    logTargetRequest: vi.fn(),
    logError: vi.fn(),
  })),
}));

vi.mock("../../open-sse/utils/streamHandler.js", () => ({
  createStreamController: vi.fn(() => ({
    signal: undefined,
    handleComplete: vi.fn(),
    handleError: vi.fn(),
  })),
}));

vi.mock("../../open-sse/handlers/chatCore/nonStreamingHandler.js", () => ({
  handleNonStreamingResponse: vi.fn(async () => ({ success: true })),
}));

vi.mock("../../open-sse/utils/clientDetector.js", () => ({
  detectClientTool: vi.fn(() => null),
  isNativePassthrough: vi.fn(() => false),
}));

vi.mock("../../open-sse/utils/bypassHandler.js", () => ({
  handleBypassRequest: vi.fn(() => null),
}));

vi.mock("../../open-sse/utils/toolDeduper.js", () => ({
  dedupeTools: vi.fn((tools) => ({ tools, stripped: [] })),
}));

vi.mock("../../open-sse/rtk/index.js", () => ({
  compressMessages: vi.fn(() => null),
  formatRtkLog: vi.fn(() => ""),
}));

vi.mock("../../open-sse/rtk/headroom.js", () => ({
  compressWithHeadroom: vi.fn(async () => null),
  formatHeadroomLog: vi.fn(() => ""),
  formatHeadroomSizeLog: vi.fn(() => ""),
  isHeadroomPhantomSavings: vi.fn(() => false),
}));

vi.mock("../../open-sse/providers/capabilities.js", () => ({
  getCapabilitiesForModel: vi.fn(() => ({})),
}));

vi.mock("../../open-sse/translator/concerns/modality.js", () => ({
  stripUnsupportedModalities: vi.fn(() => false),
}));

vi.mock("../../open-sse/translator/concerns/prefetch.js", () => ({
  prefetchRemoteImages: vi.fn(async () => 0),
}));

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
}));

import { FORMATS } from "../../open-sse/translator/formats.js";
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { applyInboundInjection } from "../../open-sse/mcp/inboundInjectionPipeline.js";

const enabledServer = {
  id: "repo",
  name: "Repository",
  enabled: true,
  activationMode: "always",
};

const cachedTools = [{
  serverId: "repo",
  tools: [{
    name: "search",
    description: "Search repository files",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
  }],
}];

const enabledSkill = {
  id: "skill-1",
  name: "Repository Guide",
  description: "Repository guidance",
  systemPrompt: "Use repository rules.",
  enabled: true,
  matchRules: { mode: "always" },
};

function makeOpenAiBody() {
  return {
    __format: FORMATS.OPENAI,
    model: "gpt-4o",
    stream: false,
    tools: [{ type: "function", function: { name: "client_tool", parameters: {} } }],
    messages: [
      { role: "system", content: "Client system text." },
      { role: "user", content: "Search repository files." },
    ],
  };
}

function makeBody(format) {
  if (format === FORMATS.CLAUDE) {
    return {
      __format: format,
      system: "Client Claude system text.",
      tools: [{ name: "client_tool", input_schema: {} }],
      messages: [{ role: "user", content: "Search repository files." }],
    };
  }
  if (format === FORMATS.GEMINI) {
    return {
      __format: format,
      systemInstruction: { parts: [{ text: "Client Gemini system text." }] },
      tools: [{ functionDeclarations: [{ name: "client_tool", parameters: {} }] }],
      contents: [{ role: "user", parts: [{ text: "Search repository files." }] }],
    };
  }
  if (format === FORMATS.OPENAI_RESPONSES) {
    return {
      __format: format,
      instructions: "Client Responses system text.",
      tools: [{ type: "function", name: "client_tool", parameters: {} }],
      input: [{ type: "message", role: "user", content: "Search repository files." }],
    };
  }
  return makeOpenAiBody();
}

function countMcpTools(format, body) {
  if (format === FORMATS.GEMINI) {
    return body.tools
      .flatMap((tool) => tool.functionDeclarations || [])
      .filter((tool) => tool.name === "mcp__repo__search").length;
  }
  return body.tools.filter((tool) => (
    tool.function?.name === "mcp__repo__search" || tool.name === "mcp__repo__search"
  )).length;
}

function serializedSystemText(format, body) {
  if (format === FORMATS.CLAUDE) return body.system;
  if (format === FORMATS.GEMINI) return body.systemInstruction.parts.map((part) => part.text).join("\n");
  if (format === FORMATS.OPENAI_RESPONSES) return body.instructions;
  return body.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  getEnabledMcpServersMock.mockResolvedValue([enabledServer]);
  getAllMcpToolsCacheMock.mockResolvedValue(cachedTools);
  getEnabledSkillsMock.mockResolvedValue([enabledSkill]);
  translateRequestMock.mockImplementation((_sourceFormat, _targetFormat, _model, body) => body);
  executeMock.mockResolvedValue({
    response: new Response("{}", { status: 200 }),
    url: "https://example.test/v1/chat/completions",
    headers: {},
    transformedBody: null,
  });
});

describe("MCP inbound injection pipeline", () => {
  it.each([
    FORMATS.OPENAI,
    FORMATS.CLAUDE,
    FORMATS.GEMINI,
    FORMATS.OPENAI_RESPONSES,
  ])("composes native %s tools and skills without mutating caller input", async (format) => {
    const original = makeBody(format);
    const originalSnapshot = structuredClone(original);

    const injected = await applyInboundInjection({
      body: original,
      sourceFormat: format,
      headers: { "x-mcp-servers": "repo" },
    });

    expect(injected).not.toBe(original);
    expect(countMcpTools(format, injected)).toBe(1);
    expect(serializedSystemText(format, injected)).toContain("<!-- 9router:mcp-skills -->");
    expect(serializedSystemText(format, injected)).toContain("Client");
    expect(original).toEqual(originalSnapshot);
  });

  it("retains only configured header-restricted servers and no-ops with empty enabled data", async () => {
    const body = makeOpenAiBody();

    getEnabledMcpServersMock.mockResolvedValue([]);
    getAllMcpToolsCacheMock.mockResolvedValue([]);
    getEnabledSkillsMock.mockResolvedValue([]);
    expect(await applyInboundInjection({
      body,
      sourceFormat: FORMATS.OPENAI,
      headers: { "x-mcp-servers": "unknown" },
    })).toBe(body);
  });

  it("keeps client tools and system text while retrying composed output without duplicates", async () => {
    const original = makeOpenAiBody();
    const originalSnapshot = structuredClone(original);

    const first = await applyInboundInjection({ body: original, sourceFormat: FORMATS.OPENAI });
    const second = await applyInboundInjection({ body: first, sourceFormat: FORMATS.OPENAI });

    expect(second.tools[0]).toBe(original.tools[0]);
    expect(second.messages[0]).toBe(original.messages[0]);
    expect(countMcpTools(FORMATS.OPENAI, second)).toBe(1);
    expect(serializedSystemText(FORMATS.OPENAI, second).match(/<!-- 9router:mcp-skills -->/g)).toHaveLength(1);
    expect(original).toEqual(originalSnapshot);
  });

  it("fails open with sanitized counts and reason only", async () => {
    const body = makeOpenAiBody();
    const log = { warn: vi.fn() };
    const rawSchema = JSON.stringify(cachedTools);
    const rawPrompt = body.messages[1].content;
    const rawSkillPrompt = enabledSkill.systemPrompt;

    getEnabledMcpServersMock.mockRejectedValue(new Error(`db failed ${rawSchema} ${rawPrompt} ${rawSkillPrompt}`));

    expect(await applyInboundInjection({ body, sourceFormat: FORMATS.OPENAI, headers: { authorization: "Bearer secret" }, log })).toBe(body);
    const logPayload = JSON.stringify(log.warn.mock.calls);
    expect(logPayload).toContain("invalid-input");
    expect(logPayload).not.toContain(rawSchema);
    expect(logPayload).not.toContain(rawPrompt);
    expect(logPayload).not.toContain(rawSkillPrompt);
    expect(logPayload).not.toContain("Bearer secret");
  });

  it("injects after source-format detection and before request translation", async () => {
    const body = makeOpenAiBody();

    await handleChatCore({
      body,
      modelInfo: { provider: "openai", model: "gpt-4o" },
      credentials: { apiKey: "test-key", providerSpecificData: {} },
      clientRawRequest: {
        endpoint: "/v1/chat/completions",
        body,
        headers: { accept: "application/json", "x-mcp-servers": "repo" },
      },
      connectionId: "mcp-test",
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
      rtkEnabled: false,
      headroomEnabled: false,
      cavemanEnabled: false,
      ponytailEnabled: false,
      pxpipeEnabled: false,
    });

    expect(events).toEqual(["detect:openai", "translate:openai"]);
    expect(translateRequestMock.mock.calls[0][3]).toEqual(expect.objectContaining({
      tools: expect.arrayContaining([
        expect.objectContaining({ function: expect.objectContaining({ name: "mcp__repo__search" }) }),
      ]),
    }));
  });
});
