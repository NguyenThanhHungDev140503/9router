# Tài liệu Luồng Kỹ thuật: Hệ thống MCP & Custom Skills Gateway (7 Phases)

Tài liệu này giải thích chi tiết luồng kỹ thuật (Technical Flow) cho toàn bộ 7 Phase của Milestone v1.0.0 theo chuẩn thiết kế và vận hành của **9router**.

---

## 1. Bức tranh Tổng quan (End-to-End Architecture Flow)

```
[ Client Request ] (OpenAI / Claude / Gemini)
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ 1. INBOUND INTERCEPTION & INJECTION (Phase 3)            │
│    - Parse Model & Provider                              │
│    - Fetch Active Skills & MCP Tools from DB (Phase 1)   │
│    - Convert Schema (OpenAI / Claude / Gemini format)    │
│    - Prefix Tool Name: mcp__<serverId>__<toolName>       │
│    - Inject System Prompts & Tool Declarations           │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼ Forward Request
┌──────────────────────────────────────────────────────────┐
│ 2. UPSTREAM LLM PROVIDER                                 │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼ LLM Stream / Response
┌──────────────────────────────────────────────────────────┐
│ 3. AUTONOMOUS SERVER-SIDE REACT LOOP (Phase 4)           │
│    - Detect tool_calls in chunk / response               │
│    - Check prefix:                                       │
│      ├── Client Tool (no prefix) ──► Yield to Client     │
│      └── Gateway Tool (mcp__*)   ──► Handle Server-Side  │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼ Extract (serverId, toolName, args)
┌──────────────────────────────────────────────────────────┐
│ 4. PROCESS & CLIENT MANAGER EXECUTION (Phase 2)          │
│    - Route to Client (Stdio / SSE / HTTP)                │
│    - Format JSON-RPC 2.0: tools/call                     │
│    - Execute with Timeout & Sanitize Guard               │
│    - Return Tool Result                                  │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼ Append Result to Context
┌──────────────────────────────────────────────────────────┐
│ 5. RE-INVOKE UPSTREAM LLM (Loop iteration <= 10)         │
│    - Send updated conversation history                   │
│    - Continue until no more gateway tool calls           │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
[ Stream Final Answer back to Client ]
```

---

## 2. Chi tiết Kỹ thuật Từng Phase (7 Phases Technical Flow)

---

### Phase 1: Database & Repository Layer (MCP-DB)

#### 1. Mục đích & Phạm vi
Thiết lập schema cơ sở dữ liệu SQLite và Repository Pattern để lưu trữ cấu hình MCP server, cached schema của tools, custom skills (system prompt) và các rules kích hoạt gateway.

#### 2. Sơ đồ Cấu trúc Dữ liệu & Luồng Repo
```
 SQLite Database
 ├── mcpServers ────────(1:1)───► mcpToolsCache
 ├── skills
 └── gatewayToolRules
       ▲
       │ CRUD & Query
 ┌─────┴──────────────────┐
 │  mcpRepo / skillsRepo  │
 └────────────────────────┘
```

#### 3. Chi tiết Luồng Kỹ thuật (Technical Flow)
1. **Khởi tạo Schema (`src/lib/db/schema.js`):**
   - Bảng `mcpServers`: Lưu `id`, `name`, `transport` (`stdio` | `sse` | `http`), `command`, `args` (JSON array), `env` (JSON object), `url`, `enabled` (boolean flag).
   - Bảng `mcpToolsCache`: Lưu snapshot tools `toolsJson` theo từng `serverId`.
   - Bảng `skills`: Lưu các prompt tùy biến theo `id`, `name`, `systemPrompt`, `enabled`, `priority`.
2. **Thao tác Dữ liệu (`src/lib/db/repos/mcpRepo.js` & `skillsRepo.js`):**
   - `getEnabledServers()`: Lấy danh sách server có `enabled = 1`.
   - `getToolsCache(serverId)`: Đọc schema công cụ nhanh từ SQLite mà không cần ping tiến trình MCP.
   - `updateToolsCache(serverId, tools)`: Đồng bộ schema mới nhất khi phát hiện thay đổi từ server.

---

### Phase 2: Process & Client Manager (MCP-PROC)

#### 1. Mục đích & Phạm vi
Quản lý vòng đời (lifecycle) của các tiến trình MCP con qua Stdio hoặc kết nối mạng qua SSE/HTTP, giao tiếp qua chuẩn JSON-RPC 2.0.

#### 2. Sơ đồ Luồng Tiến trình
```
┌──────────────────────────────────────────────────────────────┐
│                     processManager.js                        │
│                                                              │
│  ┌───────────────────────┐        ┌───────────────────────┐  │
│  │     Stdio Client      │        │    SSE/HTTP Client    │  │
│  │ (child_process.spawn) │        │ (fetch / EventSource) │  │
│  └───────────┬───────────┘        └───────────┬───────────┘  │
└──────────────┼────────────────────────────────┼──────────────┘
               │ JSON-RPC 2.0 (stdin/stdout)    │ JSON-RPC 2.0 (HTTP/SSE)
               ▼                                ▼
       [ External MCP Server ]          [ Remote MCP Server ]
```

#### 3. Chi tiết Luồng Kỹ thuật (Technical Flow)
1. **Khởi tạo Tiến trình (`processManager.startServer`):**
   - Với `stdio`: Kiểm tra `command` và `args` thông qua bộ lọc bảo mật (chặn ký tự injection nguy hiểm như `;`, `&&`, `|`). Gọi `child_process.spawn`.
   - Đăng ký listeners: `stdout` (nhận message JSON-RPC), `stderr` (ghi log cảnh báo), `error`/`exit` (tự động khôi phục / restart nếu crash bất thường).
2. **Giao thức Bắt tay (Handshake JSON-RPC 2.0 qua `client.js`):**
   - Bước 1: Gửi request `initialize` -> Nhận protocol version và server capabilities.
   - Bước 2: Gửi notification `notifications/initialized`.
   - Bước 3: Gửi request `tools/list` -> Nhận danh sách tools và ghi vào `mcpToolsCache`.
3. **Thực thi Tool (`processManager.executeToolCall`):**
   - Gửi payload JSON-RPC:
     ```json
     {
       "jsonrpc": "2.0",
       "id": "req-123",
       "method": "tools/call",
       "params": {
         "name": "readFile",
         "arguments": { "path": "/var/log/app.log" }
       }
     }
     ```
   - Watchdog timer: Giới hạn timeout (mặc định 30s). Nếu quá thời gian, abort request và trả mã lỗi chuẩn.

---

### Phase 3: Format-Aware Inbound Injection (MCP-INJECT)

#### 1. Mục đích & Phạm vi
Tiêm định nghĩa các công cụ MCP và custom skills vào request body trước khi gửi lên Upstream LLM, tương thích đa nền tảng (OpenAI, Anthropic Claude, Google Gemini).

#### 2. Sơ đồ Chuyển đổi Định dạng (Schema Transformation Flow)
```
  [ Raw MCP Tool Schema ]
            │
            ▼
┌───────────────────────┐
│     injector.js       │
├───────────────────────┴─────────────────────────────┐
│  Thêm Prefix: mcp__<serverId>__<toolName>           │
└───────────┬───────────────────┬───────────────────┬─┘
            │                   │                   │
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │ OpenAI Format │   │ Claude Format │   │ Gemini Format │
    │ tools: [{     │   │ tools: [{     │   │ [{            │
    │  type: "func",│   │  name,        │   │   function-   │
    │  function: {} │   │  input_schema │   │  Declarations │
    │ }]            │   │ }]            │   │ }]            │
    └───────────────┘   └───────────────┘   └───────────────┘
```

#### 3. Chi tiết Luồng Kỹ thuật (Technical Flow)
1. **Truy xuất Dữ liệu Cấu hình:**
   - Lấy danh sách server active từ `mcpRepo` và đọc cached tools.
   - Lấy danh sách skills active từ `skillsRepo`.
2. **Tiêm Custom Skills (System Prompt):**
   - OpenAI: Ghép nội dung skill vào role `system` đầu tiên hoặc tạo `developer` message.
   - Claude: Gán vào thuộc tính `system`.
   - Gemini: Gán vào `systemInstruction.parts[].text`.
3. **Chuyển đổi & Tiêm MCP Tools:**
   - Đặt tên chuẩn hóa: `mcp__<serverId>__<originalToolName>` để phục vụ việc định tuyến ngược ở Phase 4.
   - Đóng gói đúng format của từng provider như sơ đồ trên.

---

### Phase 4: Autonomous Server-Side ReAct Loop (MCP-REACT)

#### 1. Mục đích & Phạm vi
Trọng tâm xử lý của Gateway. Tự động đánh chặn các tool calls thuộc Gateway (`mcp__*`), thực thi ngầm và cấp ngược kết quả cho LLM trong một vòng lặp ReAct độc lập mà không làm đứt đoạn stream của client.

#### 2. Sơ đồ Vòng lặp ReAct
```
               ┌──────────────────────────────┐
               │    Upstream LLM Response     │
               └──────────────┬───────────────┘
                              │
                    Có Tool Calls không?
                     /               \
                  (Có)               (Không)
                  /                     \
      ┌───────────────────────┐          ▼
      │ Phân loại Tool Call   │   Stream text về Client
      └───────────┬───────────┘   (Kết thúc turn)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [ Client Tools ]    [ Gateway Tools ]
 (Không có mcp__)    (Bắt đầu bằng mcp__)
        │                   │
        ▼                   ▼
  Trả ngay về cho   1. Tách serverId & toolName
  Client xử lý      2. Gọi processManager.executeToolCall()
                    3. Tạo message tool_result
                    4. Append vào conversation history
                    5. Tăng iteration counter (counter <= 10)
                    6. Gọi lại Upstream LLM (Vòng lặp tiếp theo)
```

#### 3. Chi tiết Luồng Kỹ thuật (Technical Flow)
1. **Đánh chặn Tool Calls:**
   - `open-sse/mcp/toolLoop.js` kiểm tra mảng `tool_calls` trả về từ upstream.
   - Lọc các tool có prefix `mcp__`.
2. **Thực thi và Định tuyến Server-side:**
   - Parse định danh: `mcp__filesystem__read_file` -> `serverId = filesystem`, `toolName = read_file`.
   - Chuyển tiếp tới `processManager.executeToolCall("filesystem", "read_file", args)`.
3. **Cập nhật Ngữ cảnh và Tái triệu gọi (Re-invocation):**
   - Đóng gói kết quả theo chuẩn format của provider:
     - OpenAI: Role `assistant` (chứa `tool_calls`) kèm role `tool` (chứa `tool_call_id` và content kết quả).
     - Claude: Role `assistant` (chứa `tool_use`) kèm role `user` (chứa `tool_result`).
   - Gửi payload cập nhật lên LLM để sinh tiếp câu trả lời hoặc kích hoạt tool tiếp theo.
4. **Cơ chế Ngăn ngừa Vòng lặp Vô hạn:**
   - Giới hạn `MAX_ITERATIONS = 10`. Nếu chạm ngưỡng, ngắt vòng lặp và trả cảnh báo về client.

---

### Phase 5: REST API Endpoints (MCP-API)

#### 1. Mục đích & Phạm vi
Cung cấp bộ API RESTful phục vụ việc quản lý, giám sát và kiểm thử hệ thống MCP/Skills từ Web Dashboard hoặc external scripts.

#### 2. Danh mục Endpoints & Luồng Dữ liệu
```
[ Frontend / API Client ]
         │
         ├── GET/POST/PUT/DELETE /api/mcp/servers  ──► mcpRepo & processManager
         ├── GET                 /api/mcp/tools    ──► mcpToolsCache
         ├── POST                /api/mcp/test     ──► processManager.executeToolCall
         └── GET/POST/PUT/DELETE /api/skills       ──► skillsRepo
```

#### 3. Chi tiết Luồng Kỹ thuật (Technical Flow)
1. **/api/mcp/servers:**
   - `POST`: Nhận payload cấu hình -> Validate dữ liệu -> Lưu DB -> Gọi `processManager.startServer()` để kiểm tra kết nối ngay lập tức -> Ghi cache tools nếu thành công.
   - `DELETE`: Dừng process đang chạy thông qua `processManager.stopServer()` -> Xóa bản ghi trong DB và cache liên quan.
2. **/api/mcp/test:**
   - Cho phép gửi payload test trực tiếp một tool bất kỳ trên server đã cấu hình mà không cần đi qua LLM.
3. **/api/skills:**
   - Quản lý các prompt skill, sắp xếp priority, bật/tắt kích hoạt.

---

### Phase 6: Web Dashboard UI (MCP-UI)

#### 1. Mục đích & Phạm vi
Cung cấp giao diện đồ họa tại `src/app/(dashboard)/dashboard/skills/page.js` để người dùng quản trị trực quan toàn bộ hệ sinh thái MCP và Skills.

#### 2. Sơ đồ Tương tác UI
```
┌─────────────────────────────────────────────────────────────┐
│                 Dashboard / Skills Page                     │
│                                                             │
│  [ Tab: MCP Servers ]            [ Tab: Custom Skills ]     │
│  ├── Server List & Status Badges ├── Prompt Editor          │
│  ├── Add/Edit Modal (Stdio/SSE)  ├── Priority Order Form    │
│  ├── Quick Enable/Disable Toggle └── Model Matching Rules   │
│  └── Inspect & Test Tool Modal                              │
└─────────────────────────────────────────────────────────────┘
```

#### 3. Chi tiết Luồng Kỹ thuật (Technical Flow)
1. **Quản trị Server (MCP Servers Tab):**
   - Hiển thị danh sách server kèm badge trạng thái thời gian thực (`Connected`, `Stopped`, `Error`).
   - Form thêm mới: Hỗ trợ cấu hình Stdio (command, args, env) hoặc SSE/HTTP (URL).
   - Quick Toggle Switch: Gọi API update `enabled` và đồng bộ runtime tiến trình tức thì.
2. **Inspect & Live Tool Tester:**
   - Modal hiển thị schema chi tiết của từng tool.
   - Tự động dựng input form theo JSON Schema để người dùng nhập tham số và nhấn "Run Test", xem output JSON trực tiếp.

---

### Phase 7: Automated Testing & Verification (MCP-TEST)

#### 1. Mục đích & Phạm vi
Đảm bảo chất lượng toàn diện thông qua Unit Tests, Integration Tests và E2E Simulation Tests cho toàn bộ chuỗi pipeline MCP Gateway.

#### 2. Ma trận Kiểm thử
```
┌─────────────────────────────────────────────────────────────┐
│                     Test Pipeline Suite                     │
├──────────────────────────┬──────────────────────────────────┤
│ mcpRepo.test.js          │ SQLite CRUD, sync cache, isolate │
├──────────────────────────┼──────────────────────────────────┤
│ clientAndProcess.test.js │ JSON-RPC 2.0, mock stdio spawn   │
├──────────────────────────┼──────────────────────────────────┤
│ injector.test.js         │ OpenAI / Claude / Gemini formats │
├──────────────────────────┼──────────────────────────────────┤
│ toolLoop.test.js         │ ReAct loop simulation (E2E)      │
└──────────────────────────┴──────────────────────────────────┘
```

#### 3. Chi tiết Luồng Kỹ thuật (Technical Flow)
1. **Kiểm thử Tầng Lưu trữ (`mcpRepo.test.js`):** Kiểm tra tính toàn vẹn dữ liệu, cascade deletion giữa `mcpServers` và `mcpToolsCache`.
2. **Kiểm thử Giao thức & Tiến trình (`clientAndProcess.test.js`):** Tạo mock stdio process phát sinh message JSON-RPC để kiểm tra bắt tay, timeout handling, và crash recovery.
3. **Kiểm thử Tiêm Schema (`injector.test.js`):** Đảm bảo chuyển đổi chính xác từ MCP Tool sang định dạng `function` của OpenAI, `input_schema` của Claude, và `functionDeclarations` của Gemini.
4. **Kiểm thử Vòng lặp ReAct (`toolLoop.test.js`):** Giả lập phản hồi LLM đa lượt (multi-turn), kiểm tra bắt đúng `mcp__*` tools, gọi mock executor, nạp lại context và trả về stream hoàn chỉnh.

---

## 3. Tổng kết Vận hành (Operational Summary)

1. **Khi có request gửi vào Gateway:** `injector.js` (Phase 3) nạp cấu hình từ `mcpRepo`/`skillsRepo` (Phase 1), biến đổi request và chuyển tiếp lên Upstream.
2. **Khi Upstream trả về Tool Calls:** `toolLoop.js` (Phase 4) chặn các tool `mcp__*`, yêu cầu `processManager.js` (Phase 2) thực thi qua JSON-RPC 2.0.
3. **Vòng lặp ReAct:** Lặp lại cho đến khi có câu trả lời cuối cùng hoặc đạt giới hạn.
4. **Toàn bộ cấu hình và thử nghiệm:** Được điều khiển qua REST API (Phase 5) và Dashboard UI (Phase 6), được bảo chứng bởi bộ Test Suite (Phase 7).
