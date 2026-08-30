import { describe, it, expect } from "vitest";
import { matchExplicitMentions } from "../../open-sse/mcp/search/explicitMatcher.js";

describe("Explicit Fast-Path Matcher", () => {
  const activeSkills = [
    { id: "s1", name: "gsd-milestone-summary" },
    { id: "s2", name: "explain-technical-flow" },
  ];
  const activeServers = [
    { id: "github", name: "github" },
    { id: "filesystem", name: "fs-server" },
  ];

  it("extracts $skill mentions", () => {
    const prompt = "Hãy dùng $gsd-milestone-summary để tổng hợp milestone";
    const result = matchExplicitMentions(prompt, { skills: activeSkills, servers: activeServers });
    expect(result.skills.map((s) => s.name)).toContain("gsd-milestone-summary");
  });

  it("extracts @server mentions", () => {
    const prompt = "Vui lòng gọi @github để check issues";
    const result = matchExplicitMentions(prompt, { skills: activeSkills, servers: activeServers });
    expect(result.servers.map((s) => s.id)).toContain("github");
  });

  it("extracts @server mentions matching server name", () => {
    const prompt = "Vui lòng gọi @fs-server để đọc file";
    const result = matchExplicitMentions(prompt, { skills: activeSkills, servers: activeServers });
    expect(result.servers.map((s) => s.id)).toContain("filesystem");
  });

  it("handles case-insensitive matches for skills and servers", () => {
    const prompt = "Dùng $GSD-MILESTONE-SUMMARY và @GITHUB";
    const result = matchExplicitMentions(prompt, { skills: activeSkills, servers: activeServers });
    expect(result.skills.map((s) => s.name)).toContain("gsd-milestone-summary");
    expect(result.servers.map((s) => s.id)).toContain("github");
  });

  it("returns empty arrays when no mentions found", () => {
    const prompt = "Hãy viết một bài văn";
    const result = matchExplicitMentions(prompt, { skills: activeSkills, servers: activeServers });
    expect(result.skills).toEqual([]);
    expect(result.servers).toEqual([]);
  });

  it("handles empty or invalid prompt", () => {
    expect(matchExplicitMentions("", { skills: activeSkills, servers: activeServers })).toEqual({ skills: [], servers: [] });
    expect(matchExplicitMentions(null, { skills: activeSkills, servers: activeServers })).toEqual({ skills: [], servers: [] });
    expect(matchExplicitMentions(undefined)).toEqual({ skills: [], servers: [] });
  });
});
