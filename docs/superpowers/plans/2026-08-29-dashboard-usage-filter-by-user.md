# Dashboard Usage Filter By User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép Admin lọc toàn bộ số liệu thống kê Dashboard Usage theo từng User (`All Users`, `Unassigned / System`, và từng `userId`) trên cả hai tab Overview và Details, bảo đảm phân quyền RBAC và hiển thị username trong bảng chi tiết request.

**Architecture:** Tạo migration thêm composite indexes `(userId, timestamp DESC)`, cập nhật DB repository để lọc theo user và JOIN bảng `users` lấy username, cập nhật các API route `/api/usage/*` để xác thực quyền Admin/User, và bổ sung User Filter dropdown trên thanh toolbar của Dashboard Usage.

**Tech Stack:** Next.js (App Router), React, SQLite / `better-sqlite3`, Tailwind CSS, Lucide React, Vitest.

---

## File Structure & Responsibilities

- `src/lib/db/schema.js`: Khai báo bảng và composite indexes.
- `src/lib/db/migrations/007-usage-user-composite-indexes.js`: Migration tạo index `idx_uh_user_ts` và `idx_rd_user_ts`.
- `src/lib/db/migrations/index.js`: Đăng ký migration 007.
- `src/lib/db/repos/usageRepo.js`: Cập nhật `getUsageStats`, `getChartData`, `getRequestDetails` để hỗ trợ `filter.userId` (`unassigned` vs specific id vs `all`) và JOIN `users`.
- `src/app/api/usage/stats/route.js`: Parse `userId` param và kiểm tra quyền RBAC.
- `src/app/api/usage/chart/route.js`: Parse `userId` param và kiểm tra quyền RBAC.
- `src/app/api/usage/request-details/route.js`: Parse `userId` param và kiểm tra quyền RBAC.
- `src/app/(dashboard)/dashboard/usage/page.js`: Render User Filter dropdown trong header toolbar và sync URL query param `userId`.
- `src/shared/components/UsageStats.js`: Đọc `userId` từ query/props và truyền vào `/api/usage/stats` & `/api/usage/chart`.
- `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`: Đọc `userId` từ URL params, truyền vào `/api/usage/request-details` và render cột `User` trong bảng.
- `tests/unit/usage-user-filter.test.js`: Unit & integration tests cho DB repo và API handlers.

---

### Task 1: Database Migration 007 & Schema Update for Composite Indexes

**Files:**
- Create: `src/lib/db/migrations/007-usage-user-composite-indexes.js`
- Modify: `src/lib/db/schema.js:159-165, 184-190`
- Modify: `src/lib/db/migrations/index.js`
- Test: `tests/unit/migration-007.test.js`

- [ ] **Step 1: Write the failing test for Migration 007**

```javascript
// tests/unit/migration-007.test.js
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import migration007 from "@/lib/db/migrations/007-usage-user-composite-indexes.js";

describe("Migration 007: Usage User Composite Indexes", () => {
  it("should create composite indexes on usageHistory and requestDetails", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE usageHistory (id INTEGER PRIMARY KEY, timestamp TEXT, userId TEXT);
      CREATE TABLE requestDetails (id TEXT PRIMARY KEY, timestamp TEXT, userId TEXT);
    `);

    migration007.up(db);

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
    expect(indexes).toContain("idx_uh_user_ts");
    expect(indexes).toContain("idx_rd_user_ts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/migration-007.test.js`
Expected: FAIL with missing file `007-usage-user-composite-indexes.js`.

- [ ] **Step 3: Create Migration 007 and update schema**

Create `src/lib/db/migrations/007-usage-user-composite-indexes.js`:
```javascript
export default {
  version: 7,
  name: "usage-user-composite-indexes",
  up(db) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_uh_user_ts ON usageHistory(userId, timestamp DESC)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_rd_user_ts ON requestDetails(userId, timestamp DESC)");
  },
};
```

Update `src/lib/db/migrations/index.js` to import and include `007-usage-user-composite-indexes.js`.
Update `src/lib/db/schema.js` indexes array for `usageHistory` and `requestDetails`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/migration-007.test.js`
Expected: PASS.

---

### Task 2: Update Usage Repository (`usageRepo.js`) for User Filtering & JOIN

**Files:**
- Modify: `src/lib/db/repos/usageRepo.js`
- Test: `tests/unit/usage-repo-user-filter.test.js`

- [ ] **Step 1: Write failing tests for repository user filter logic**

```javascript
// tests/unit/usage-repo-user-filter.test.js
import { describe, it, expect, beforeEach } from "vitest";
import { getUsageStats, getChartData, getRequestDetails, saveRequestUsage, saveRequestDetail } from "@/lib/db/repos/usageRepo.js";
import { getDb } from "@/lib/db/index.js";

describe("usageRepo User Filtering", () => {
  it("filters stats by specific userId", async () => {
    // Test that getUsageStats with filter: { userId: 'user-1' } only aggregates user-1
  });

  it("filters stats by unassigned userId", async () => {
    // Test that getUsageStats with filter: { userId: 'unassigned' } matches null or empty userId
  });

  it("joins users table to provide username in getRequestDetails", async () => {
    // Test that getRequestDetails returns username field populated from users table
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/unit/usage-repo-user-filter.test.js`
Expected: FAIL.

- [ ] **Step 3: Update `src/lib/db/repos/usageRepo.js`**

1. In `getUsageStats` and `getChartData`, update the `whereClause` generator:
```javascript
if (filter?.userId === "unassigned") {
  conditions.push("(userId IS NULL OR userId = '')");
} else if (filter?.userId && filter?.userId !== "all") {
  conditions.push("userId = ?");
  params.push(filter.userId);
}
```
2. In `getRequestDetails`, add `LEFT JOIN users ON requestDetails.userId = users.id` and select `users.username AS username`. Handle `filter.userId === "unassigned"` with `(requestDetails.userId IS NULL OR requestDetails.userId = '')` and `filter.userId` with `requestDetails.userId = ?`.

- [ ] **Step 4: Run test to verify passes**

Run: `npx vitest run tests/unit/usage-repo-user-filter.test.js`
Expected: PASS.

---

### Task 3: API Routes Parameter Parsing & Authorization Check

**Files:**
- Modify: `src/app/api/usage/stats/route.js`
- Modify: `src/app/api/usage/chart/route.js`
- Modify: `src/app/api/usage/request-details/route.js`
- Test: `tests/unit/usage-api-routes.test.js`

- [ ] **Step 1: Write failing test for API route query params & RBAC**

```javascript
// tests/unit/usage-api-routes.test.js
import { describe, it, expect } from "vitest";

describe("Usage API Routes RBAC & Query Params", () => {
  it("allows admin to filter by specific userId or unassigned", async () => {
    // Mock userContext as admin and verify filter.userId is passed
  });

  it("forces non-admin to filter only by self userId regardless of param", async () => {
    // Mock userContext as normal user and verify filter.userId equals user.userId
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/unit/usage-api-routes.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement route handlers**

In `src/app/api/usage/stats/route.js`, `src/app/api/usage/chart/route.js`, `src/app/api/usage/request-details/route.js`:
```javascript
const userContext = await getUserContext(request);
const requestedUserId = searchParams.get("userId");

let targetUserId = undefined;
if (userContext && !userContext.isAdmin) {
  targetUserId = userContext.userId;
} else if (requestedUserId && requestedUserId !== "all") {
  targetUserId = requestedUserId;
}

if (targetUserId) {
  filter.userId = targetUserId;
}
```

- [ ] **Step 4: Run test to verify passes**

Run: `npx vitest run tests/unit/usage-api-routes.test.js`
Expected: PASS.

---

### Task 4: Frontend Header Toolbar User Selector & URL Sync

**Files:**
- Modify: `src/app/(dashboard)/dashboard/usage/page.js`
- Test: Manual / Component test

- [ ] **Step 1: Fetch users if Admin & Render User Selector**

In `src/app/(dashboard)/dashboard/usage/page.js`:
- Lấy thông tin user hiện tại qua `useUserStore` hoặc `/api/auth/me`.
- Nếu user là Admin: `fetch('/api/users')` lấy danh sách active users.
- Đọc `userId` từ `searchParams.get('userId') || 'all'`.
- Render `select` dropdown phong cách 9Router:
  - `<option value="all">All Users</option>`
  - `<option value="unassigned">Unassigned / System</option>`
  - `{users.map(u => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}`
- Khi `onChange`: Cập nhật search params và gọi `router.push('/dashboard/usage?...', { scroll: false })`.

- [ ] **Step 2: Verify component compiles & handles state**

Run: `node --check src/app/\(dashboard\)/dashboard/usage/page.js`

---

### Task 5: Integrate User Filter in Overview Tab (`UsageStats.js`)

**Files:**
- Modify: `src/shared/components/UsageStats.js`
- Modify: `src/app/(dashboard)/dashboard/usage/components/UsageChart.js`

- [ ] **Step 1: Update fetch queries with `userId` param**

- Đọc `userId` từ prop hoặc URL `searchParams`.
- Truyền `userId` vào `fetch(/api/usage/stats?period=${period}${userId && userId !== 'all' ? '&userId=' + userId : ''})`.
- Truyền `userId` vào `fetch(/api/usage/chart?period=${period}${userId && userId !== 'all' ? '&userId=' + userId : ''})`.
- Cập nhật dependency array trong `useEffect` để tự động re-fetch khi `userId` thay đổi.

---

### Task 6: Integrate User Filter & User Column in Details Tab (`RequestDetailsTab.js`)

**Files:**
- Modify: `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`

- [ ] **Step 1: Pass `userId` param to `/api/usage/request-details`**

- Đọc `userId` từ `searchParams.get('userId')`.
- Truyền `userId` vào query params khi fetch `/api/usage/request-details`.

- [ ] **Step 2: Add User column to table**

- Thêm cột `User` trong `<thead>`.
- Trong từng hàng `<tr>`, hiển thị:
  - `detail.username` (hoặc `detail.userId`) kèm icon user nếu có.
  - Badge mờ `System` / `Unassigned` nếu `!detail.userId`.

---

### Task 7: Full System Verification & End-to-End Tests

**Files:**
- Run: Full test suite `npm test` or `npx vitest run`
- Verify: Endpoint responses with curl

- [ ] **Step 1: Run unit and integration tests**

Run: `npx vitest run`
Expected: ALL PASS.

- [ ] **Step 2: Verify syntax integrity**

Run:
```bash
node --check src/lib/db/repos/usageRepo.js
node --check src/app/api/usage/stats/route.js
node --check src/app/api/usage/chart/route.js
node --check src/app/api/usage/request-details/route.js
```
Expected: Clean exit code 0.
