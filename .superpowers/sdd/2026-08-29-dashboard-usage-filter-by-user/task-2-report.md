# Task 2 Report

## Status

Implemented usage repository user filtering and request-details username enrichment.

## Changes

- Added shared `addUserFilter` handling for specific users, `unassigned` (`NULL` or empty), and `all`.
- Applied filtering to `getUsageStats` recent, rolling-window, and live-history queries.
- Applied filtering to all `getChartData` query paths, including daily history.
- Added `LEFT JOIN users` to request-details count and data queries.
- Added `username` to request detail results, returning `null` when no user is assigned.
- Added real SQLite behavior tests covering assigned stats, unassigned stats/chart data, and username joins.

## Verification

- `npx vitest run unit/usage-repo-user-filter.test.js`: PASS, 3 tests.
- `npx vitest run unit/db-sqlite-vs-lowdb.test.js`: PASS, 20 tests.
- `git diff --check`: PASS.
- Combined run with `unit/request-details-tab.test.js` blocked during collection because this checkout cannot resolve `next/server`.
- Direct `npx eslint ...` blocked because shell resolved global ESLint 6.4.0 instead of repo ESLint 9 and found no config.

## Concerns

- `getUsageHistory`, `getRecentLogs`, and `getDistinctProviders` retain existing user-filter behavior and were not expanded by Task 2.
- Existing unrelated worktree changes remain untouched: `docs/superpowers/specs/2026-08-29-dashboard-usage-filter-by-user-design.md`, `tests/results.json`, and `docs/superpowers/plans/2026-08-29-dashboard-usage-filter-by-user.md`.

## Review Fixes

- Fixed filtered `getUsageStats` period cutoff. `7d`, `30d`, and `60d` now use their requested `PERIOD_MS` window; `all` uses Unix epoch; unknown periods retain the 24-hour fallback. Existing unfiltered periods still use daily summaries.
- Added a 3-day-old `user-1` usage row and 7-day filtered stats regression assertion (`2` requests, `20` prompt tokens).
- Added empty-string `requestDetails.userId` fixture. `unassigned` details assertion now requires both NULL and empty rows and verifies `totalItems === 2`.
- Kept `r.username || null`. `users.username` is `TEXT NOT NULL`; LEFT JOIN produces SQL NULL only when no user matches. Therefore `|| null` and `?? null` have identical outputs under the actual schema contract; changing it would add no behavior.

## Review-Fix Verification

- Command: `cd tests && npx vitest run unit/usage-repo-user-filter.test.js`
- Output: `Test Files 1 passed (1)`; `Tests 4 passed (4)`.
- Command: `cd tests && npx vitest run unit/db-sqlite-vs-lowdb.test.js`
- Output: `Test Files 1 passed (1)`; `Tests 20 passed (20)`.
- Command: `git diff --check`
- Output: passed with no output.
