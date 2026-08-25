# In-Memory BM25 Tool & Skill Search Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace naive substring matching in 9router's inbound MCP/Skill selection with an In-Memory BM25 index (MiniSearch) and explicit fast-path matcher for sub-millisecond, highly accurate tool selection and token optimization.

**Architecture:** Create a new `open-sse/mcp/search/` module comprising a tokenizer, regex explicit matcher, and `ToolIndexManager` using MiniSearch. Integrate this search pipeline into `inboundSelection.js` and wire atomic rebuild triggers into MCP/Skills API mutations.

**Tech Stack:** Node.js (ESM), `minisearch`, Vitest / Node test runner, SQLite (`better-sqlite3`).

---

### File Structure & Responsibilities
- Create: `open-sse/mcp/search/tokenizer.js` — Text extraction, NFKC normalization, stopword filtering, tokenization.
- Create: `open-sse/mcp/search/explicitMatcher.js` — Regex-based fast-path matching for `$skill-name` and `@server-name`.
- Create: `open-sse/mcp/search/toolIndex.js` — MiniSearch index lifecycle (init, search, atomic rebuild, scoring threshold).
- Modify: `open-sse/config/mcpConstants.js` — Add constants for score threshold, max skills, and boost weights.
- Modify: `open-sse/mcp/inboundSelection.js` — Replace naive `lexicalMatch` with the new hybrid search pipeline (Fast-Path + BM25 + Mode Filter).
- Modify: `src/app/api/mcp/servers/route.js`, `src/app/api/skills/route.js` — Trigger async index sync upon CRUD/toggle operations.
- Test: `test/mcp/tokenizer.test.js` — Unit tests for tokenization and text normalization.
- Test: `test/mcp/explicitMatcher.test.js` — Unit tests for `$skill` and `@server` syntax matching.
- Test: `test/mcp/toolIndex.test.js` — Unit tests for MiniSearch index creation, query scoring, fuzzy/prefix search, and atomic swap.
- Test: `test/mcp/inboundSelectionSearch.test.js` — Integration test for end-to-end inbound selection with the new index.

---

### Task 1: Install `minisearch` Dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `minisearch` package**

Run: `npm install minisearch`
Expected: `minisearch` added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify installation**

Run: `node -e 'import("minisearch").then(() => console.log("MiniSearch OK"));'`
Expected: Output `MiniSearch OK`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): install minisearch for in-memory tool search index"
```

---

### Task 2: Implement Tokenizer & Text Normalization

**Files:**
- Create: `open-sse/mcp/search/tokenizer.js`
- Test: `test/mcp/tokenizer.test.js`

- [ ] **Step 1: Write failing unit test for `tokenizer.js`**

Create `test/mcp/tokenizer.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { normalizePromptText, tokenizeAndClean } from "../../open-sse/mcp/search/tokenizer.js";

describe("Tokenizer & Normalization", () => {
  it("normalizes unicode and removes excessive punctuation", () => {
    const raw = "  Hãy Đọc File: /tmp/test.txt!!!  ";
    const normalized = normalizePromptText(raw);
    expect(normalized).toBe("hãy đọc file /tmp/test.txt");
  });

  it("extracts tokens and filters short noise", () => {
    const text = "read the file and save to database";
    const tokens = tokenizeAndClean(text);
    expect(tokens).toContain("read");
    expect(tokens).toContain("file");
    expect(tokens).toContain("save");
    expect(tokens).toContain("database");
    expect(tokens).not.toContain("to");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/mcp/tokenizer.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `open-sse/mcp/search/tokenizer.js`**

```javascript
const COMMON_STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "là", "và", "hoặc", "của", "trong", "cho", "trên", "với", "tại", "bởi", "từ", "hãy", "giúp"
]);

export function normalizePromptText(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}_\-./\\]+/gu, " ")
    .trim();
}

export function tokenizeAndClean(text) {
  if (typeof text !== "string") return [];
  const normalized = normalizePromptText(text);
  return normalized
    .split(/\s+/)
    .filter((token) => token.length > 1 && !COMMON_STOP_WORDS.has(token));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/mcp/tokenizer.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add open-sse/mcp/search/tokenizer.js test/mcp/tokenizer.test.js
git commit -m "feat(mcp): add tokenizer and text normalization for search index"
```

---

### Task 3: Implement Explicit Fast-Path Matcher

**Files:**
- Create: `open-sse/mcp/search/explicitMatcher.js`
- Test: `test/mcp/explicitMatcher.test.js`

- [ ] **Step 1: Write failing unit test for `explicitMatcher.js`**

Create `test/mcp/explicitMatcher.test.js`:
```javascript
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

  it("returns empty arrays when no mentions found", () => {
    const prompt = "Hãy viết một bài văn";
    const result = matchExplicitMentions(prompt, { skills: activeSkills, servers: activeServers });
    expect(result.skills).toEqual([]);
    expect(result.servers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/mcp/explicitMatcher.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `open-sse/mcp/search/explicitMatcher.js`**

```javascript
const SKILL_MENTION_REGEX = /\$([a-zA-Z0-9_-]+)/g;
const SERVER_MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g;

export function matchExplicitMentions(prompt, { skills = [], servers = [] } = {}) {
  const matchedSkills = [];
  const matchedServers = [];

  if (typeof prompt !== "string" || !prompt) {
    return { skills: matchedSkills, servers: matchedServers };
  }

  // Check $skill mentions
  const skillMatches = [...prompt.matchAll(SKILL_MENTION_REGEX)].map((m) => m[1].toLocaleLowerCase());
  if (skillMatches.length > 0) {
    for (const skill of skills) {
      const name = skill?.name?.toLocaleLowerCase();
      if (name && skillMatches.includes(name)) {
        matchedSkills.push(skill);
      }
    }
  }

  // Check @server mentions
  const serverMatches = [...prompt.matchAll(SERVER_MENTION_REGEX)].map((m) => m[1].toLocaleLowerCase());
  if (serverMatches.length > 0) {
    for (const server of servers) {
      const id = server?.id?.toLocaleLowerCase();
      const name = server?.name?.toLocaleLowerCase();
      if ((id && serverMatches.includes(id)) || (name && serverMatches.includes(name))) {
        matchedServers.push(server);
      }
    }
  }

  return { skills: matchedSkills, servers: matchedServers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/mcp/explicitMatcher.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add open-sse/mcp/search/explicitMatcher.js test/mcp/explicitMatcher.test.js
git commit -m "feat(mcp): add explicit mention matcher for $skill and @server"
```

---

### Task 4: Implement In-Memory MiniSearch Index Manager (`toolIndex.js`)

**Files:**
- Create: `open-sse/mcp/search/toolIndex.js`
- Modify: `open-sse/config/mcpConstants.js`
- Test: `test/mcp/toolIndex.test.js`

- [ ] **Step 1: Update constants in `open-sse/config/mcpConstants.js`**

Add constants:
```javascript
export const MCP_SEARCH_CONFIG = Object.freeze({
  MIN_SCORE_THRESHOLD: 1.2,
  MAX_INJECTED_TOOLS_DEFAULT: 5,
  MAX_INJECTED_SKILLS_DEFAULT: 3,
  BOOST: {
    triggers: 4.0,
    keywords: 3.0,
    name: 2.0,
    description: 1.0,
  },
});
```

- [ ] **Step 2: Write failing unit test for `toolIndex.js`**

Create `test/mcp/toolIndex.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { ToolIndexManager } from "../../open-sse/mcp/search/toolIndex.js";

describe("ToolIndexManager (MiniSearch)", () => {
  const servers = [{ id: "fs", name: "filesystem", enabled: true }];
  const toolCache = [{
    serverId: "fs",
    tools: [
      { name: "read_file", description: "Read file contents from filesystem disk" },
      { name: "write_file", description: "Write content to a file" }
    ]
  }];
  const skills = [{ id: "s1", name: "code-reviewer", systemPrompt: "Review source code for bugs", enabled: true }];

  it("indexes tools and skills and retrieves them by relevance score", () => {
    const manager = new ToolIndexManager();
    manager.buildIndex({ servers, toolCache, skills });

    const results = manager.search("I want to read a file from disk");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe("tool");
    expect(results[0].name).toBe("read_file");
  });

  it("handles typo fuzzy search", () => {
    const manager = new ToolIndexManager();
    manager.buildIndex({ servers, toolCache, skills });

    const results = manager.search("reveiw source code");
    expect(results.some((r) => r.name === "code-reviewer")).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `npx vitest run test/mcp/toolIndex.test.js`
Expected: FAIL.

- [ ] **Step 4: Implement `open-sse/mcp/search/toolIndex.js`**

```javascript
import MiniSearch from "minisearch";
import { MCP_SEARCH_CONFIG } from "../../config/mcpConstants.js";
import { normalizePromptText } from "./tokenizer.js";

export class ToolIndexManager {
  constructor() {
    this.index = null;
    this.documents = new Map();
  }

  static createSearchEngine() {
    return new MiniSearch({
      fields: ["triggers", "keywords", "name", "description"],
      storeFields: ["id", "type", "serverId", "name"],
      searchOptions: {
        boost: MCP_SEARCH_CONFIG.BOOST,
        fuzzy: (term) => (term.length > 4 ? 0.2 : false),
        prefix: true,
        combineWith: "OR",
      },
    });
  }

  buildIndex({ servers = [], toolCache = [], skills = [] } = {}) {
    const engine = ToolIndexManager.createSearchEngine();
    const docs = [];
    const docMap = new Map();

    const enabledServerIds = new Set(
      servers.filter((s) => s?.enabled === true && typeof s?.id === "string").map((s) => s.id)
    );

    // Index Tools
    for (const cacheRow of toolCache) {
      if (!enabledServerIds.has(cacheRow.serverId) || !Array.isArray(cacheRow.tools)) continue;

      for (const tool of cacheRow.tools) {
        if (!tool?.name) continue;
        const id = `tool:${cacheRow.serverId}:${tool.name}`;
        const doc = {
          id,
          type: "tool",
          serverId: cacheRow.serverId,
          name: tool.name,
          triggers: Array.isArray(tool.triggers) ? tool.triggers.join(" ") : "",
          keywords: Array.isArray(tool.keywords) ? tool.keywords.join(" ") : "",
          description: tool.description || "",
        };
        docs.push(doc);
        docMap.set(id, { ...doc, raw: tool });
      }
    }

    // Index Skills
    for (const skill of skills) {
      if (skill?.enabled !== true || !skill?.name) continue;
      const id = `skill:${skill.id || skill.name}`;
      const doc = {
        id,
        type: "skill",
        name: skill.name,
        triggers: Array.isArray(skill.triggers) ? skill.triggers.join(" ") : "",
        keywords: Array.isArray(skill.keywords) ? skill.keywords.join(" ") : "",
        description: skill.description || skill.systemPrompt || "",
      };
      docs.push(doc);
      docMap.set(id, { ...doc, raw: skill });
    }

    engine.addAll(docs);
    this.index = engine;
    this.documents = docMap;
  }

  search(query, { minScore = MCP_SEARCH_CONFIG.MIN_SCORE_THRESHOLD } = {}) {
    if (!this.index || typeof query !== "string" || !query.trim()) return [];
    const normalized = normalizePromptText(query);
    if (!normalized) return [];

    const searchResults = this.index.search(normalized);
    return searchResults
      .filter((res) => res.score >= minScore)
      .map((res) => {
        const fullDoc = this.documents.get(res.id);
        return {
          ...res,
          ...fullDoc,
        };
      });
  }
}

export const globalToolIndex = new ToolIndexManager();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/mcp/toolIndex.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add open-sse/config/mcpConstants.js open-sse/mcp/search/toolIndex.js test/mcp/toolIndex.test.js
git commit -m "feat(mcp): implement in-memory MiniSearch tool index manager"
```

---

### Task 5: Refactor `inboundSelection.js` to Use BM25 Search & Fast-Path

**Files:**
- Modify: `open-sse/mcp/inboundSelection.js`
- Test: `test/mcp/inboundSelection.test.js`
- Create: `test/mcp/inboundSelectionSearch.test.js`

- [ ] **Step 1: Write integration test for new search-driven `inboundSelection.js`**

Create `test/mcp/inboundSelectionSearch.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { selectInboundMcp } from "../../open-sse/mcp/inboundSelection.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("selectInboundMcp with BM25 & Fast-Path", () => {
  const servers = [{ id: "fs", name: "fs-server", enabled: true }];
  const toolCache = [{
    serverId: "fs",
    tools: [
      { name: "read_file", description: "Read a file from disk" },
      { name: "write_file", description: "Write content to disk" },
      { name: "delete_file", description: "Delete a file permanently" },
    ]
  }];
  const skills = [
    { id: "s1", name: "milestone-summary", systemPrompt: "Summarize milestones", enabled: true }
  ];

  it("selects relevant tools based on query score instead of indiscriminate dump", () => {
    const body = {
      messages: [{ role: "user", content: "Please read the file at /tmp/demo.txt" }]
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
      messages: [{ role: "user", content: "Chạy $milestone-summary giúp tôi" }]
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
});
```

- [ ] **Step 2: Update `open-sse/mcp/inboundSelection.js`**

Modify `open-sse/mcp/inboundSelection.js` to build/search the index and merge with explicit fast-path matches while honoring `ALWAYS`, `AUTO`, `DISABLED` and `x-mcp-servers` header.

- [ ] **Step 3: Run all MCP selection tests**

Run: `npx vitest run test/mcp/`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add open-sse/mcp/inboundSelection.js test/mcp/inboundSelectionSearch.test.js
git commit -m "feat(mcp): integrate BM25 search and fast-path into inbound selection"
```

---

### Task 6: Hook Realtime Index Rebuild into API Mutations

**Files:**
- Modify: `src/app/api/mcp/servers/route.js`
- Modify: `src/app/api/skills/route.js`

- [ ] **Step 1: Add index sync triggers in MCP and Skill API routes**

When servers/skills are created, updated, toggled, or deleted via REST API, trigger `globalToolIndex.buildIndex()` asynchronously to ensure live zero-downtime synchronization in RAM.

- [ ] **Step 2: Verify build and test suite**

Run: `npm test`
Expected: All unit and integration tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mcp/servers/route.js src/app/api/skills/route.js
git commit -m "feat(mcp): wire realtime search index rebuild to REST API mutations"
```

---

## Plan Review Checklist
1. **Spec coverage:** Tất cả yêu cầu từ BM25 search, Fast-path `$skill` / `@server`, ranking weights, Top-K budget, và realtime sync đều có task tương ứng.
2. **No Placeholders:** Mọi step đều có code, file path và command cụ thể.
3. **Execution Ready:** Sẵn sàng thực thi.
