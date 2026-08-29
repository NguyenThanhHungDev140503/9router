# Task 3 Report

## Changes

- Updated `src/app/api/usage/stats/route.js` to parse `userId` and let admins select a specific user or `unassigned`; `all` keeps an unrestricted filter.
- Updated `src/app/api/usage/chart/route.js` with the same admin and non-admin authorization behavior.
- Updated `src/app/api/usage/request-details/route.js` with the same behavior while preserving pagination and existing request filters.
- Added real route-handler tests in `tests/unit/usage-api-routes.test.js` covering all three routes, admin-specific filtering, admin-unassigned filtering, and non-admin self-only enforcement.

## Verification

- RED: initial route test run failed because admin query parameters were ignored after test dependencies were corrected.
- PASS: `npx vitest run tests/unit/usage-api-routes.test.js` (`9/9` tests).
- PASS: `npx vitest run unit/usage-api-routes.test.js unit/usage-repo-user-filter.test.js` from `tests/` (`13/13` tests).
- PASS: `git diff --check`.
- NOT RUN: ESLint. Workspace resolved global ESLint `6.4.0`, which cannot load repository `eslint.config.mjs` flat configuration.

## Review

- Authorization precedence matches existing auth patterns: non-admin context always wins over requested `userId`.
- Admin `userId=all` and absent `userId` produce unrestricted filters.
- Admin `userId=unassigned` reaches repository filtering unchanged.
- No unrelated files included in commit.
