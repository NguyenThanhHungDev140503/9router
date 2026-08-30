# Design Specification: Dashboard Usage Filter By User

## 1. Context & Objectives
- **Target**: Cho phép lọc toàn bộ dữ liệu thống kê sử dụng (Dashboard Usage) theo người dùng (User).
- **Scope**:
  - Hỗ trợ cho Admin lọc theo từng User, xem toàn bộ (`All Users`), hoặc xem dữ liệu cũ/hệ thống không gắn user (`Unassigned / System`).
  - Đảm bảo tính bảo mật (RBAC): User thường không được chọn user khác và luôn chỉ xem dữ liệu của chính mình.
  - Đồng bộ trạng thái lọc qua URL params trên cả 2 tab `Overview` và `Details`.

---

## 2. Architecture & Data Flow

```
+--------------------------------------------------------------------------------+
|                               Dashboard Usage UI                               |
|                                                                                |
|  [Tabs: Overview | Details]      [User Filter: All / Unassigned / User X]      |
+--------------------------------------------------------------------------------+
                                       |
                +----------------------+----------------------+
                | (sync userId param)                         | (sync userId param)
                v                                             v
        +---------------+                             +---------------+
        |  Tab Overview |                             |  Tab Details  |
        +---------------+                             +---------------+
                |                                             |
                v (fetch stats & chart)                       v (fetch request-details)
    /api/usage/stats?userId=...                  /api/usage/request-details?userId=...
    /api/usage/chart?userId=...
                |                                             |
                +----------------------+----------------------+
                                       |
                                       v
                              [Auth Verification]
                     (Admin: target userId / Non-admin: self)
                                       |
                                       v
                             [Usage Repository SQL]
          - userId == 'unassigned' -> WHERE (rd.userId IS NULL OR rd.userId = '')
          - userId == '<nanoid>'   -> WHERE rd.userId = ?
          - all / no filter        -> (no userId WHERE clause)
          - JOIN users ON rd.userId = users.id (for username display)
                                       |
                                       v
                                  [SQLite DB]
```

---

## 3. Detailed Component Specifications

### 3.1 Data Layer & Migration (`src/lib/db/`)
1. **Migration 007 (`src/lib/db/migrations/007-usage-user-composite-indexes.js`)**:
   - Thêm composite index tối ưu hóa cho query lọc theo user kết hợp sắp xếp thời gian:
     - `CREATE INDEX IF NOT EXISTS idx_uh_user_ts ON usageHistory(userId, timestamp DESC)`
     - `CREATE INDEX IF NOT EXISTS idx_rd_user_ts ON requestDetails(userId, timestamp DESC)`
   - Cập nhật định nghĩa index trong `src/lib/db/schema.js`.

2. **Repository SQL (`src/lib/db/repos/usageRepo.js`)**:
   - Helper build user condition:
     ```javascript
     if (filter?.userId === "unassigned") {
       conditions.push("(userId IS NULL OR userId = '')");
     } else if (filter?.userId) {
       conditions.push("userId = ?");
       params.push(filter.userId);
     }
     ```
   - Trong `getRequestDetails`:
     - Thực hiện `LEFT JOIN users ON requestDetails.userId = users.id`.
     - Lấy `users.username AS username` gắn trực tiếp vào object trả về.

### 3.2 API Routes Layer
1. `src/app/api/usage/stats/route.js`:
   - Parse `searchParams.get("userId")`.
   - Apply role-based filter check (Admin được chọn target, Non-admin cố định self).
2. `src/app/api/usage/chart/route.js`:
   - Parse `searchParams.get("userId")`.
   - Apply role-based filter check.
3. `src/app/api/usage/request-details/route.js`:
   - Parse `searchParams.get("userId")`.
   - Apply role-based filter check.

### 3.3 UI Layer
1. **Header Toolbar (`src/app/(dashboard)/dashboard/usage/page.js`)**:
   - Check `isAdmin` via current user session / `useUserStore`.
   - If `isAdmin`, fetch users list via `/api/users`.
   - Render User Select Dropdown with options:
     - `all`: "All Users"
     - `unassigned`: "Unassigned / System"
     - `<userId>`: `${user.username}`
   - Handle change: update `userId` search param in current URL.
2. **Overview Tab (`src/shared/components/UsageStats.js`)**:
   - Read `userId` from props/URL.
   - Include `userId` in queries to `/api/usage/stats` and `/api/usage/chart`.
3. **Details Tab (`src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`)**:
   - Read `userId` from URL search params.
   - Pass `userId` to `/api/usage/request-details`.
   - Add **User** column in Request Details Table to display `username` or `Unassigned`.

---

## 4. Verification & Testing Plan
1. **Unit / Integration Tests**:
   - Test migration 006 áp dụng thành công.
   - Query `usageRepo` với `userId = unassigned`, `userId = <id>`, và `userId = all`.
   - Kiểm tra `LEFT JOIN users` trả về đúng `username`.
   - Test `/api/usage/stats`, `/api/usage/chart`, `/api/usage/request-details` với Admin vs Non-admin auth tokens.
2. **End-to-End Verification**:
   - Login as Admin -> View Usage -> Select user from dropdown -> Check Metrics, Chart, and Table update accurately.
   - Switch tabs (`Overview` <-> `Details`) -> Verify selected user filter persists.
   - Login as regular User -> Verify User filter dropdown is hidden, only self usage is visible.

---

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| D1: Strategy for Request Details Username | Resolved | Picked SQL `LEFT JOIN users ON requestDetails.userId = users.id` |
| D2: Indexing & Migration Strategy | Resolved | Picked Migration 006 Composite index `(userId, timestamp DESC)` |

VERDICT: APPROVED. Spec updated with composite indexes migration and SQL join.

NO UNRESOLVED DECISIONS
