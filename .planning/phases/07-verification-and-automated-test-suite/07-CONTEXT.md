# Phase 7 Context & Discussion

## Key Technical Decisions

### 1. Subprocess Stdio Mocking & Lifecycle Testing
- Use real child processes (`node -e ...` / fixture scripts) for Stdio transport and `McpProcessManager` tests.
- Verifies real OS behavior: SIGTERM graceful shutdown, SIGKILL fallback on timeout, stderr logging, buffer newline framing, and crash recovery (`exit code != 0`, `EPIPE`).

### 2. ReAct Multi-Turn E2E Simulation
- Use local HTTP mock upstream server to simulate real LLM provider responses (OpenAI, Claude, Gemini).
- Test full gateway request lifecycle:
  1. Client sends request to `/v1/chat/completions` or `/v1/messages`.
  2. Gateway injects tools and calls upstream mock server.
  3. Upstream mock emits `mcp__*` tool call.
  4. Gateway intercepts tool call, executes tool on MCP server, appends tool result message.
  5. Gateway makes follow-up upstream request and streams final answer back to client.

### 3. NPM Script Integration
- Add clear test scripts:
  - `npm --prefix tests run test` (all tests)
  - Root `package.json` convenience scripts:
    - `npm run test:mcp` -> run all unit & E2E MCP tests.
    - `npm run test:gate` -> run tests and verify no regressions with strict zero-failure rule for MCP suites.

### 4. Strict Regression & Verification Gate
- Extend `verify-no-regression.mjs` / verification gate:
  - Strict rule: All MCP and Skills test suites must pass 100% (zero failures permitted).
  - Baseline checks: No existing baseline test can transition from passing to failing.
