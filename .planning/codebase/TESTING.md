# Testing Patterns

**Analysis Date:** 2026-08-19

## Test Framework

**Runner:**
- Vitest 1.x
- Configuration: `tests/vitest.config.js` (resolves root-relative path aliases `@/*` and `open-sse/*`)

**Assertion Library:**
- Vitest built-in `expect` & `chai`
- Matchers: `toBe`, `toEqual`, `toThrow`, `toMatchSnapshot`, `toBeDefined`

**Run Commands:**
```bash
# Run tests from the tests package
cd tests && npx vitest run

# Run a specific unit test file
npx vitest run unit/capabilities.test.js

# Run translator snapshot tests
npx vitest run translator/golden-request.test.js

# Verify provider and regression baselines
node tests/__baseline__/verify-no-regression.mjs
node tests/__baseline__/verify-providers.mjs
node tests/__baseline__/verify-alias.mjs
node tests/__baseline__/verify-oauth-urls.mjs
```

## Test File Organization

**Location:**
- Dedicated `tests/` folder organized by test category:
  - `tests/unit/` - Unit tests for core services, database drivers, combos, RTK, and executors
  - `tests/translator/` - Format conversion, roundtrip tests, and golden snapshots
  - `tests/real/` - Live provider API integration tests (skipped in CI without credentials)
  - `tests/__baseline__/` - Snapshot baselines, known failures list, and regression verification scripts

**Naming:**
- `*.test.js` for all Vitest test suites
- `*.real.test.js` for live upstream provider tests
- `*.snap` for snapshot comparison files in `__snapshots__/`

## Test Structure

**Suite Organization:**
```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("ServiceName", () => {
  beforeEach(() => {
    // Reset state / mocks
  });

  it("should handle expected input correctly", async () => {
    // arrange
    const input = { model: "claude-3-5-sonnet", messages: [] };

    // act
    const result = await processRequest(input);

    // assert
    expect(result).toBeDefined();
    expect(result.status).toBe("success");
  });

  it("should fail open on malformed input", () => {
    expect(() => processRequest(null)).not.toThrow();
  });
});
```

## Mocking

**Framework:**
- Vitest built-in mocking (`vi.fn()`, `vi.spyOn()`, `vi.mock()`)

**Patterns:**
- Mocking external HTTP requests via global fetch or undici mocks:
```javascript
vi.spyOn(global, "fetch").mockResolvedValue(
  new Response(JSON.stringify({ ok: true }), { status: 200 })
);
```
- Mocking database adapters and SQLite instances to verify migrations and query execution in-memory.

**What to Mock:**
- Network calls to third-party AI provider APIs (Anthropic, OpenAI, xAI, Google)
- OS-level system calls (process spawning, tray icons, machine ID generation)
- Local file system operations for temporary test artifacts

**What NOT to Mock:**
- Format translator logic (`open-sse/translator/*`) — tests should use real conversions
- RTK compression filters — tests must verify exact character/token pruning
- Pure utility and helper functions

## Baseline Verification & Regression Strategy

**Baseline Regression Tests:**
- The test suite is designed around baseline verification against known states:
  - `tests/__baseline__/known-fails.txt`: Documents tests that are known to fail due to missing local credentials or external-only dependencies (e.g. cloud workers).
  - `verify-no-regression.mjs`: Compares test outcomes against the known failures list to ensure no new regressions are introduced.
  - `verify-providers.mjs` & `verify-alias.mjs`: Verifies that provider registries and model aliases match committed baseline snapshots.

## Test Types

**Unit Tests (`tests/unit/`):**
- Test individual functions, models, database queries, and RTK filters in isolation.
- Fast execution (<100ms per test).

**Golden Snapshot Tests (`tests/translator/`):**
- Verify request and response payloads across OpenAI, Claude, Gemini, and Kiro formats using snapshot matching to ensure protocol stability.

**Integration Tests (`tests/unit/rtk.e2e.test.js`, `db-driver-chain.test.js`):**
- Test end-to-end interactions between multiple modules (e.g., SQLite adapter fallback chain, full combo routing with token compression).

**Live Real Tests (`tests/translator/real/`):**
- Make real upstream network calls when API keys are available in the local environment.

---

*Testing analysis: 2026-08-19*
*Update when test patterns change*
