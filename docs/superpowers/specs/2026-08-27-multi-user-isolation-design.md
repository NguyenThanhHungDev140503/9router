# Tài Liệu Thiết Kế (Design Spec): Hệ Thống Đa Người Dùng & Cô Lập Dữ Liệu 9Router

- **Ngày ban hành:** 2026-08-27
- **Tác giả:** 9Router Architecture Team
- **Trạng thái:** Approved by User
- **Phạm vi:** Database Schema, Auth/RBAC, Repository Isolation, Gateway Routing, Dashboard UI

---

## 1. Tổng Quan & Mục Tiêu Hệ Thống

9Router hiện tại hoạt động ở mô hình Single-User (chỉ có 1 mật khẩu chung lưu trong bảng `settings`). Mục tiêu của bản thiết kế này là nâng cấp hệ thống thành nền tảng **Multi-User Multi-Tenant** hoàn chỉnh:
1. **User Admin Mặc Định:** User đầu tiên kế thừa toàn bộ dữ liệu và quyền cấu hình hệ thống hiện có, đóng vai trò `admin`.
2. **Quản Lý User Mới:** Admin có toàn quyền tạo mới, cấp mật khẩu, khóa hoặc xóa các tài khoản `user` thường.
3. **Cô Lập Dữ Liệu Tuyệt Đối (Data Isolation):** Mỗi user chỉ thấy, quản lý và sử dụng tài nguyên (API Keys, Provider Connections, Combos, Aliases, Nodes, Custom Models, MCP, Skills, Usage Logs) của chính mình.
4. **Chia Sẻ Tài Nguyên (Shared Providers):** Admin có thể tùy chọn đánh dấu một số Provider Connection là "Shared" để tất cả user thường có thể gọi model thông qua connection này.
5. **Gateway Routing Linh Hoạt:** Khi user gọi API qua Gateway (`/v1/*`), hệ thống tự động ưu tiên Private Connection của user trước; nếu không có thì fallback sang Shared Connection của Admin.
6. **Thống Kê Riêng Biệt:** Mọi chi phí, số lượng token, và request log luôn được quy về đúng User sở hữu API Key gọi đến.

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (Database & Migration)

### 2.1 Bảng Mới: `users`
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,               -- Chuỗi ID duy nhất (ví dụ: 'usr_admin', 'usr_uuid')
  username TEXT UNIQUE NOT NULL,     -- Tên đăng nhập
  password TEXT NOT NULL,            -- Hash bcrypt mật khẩu
  role TEXT NOT NULL DEFAULT 'user', -- 'admin' hoặc 'user'
  is_active INTEGER NOT NULL DEFAULT 1, -- 1: Hoạt động, 0: Bị khóa
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

### 2.2 Cập Nhật Schema (Migration `005-multi-user-isolation.js`)
Thêm các cột mới và index vào các bảng hiện có:
- `provider_connections`: Bổ sung `user_id TEXT`, `is_shared INTEGER DEFAULT 0`
- `api_keys`: Bổ sung `user_id TEXT`
- `provider_nodes`: Bổ sung `user_id TEXT`
- `proxy_pools`: Bổ sung `user_id TEXT`
- `combos`: Bổ sung `user_id TEXT`
- `model_aliases`: Bổ sung `user_id TEXT`
- `custom_models`: Bổ sung `user_id TEXT`
- `mcp_servers`: Bổ sung `user_id TEXT`
- `mcp_plugins`: Bổ sung `user_id TEXT`
- `gateway_tool_rules`: Bổ sung `user_id TEXT`
- `skills`: Bổ sung `user_id TEXT`
- `hermes_profiles`: Bổ sung `user_id TEXT`
- `hermes_swarm_tasks`: Bổ sung `user_id TEXT`
- `usage`: Bổ sung `user_id TEXT`
- `request_details`: Bổ sung `user_id TEXT`

### 2.3 Chiến Lược Di Trú Dữ Liệu (Data Migration Logic)
1. Kiểm tra bảng `users`. Nếu bảng rỗng:
   - Tạo user Admin mặc định:
     - `id`: `'usr_admin'`
     - `username`: `'admin'`
     - `password`: Lấy từ `settings.password` (nếu đã có) hoặc hash từ `process.env.INITIAL_PASSWORD` / `"123456"`.
     - `role`: `'admin'`
     - `is_active`: `1`
2. Cập nhật tất cả các bản ghi hiện có trong tất cả các bảng trên gán `user_id = 'usr_admin'`.

---

## 3. Xác Thực (Auth) & Phân Quyền (RBAC)

### 3.1 Flow Đăng Nhập (`POST /api/auth/login`)
- Nhận payload `{ username, password }` (nếu client cũ chỉ gửi `{ password }`, tự động gán `username = "admin"`).
- Tìm user trong bảng `users` theo `username`.
- So khớp mật khẩu với bcrypt. Kiểm tra `is_active === 1`.
- Cấp cookie `auth_token` chứa JWT claims:
  ```json
  {
    "userId": "usr_admin",
    "username": "admin",
    "role": "admin",
    "authenticated": true
  }
  ```

### 3.2 Request Context & Dashboard Guard (`src/dashboardGuard.js`)
- Middleware / Guard trích xuất claims từ JWT:
  - Nếu token hợp lệ, inject thông tin user vào Request Header nội bộ: `x-user-id`, `x-user-role`, `x-user-name`.
  - Phân quyền routes:
    - Admin Routes (`/api/users/*`, `/api/settings/system`): Bắt buộc `role === 'admin'`. Trả về 403 Forbidden nếu không đủ quyền.
    - User Resource Routes (`/api/providers/*`, `/api/keys/*`, `/api/combos/*`, `/api/usage/*`): Tự động trích xuất `userId` từ context để lọc dữ liệu.

### 3.3 CRUD API Quản Lý Users (Dành riêng cho Admin)
- `GET /api/users`: Trả về danh sách user kèm metadata (không trả trường `password`).
- `POST /api/users`: Tạo user mới với `{ username, password, role }`.
- `PATCH /api/users/[id]`: Cập nhật `role`, trạng thái `is_active`, hoặc đổi mật khẩu user.
- `DELETE /api/users/[id]`: Xóa user và cascade xóa/dọn dẹp tài nguyên thuộc user đó.
- `POST /api/auth/change-password`: Endpoint dành cho mọi user tự đổi mật khẩu cá nhân.

---

## 4. Tầng Repository & Cô Lập Dữ Liệu (Data Layer)

Tất cả các repository trong `src/lib/db/repos/` được nâng cấp nhận tham số `userId` (hoặc context object):
- **`getProviderConnections(userId, includeShared = true)`**:
  - Trả về `WHERE (user_id = :userId) OR (is_shared = 1 AND :includeShared = 1)`.
- **`createProviderConnection(data, userId)`**:
  - Luôn gán `user_id = userId`. Chỉ `admin` mới được set `is_shared = 1`.
- **`getApiKeys(userId)`**, **`getCombos(userId)`**, **`getProviderNodes(userId)`**, **`getMcpServers(userId)`**...:
  - Luôn lọc nghiêm ngặt `WHERE user_id = :userId`.
- **`getUsage(userId, filters)`**:
  - Nếu `userId` là user thường: Filter `WHERE user_id = :userId`.
  - Nếu `userId` là admin: Mặc định lấy toàn bộ; nếu có `filters.targetUserId` thì lọc theo user đó.

---

## 5. Gateway Routing & Thực Thi Request (`/v1/*`)

### 5.1 Xác Thực Khóa API Gateway (`src/sse/services/auth.js`)
1. Client gửi `Authorization: Bearer <API_KEY>`.
2. Hàm `validateApiKey(apiKey)` tìm khóa trong bảng `api_keys` và trả về `user_id` sở hữu khóa đó.
3. Kiểm tra user sở hữu: Nếu `is_active === 0` -> Trả về 401 Unauthorized.
4. Đính kèm `userId` vào `requestContext`.

### 5.2 Cơ Chế Lựa Chọn Provider Connection (Routing Algorithm)
1. Gateway tải danh sách Provider Connections hợp lệ:
   ```sql
   SELECT * FROM provider_connections 
   WHERE is_active = 1 AND (user_id = :userId OR is_shared = 1)
   ```
2. Thuật toán sắp xếp ưu tiên:
   - **Ưu tiên 1 (Private Connection):** `user_id === :userId` được xếp lên đầu.
   - **Ưu tiên 2 (Shared Connection):** `is_shared === 1` dùng làm fallback khi user không có connection riêng cho model yêu cầu.
   - Sắp xếp tiếp theo `priority` và latency đo được.
3. Ghi nhận `usage` và `request_details` với `user_id = :userId` của chủ sở hữu API Key.

---

## 6. Thiết Kế Giao Diện Người Dùng (UI/UX)

### 6.1 Màn Hình Login (`src/app/login/page.js`)
- Nâng cấp form đăng nhập hỗ trợ 2 trường: **Username** và **Password**.
- Tự động autofocus và hiển thị thông báo lỗi chi tiết khi xác thực thất bại.

### 6.2 Trang Quản Lý Người Dùng Mới (`src/app/(dashboard)/users/page.js` - Admin Only)
- Menu Sidebar xuất hiện thêm mục **Users** (kèm icon người dùng).
- Bảng danh sách: Username, Role badge, Trạng thái hoạt động, Ngày tạo, Thao tác (Đổi mật khẩu, Khóa/Mở khóa, Xóa).
- Modal "+ Add User": Cho phép nhập Username, Password khởi tạo, Phân quyền (`Admin` / `User`).

### 6.3 Nâng Cấp Trang Providers (`/providers`)
- **Đối với Admin:** Trên mỗi Provider Card / Modal có thêm nút toggle **"Share with all users"** (`is_shared`).
- **Đối với User thường:** Giao diện phân tách rõ ràng:
  - Tab / Section **"My Connections"**: Các provider do user tự cấu hình.
  - Tab / Section **"Shared by Admin"**: Các provider được Admin chia sẻ sẵn (chỉ xem trạng thái hoạt động, không sửa/xóa được).

### 6.4 Nâng Cấp Trang Usage & Request Logs (`/usage`)
- **User thường:** Dashboard chỉ hiển thị biểu đồ và lịch sử request của chính mình.
- **Admin:** Có thêm dropdown bộ lọc **"Filter by User: [All Users | User A | User B...]"**.

---

## 7. Kiểm Thử & Kế Hoạch Xác Minh (Verification Plan)

1. **Unit & Integration Tests (Vitest):**
   - Test migration `005-multi-user-isolation.js` nâng cấp dữ liệu cũ về Admin an toàn.
   - Test CRUD User API & phân quyền RBAC (User thường bị chặn khi gọi Admin API).
   - Test cô lập dữ liệu: User A không thể đọc/ghi API Key, Provider, Combo của User B.
   - Test Gateway routing: Gọi API bằng key của User A ưu tiên Private Connection của User A, fallback sang Shared Connection của Admin khi cần.
   - Test Usage isolation: Request log và token usage ghi nhận chính xác theo `userId`.
2. **Manual & Live Verification:**
   - Đăng nhập tài khoản `admin` -> Tạo tài khoản `user1`.
   - Đăng nhập `user1` -> Thêm Provider riêng và tạo API Key riêng.
   - Kiểm tra Database xác nhận các trường `user_id` được gán chính xác.
   - Gửi request curl Gateway kiểm tra routing và đối chiếu lịch sử Usage trên cả 2 tài khoản.
