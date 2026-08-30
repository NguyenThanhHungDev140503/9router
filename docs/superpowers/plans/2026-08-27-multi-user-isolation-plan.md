# Kế Hoạch Triển Khai (Implementation Plan): Hệ Thống Đa Người Dùng & Cô Lập Dữ Liệu 9Router

- **Dự án:** 9Router Multi-User Architecture
- **Mục tiêu:** Chuyển đổi hệ thống từ Single-User sang Multi-User hoàn chỉnh, cô lập dữ liệu 100%, hỗ trợ Admin & User thường, Shared Providers.
- **Tiêu chuẩn phát triển:** Test-Driven Development (TDD) với Vitest, các bước thực hiện tuần tự, atomic commits.

---

## Giai Đoạn 1: Database Schema & Migration (`src/lib/db/`)

### Task 1.1: Tạo Migration `005-multi-user-isolation.js`
- **Mô tả:**
  - Tạo bảng `users` (`id`, `username`, `password`, `role`, `is_active`, `created_at`, `updated_at`).
  - Thêm cột `user_id` vào các bảng: `provider_connections`, `api_keys`, `provider_nodes`, `proxy_pools`, `combos`, `model_aliases`, `custom_models`, `mcp_servers`, `mcp_plugins`, `gateway_tool_rules`, `skills`, `hermes_profiles`, `hermes_swarm_tasks`, `usage`, `request_details`.
  - Thêm cột `is_shared INTEGER DEFAULT 0` vào bảng `provider_connections`.
  - Tạo user `admin` mặc định (`id = 'usr_admin'`, mật khẩu lấy từ `settings.password` hoặc `"123456"`).
  - Gán toàn bộ dữ liệu hiện có trong DB về `user_id = 'usr_admin'`.
- **Files:**
  - `src/lib/db/migrations/005-multi-user-isolation.js`
  - `src/lib/db/schema.js`
  - `src/lib/db/migrations/index.js`
- **Test:**
  - `tests/unit/db/multiUserMigration.test.js`

### Task 1.2: Tạo User Repository (`src/lib/db/repos/usersRepo.js`)
- **Mô tả:** Viết CRUD cho bảng `users`:
  - `getUserById(id)`
  - `getUserByUsername(username)`
  - `getAllUsers()`
  - `createUser({ username, password, role })`
  - `updateUser(id, updates)`
  - `deleteUser(id)`
  - `verifyUserPassword(username, password)`
- **Files:**
  - `src/lib/db/repos/usersRepo.js`
  - `src/lib/db/repos/index.js`
  - `src/lib/db/index.js`
  - `src/lib/localDb.js`
- **Test:**
  - `tests/unit/db/usersRepo.test.js`

---

## Giai Đoạn 2: Nâng Cấp Tầng Repository Cô Lập Dữ Liệu (`src/lib/db/repos/`)

### Task 2.1: Bổ sung `userId` vào các Repositories
- **Mô tả:**
  - `connectionsRepo.js`: `getProviderConnections(userId, includeShared = true)` - lọc theo `user_id = ? OR is_shared = 1`. `createProviderConnection(data, userId)`.
  - `apiKeysRepo.js`: `getApiKeys(userId)`, `createApiKey(data, userId)`. `validateApiKey(key)` trả về thêm `userId`.
  - `combosRepo.js`, `nodesRepo.js`, `proxyPoolsRepo.js`, `aliasRepo.js`, `mcpRepo.js`, `skillsRepo.js`: Thêm điều kiện `WHERE user_id = ?` cho tất cả thao tác đọc/ghi.
  - `usageRepo.js`: `recordUsage(..., userId)`, `getUsage(userId, filters)` (hỗ trợ Admin lọc all hoặc theo user).
- **Files:**
  - `src/lib/db/repos/*.js`
- **Test:**
  - `tests/unit/db/repoIsolation.test.js`

---

## Giai Đoạn 3: Nâng Cấp Auth & Session Management

### Task 3.1: Dashboard Session & Token Claims
- **Mô tả:**
  - `src/lib/auth/dashboardSession.js`: Cập nhật `createDashboardAuthToken({ userId, username, role })`.
  - `src/app/api/auth/login/route.js`: Hỗ trợ đăng nhập với `{ username, password }` qua `usersRepo`. Tương thích ngược khi chỉ có `{ password }`.
- **Files:**
  - `src/lib/auth/dashboardSession.js`
  - `src/app/api/auth/login/route.js`
- **Test:**
  - `tests/unit/auth/loginMultiUser.test.js`

### Task 3.2: Middleware Phân Quyền (`src/dashboardGuard.js`)
- **Mô tả:**
  - Trích xuất `userId`, `role` từ token và gán vào header request nội bộ `x-user-id`, `x-user-role`.
  - Bảo vệ các Admin routes (`/api/users/*` chỉ cho phép `role === 'admin'`).
- **Files:**
  - `src/dashboardGuard.js`
- **Test:**
  - `tests/unit/auth/dashboardGuard.test.js`

### Task 3.3: API Quản Lý Users
- **Mô tả:** Xây dựng API endpoints:
  - `GET /api/users` (Admin only)
  - `POST /api/users` (Admin only)
  - `PATCH /api/users/[id]` (Admin only)
  - `DELETE /api/users/[id]` (Admin only)
  - `POST /api/auth/change-password` (Tất cả authenticated user)
- **Files:**
  - `src/app/api/users/route.js`
  - `src/app/api/users/[id]/route.js`
  - `src/app/api/auth/change-password/route.js`
- **Test:**
  - `tests/unit/api/usersApi.test.js`

---

## Giai Đoạn 4: Cập Nhật API Gateway & Routing (`/v1/*`)

### Task 4.1: Gateway Auth & User Context Injection
- **Mô tả:**
  - `src/sse/services/auth.js`: Khi validate API key, trích xuất `userId` và kiểm tra user `is_active === 1`.
  - Truyền `userId` vào `requestContext`.
  - Lấy danh sách connections của user: Private Connections (ưu tiên cao) + Shared Connections của Admin (fallback).
- **Files:**
  - `src/sse/services/auth.js`
  - `src/app/api/v1/chat/completions/route.js`
  - `src/app/api/v1/responses/route.js`
- **Test:**
  - `tests/unit/gateway/multiUserRouting.test.js`

---

## Giai Đoạn 5: Cập Nhật Dashboard UI

### Task 5.1: Form Login Mới
- **Mô tả:** Cập nhật trang `/login` cho phép nhập `Username` và `Password`.
- **Files:**
  - `src/app/login/page.js`

### Task 5.2: Trang Quản Lý Users (`/users`)
- **Mô tả:**
  - Tạo trang Dashboard Users cho Admin: Bảng danh sách user, Modal thêm user, Đổi mật khẩu, Khóa/Mở khóa tài khoản.
  - Bổ sung menu item "Users" trên Sidebar (ẩn đối với user thường).
- **Files:**
  - `src/app/(dashboard)/users/page.js`
  - `src/components/layout/Sidebar.jsx` (hoặc component navigation tương ứng)

### Task 5.3: UI Shared Provider & Usage Filter
- **Mô tả:**
  - Trang `/providers`: Thêm toggle "Share with all users" cho Admin. Hiển thị mục "Shared by Admin" cho user thường.
  - Trang `/usage`: Thêm dropdown "Filter by User" cho Admin.
- **Files:**
  - `src/app/(dashboard)/providers/page.js`
  - `src/app/(dashboard)/usage/page.js`

---

## Giai Đoạn 6: Kiểm Thử Toàn Diện & Xác Thực Hệ Thống

### Task 6.1: Chạy Full Test Suite (Vitest)
- Chạy toàn bộ test suites đảm bảo không hồi quy:
  ```bash
  cd tests && npx vitest run
  ```

### Task 6.2: Kiểm tra Thực Tế (E2E / Live Verification)
- Khởi động server local.
- Login admin -> Tạo user mới -> Đăng nhập user mới -> Cấu hình key & test Gateway curl.
