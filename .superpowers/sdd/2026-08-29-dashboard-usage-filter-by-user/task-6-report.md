# Task 6 Report

## Changes

- `RequestDetailsTab` reads `userId` from `useSearchParams()`.
- Non-`all` `userId` values are forwarded to `/api/usage/request-details`.
- Fetch callback dependencies include `userId`, so URL filter changes reload details.
- Added `User` table column.
- User rows render `detail.username` or `detail.userId` with `person` icon.
- Rows without `userId` render muted `System / Unassigned` badge with `person_off` icon.
- Updated empty/loading table `colSpan` to match ten columns.
- Added focused source-contract regression test.

## Verification

- `npx vitest run unit/request-details-tab.test.js -t "user filter and column contract" --reporter=verbose`
  - Passed: 1 test.
- `node --check tests/unit/request-details-tab.test.js`
  - Passed.
- `git diff --check`
  - Passed.
- `npx eslint "src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js"`
  - Not runnable in current checkout: `npx` resolved global ESLint 6.4.0, while repository config requires newer local tooling and root `node_modules` is absent.
- Next.js package check
  - Not runnable: root `node_modules/next` is absent.

## Notes

The full existing `request-details-tab.test.js` file has unrelated pre-existing failures when run in this environment, including DB fixture failures and unavailable `next/server`. Focused Task 6 test passes.
