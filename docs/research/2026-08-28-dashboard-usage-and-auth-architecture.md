# Research Report: Dashboard Usage & Authorization Architecture in 9Router

## 1. Overview & Context
Tài liệu khảo sát chi tiết kiến trúc hiện tại của 9Router gồm 2 thành phần chính:
- **Authorization & Multi-User Architecture**: Cách thức xác thực, phân quyền (RBAC), context request, schema database.
- **Dashboard Usage Architecture**: Cách thu thập dữ liệu usage (tokens, cost, requests), lưu trữ trong SQLite, API endpoints thống kê và UI Dashboard.

---

## 2. Authorization & Multi-User Architecture

### 2.1 Database Schema (`src/lib/db/schema.js` & Migration `005-multi-user.js`)
- **Bảng `users`**:
  - `id` (TEXT PRIMARY KEY) - nanoid / uuid.
  - `username` (TEXT UNIQUE NOT NULL).
  - `password_hash` (TEXT NOT NULL) - Bcrypt hash.
  - `role` (TEXT NOT NULL, default `'user'`) - Nhận các giá trị `'admin'` hoặc `'user'`.
  - `is_active` (INTEGER NOT NULL, default 1).
  - `created_at`, `updated_at`.
- **Quan hệ `user_id` trong các bảng liên quan**:
  - `api_keys.user_id`: Mỗi API key thuộc về một user.
  - `connections.user_id`: Provider connection thuộc về user.
  - `usage_history.user_id`: Ghi nhận token/request usage theo user.
  - `request_details.user_id`: Chi tiết từng request ghi nhận theo user.
  - `request_logs.user_id`: Log rút gọn request.

### 2.2 Authentication & Session Management
- **Dashboard Web UI Session (`src/lib/auth/dashboardSession.js`)**:
  - Sử dụng JWT (`HS256`) lưu trong HTTP-only Cookie `auth_token`.
  - Claims bao gồm: `{ authenticated: true, userId, username, role, isAdmin }`.
  - `verifyDashboardAuthToken(token)` giải mã và xác thực token với secret `jwt-secret` trong `DATA_DIR`.
- **API Request Authentication (OpenAI / Chat / Proxy endpoints)**:
  - Header `Authorization: Bearer <API_KEY>`.
  - Khóa API được kiểm tra trong DB (`api_keys`), truy ra `user_id` và `user.role`.

### 2.3 User Context Resolution (`src/lib/auth/userContext.js`)
- `getUserContext(request)`:
  1. Kiểm tra Bearer token trong header `Authorization` (API key) -> lấy user từ DB.
  2. Kiểm tra Cookie `auth_token` -> decode JWT lấy `{ userId, username, role, isAdmin }`.
  3. Hỗ trợ Single-User fallback: Nếu chưa cấu hình multi-user / `users` rỗng hoặc admin mặc định, `isAdmin` = true.
- `requireAdmin(userContext)`: Kiểm tra `userContext.isAdmin === true` (hoặc `role === 'admin'`). Throw error nếu là user thường.

---

## 3. Dashboard Usage Architecture

### 3.1 Data Flow & Pipeline ghi nhận Usage
1. Khi có request AI hoàn thành (Chat completions, Codex responses, Embeddings):
   - `open-sse/handlers/chatCore/requestDetail.js` & `src/sse/handlers/embeddings.js` tính toán token (prompt_tokens, completion_tokens), cost, status, latency.
   - Gọi `saveRequestUsage(entry)` và `saveRequestDetail(entry)` (trong `src/lib/db/repos/usageRepo.js`).
   - `entry` chứa trường `user_id` (được extract từ API Key hoặc session).

2. **Lưu trữ DB (`usage_history`, `request_details`, `request_logs`)**:
   - `usage_history`: Record theo model, provider, connection_id, user_id, prompt_tokens, completion_tokens, cost, timestamp.
   - `request_details`: Lưu metadata & body (request, response, provider payload, user_id).
   - `request_logs`: Stream log gần nhất (50-100 entries).

### 3.2 Backend Analytics & Aggregation Queries (`src/lib/db/repos/usageRepo.js`)
- **Hàm `getUsageStats(period, filter)`**:
  - Hỗ trợ `filter.userId` (dùng mệnh đề `WHERE user_id = ?`).
  - Trả về:
    - `summary`: totalRequests, totalTokens, totalCost, avgLatency, successRate.
    - `byModel`: Thống kê group by model.
    - `byProvider`: Thống kê group by provider.
    - `byHour` / `byDay`: Time-series dữ liệu.
- **Hàm `getChartData(period, filter)`**:
  - Hỗ trợ `filter.userId`.
  - Trả về time-series bucket cho biểu đồ token/cost theo thời gian.
- **Hàm `getRequestDetails(filter)`**:
  - Hỗ trợ `filter.userId`, `filter.provider`, `filter.model`, `filter.status`, pagination (`page`, `pageSize`).
  - Redact conversation content trước khi trả về client để đảm bảo privacy.

### 3.3 Usage API Endpoints
- `GET /api/usage/stats?period=7d`:
  - Hiện tại: `const filter = userContext && !userContext.isAdmin ? { userId: userContext.userId } : {};`
  - Nếu user là non-admin: tự động filter theo `userContext.userId`.
  - Nếu user là Admin: nhận toàn bộ thống kê hệ thống (chưa có param lọc theo 1 user cụ thể).
- `GET /api/usage/chart?period=7d`:
  - Tương tự `stats`, non-admin chỉ thấy của mình, Admin thấy toàn bộ (chưa hỗ trợ `userId` query param cho Admin).
- `GET /api/usage/request-details?page=1&pageSize=20&...`:
  - Đã có filter `userId` trong DB repo, nhưng route chưa parse `searchParams.get("userId")` khi Admin gửi lên.

### 3.4 Frontend Components (`src/app/(dashboard)/dashboard/usage/`)
- **Page Container (`src/app/(dashboard)/dashboard/usage/page.js`)**:
  - Quản lý URL params (`tab=overview|details`).
  - Hiển thị tab `overview` (`UsageStats`) hoặc `details` (`RequestDetailsTab`).
- **Tab Overview (`src/shared/components/UsageStats.js`)**:
  - Chứa bộ chọn `period` (Today, 24h, 7D, 30D, 60D).
  - Metrics Cards (Total Requests, Total Tokens, Total Cost, Avg Latency, Success Rate).
  - Chart (`UsageChart`).
  - Bảng thống kê theo Model (`UsageTable` theo model) và theo Provider.
- **Tab Details (`src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`)**:
  - Bảng chi tiết từng request.
  - Các bộ lọc hiện tại: Provider, Model, Status, Date Range.
  - Hiện tại **CHƯA** có User filter dropdown.
- **Quản lý danh sách Users (`src/app/api/users`)**:
  - Endpoint `GET /api/users` chỉ cho phép Admin truy cập.
  - Phù hợp để fetch danh sách user cho filter dropdown khi tài khoản hiện tại là Admin.

---

## 4. Key Findings & Gap Analysis cho tính năng "Lọc theo User"

1. **Backend / Data Layer đã sẵn sàng**:
   - Schema DB đã có cột `user_id` trong tất cả các bảng usage.
   - Repository `usageRepo.js` (`getUsageStats`, `getChartData`, `getRequestDetails`) đã có sẵn logic xử lý `filter.userId`.
2. **API Routes còn thiếu param parsing cho Admin**:
   - `GET /api/usage/stats`: Cần đọc `searchParams.get("userId")`. Nếu caller là Admin, áp dụng `filter.userId = targetUserId`. Nếu caller là non-admin, luôn cố định `userId = userContext.userId`.
   - `GET /api/usage/chart`: Cần tương tự đọc `userId` param.
   - `GET /api/usage/request-details`: Cần đọc `searchParams.get("userId")` và pass vào filter cho Admin.
3. **Frontend UI cần bổ sung**:
   - Kiểm tra `isAdmin` từ session/auth.
   - Nếu là Admin: Hiển thị User Filter Selector (All Users + danh sách người dùng lấy từ `/api/users`).
   - Cập nhật cả 2 tab:
     - Tab **Overview**: Lọc toàn bộ thẻ metric tổng quan, biểu đồ `UsageChart`, bảng `byModel` và `byProvider` theo user được chọn.
     - Tab **Details**: Thêm cột User trong bảng và thêm User Filter Select bên cạnh Provider/Model/Status.
   - Nếu là User thường: Ẩn User Filter, tự động hiển thị dữ liệu của chính user đó.
