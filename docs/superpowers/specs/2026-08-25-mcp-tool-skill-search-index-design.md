# Design Specification: In-Memory BM25 Tool & Skill Search Index for 9router

**Author:** Codex  
**Date:** 2026-08-25  
**Status:** Approved  
**Target Subsystem:** `open-sse/mcp/` & `src/lib/mcp/`

---

## 1. Problem Statement & Motivation

Currently, 9router uses naive string substring matching (`String.prototype.includes()`) in `open-sse/mcp/inboundSelection.js` to dispatch MCP tools and Custom Skills to upstream LLM payloads:
1. **Low Precision & Recall:** Full descriptions almost never match conversational prompts verbatim, while short names (e.g., `get`, `run`, `file`) trigger false positives across unrelated queries.
2. **No Ranking / Relevance Scoring:** Candidates are selected in SQLite insertion order up to `MAX_INJECTED_TOOLS = 30`, diluting model attention and inflating token costs.
3. **No Explicit Mention Fast-Path:** Users mentioning `$skill-name` or `@server-name` still go through loose substring matching instead of immediate deterministic dispatch.

---

## 2. Goals & Success Criteria

- **Sub-millisecond Search:** Zero network calls, zero external embedding services; in-memory BM25 index query execution `< 1ms`.
- **Intelligent Ranking:** Score-weighted field matching (`triggers` > `keywords` > `name` > `description`) with fuzzy typo tolerance.
- **Explicit Fast-Path:** Instant 100% precision dispatch for `$skill-name` and `@server-name` prompt references.
- **Tight Token Budget:** Reduce injected tools from a blanket 30 to a relevant Top-K (default: 5 tools, 3 skills) with `minScore` threshold filtering.
- **Fail-Open Resilience:** Complete failure boundary ensuring zero request disruptions on search index exceptions.

---

## 3. Architecture & Components

```
open-sse/mcp/
├── search/
│   ├── toolIndex.js          # In-memory MiniSearch lifecycle, index build, atomic swap
│   ├── tokenizer.js          # Text normalization, stopword filtering, token extraction
│   └── explicitMatcher.js    # Regex matcher for $skill-name and @server-name mentions
├── inboundSelection.js       # Orchestrates Fast-Path + BM25 ranking + Activation Mode filters
└── inboundInjectionPipeline.js
```

### 3.1. Document Model
```typescript
interface SearchDocument {
  id: string;             // "tool:<serverId>:<toolName>" or "skill:<skillId>"
  type: "tool" | "skill";
  serverId?: string;
  name: string;
  triggers: string;
  keywords: string;
  description: string;
  raw: object;            // Original MCP tool / Skill record
}
```

### 3.2. Search Configuration (`MiniSearch`)
- **Fields:** `['triggers', 'keywords', 'name', 'description']`
- **Boost Weights:**
  - `triggers`: 4.0
  - `keywords`: 3.0
  - `name`: 2.0
  - `description`: 1.0
- **Search Options:**
  - `fuzzy`: `(term) => term.length > 4 ? 0.2 : false`
  - `prefix`: `true`
  - `combineWith`: `'OR'`

---

## 4. End-to-End Processing Flow

```
[ Incoming Request Body ]
           │
           ▼
 1. Extract Normalized User Prompt Text
           │
           ├────────────────────────────────────────┐
           ▼                                        ▼
   [ Fast-Path Match ]                      [ BM25 Search ]
   - Match regex `\$([a-zA-Z0-9_-]+)`       - MiniSearch query over index
   - Match regex `@([a-zA-Z0-9_-]+)`        - Filter by minScore >= 1.5
   - Score = 999                            - Rank by descending score
           │                                        │
           └───────────────────┬────────────────────┘
                               │
                               ▼
 2. Merge, Mode Filtering & Deduplication
    - ALWAYS mode: Score = 1000 (unconditional injection)
    - DISABLED mode: Exclude
    - AUTO mode: Include if Fast-Path or BM25 matched
    - Respect `x-mcp-servers` header override
                               │
                               ▼
 3. Top-K Slice & Inject
    - Tools: Top 5
    - Skills: Top 3
    - Format-aware injection into OpenAI / Claude / Gemini payloads
```

---

## 5. Index Lifecycle & Dynamic Sync

1. **Cold Start:** On server launch, `toolIndex.init()` reads enabled servers, tool caches, and skills from SQLite and builds the in-memory inverted index.
2. **Realtime Sync:** When CRUD or toggle operations occur via `/api/mcp/servers`, `/api/mcp/tools`, or `/api/skills`, an async `toolIndex.rebuild()` is triggered with atomic instance replacement (zero locking, zero read interruption).

---

## 6. Testing & Validation Plan

1. **Unit Tests:**
   - `test/mcp/toolIndex.test.js`: Index document creation, boost scoring verification, fuzzy & prefix matching.
   - `test/mcp/explicitMatcher.test.js`: Regex extraction for `$skill` and `@server`.
2. **Integration Tests:**
   - `test/mcp/inboundSelection.test.js`: Top-K limiting, mode filtering (`ALWAYS`, `AUTO`, `DISABLED`), header overrides.
3. **Benchmark:**
   - Verify index construction `< 50ms` for 500 tools and query search latency `< 1ms` per request.
