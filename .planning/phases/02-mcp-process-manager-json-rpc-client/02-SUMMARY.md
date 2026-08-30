---
phase: 02-mcp-process-manager-json-rpc-client
status: completed
completed_at: "2026-08-21T09:12:00.000Z"
requirements_covered:
  - MCP-PROC-01
  - MCP-PROC-02
  - MCP-PROC-03
---

# Phase 2 Summary: MCP Process Manager & JSON-RPC Client

Đã hoàn thành toàn bộ Phase 2 gồm:
1. **JSON-RPC 2.0 Client & Protocol Lifecycle** (`src/lib/mcp/client.js`, `src/lib/mcp/errors.js`):
   - Chuẩn hoá ID dạng UUID (`randomUUID`).
   - Giao thức bắt tay `initialize` & gửi notification `notifications/initialized`.
   - Các API `listTools` và `callTool` theo protocol MCP 2024-11-05.
   - Quản lý timeout, connection close, custom MCP error types.

2. **Security & Guardrails** (`src/lib/mcp/security.js`):
   - Chống SSRF cho SSE/HTTP transport (chặn loopback, private IPv4/IPv6, link-local metadata).
   - Kiểm duyệt và lọc command stdio an toàn theo whitelist (`npx`, `node`, `python`, `docker`, ...).
   - Xoá / Redact secret token, api key trong error logging.
   - Giới hạn output length và buffer size.

3. **Stdio Transport** (`src/lib/mcp/stdioTransport.js`):
   - Spawn tiến trình stdio con, đọc/ghi newline-delimited JSON-RPC qua `readline`.
   - Bắt luồng stderr và error / exit handling.

4. **SSE / HTTP Transport** (`src/lib/mcp/sseTransport.js`):
   - Đọc luồng SSE event stream dạng `event: endpoint`, `event: message`, gửi JSON-RPC qua POST endpoint.

5. **Process Manager** (`src/lib/mcp/processManager.js`):
   - Quản lý vòng đời tiến trình / kết nối MCP server đa dạng (stdio, sse, http).
   - Auto-restart với exponential backoff khi tiến trình crash.
   - Tự động list và đồng bộ tools vào database (`mcpToolsCache`).
   - Kiểm tra trạng thái máy chủ, khởi động / dừng phiên an toàn.

6. **Unit Tests**:
   - 6 test suites / 35 tests hoàn thành thành công 100% trong `tests/unit/mcp-*.test.js`.
