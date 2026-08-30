# Milestone Summary: Inbound MCP & Custom Skills Gateway (v1.0.0)

**Ngày hoàn thành:** 2026-08-19  
**Mục tiêu:** Xây dựng hệ thống Gateway Proxy thông minh hỗ trợ Model Context Protocol (MCP) và Custom System Prompt Skills cho 9router. Cho phép client LLM (OpenAI, Anthropic Claude, Google Gemini) gọi và thực thi server-side MCP tools tự động thông qua vòng lặp ReAct độc lập tại gateway.

---

## 1. Kiến trúc Tổng thể (System Architecture & Data Flow)

```
[ Client: OpenAI / Claude / Gemini / Codex ]
                   │
                   ▼  (1) HTTP/SSE Chat Request
      ┌─────────────────────────┐
      │     9router Gateway     │
      │  (src/sse/handlers/     │
      │   open-sse/chatCore)    │
      └────────────┬────────────┘
                   │
                   ▼  (2) Inbound Injection (Phase 3)
      ┌─────────────────────────┐
      │   Injector (Skills &    │ ◄─── DB: mcpServers, skills,
      │     MCP Tool Schemas)   │      mcpToolsCache (Phase 1)
      └────────────┬────────────┘
                   │
                   ▼  (3) Forward transformed request
      ┌─────────────────────────┐
      │   Upstream LLM Provider │
      │ (OpenAI / Claude/Gemini)│
      └────────────┬────────────┘
                   │
                   ▼  (4) Response with tool_calls (mcp__<server>__<tool>)
      ┌─────────────────────────┐
      │ Autonomous ReAct Loop   │
      │ (open-sse/mcp/toolLoop) │ ◄─── (Phase 4)
      └─────┬─────────────▲─────┘
            │             │
(5) Exec    │             │ (6) Append tool_result & Re-invoke LLM
            ▼             │
      ┌─────────────────────────┐
      │  Process & Client Mgr   │
      │ (lib/mcp/processManager)│ ◄─── (Phase 2)
      └────────────┬────────────┘
                   │
                   ▼  (JSON-RPC 2.0 over Stdio/SSE/HTTP)
      ┌─────────────────────────┐
      │ External MCP Server(s)  │
      └─────────────────────────┘
                   │
                   ▼  (7) Final LLM text completion
      [ Stream back to Client via SSE ]
```

---

## 2. Chi tiết Kỹ thuật 7 Phase (Detailed Technical Flow)

### Phase 1: Database & Repository Layer (MCP-DB)
- **Mục tiêu:** Cung cấp lớp lưu trữ SQLite và data access layer cho MCP servers, tool schema caches, skills, và gateway activation rules.
- **Thành phần:**
  - `src/lib/db/schema.js`:
    - `mcpServers`: Lưu cấu hình server (`id`, `name`, `transport` ['stdio', 'sse', 'http'], `command`, `args`, `env`, `url`, `enabled`, `createdAt`, `updatedAt`).
    - `mcpToolsCache`: Lưu snapshot JSON Schema các tool của từng server (`id`, `serverId`, `toolsJson`, `updatedAt`).
    - `skills`: Lưu trữ custom system prompt (`id`, `name`, `systemPrompt`, `enabled`, `priority`, `createdAt`, `updatedAt`).
    - `gatewayToolRules`: Quy tắc kích hoạt tự động skill hoặc tool set theo pattern model hoặc request.
  - `src/lib/db/repos/mcpRepo.js`: CRUD MCP server, get enabled servers, cập nhật cache tool schema.
  - `src/lib/db/repos/skillsRepo.js`: CRUD Skills, lấy danh sách active skills có sắp xếp theo độ ưu tiên (`priority`).
- **Data Flow:**
  - Gateway khởi động hoặc reload cấu hình -> Repo truy vấn SQLite -> Nạp danh sách server/skill đang bật vào in-memory cache.

---

### Phase 2: Process & Client Manager (MCP-PROC)
- **Mục tiêu:** Quản lý vòng đời tiến trình MCP con (stdio) và kết nối mạng (SSE/HTTP), thực thi giao thức JSON-RPC 2.0 chuẩn.
- **Thành phần:**
  - `src/lib/mcp/client.js`:
    - Đóng gói client JSON-RPC 2.0.
    - Phương thức: `initialize()` (bắt tay & đàm phán capability), `listTools()` (lấy danh sách công cụ), `callTool(name, arguments)` (thực thi tool).
  - `src/lib/mcp/processManager.js`:
    - Quản lý lifecycle: `spawn` tiến trình con (child_process) cho Stdio transport.
    - Quản lý kết nối persistent HTTP/SSE client.
    - Sanitize biến môi trường (`env`) và kiểm tra whitelist lệnh/tham số nhằm chống OS command injection.
    - Heartbeat, tự động restart khi process bị crash, timeout watchdog cho mỗi lượt gọi tool.
- **Technical Flow:**
  1. `processManager.startServer(serverConfig)`: Tạo child process hoặc mở SSE stream.
  2. Gửi JSON-RPC request `initialize`.
  3. Gửi `tools/list` để crawl tool definitions và ghi vào `mcpToolsCache`.
  4. `processManager.executeToolCall(serverId, toolName, args)`: Định tuyến request tới client tương ứng, chờ JSON-RPC response, xử lý timeout/error.

---

### Phase 3: Format-Aware Inbound Injection (MCP-INJECT)
- **Mục tiêu:** Tiêm định nghĩa tool và custom skills vào request body tương thích chính xác theo từng định dạng provider LLM upstream.
- **Thành phần:**
  - `open-sse/mcp/injector.js`:
    - `injectMcpTools(requestPayload, providerType)`: Lấy toàn bộ tool từ các server đang `enabled`, prefix tên thành `mcp__<serverId>__<toolName>`.
    - Converter hỗ trợ 3 chuẩn định dạng:
      - **OpenAI / Codex format:** `{ type: "function", function: { name, description, parameters } }`.
      - **Anthropic Claude format:** `{ name, description, input_schema }`.
      - **Google Gemini format:** `{ functionDeclarations: [{ name, description, parameters }] }`.
    - `injectSkillPrompts(requestPayload, providerType)`:
      - OpenAI: Nối vào message `system` đầu tiên hoặc chèn `developer` message.
      - Claude: Gán vào trường `system` top-level.
      - Gemini: Gán vào `systemInstruction.parts[].text`.
- **Technical Flow:**
  - Request từ Client đến -> `injector.js` nhận diện provider -> Tiêm system prompt skills -> Tiêm schema MCP tools vào payload -> Gửi payload đã làm giàu đến Upstream LLM.

---

### Phase 4: Autonomous Server-Side ReAct Loop (MCP-REACT)
- **Mục tiêu:** Tự động bắt giữ các tool call gateway (`mcp__*`), thực thi qua Process Manager, nạp kết quả vào ngữ cảnh và tiếp tục gọi LLM mà không cần client can thiệp.
- **Thành phần:**
  - `open-sse/mcp/toolLoop.js`:
    - Bộ điều phối ReAct loop trên Gateway.
    - `filterToolCalls()`: Phân biệt `Client-native Tools` (trả về ngay cho client) và `Gateway MCP Tools` (bắt đầu bằng `mcp__`).
    - `executeIteration()`:
      1. Parse tên tool: tách `serverId` và `originalToolName`.
      2. Chuyển tiếp tới `processManager.executeToolCall()`.
      3. Format output thành `tool_result` message đúng chuẩn của provider hiện tại.
      4. Nạp `assistant` tool_calls message và `tool` result message vào mảng `messages`.
      5. Gửi request tiếp theo lên Upstream LLM.
    - `MAX_ITERATIONS` guard (mặc định 10): Tránh loop vô tận do LLM hallucinate.
  - Tích hợp tại `open-sse/handlers/chatCore.js` và `src/sse/handlers/chat.js`.
- **Technical Flow:**
  - LLM trả về Tool Call `mcp__fs__read_file` -> `toolLoop.js` chặn lại -> Chuyển `processManager` chạy -> Nhận kết quả -> Tạo message `tool` -> Gửi lại LLM -> LLM sinh câu trả lời text cuối cùng -> Stream về cho Client.

---

### Phase 5: REST API Endpoints (MCP-API)
- **Mục tiêu:** Cung cấp giao diện quản trị RESTful cho Web Dashboard và script bên ngoài.
- **Endpoints:**
  - `GET/POST/PUT/DELETE /api/mcp/servers`: Quản lý danh sách MCP Servers cấu hình (Stdio, SSE, HTTP).
  - `GET /api/mcp/tools`: Lấy danh sách toàn bộ cached tools từ tất cả các active servers.
  - `POST /api/mcp/test`: Thực thi test kết nối server hoặc chạy thử trực tiếp một tool với tham số giả lập.
  - `GET/POST/PUT/DELETE /api/skills`: Quản lý danh sách Custom Skills, toggle trạng thái và thứ tự ưu tiên prompt.
- **Technical Flow:**
  - Request API -> Validation middleware -> Gọi Repo thực hiện DB mutation -> Trigger `processManager.reloadServer(id)` để đồng bộ trạng thái runtime tức thì.

---

### Phase 6: Web Dashboard UI (MCP-UI)
- **Mục tiêu:** Giao diện quản trị trực quan tại `src/app/(dashboard)/dashboard/skills/page.js`.
- **Thành phần & Tính năng:**
  - Tab 1: **MCP Servers Management**:
    - Danh sách server kèm badge trạng thái (`Connected`, `Stopped`, `Error`).
    - Modal thêm/sửa Server: Form nhập Command, Args, Environment variables, SSE/HTTP URLs.
    - Quick Toggle switch: Bật/tắt server tức thì không cần restart app.
  - Tab 2: **Custom Skills**:
    - Trình soạn thảo Prompt, cấu hình priority và model targeting rules.
  - Modal **Test & Inspect Tools**:
    - Xem chi tiết danh sách Tool Schemas đã cache.
    - Interactive Tester: Form tự động sinh từ JSON Schema để nhập param và chạy thử nghiệm (Live Test Tool).

---

### Phase 7: Automated Testing & Verification (MCP-TEST)
- **Mục tiêu:** Đảm bảo độ tin cậy và kiểm chứng toàn diện toàn bộ pipeline.
- **Thành phần:**
  - `test/mcp/mcpRepo.test.js`: Kiểm thử tương tác SQLite CRUD, cache sync, cascade delete.
  - `test/mcp/clientAndProcess.test.js`: Kiểm thử JSON-RPC 2.0 client, spawn mock stdio server, xử lý timeout và error handling.
  - `test/mcp/injector.test.js`: Kiểm thử chuyển đổi định dạng Tool Schema cho OpenAI, Anthropic Claude, Google Gemini.
  - `test/mcp/toolLoop.test.js`: Simulation test cho ReAct loop đa vòng lặp, kiểm thử chặn `mcp__*`, mix giữa client tools và gateway tools, chạm ngưỡng max iterations.

---

## 3. Bảng Truy vết Yêu cầu (Requirements Traceability)

| Mã Requirement | Mô tả | Phase Thực hiện | Trạng thái |
|---|---|---|---|
| **MCP-DB-01..04** | Schema SQLite, Repositories mcpRepo & skillsRepo | Phase 1 | Hoàn thành |
| **MCP-PROC-01..03** | JSON-RPC Client, Process Lifecycle & Security | Phase 2 | Hoàn thành |
| **MCP-INJECT-01..04** | Tool Schema Converters (OpenAI, Claude, Gemini), Skills Prompt Injection | Phase 3 | Hoàn thành |
| **MCP-REACT-01..05** | Gateway ReAct Loop, Tool Interception, Iteration Limits | Phase 4 | Hoàn thành |
| **MCP-API-01..04** | REST APIs (`/api/mcp/*`, `/api/skills`) | Phase 5 | Hoàn thành |
| **MCP-UI-01..04** | Dashboard UI, Server Modals, Tool Inspect & Test Runner | Phase 6 | Hoàn thành |
| **MCP-TEST-01..04** | Unit & E2E Simulation Tests cho toàn bộ subsystem | Phase 7 | Hoàn thành |

---

## 4. Hướng dẫn Vận hành & Bắt đầu (Getting Started)

1. **Cấu hình MCP Server mới:**
   - Vào Dashboard: `/dashboard/skills` -> Chọn tab **MCP Servers** -> Nhấn **Add Server**.
   - Điền thông tin (ví dụ Stdio: `npx`, args: `["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]`).
2. **Kích hoạt Server:**
   - Gạt toggle **Enabled**. Hệ thống tự động spawn tiến trình, fetch `tools/list` và lưu cache.
3. **Sử dụng từ Client:**
   - Gửi bất kỳ request chat completions nào tới 9router (`/v1/chat/completions`, `/v1/messages`, `/v1/models/*:generateContent`).
   - Gateway tự động tiêm MCP tools vào request và xử lý ReAct loop khi model gọi tool.
