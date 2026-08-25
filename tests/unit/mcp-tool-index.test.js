import { describe, it, expect } from "vitest";
import { ToolIndexManager, globalToolIndex } from "../../open-sse/mcp/search/toolIndex.js";

describe("ToolIndexManager (MiniSearch)", () => {
  const servers = [
    { id: "fs", name: "filesystem", enabled: true },
    { id: "disabled_srv", name: "disabled_server", enabled: false },
  ];
  const toolCache = [
    {
      serverId: "fs",
      tools: [
        {
          name: "read_file",
          description: "Read file contents from filesystem disk",
          triggers: ["read file", "open file"],
          keywords: ["disk", "file_reader"],
        },
        {
          name: "write_file",
          description: "Write content to a file",
        },
      ],
    },
    {
      serverId: "disabled_srv",
      tools: [
        { name: "disabled_tool", description: "Should not be indexed because server disabled" },
      ],
    },
  ];
  const skills = [
    {
      id: "s1",
      name: "code-reviewer",
      systemPrompt: "Review source code for bugs",
      enabled: true,
      matchRules: {
        triggers: ["check pr", "review code"],
        keywords: ["linter", "ast"],
      },
    },
    {
      id: "s2",
      name: "disabled-skill",
      description: "Disabled skill description",
      enabled: false,
    },
  ];

  it("indexes tools and skills and retrieves them by relevance score", () => {
    const manager = new ToolIndexManager();
    manager.buildIndex({ servers, toolCache, skills });

    const results = manager.search("I want to read a file from disk");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe("tool");
    expect(results[0].name).toBe("read_file");
    expect(results[0].raw).toBeDefined();
    expect(results[0].raw.name).toBe("read_file");
  });

  it("handles typo fuzzy search", () => {
    const manager = new ToolIndexManager();
    manager.buildIndex({ servers, toolCache, skills });

    const results = manager.search("reveiw source code");
    expect(results.some((r) => r.name === "code-reviewer")).toBe(true);
  });

  it("boosts triggers and keywords over description", () => {
    const manager = new ToolIndexManager();
    manager.buildIndex({ servers, toolCache, skills });

    const results = manager.search("check pr");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("code-reviewer");
    expect(results[0].type).toBe("skill");
  });

  it("filters out disabled servers and disabled skills", () => {
    const manager = new ToolIndexManager();
    manager.buildIndex({ servers, toolCache, skills });

    const toolResults = manager.search("disabled tool", { minScore: 0.1 });
    expect(toolResults.some((r) => r.name === "disabled_tool")).toBe(false);

    const skillResults = manager.search("disabled skill", { minScore: 0.1 });
    expect(skillResults.some((r) => r.name === "disabled-skill")).toBe(false);
  });

  it("supports skill with triggers/keywords on root or matchRules", () => {
    const customSkills = [
      {
        id: "s3",
        name: "test-runner",
        description: "Run unit tests",
        enabled: true,
        triggers: ["run tests", "execute vitest"],
        keywords: ["testing", "coverage"],
      },
    ];
    const manager = new ToolIndexManager();
    manager.buildIndex({ servers, toolCache, skills: customSkills });

    const results = manager.search("execute vitest");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("test-runner");
  });

  it("handles empty or missing queries gracefully", () => {
    const manager = new ToolIndexManager();
    manager.buildIndex({ servers, toolCache, skills });

    expect(manager.search("")).toEqual([]);
    expect(manager.search("   ")).toEqual([]);
    expect(manager.search(null)).toEqual([]);
    expect(manager.search(undefined)).toEqual([]);
  });

  it("handles unbuilt index gracefully", () => {
    const manager = new ToolIndexManager();
    expect(manager.search("read file")).toEqual([]);
  });

  it("provides singleton globalToolIndex instance", () => {
    expect(globalToolIndex).toBeInstanceOf(ToolIndexManager);
  });
});
