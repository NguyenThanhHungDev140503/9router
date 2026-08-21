# Roadmap: 9Router Server-Side MCP & Skills Gateway

## Overview
Xây dựng hệ thống Server-Side MCP & Skills Gateway toàn diện cho 9Router theo 7 phases có cấu trúc rõ ràng: từ Database & Process Manager, Inbound Injection, Autonomous ReAct Tool Loop, REST APIs, WebUI Dashboard cho đến Verification & Automated Testing.

## Phase Overview

| Phase | Name | Goal | Requirements | Success Criteria |
|---|---|---|---|---|
| 1 | Database & Repositories | Khởi tạo schema SQLite và repositories cho MCP Servers, Tools Cache, Skills | MCP-DB-01, MCP-DB-02, MCP-DB-03, MCP-DB-04 | 4 |
| 2 | MCP Process Manager & JSON-RPC Client | Xây dựng trình quản lý tiến trình stdio/sse/http và giao tiếp JSON-RPC 2.0 | MCP-PROC-01, MCP-PROC-02, MCP-PROC-03 | 3 |
| 3 | Format-Aware Inbound Injection | 2/3 | In Progress|  |
| 4 | Autonomous Server-Side ReAct Loop | Chặn `mcp__*` tool calls, thực thi tool, nạp context, và gọi lặp lại LLM | MCP-REACT-01, MCP-REACT-02, MCP-REACT-03, MCP-REACT-04, MCP-REACT-05 | 5 |
| 5 | REST API Management Endpoints | Xây dựng API endpoints quản lý Servers, Tools, Skills, và Test Execution | MCP-API-01, MCP-API-02, MCP-API-03, MCP-API-04 | 4 |
| 6 | Web Dashboard UI | Giao diện Dashboard quản lý MCP Servers, Skills, Modal cấu hình và Test Inspector | MCP-UI-01, MCP-UI-02, MCP-UI-03, MCP-UI-04 | 4 |
| 7 | Verification & Automated Test Suite | Viết test suite toàn diện cho DB, Process Manager, Injection, và ReAct Loop | MCP-TEST-01, MCP-TEST-02, MCP-TEST-03, MCP-TEST-04 | 4 |

---

### Phase 1: Database & Repositories
**Goal:** Thiết lập cấu trúc dữ liệu SQLite và repositories cho MCP Servers, Tools Cache, Skills, và Gateway Rules.
**Requirements:** MCP-DB-01, MCP-DB-02, MCP-DB-03, MCP-DB-04
**Success Criteria:**
1. `src/lib/db/schema.js` có bảng `mcpServers`, `mcpToolsCache`, `skills`, `gatewayToolRules` và bump SCHEMA_VERSION.
2. `src/lib/db/repos/mcpRepo.js` thực hiện đầy đủ CRUD cho servers và tool caches.
3. `src/lib/db/repos/skillsRepo.js` quản lý skills và quy tắc kích hoạt.
4. Auto-sync migration chạy mượt mà không làm mất dữ liệu hiện có.

### Phase 2: MCP Process Manager & JSON-RPC Client
**Goal:** Xây dựng module quản lý tiến trình con MCP (stdio) và client giao tiếp JSON-RPC 2.0.
**Requirements:** MCP-PROC-01, MCP-PROC-02, MCP-PROC-03
**Plans:** 5 plans
**Success Criteria:**
1. `src/lib/mcp/client.js` gửi/nhận chuẩn xác `initialize`, `tools/list`, `tools/call`.
2. `src/lib/mcp/processManager.js` spawn tiến trình stdio, quản lý lifecycle, auto-restart khi crash.
3. Có cơ chế timeout và xử lý lỗi fail-safe.

Plans:
- [x] 02-01-PLAN.md — JSON-RPC UUID client và protocol lifecycle tests.
- [x] 02-02-PLAN.md — Host policy, SSRF guard, sanitized errors và output limits.
- [ ] 02-03-PLAN.md — Schema v3/repository cho tested-enable gate, state và audit retention.
- [ ] 02-04-PLAN.md — Safe stdio/Streamable HTTP/legacy SSE transport factory.
- [ ] 02-05-PLAN.md — Gateway-wide process manager, recovery, limits và observability.

### Phase 3: Format-Aware Inbound Injection
**Goal:** Tự động chèn danh sách MCP Tools và nội dung Skill Prompt vào mọi Request Body gửi tới LLM.
**Requirements:** MCP-INJECT-01, MCP-INJECT-02, MCP-INJECT-03, MCP-INJECT-04
**Success Criteria:**
1. Prefix chuẩn `mcp__<server>__<tool>` được tạo nhất quán.
2. `open-sse/mcp/injector.js` chuyển đổi đúng schema cho OpenAI format (`tools[]`).
3. Chuyển đổi đúng sang Claude `input_schema` và Gemini `functionDeclarations`.
4. System Prompt của các skill đang kích hoạt được tiêm tự động vào request.

### Phase 4: Autonomous Server-Side ReAct Loop
**Goal:** Chặn tool calls của Gateway, thực thi tool qua JSON-RPC, nạp context và tiếp tục turn với LLM.
**Requirements:** MCP-REACT-01, MCP-REACT-02, MCP-REACT-03, MCP-REACT-04, MCP-REACT-05
**Success Criteria:**
1. Tự động nhận diện tool call có prefix `mcp__*` từ response của LLM.
2. Client Native Tools (như `read_file`, `edit_file`) được chuyển thẳng về Client không bị chặn.
3. Thực thi tool trên Gateway, format `tool_result` và nạp lại vào message history.
4. Lặp lại turn với LLM tối đa `MAX_ITERATIONS` (10) cho đến khi hoàn thành.
5. Tích hợp trực tiếp vào `open-sse/handlers/chatCore.js` và `src/sse/handlers/chat.js`.

### Phase 5: REST API Management Endpoints
**Goal:** Xây dựng hệ thống Next.js API Routes quản lý MCP Servers, Tools, Skills và chạy thử nghiệm.
**Requirements:** MCP-API-01, MCP-API-02, MCP-API-03, MCP-API-04
**Success Criteria:**
1. `/api/mcp/servers` hỗ trợ GET, POST, PUT, DELETE.
2. `/api/mcp/tools` trả về danh sách toàn bộ tools khả dụng.
3. `/api/mcp/test` kiểm tra kết nối và chạy thử tool với arguments.
4. `/api/skills` quản lý danh sách skills và rule kích hoạt.

### Phase 6: Web Dashboard UI
**Goal:** Nâng cấp trang `src/app/(dashboard)/dashboard/skills/` thành giao diện quản lý MCP & Skills toàn diện.
**Requirements:** MCP-UI-01, MCP-UI-02, MCP-UI-03, MCP-UI-04
**Success Criteria:**
1. Giao diện trực quan với 2 tabs: MCP Servers và Custom Skills.
2. Modal thêm/sửa Server hỗ trợ các loại Transport (Stdio, SSE, HTTP), cấu hình env và args.
3. Modal Test & Inspect Tool trực quan hiển thị input schema và kết quả JSON trả về.
4. Toggle bật/tắt tức thì kèm badge hiển thị trạng thái kết nối.

### Phase 7: Verification & Automated Test Suite
**Goal:** Xây dựng bộ test suite tự động và kiểm tra tính tương thích toàn diện.
**Requirements:** MCP-TEST-01, MCP-TEST-02, MCP-TEST-03, MCP-TEST-04
**Success Criteria:**
1. Unit tests trong `tests/unit/` kiểm tra DB repos, JSON-RPC client, và Process Manager.
2. Unit tests kiểm tra Format-Aware Inbound Injection trên OpenAI, Claude, Gemini.
3. E2E simulation test xác nhận ReAct Tool Loop hoạt động hoàn hảo đa vòng.
4. Baseline regression check (`verify-no-regression.mjs`) vượt qua an toàn.
