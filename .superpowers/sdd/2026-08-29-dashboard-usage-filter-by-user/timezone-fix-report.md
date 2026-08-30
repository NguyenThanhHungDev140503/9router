# Timezone Fix Report

## Status

Fixed residual Important finding from final review.

## Root Cause

`getUsageStats` used `row.timestamp.slice(0, 10)` when skipping raw history rows already represented by `usageDaily`. That expression uses the timestamp's UTC date for ISO timestamps, while `usageDaily.dateKey` and other aggregation paths use `getLocalDateKey(timestamp)`. A row at `2026-01-03T07:30:00.000Z` is local date `2026-01-02` in `America/Los_Angeles`, so the old fallback failed to recognize the summarized day and counted the row twice.

## Fix

Changed raw fallback deduplication in `src/lib/db/repos/usageRepo.js` to use `getLocalDateKey(row.timestamp)`. Daily aggregate and raw fallback paths now share one date-key convention.

## Regression Test

Added coverage in `tests/unit/usage-repo-user-filter.test.js` using `TZ=America/Los_Angeles`. Test stores one raw row at the local/UTC date boundary and a matching `usageDaily` aggregate. It verifies the row contributes once, not twice.

TDD evidence:

- Before fix: focused test failed with `expected 4, received 5`.
- After fix: focused test passed.

## Verification

- `npx vitest run unit/usage-repo-user-filter.test.js`: 6 passed.
- `npx vitest run unit/usage-repo-user-filter.test.js unit/usage-api-routes.test.js unit/migration-006.test.js`: 28 passed.
- `node --check src/lib/db/repos/usageRepo.js`: passed.
- `node --check tests/unit/usage-repo-user-filter.test.js`: passed.
- `git diff --check`: passed.

## Concerns

- Full repository suite not run. Repository guidance documents known baseline failures and missing optional packages.
- Unrelated existing changes in `docs/superpowers/specs/2026-08-29-dashboard-usage-filter-by-user-design.md`, `docs/superpowers/plans/2026-08-29-dashboard-usage-filter-by-user.md`, and `tests/results.json` were not modified or staged.
