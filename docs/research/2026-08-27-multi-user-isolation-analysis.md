# Nghiên Cứu & Phân Tích Codebase 9Router: Kiến Trúc Đa Người Dùng (Multi-User Data Isolation)

**Ngày thực hiện:** 2026-08-27  
**Mục tiêu:** Khảo sát toàn diện codebase hiện tại của 9Router để thiết kế và triển khai mô hình Multi-User (1 Admin ban đầu + N User thường, cô lập dữ liệu 100%).

---

## 1. Hiện Trạng Codebase (Single-User Architecture)

### 1.1 Cơ chế Xác thực Dashboard & Session
- **Lưu trữ mật khẩu:** Lưu duy nhất 1 trường `password` (bcrypt hash) trong bảng `settings` (hoặc fallback `process.env.INITIAL_PASSWORD` / `"123456"`).
- **Session Token:** `src/lib/auth/dashboardSession.js` tạo JWT chứa claims `{ authenticated: true, ...claims }` ký bằng khóa bí mật tại `DATA_DIR/jwt-secret` (thuật toán HS256).
- **Dashboard Guard:** `src/dashboardGuard.js` kiểm tra cookie `auth_token` qua `verifyDashboardAuthToken()`. Hiện tại chỉ kiểm tra token hợp lệ mà không phân biệt danh tính/ID người dùng.
- **Login Endpoint:** `src/app/api/auth/login/route.js` chỉ nhận `{ password }`, so khớp với `settings.password` và set cookie `auth_token`.

### 1.2 Cơ sở dữ liệu & Data Storage Layer
- **Engine:** SQLite (hỗ trợ `better-sqlite3`, `node:sqlite`, `bun:sqlite`, `sql.js`).
- **Schema hiện tại (`src/lib/db/schema.js`):**
  1. `settings`: Cấu hình hệ thống + mật khẩu admin duy nhất.
  2. `provider_connections`: Kết nối các AI Provider, API keys, OAuth tokens.
  3. `api_keys`: Các key 9Router cấp cho client gọi `/v1/*`.
  4. `provider_nodes`: Custom base URLs/nodes.
  5. `proxy_pools`: Danh sách proxy xoay vòng.
  6. `combos`: Bộ gom nhóm model định tuyến thông minh.
  7. `model_aliases`: Ánh xạ alias model.
  8. `custom_models`: Danh sách model tự định nghĩa.
  9. `pricing`: Bảng giá tính chi phí token.
  10. `mcp_servers`, `mcp_plugins`, `mcp_activity`: Cấu hình MCP tools & server connections.
  11. `skills`, `gateway_tool_rules`: Quy tắc kích hoạt skill gateway.
  12. `hermes_profiles`, `hermes_swarm_tasks`: Cấu hình swarm agents.
  13. `usage`, `request_details`: Thống kê lượng token, chi phí, lịch sử request.

> **Nhận xét quan trọng:** Tất cả các bảng dữ liệu trên hiện **KHÔNG** có cột `user_id`. Mọi request API Gateway và Dashboard đều thao tác trên tập dữ liệu dùng chung (Global Scope).

### 1.3 Cơ chế Xác thực Gateway (`/v1/*`, `/v1beta/*`)
- Client gửi `Authorization: Bearer <API_KEY>`.
- `src/sse/services/auth.js` gọi `validateApiKey(key)` tra cứu trong bảng `api_keys`.
- Sau khi xác thực hợp lệ, gateway load toàn bộ `provider_connections` đang active để định tuyến mà không phân quyền người sở hữu.

---

## 2. Yêu Cầu & Phạm Vi Tính Năng Multi-User

1. **Khởi tạo & Phân Quyền (RBAC):**
   - User đầu tiên (mặc định hiện tại) tự động trở thành `admin`.
   - `admin` có quyền: Quản lý người dùng (thêm, sửa, khóa, xóa user, reset mật khẩu), xem thống kê toàn hệ thống, cấu hình system settings.
   - `user` (người dùng thông thường): Chỉ thấy và quản lý tài nguyên của chính mình.
2. **Cô Lập Dữ Liệu (Data Isolation):**
   - **Tài nguyên tách biệt theo `user_id`:**
     - Provider Connections (API key, OAuth credentials cá nhân).
     - Gateway API Keys (mỗi user tạo key riêng để dùng).
     - Model Combos, Model Aliases, Custom Models.
     - Provider Nodes, Proxy Pools cá nhân.
     - MCP Servers / Plugins / Tools / Rules cá nhân.
     - Hermes Profiles / Tasks.
     - Usage / Request Logs / Metrics (thống kê chi phí/token riêng biệt).
   - **Tài nguyên Global (System Level - do Admin quản lý hoặc chia sẻ):**
     - Pricing Catalog (Bảng giá chuẩn).
     - System Settings (Cổng mạng, Tunnel, Log level, Auth mode toàn server).
3. **Gateway Routing theo User Context:**
   - Khi API client gửi API Key của User A, Gateway chỉ sử dụng Provider Connections và Combos thuộc sở hữu của User A. Request log và Usage ghi nhận trực tiếp vào User A.

---

## 3. Đánh Giá Rủi Ro & Thách Thức Kỹ Thuật

1. **Migration Dữ Liệu Hiện Tại:**
   - Cần migration script (`005-multi-user-schema.js`) tạo bảng `users` và tự động gắn toàn bộ dữ liệu hiện có cho User Admin (ID: `1` hoặc `admin_default`).
2. **Backward Compatibility:**
   - Hệ thống chạy local hoặc chế độ single-user (khi tắt auth) vẫn phải hoạt động mượt mà không crash.
3. **Session & Middleware Update:**
   - Payload JWT cần mang theo `{ userId, username, role }`.
   - Tất cả Repository Repos (`src/lib/db/repos/*`) cần nhận context `userId` để filter `WHERE user_id = ?`.
