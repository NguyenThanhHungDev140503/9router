# 9Router Server-Side MCP & Skills Gateway

## What This Is
Hệ sinh thái Server-Side MCP (Model Context Protocol) & Skills Gateway tích hợp trực tiếp trên 9Router. Cho phép mọi AI Coding Assistant / Harness (Codex CLI, Claude Code, Cursor, OpenCode, Roo Code, v.v.) tự động sử dụng toàn bộ MCP Tools và Skills cấu hình tập trung trên 9Router mà không cần cài đặt hoặc sao chép cấu hình ở từng máy/client.

## Core Value
Biến 9Router thành AI Agent Gateway trung tâm:
1. Tập trung hóa quản lý MCP Servers (Stdio, SSE, Stream/HTTP) và Skills trong SQLite.
2. Tự động tiêm (Inject) System Prompts và Tool Definitions (`tools[]`) vào request theo format tương thích (OpenAI, Claude, Gemini, Responses API).
3. Vòng lặp Autonomous Server-Side ReAct Loop: Tự động chặn tool calls mang tiền tố `mcp__*`, gọi JSON-RPC tới MCP server tương ứng, nạp kết quả và tiếp tục vòng lặp với LLM cho đến khi hoàn tất rồi stream về client.

## Context
- Đã có nền tảng 9Router: SQLite DB layer (`src/lib/db/`), System Injection (`open-sse/rtk/systemInject.js`), Format Translators (`open-sse/translator/`), và Chat Core (`open-sse/handlers/chatCore.js`).
- Đã có sơ thảo kiến trúc kỹ thuật trong `docs/SERVER_SIDE_MCP_SKILLS_EXPLAINER.md`.

## Requirements

### Validated
- ✓ 40+ LLM Upstream Providers & Translation Gateway — existing (`open-sse/`)
- ✓ Multi-driver SQLite persistence (`src/lib/db/`) — existing
- ✓ Basic Stdio SSE Bridge for Devtools (`src/lib/mcp/stdioSseBridge.js`) — existing
- ✓ Format-aware System Prompt Injection (`open-sse/rtk/systemInject.js`) — existing

### Active
- [ ] **MCP-DB**: SQLite schema & repositories cho `mcpServers`, `mcpToolsCache`, `skills`, `gatewayToolRules`
- [ ] **MCP-PROC**: Tiến trình quản lý `McpProcessManager` hỗ trợ khởi động, giám sát tiến trình Stdio/SSE/HTTP, và thực thi JSON-RPC 2.0 tool calls
- [ ] **MCP-INJECT**: Format-Aware Inbound Tool Schema Injection (`open-sse/mcp/injector.js`) và Skill Prompt Injection hỗ trợ các định dạng (OpenAI, Claude, Gemini, Codex Responses)
- [ ] **MCP-REACT**: Autonomous Server-Side ReAct Loop (`open-sse/mcp/toolLoop.js`) chặn `mcp__*` tool calls, nạp context, lặp lại turn với LLM tối đa N vòng, và chuyển tiếp client-native tools
- [ ] **MCP-API**: REST API endpoints trên 9Router (`/api/mcp/servers`, `/api/mcp/tools`, `/api/skills`, `/api/mcp/test`)
- [ ] **MCP-UI**: Web Dashboard UI hoàn chỉnh tại `src/app/(dashboard)/dashboard/skills/` cho phép thêm, sửa, xóa, cấu hình env, test công cụ, và bật/tắt MCP & Skills
- [ ] **MCP-TEST**: Bộ kiểm thử tự động (Unit tests, Mock JSON-RPC, ReAct Loop simulation, Format translation tests)

### Out of Scope
- Chạy trực tiếp MCP Server trên máy client của người dùng (tất cả chạy server-side trên máy host 9Router).
- Hỗ trợ giao thức MCP chưa chuẩn hóa (tập trung vào MCP spec JSON-RPC 2.0 chuẩn).

## Key Decisions
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prefix `mcp__<server>__<tool>` | Giúp phân biệt rạch ròi giữa Gateway MCP tools và Client Native tools (như read_file, edit_file) | Adopted |
| Format-aware Schema Conversion | Đảm bảo tương thích hoàn hảo giữa Claude `input_schema`, OpenAI `parameters`, và Gemini schemas | Adopted |
| Max ReAct Loop Capped (Default 10) | Tránh vòng lặp vô tận khi LLM lặp lại tool calls lỗi | Adopted |
| Fail-Open on Injection Error | Đảm bảo các request thông thường không bị đứt đoạn nếu một MCP server gặp sự cố | Adopted |

## Evolution
This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-08-19 after initialization*
