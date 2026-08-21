# Requirements

**Analysis Date:** 2026-08-19

## v1 Requirements

### Database & Repository Layer (MCP-DB)
- [x] **MCP-DB-01**: Bổ sung bảng `mcpServers` trong SQLite schema với các trường `id`, `name`, `transport` (stdio/sse/http), `command`, `args`, `env`, `url`, `enabled`, `createdAt`, `updatedAt`.
- [x] **MCP-DB-02**: Bổ sung bảng `mcpToolsCache` lưu trữ danh sách schema tool của từng MCP server.
- [x] **MCP-DB-03**: Bổ sung bảng `skills` và `gatewayToolRules` để quản lý các custom system prompt skills và quy tắc kích hoạt.
- [x] **MCP-DB-04**: Tạo repository `src/lib/db/repos/mcpRepo.js` và `skillsRepo.js` với đầy đủ các thao tác CRUD và cache sync.

### Process & Client Manager (MCP-PROC)
- [ ] **MCP-PROC-01**: Xây dựng `src/lib/mcp/client.js` thực thi giao thức JSON-RPC 2.0 (khởi tạo `initialize`, lấy danh sách `tools/list`, gọi `tools/call`).
- [ ] **MCP-PROC-02**: Xây dựng `src/lib/mcp/processManager.js` quản lý vòng đời tiến trình MCP con (spawn stdio processes, theo dõi stdio/stderr, tự khởi động lại khi crash, quản lý kết nối SSE/HTTP).
- [ ] **MCP-PROC-03**: Cơ chế timeout, error handling, và bảo mật (cấm injection command nguy hiểm, sanitize env vars).

### Format-Aware Inbound Injection (MCP-INJECT)
- [x] **MCP-INJECT-01**: Xây dựng `open-sse/mcp/injector.js` chuyển đổi danh sách MCP Tools sang định dạng chuẩn (`mcp__<server>__<tool>`) cho OpenAI format (`tools: [{type: "function", function: ...}]`).
- [x] **MCP-INJECT-02**: Hỗ trợ chuyển đổi Tool Schema sang định dạng Anthropic Claude (`tools: [{name, description, input_schema}]`).
- [x] **MCP-INJECT-03**: Hỗ trợ chuyển đổi Tool Schema sang định dạng Google Gemini / Antigravity (`tools: [{functionDeclarations: [...]}]`).
- [x] **MCP-INJECT-04**: Tiêm System Prompt của các Skill đang kích hoạt vào request payload trước khi gửi tới upstream LLM.

### Autonomous Server-Side ReAct Loop (MCP-REACT)
- [ ] **MCP-REACT-01**: Xây dựng `open-sse/mcp/toolLoop.js` để phát hiện và chặn các tool calls có prefix `mcp__*` từ response của LLM.
- [ ] **MCP-REACT-02**: Tách biệt rõ ràng Client Native Tools (trả về trực tiếp cho Client) và Gateway MCP Tools (xử lý server-side).
- [ ] **MCP-REACT-03**: Gọi `processManager.executeToolCall()`, format kết quả trả về thành `tool_result` (OpenAI / Claude / Gemini message shape) và nạp vào history.
- [ ] **MCP-REACT-04**: Tự động lặp lại turn gọi LLM cho tới khi không còn Gateway tool call nào hoặc chạm ngưỡng `MAX_ITERATIONS` (mặc định 10), sau đó stream response hoàn chỉnh về cho client.
- [ ] **MCP-REACT-05**: Tích hợp mượt mà vào `open-sse/handlers/chatCore.js` và `src/sse/handlers/chat.js` cho cả luồng streaming và non-streaming.

### REST API Endpoints (MCP-API)
- [ ] **MCP-API-01**: Endpoint `/api/mcp/servers` (GET, POST, PUT, DELETE) để quản lý cấu hình MCP Server.
- [ ] **MCP-API-02**: Endpoint `/api/mcp/tools` để liệt kê toàn bộ tools đã load và cache.
- [ ] **MCP-API-03**: Endpoint `/api/mcp/test` để test kết nối và chạy thử tool cụ thể.
- [ ] **MCP-API-04**: Endpoint `/api/skills` (GET, POST, PUT, DELETE) để quản lý danh sách skills và rule kích hoạt.

### Web Dashboard UI (MCP-UI)
- [ ] **MCP-UI-01**: Nâng cấp giao diện `src/app/(dashboard)/dashboard/skills/page.js` với tab MCP Servers và tab Custom Skills.
- [ ] **MCP-UI-02**: Modal thêm/sửa MCP Server (chọn Transport: Stdio, SSE, HTTP; nhập command, args, env, URL).
- [ ] **MCP-UI-03**: Modal kiểm tra (Test & Inspect) danh sách Tools trả về từ MCP Server kèm nút Test Execute Tool.
- [ ] **MCP-UI-04**: Toggle bật/tắt tức thì từng MCP Server và Skill, hiển thị trạng thái kết nối (Connected, Stopped, Error).

### Automated Testing (MCP-TEST)
- [ ] **MCP-TEST-01**: Unit tests cho `mcpRepo.js` và `skillsRepo.js` với SQLite.
- [ ] **MCP-TEST-02**: Unit tests cho JSON-RPC client và Process Manager với mock stdio server.
- [ ] **MCP-TEST-03**: Unit tests cho Schema Injector trên các format OpenAI, Claude, Gemini.
- [ ] **MCP-TEST-04**: E2E simulation test cho ReAct Tool Loop (kiểm tra turn-taking, tool execution, và final stream output).

## v2 Requirements (Deferred)
- **MCP-DOCKER**: Khả năng chạy MCP Server trong Docker container cô lập.
- **MCP-MARKETPLACE**: Cài đặt 1-click các MCP Server phổ biến từ danh mục Marketplace cộng đồng.
- **MCP-OAUTH**: Hỗ trợ OAuth 2.0 luồng xác thực dành riêng cho các Remote HTTP MCP Servers.

## Out of Scope
- Chạy các client-native file manipulation tools trên máy chủ gateway nếu không có cấu hình chia sẻ filesystem.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MCP-DB-01..04 | Phase 1 | Complete |
| MCP-PROC-01..03 | Phase 2 | Pending |
| MCP-INJECT-01..04 | Phase 3 | Pending |
| MCP-REACT-01..05 | Phase 4 | Pending |
| MCP-API-01..04 | Phase 5 | Pending |
| MCP-UI-01..04 | Phase 6 | Pending |
| MCP-TEST-01..04 | Phase 7 | Pending |
