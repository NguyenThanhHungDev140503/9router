---
status: resolved
trigger: "Khi mở MCP hoặc skill trên UI báo lỗi `Local only: CLI token required`; khi add MCP hoặc skill UI báo thành công nhưng item không hiển thị."
created: 2026-08-23
updated: 2026-08-23
---

# Debug Session: mcp-ui-token-error

## Symptoms

- Expected: Mở MCP/skill trên UI không lỗi; add MCP/skill thành công và item xuất hiện ngay.
- Actual: UI báo `Local only: CLI token required` khi mở MCP/skill. Add báo thành công nhưng item không hiển thị.
- Timeline: Sau milestone v1.0, hiện tại.
- Reproduction: Mở dashboard MCP/Skills; thử add MCP hoặc skill.

## Current Focus

- hypothesis: "UI management requests use an auth path requiring CLI token, or read/write endpoints use different persistence/read contexts."
- test: "Trace dashboard fetch/add flow, API auth middleware, and DB repository persistence."
- expecting: "Find mismatch between UI API client/auth headers and server endpoint authorization or list query."
- next_action: "run regression suite"

## Evidence

- timestamp: 2026-08-23
  finding: "`src/dashboardGuard.js` classified every `/api/mcp/*` route as local-only. Remote dashboard requests therefore received `Local only: CLI token required`; management GET/POST/PATCH routes were blocked before normal JWT auth."
- timestamp: 2026-08-23
  finding: "MCP bridge routes are only `src/app/api/mcp/[plugin]/sse/route.js` and `src/app/api/mcp/[plugin]/message/route.js`; management routes must remain normal authenticated dashboard APIs."
- timestamp: 2026-08-23
  verification: "`tests/unit/dashboard-guard.test.js` passed: 24 tests."

## Eliminated

## Resolution

- root_cause: "`LOCAL_ONLY_PATHS` used broad `/api/mcp/` prefix, overriding dashboard JWT access for MCP management APIs."
- fix: "Removed broad prefix. Added exact bridge matcher for `/api/mcp/<plugin>/sse` and `/api/mcp/<plugin>/message`; kept bridge local-only while allowing remote authenticated management APIs."
- verification: "`npx vitest run unit/dashboard-guard.test.js --reporter=dot` passed: 24/24."
- files_changed: "`src/dashboardGuard.js`, `tests/unit/dashboard-guard.test.js`."
