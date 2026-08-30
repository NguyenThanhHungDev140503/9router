# Phase 7: Verification & Automated Test Suite - Specification

**Status:** Approved
**Created:** 2026-08-24
**Target Requirements:** MCP-TEST-01, MCP-TEST-02, MCP-TEST-03, MCP-TEST-04

---

## 1. Overview & Goals

Phase 7 establishes a comprehensive, high-fidelity automated test suite and regression verification gate across the MCP (Model Context Protocol) and Custom Skills subsystem.

### Key Objectives:
1. **MCP-TEST-01: SQLite Database & Repository Unit Tests:**
   - Verify `mcpRepo.js` and `skillsRepo.js` across SQLite database operations.
   - Test CRUD for MCP servers, tool caches, skill prompts, and gateway activation rules, including cascading deletions and foreign key constraints.

2. **MCP-TEST-02: JSON-RPC Client, Process Manager & Real Subprocess Tests:**
   - Test `McpClient`, `StdioTransport`, `SseTransport`, and `McpProcessManager`.
   - Use real child processes (`node -e ...`) to test OS signal handling (SIGTERM, SIGKILL fallback), stdout/stderr stream framing, broken pipe handling, unhandled crash recovery, and execution timeouts.

3. **MCP-TEST-03: Format-Aware Inbound Tool Schema Injection Tests:**
   - Verify tool schema transformation and injection across OpenAI (`tools.function`), Claude (`tools.input_schema`), and Gemini (`functionDeclarations`) formats.
   - Verify partition between server-side MCP tools (`mcp__*`) and client-native tools without leaking or cross-contaminating schemas.

4. **MCP-TEST-04: Full Pipeline ReAct Loop E2E Simulation & Strict Non-Regression Gate:**
   - E2E simulation using a local HTTP mock upstream server to verify end-to-end request handling, multi-turn tool execution, tool result injection, and streaming terminal output across OpenAI and Claude protocols.
   - Update verification gate (`verify-no-regression.mjs` / gate script) with strict rule: 100% pass on all MCP/Skills test suites and zero regression against baseline.

---

## 2. Test Architecture & Directory Structure

```
tests/
├── unit/
│   ├── mcp-skills-db.test.js              # (MCP-TEST-01) DB repositories
│   ├── mcp-client.test.js                 # (MCP-TEST-02) JSON-RPC client
│   ├── mcp-process-manager.test.js        # (MCP-TEST-02) Process manager lifecycle
│   ├── mcp-stdio-transport.test.js        # (MCP-TEST-02) Real child process stdio transport
│   ├── mcp-sse-transport.test.js          # (MCP-TEST-02) SSE transport
│   ├── mcp-security.test.js               # (MCP-TEST-02) Process security and isolation
│   ├── mcp-format-injector.test.js        # (MCP-TEST-03) OpenAI, Claude, Gemini injection
│   ├── mcp-tool-partition.test.js         # (MCP-TEST-03) Tool partitioning & filtering
│   ├── mcp-chat-core-injection.test.js    # (MCP-TEST-03) Inbound injection in ChatCore
│   ├── mcp-skill-prompt-injector.test.js  # (MCP-TEST-03) System prompt skills injection
│   ├── mcp-inbound-selection.test.js      # (MCP-TEST-03) Inbound header server selection
│   ├── mcp-tool-loop.test.js              # (MCP-TEST-04) Multi-turn ReAct autonomous loop
│   ├── mcp-tool-executor.test.js          # (MCP-TEST-04) Tool execution & output formatting
│   ├── api-mcp-servers.test.js            # REST API /api/mcp/servers
│   ├── api-mcp-tools-test.test.js         # REST API /api/mcp/tools & /api/mcp/test
│   └── api-skills.test.js                 # REST API /api/skills
├── e2e/
│   └── mcp-react-pipeline.e2e.test.js     # (MCP-TEST-04) HTTP Mock Upstream ReAct E2E
└── __baseline__/
    ├── known-fails.txt                    # Baseline known failure list
    └── verify-no-regression.mjs           # Strict regression gate checker
```

---

## 3. Verification Criteria & Gate Checks

1. **Scripts in Root `package.json`**:
   - `npm run test:mcp`: Run all MCP unit and E2E suites.
   - `npm run test:gate`: Run full test suite, output json report, and verify via strict gate.

2. **Strict Gate Enforcement**:
   - Every test matching `mcp-` or `api-mcp` or `api-skills` must pass (0 failures).
   - Baseline check: No non-MCP test can change from pass to fail relative to `known-fails.txt`.
