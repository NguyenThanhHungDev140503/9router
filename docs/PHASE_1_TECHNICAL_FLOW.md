# Phase 1: Database & Repository Layer — Technical Flow & Architecture

## 1. Tổng quan mục tiêu
Phase 1 xây dựng nền tảng lưu trữ và truy xuất dữ liệu SQLite hiệu năng cao cho hệ thống Server-Side MCP (Model Context Protocol) và Custom Skills trên 9Router:
- Lưu trữ cấu hình kết nối đa giao thức (stdio, SSE, HTTP).
- Cache schema danh sách công cụ (Tools) theo từng server để phục vụ ReAct loop tức thì.
- Quản lý Custom System Prompt Skills và bộ quy tắc kiểm soát công cụ Gateway (auto-execute, block, passthrough).

---

## 2. Luồng kỹ thuật (Technical Flow)

```
[ Next.js API / ReAct Engine ]
             │
             ▼
   [ src/lib/db/index.js ] (Public Barrel API)
             │
    ┌────────┴──────────────────────────┐
    ▼                                   ▼
[ mcpRepo.js ]                   [ skillsRepo.js ]
    │ (Validation & JSON Serialize)      │ (Validation & Action Checks)
    └────────┬──────────────────────────┘
             ▼
     [ driver.js ] (Adapter Router)
             │
             ├── Node >= 22.5: node:sqlite (DatabaseSync)
             ├── Bun: bun:sqlite
             ├── C++ Native: better-sqlite3
             └── Fallback: sql.js
             ▼
     [ data.sqlite ] (WAL Mode + Safe Transactions)
```

---

## 3. Cấu trúc Schema SQLite

### 3.1 Bảng `mcpServers`
Lưu cấu hình chi tiết của từng MCP Server.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID định danh server |
| `name` | `TEXT NOT NULL UNIQUE` | Tên server (dùng làm prefix `mcp__<name>__<tool>`) |
| `transport` | `TEXT NOT NULL` | Giao thức: `stdio`, `sse`, hoặc `http` |
| `command` | `TEXT` | Lệnh thực thi (dành cho stdio, ví dụ: `npx`, `node`, `python`) |
| `args` | `TEXT` | Tham số dòng lệnh dưới dạng JSON Array (ví dụ: `["-y", "@modelcontextprotocol/server-filesystem"]`) |
| `env` | `TEXT` | Biến môi trường tùy biến dưới dạng JSON Object |
| `url` | `TEXT` | URL endpoint kết nối (dành cho `sse` và `http`) |
| `enabled` | `INTEGER NOT NULL DEFAULT 1` | 1 = Kích hoạt, 0 = Tắt |
| `createdAt` | `TEXT NOT NULL` | Thời gian tạo (ISO 8601) |
| `updatedAt` | `TEXT NOT NULL` | Thời gian cập nhật gần nhất |

**Indexes:**
- `idx_mcpServers_name` (UNIQUE)
- `idx_mcpServers_enabled`

---

### 3.2 Bảng `mcpToolsCache`
Lưu trữ bộ nhớ đệm schema công cụ sau khi tiến trình MCP khởi tạo và phản hồi qua `tools/list`.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `serverId` | `TEXT PRIMARY KEY` | Khóa ngoại trỏ đến `mcpServers.id` |
| `tools` | `TEXT NOT NULL DEFAULT '[]'` | Mảng JSON chứa toàn bộ Tool Schemas (`name`, `description`, `inputSchema`) |
| `updatedAt` | `TEXT NOT NULL` | Thời gian đồng bộ cache gần nhất |

**Indexes:**
- `idx_mcpToolsCache_updatedAt`

**Hành vi xóa:** Khi xóa `mcpServers`, `mcpRepo.deleteMcpServer()` tự động xóa đồng thời bản ghi trong `mcpToolsCache`.

---

### 3.3 Bảng `skills`
Lưu trữ các đoạn System Prompt Skills tùy biến để tiêm tự động vào request upstream.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID định danh skill |
| `name` | `TEXT NOT NULL UNIQUE` | Tên nhận diện skill |
| `description` | `TEXT` | Mô tả mục đích sử dụng |
| `systemPrompt` | `TEXT NOT NULL` | Nội dung prompt hướng dẫn cho LLM |
| `enabled` | `INTEGER NOT NULL DEFAULT 1` | 1 = Kích hoạt, 0 = Tắt |
| `matchRules` | `TEXT` | JSON object chứa quy tắc khớp điều kiện (ví dụ: `{ providers: ["anthropic"] }`) |
| `createdAt` | `TEXT NOT NULL` | Thời gian tạo (ISO 8601) |
| `updatedAt` | `TEXT NOT NULL` | Thời gian cập nhật |

**Indexes:**
- `idx_skills_name` (UNIQUE)
- `idx_skills_enabled`

---

### 3.4 Bảng `gatewayToolRules`
Quy tắc quản lý quyền thực thi Server-Side đối với từng Tool cụ thể.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID định danh quy tắc |
| `toolName` | `TEXT NOT NULL UNIQUE` | Tên tool (chuẩn format `mcp__<server>__<tool>`) |
| `action` | `TEXT NOT NULL DEFAULT 'auto_execute'` | Hành vi: `auto_execute`, `block`, `passthrough_client` |
| `timeoutMs` | `INTEGER NOT NULL DEFAULT 30000` | Giới hạn thời gian chạy (ms) |
| `enabled` | `INTEGER NOT NULL DEFAULT 1` | Trạng thái hiệu lực của rule |
| `createdAt` | `TEXT NOT NULL` | Thời gian tạo |
| `updatedAt` | `TEXT NOT NULL` | Thời gian cập nhật |

**Indexes:**
- `idx_gatewayToolRules_toolName` (UNIQUE)
- `idx_gatewayToolRules_enabled`

---

## 4. Chi tiết Repositories & API

### 4.1 MCP Repository (`src/lib/db/repos/mcpRepo.js`)
- `getMcpServers()`: Lấy danh sách toàn bộ server.
- `getEnabledMcpServers()`: Lấy danh sách server đang bật để nạp schema khi xử lý request.
- `getMcpServerById(id)` / `getMcpServerByName(name)`: Tìm kiếm server.
- `createMcpServer(data)`: Validate input payload + khởi tạo server mới.
- `updateMcpServer(id, data)`: Cập nhật cấu hình server.
- `deleteMcpServer(id)`: Xóa server và xóa sạch cache công cụ liên quan.
- `getMcpToolsCache(serverId)` / `saveMcpToolsCache(serverId, tools)` / `deleteMcpToolsCache(serverId)`: Quản lý cache tool schema.

### 4.2 Skills Repository (`src/lib/db/repos/skillsRepo.js`)
- `getSkills()` / `getEnabledSkills()`: Truy xuất danh sách skills.
- `getSkillById(id)` / `getSkillByName(name)`: Truy vấn skill.
- `createSkill(data)` / `updateSkill(id, data)` / `deleteSkill(id)`: Quản lý vòng đời skill.
- `getGatewayToolRules()` / `getGatewayToolRuleByToolName(toolName)`: Lấy quy tắc thực thi tool.
- `createGatewayToolRule(data)` / `updateGatewayToolRule(id, data)` / `deleteGatewayToolRule(id)`: Thiết lập quyền thực thi và timeout.

---

## 5. Cơ chế Migration & Khả năng tương thích ngược
1. **Schema Versioning**: Nâng `SCHEMA_VERSION = 2` trong `src/lib/db/schema.js`.
2. **Auto Migration Chain**: Tệp `src/lib/db/migrations/002-mcp-skills.js` tự động khởi chạy khi ứng dụng khởi động nếu DB ở phiên bản cũ.
3. **Zero-Downtime / No Data Loss**: Sử dụng `CREATE TABLE IF NOT EXISTS` và `CREATE INDEX IF NOT EXISTS`, đảm bảo toàn bộ dữ liệu cấu hình cũ (API keys, Connections, Usage) được giữ nguyên vẹn 100%.

---

## 6. Tiêu chuẩn Bảo mật (Security & Safety)
- **Parameterized SQL**: 100% câu truy vấn dùng biến bind `?`, ngăn ngừa hoàn toàn SQL Injection.
- **Fail-safe Serialization**: Tự động parse/stringify JSON an toàn qua helper `jsonCol.js`.
- **Strict Input Validation**: Kiểm tra chặt chẽ giá trị `transport`, `action`, `timeoutMs` và kiểu dữ liệu trước khi chạm tới cơ sở dữ liệu.
