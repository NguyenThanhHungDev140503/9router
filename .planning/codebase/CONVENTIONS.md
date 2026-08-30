# Coding Conventions

**Analysis Date:** 2026-08-19

## Naming Patterns

**Files:**
- camelCase.js for service helpers, handlers, and utility modules (`chatCore.js`, `tokenRefresh.js`, `proxyFetch.js`)
- kebab-case.js for provider registry entries, executors, and unit test files (`azure.js`, `codebuddy-cn.js`, `combo-autoswitch.test.js`)
- PascalCase.js for React UI components (`ProviderIcon.js`, `ComboFormModal.js`, `RuntimeI18nProvider.js`)
- *.test.js for all unit, integration, and translator tests inside `tests/`

**Functions & Methods:**
- camelCase for functions, methods, and closures (`translateRequest`, `getExecutor`, `parseModel`, `execute`)
- handle* for UI event handlers and API request dispatchers (`handleSubmit`, `handleSelect`, `handleChat`)
- is*/has*/can* for boolean helper functions (`isActive`, `hasMaps`, `canRefresh`)

**Variables & Constants:**
- camelCase for local variables and module references (`adapter`, `accountList`, `requestData`)
- UPPER_SNAKE_CASE for configuration constants, error codes, and schema enums (`SCHEMA_VERSION`, `ROLE`, `CLAUDE_BLOCK`, `DEFAULT_TIMEOUT`)
- Leading underscore (`_*`) for global / process singletons to survive HMR (`global._dbAdapter`)

**Types & Schemas:**
- PascalCase for simulated type representations, schemas, and classes (`BaseExecutor`, `SqliteAdapter`, `User`)

## Code Style

**Formatting:**
- Modern ECMAScript / ESM (`import` / `export`) used across `src/` and `open-sse/`
- CommonJS (`require` / `module.exports`) used specifically in `custom-server.js`, `cli/`, and build scripts where direct Node startup without transpilation is required
- 2-space indentation, double quotes for strings, semicolons required
- Standard single/multiline ternary and guard clause patterns

**Linting:**
- ESLint 9 with `eslint.config.mjs` extending `eslint-config-next/core-web-vitals`
- Default ignores: `.next/**`, `out/**`, `build/**`
- Execution: `npx eslint .`

## Import Organization

**Order:**
1. Node.js built-ins (`node:path`, `node:url`, `crypto`, `http`)
2. External npm dependencies (`next`, `react`, `undici`, `jose`, `zustand`)
3. Internal framework and core aliases (`@/lib/db`, `@/shared/components`, `open-sse/config`)
4. Relative local imports (`./base.js`, `../utils/error.js`)

**Path Aliases:**
- `@/*` maps to `./src/*`
- `open-sse` and `open-sse/*` maps to `./open-sse` and `./open-sse/*`

## Error Handling

**Strategy:**
- **Fail-Open for Enhancements:** Modules like RTK token reduction, Caveman prompt injection, and request detail logging must NEVER crash the primary request stream. If compression or prompt parsing fails, catch internally, log debug info, and pass the original uncompressed body through.
- **Fail-Safe Fallback for Upstream Errors:** When an upstream provider returns a 429, 401 (expired token), or 5xx, catch in `chat.js` / `chatCore.js`, trigger background token refresh or advance to the next account / combo provider.
- **Structured Error Responses:** Client errors are mapped to OpenAI standard format: `{ error: { message, type, code } }` via `open-sse/utils/error.js`.

**Pattern:**
```javascript
try {
  const result = await operation();
  return result;
} catch (err) {
  if (isFatal(err)) {
    throw err;
  }
  console.warn(`[Module] Non-fatal error, falling back: ${err.message}`);
  return fallbackValue;
}
```

## Logging

**Framework:**
- Built-in `console.log`, `console.warn`, `console.error` with structured prefixes (`[DB]`, `[BackgroundTokenRefresh]`, `[RTK]`, `[Executor]`)
- File audit logging to `~/.9router/log.txt` via `src/lib/usageDb.js`
- In-memory request detail logger with sensitive data redaction (`src/lib/requestDetailsDb.js`)

## Module Design & Extensibility

**Translator Engine:**
- Self-registration via `register(from, to, reqFn, resFn)` at import time
- Direct pair routes take precedence over standard OpenAI bridge route
- Never hardcode role/block names; always import from `open-sse/translator/schema/`

**Provider Registry:**
- Declarative registration objects with capabilities, pricing, and default configurations
- Registry index is auto-generated; do not manually edit `open-sse/providers/registry/index.js`

---

*Convention analysis: 2026-08-19*
*Update when patterns change*
