import { describe, it, expect } from "vitest";
import { MCP_SEARCH_CONFIG } from "../../open-sse/config/mcpConstants.js";
import { selectInboundMcp } from "../../open-sse/mcp/inboundSelection.js";
import { ToolIndexManager } from "../../open-sse/mcp/search/toolIndex.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("selectInboundMcp with BM25 & Fast-Path", () => {
  const servers = [{ id: "fs", name: "fs-server", enabled: true }];
  const toolCache = [
    {
      serverId: "fs",
      tools: [
        { name: "read_file", description: "Read a file from disk" },
        { name: "write_file", description: "Write content to disk" },
        { name: "delete_file", description: "Delete a file permanently" },
      ],
    },
  ];
  const skills = [
    { id: "s1", name: "milestone-summary", systemPrompt: "Summarize milestones", enabled: true },
  ];

  it("selects relevant tools based on query score instead of indiscriminate dump", () => {
    const body = {
      messages: [{ role: "user", content: "Please read the file at /tmp/demo.txt" }],
    };
    const result = selectInboundMcp({
      format: FORMATS.OPENAI,
      body,
      servers,
      toolCache,
      skills,
    });

    expect(result.tools.some((t) => t.tool.name === "read_file")).toBe(true);
    // Unrelated tools should not be picked if score is low
    expect(result.tools.some((t) => t.tool.name === "delete_file")).toBe(false);
  });

  it("instantly selects skill when explicit $skill is present", () => {
    const body = {
      messages: [{ role: "user", content: "Chạy $milestone-summary giúp tôi" }],
    };
    const result = selectInboundMcp({
      format: FORMATS.OPENAI,
      body,
      servers,
      toolCache,
      skills,
    });

    expect(result.skills.some((s) => s.name === "milestone-summary")).toBe(true);
  });

  it("instantly selects server tools when explicit @server is present", () => {
    const body = {
      messages: [{ role: "user", content: "Use @fs to manage documents" }],
    };
    const result = selectInboundMcp({
      format: FORMATS.OPENAI,
      body,
      servers,
      toolCache,
      skills,
    });

    expect(result.tools.some((t) => t.serverId === "fs" && t.tool.name === "read_file")).toBe(true);
    expect(result.tools.some((t) => t.serverId === "fs" && t.tool.name === "write_file")).toBe(true);
  });

  it("merges explicit fast-path, ALWAYS candidates, and BM25 search without duplicates", () => {
    const mixedServers = [
      { id: "always_srv", name: "always-server", enabled: true, activationMode: "always" },
      { id: "fs", name: "fs-server", enabled: true, activationMode: "auto" },
    ];
    const mixedCache = [
      {
        serverId: "always_srv",
        tools: [{ name: "ping_service", description: "Healthcheck service" }],
      },
      {
        serverId: "fs",
        tools: [
          { name: "read_file", description: "Read a file from disk" },
          { name: "write_file", description: "Write content to disk" },
        ],
      },
    ];
    const mixedSkills = [
      { id: "s1", name: "milestone-summary", systemPrompt: "Summarize milestones", enabled: true },
      { id: "s_always", name: "always-guidelines", systemPrompt: "Follow rules", enabled: true, activationMode: "always" },
    ];

    const body = {
      messages: [{ role: "user", content: "Please execute $milestone-summary and read file content" }],
    };

    const result = selectInboundMcp({
      format: FORMATS.OPENAI,
      body,
      servers: mixedServers,
      toolCache: mixedCache,
      skills: mixedSkills,
    });

    // ALWAYS server tool + ALWAYS skill
    expect(result.tools.some((t) => t.tool.name === "ping_service")).toBe(true);
    expect(result.skills.some((s) => s.name === "always-guidelines")).toBe(true);

    // Fast-path skill
    expect(result.skills.some((s) => s.name === "milestone-summary")).toBe(true);

    // BM25 matched tool
    expect(result.tools.some((t) => t.tool.name === "read_file")).toBe(true);
  });

  it("enforces configured tool and skill budgets across explicit and always matches", () => {
    const budgetTools = Array.from(
      { length: MCP_SEARCH_CONFIG.MAX_INJECTED_TOOLS_DEFAULT + 2 },
      (_, index) => ({ name: `tool_${index}`, description: "Always injected tool" }),
    );
    const budgetSkills = Array.from(
      { length: MCP_SEARCH_CONFIG.MAX_INJECTED_SKILLS_DEFAULT + 2 },
      (_, index) => ({
        id: `skill_${index}`,
        name: `skill_${index}`,
        systemPrompt: "Always injected skill",
        enabled: true,
        activationMode: "always",
      }),
    );

    const result = selectInboundMcp({
      format: FORMATS.OPENAI,
      body: { messages: [{ role: "user", content: "Use @budget $skill_0" }] },
      servers: [{ id: "budget", name: "budget", enabled: true, activationMode: "always" }],
      toolCache: [{ serverId: "budget", tools: budgetTools }],
      skills: budgetSkills,
    });

    expect(result.tools).toHaveLength(MCP_SEARCH_CONFIG.MAX_INJECTED_TOOLS_DEFAULT);
    expect(result.skills).toHaveLength(MCP_SEARCH_CONFIG.MAX_INJECTED_SKILLS_DEFAULT);
  });

  it("uses supplied persistent index without rebuilding it per selection", () => {
    const indexManager = new ToolIndexManager();
    indexManager.buildIndex({ servers, toolCache, skills });
    const originalBuildIndex = indexManager.buildIndex;
    indexManager.buildIndex = () => {
      throw new Error("selection should reuse an initialized index");
    };

    const result = selectInboundMcp({
      format: FORMATS.OPENAI,
      body: { messages: [{ role: "user", content: "read file" }] },
      servers,
      toolCache,
      skills,
      indexManager,
    });

    indexManager.buildIndex = originalBuildIndex;
    expect(result.tools.some((item) => item.tool.name === "read_file")).toBe(true);
  });

  it("returns allowedServerIds containing eligible enabled servers and emits diagnostics for explicit targets", () => {
    const mixedServers = [
      { id: "srv-shared", name: "shared-srv", enabled: true },
      { id: "srv-disabled", name: "disabled-srv", enabled: false },
    ];
    const mixedCache = [
      { serverId: "srv-shared", tools: [{ name: "ping" }] },
      { serverId: "srv-disabled", tools: [{ name: "noop" }] },
    ];
    const mixedSkills = [
      { id: "skill-1", name: "helper", systemPrompt: "Help", enabled: true },
    ];

    const result = selectInboundMcp({
      format: FORMATS.OPENAI,
      body: { messages: [{ role: "user", content: "Check @shared-srv and @disabled-srv and @nonexistent" }] },
      servers: mixedServers,
      toolCache: mixedCache,
      skills: mixedSkills,
    });

    expect(result.allowedServerIds).toBeInstanceOf(Set);
    expect(result.allowedServerIds.has("srv-shared")).toBe(true);
    expect(result.allowedServerIds.has("srv-disabled")).toBe(false);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "disabled-srv", reason: "server_disabled" }),
        expect.objectContaining({ target: "nonexistent", reason: "server_not_found" }),
      ])
    );
  });
});
