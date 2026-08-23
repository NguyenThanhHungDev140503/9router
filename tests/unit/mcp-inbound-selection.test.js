import { describe, expect, it } from "vitest";

import { MAX_INJECTED_TOOLS } from "../../open-sse/config/mcpConstants.js";
import {
  extractUserPromptText,
  selectInboundMcp,
} from "../../open-sse/mcp/inboundSelection.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const enabledServers = [
  { id: "filesystem", name: "Filesystem", enabled: true, activationMode: "auto", triggers: ["file", "workspace"] },
  { id: "search", name: "Search", enabled: true, activationMode: "always" },
  { id: "disabled-server", name: "Disabled", enabled: false, activationMode: "always" },
];

const cacheRows = [
  {
    serverId: "filesystem",
    tools: [{ name: "read_file", description: "Read a file from workspace.", inputSchema: { type: "object" } }],
  },
  {
    serverId: "search",
    tools: [{ name: "search_docs", description: "Search documentation.", inputSchema: { type: "object" } }],
  },
  {
    serverId: "disabled-server",
    tools: [{ name: "hidden_tool", description: "Must never inject.", inputSchema: { type: "object" } }],
  },
];

const skills = [
  {
    name: "Repository Guide",
    description: "Help with repository files.",
    systemPrompt: "Use repository conventions.",
    enabled: true,
    matchRules: { mode: "auto", triggers: ["repository", "repo"] },
  },
  {
    name: "Always Skill",
    description: "Always present.",
    systemPrompt: "Always follow policy.",
    enabled: true,
    matchRules: { mode: "always" },
  },
  {
    name: "Disabled Skill",
    description: "Must not inject.",
    systemPrompt: "Never include this.",
    enabled: true,
    matchRules: { mode: "disabled" },
  },
];

function select(overrides = {}) {
  return selectInboundMcp({
    format: FORMATS.OPENAI,
    body: { messages: [{ role: "user", content: "Find file in repository" }] },
    servers: enabledServers,
    toolCache: cacheRows,
    skills,
    ...overrides,
  });
}

describe("MCP inbound selection", () => {
  it("extracts user text from supported request formats", () => {
    expect(extractUserPromptText(FORMATS.OPENAI, {
      messages: [{ role: "user", content: [{ type: "text", text: "Open source docs" }] }],
    })).toBe("Open source docs");
    expect(extractUserPromptText(FORMATS.CLAUDE, {
      messages: [{ role: "user", content: [{ type: "text", text: "Read file" }] }],
    })).toBe("Read file");
    expect(extractUserPromptText(FORMATS.GEMINI, {
      contents: [{ role: "user", parts: [{ text: "Search docs" }] }],
    })).toBe("Search docs");
    expect(extractUserPromptText(FORMATS.OPENAI_RESPONSES, {
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Find repository" }] }],
    })).toBe("Find repository");
  });

  it("selects enabled always candidates, rejects disabled entries, and defaults missing modes to auto", () => {
    const result = select({
      servers: [
        { id: "always", name: "Always", enabled: true, activationMode: "always" },
        { id: "implicit-auto", name: "Findable", enabled: true, triggers: ["match me"] },
        { id: "disabled", name: "Disabled", enabled: true, activationMode: "disabled" },
      ],
      toolCache: [
        { serverId: "always", tools: [{ name: "always_tool" }] },
        { serverId: "implicit-auto", tools: [{ name: "auto_tool" }] },
        { serverId: "disabled", tools: [{ name: "disabled_tool" }] },
      ],
      skills: [
        { name: "Always Skill", description: "", systemPrompt: "", enabled: true, matchRules: { mode: "always" } },
        { name: "Findable Skill", description: "", systemPrompt: "", enabled: true, matchRules: { triggers: ["match me"] } },
        { name: "Disabled Skill", description: "", systemPrompt: "", enabled: true, matchRules: { mode: "disabled" } },
      ],
      body: { messages: [{ role: "user", content: "Please match me" }] },
    });

    expect(result.tools.map(({ tool }) => tool.name)).toEqual(["always_tool", "auto_tool"]);
    expect(result.skills.map(({ name }) => name)).toEqual(["Always Skill", "Findable Skill"]);
  });

  it("matches auto candidates with normalized triggers, names, and descriptions", () => {
    const result = select();

    expect(result.tools.map(({ tool }) => tool.name)).toEqual(["read_file", "search_docs"]);
    expect(result.skills.map(({ name }) => name)).toEqual(["Repository Guide", "Always Skill"]);
  });

  it("returns zero auto tools when no lexical candidate matches", () => {
    const result = select({
      servers: [{ id: "filesystem", name: "Filesystem", enabled: true, activationMode: "auto", triggers: ["file"] }],
      toolCache: cacheRows.slice(0, 1),
      skills: [{ ...skills[0], matchRules: { mode: "auto", triggers: ["repo"] } }],
      body: { messages: [{ role: "user", content: "Explain quantum mechanics" }] },
    });

    expect(result.tools).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.reason).toBe("no-match");
  });

  it("uses x-mcp-servers only as an enabled known-server allow-list", () => {
    const result = select({
      headers: {
        "x-mcp-servers": " filesystem, disabled-server, unknown, filesystem, \u0000bad ",
      },
    });

    expect(result.tools.map(({ serverId }) => serverId)).toEqual(["filesystem"]);
    expect(result.tools.map(({ tool }) => tool.name)).toEqual(["read_file"]);
  });

  it("keeps stable server/cache order and applies configured cap", () => {
    const tools = Array.from({ length: MAX_INJECTED_TOOLS + 5 }, (_, index) => ({
      name: `tool_${index}`,
      description: "Always selected.",
    }));
    const result = select({
      servers: [{ id: "bulk", name: "Bulk", enabled: true, activationMode: "always" }],
      toolCache: [{ serverId: "bulk", tools }],
      skills: [],
    });

    expect(result.tools).toHaveLength(MAX_INJECTED_TOOLS);
    expect(result.tools.map(({ tool }) => tool.name)).toEqual(
      tools.slice(0, MAX_INJECTED_TOOLS).map(({ name }) => name),
    );
  });

  it("fails open on malformed inputs without mutating cached records or skills", () => {
    const malformedCache = [{ serverId: "filesystem", tools: [{ name: "read_file" }] }];
    const sourceSkills = [{ ...skills[0], matchRules: "not-an-object" }];
    const result = select({
      body: null,
      servers: [{ id: "filesystem", enabled: true, activationMode: "auto" }],
      toolCache: malformedCache,
      skills: sourceSkills,
      headers: { "x-mcp-servers": {} },
    });

    expect(result).toEqual({ tools: [], skills: [], reason: "invalid-input" });
    expect(malformedCache).toEqual([{ serverId: "filesystem", tools: [{ name: "read_file" }] }]);
    expect(sourceSkills).toEqual([{ ...skills[0], matchRules: "not-an-object" }]);
  });
});
