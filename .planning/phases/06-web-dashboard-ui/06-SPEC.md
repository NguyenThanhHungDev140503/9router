# Phase 6: Web Dashboard UI Specification

## Overview
Phase 6 delivers the Web Management Dashboard for 9Router's Server-Side MCP & Skills Gateway at `/dashboard/skills`.

---

## 1. User Decisions & Choices
- **Layout**: 2-Tab structure (`MCP Servers` | `Custom Skills`). Gateway Rules managed inside Custom Skills.
- **Inspector**: Centered Modal popup with tool selector, argument JSON editor, and execution results.
- **Form Inputs**: Dynamic Key-Value editor for environment variables and list inputs for command args, with Raw JSON switch.
- **Diagnostics**: Status badges (`Connected`, `Stopped`, `Error`) with tooltip error diagnostics.

---

## 2. Requirements & Verification

### MCP-UI-01: Tabbed Dashboard
- Two tabs: `MCP Servers` and `Custom Skills`.
- Preserves filter/tab state across actions.
- Displays responsive card lists with empty states and loading skeletons.

### MCP-UI-02: MCP Server Configuration Modal
- Supports `stdio`, `sse`, and `http` transports.
- Dynamic key-value row editor for `env` variables with Raw JSON toggle.
- Dynamic list for `args` with Raw JSON toggle.
- URL input with format validation for `sse` and `http`.
- Create and edit modes with pre-filled fields.

### MCP-UI-03: Tool Inspection & Live Execution Modal
- Centered popup displaying server tools from `/api/mcp/tools?serverId=...`.
- Shows tool schemas (description, parameters required/properties).
- JSON argument editor with preset template based on tool schema.
- Live "Execute Tool" button hitting `/api/mcp/test`.
- Renders formatted JSON response / error trace.

### MCP-UI-04: Instant Toggles & Status Indicators
- Optimistic toggle switch for server and skill enabled states.
- Color badges: Green (`Connected`), Gray (`Stopped`), Red (`Error`), Yellow (`Testing/Syncing`).
- Error badges provide tooltip with crash/init error details.
