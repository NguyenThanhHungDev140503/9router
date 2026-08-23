# Phase 6: Web Dashboard UI - Context & User Decisions

## User Choices Locked:
1. **Layout**: 2 Tabs (`MCP Servers` & `Custom Skills`). Gateway Rules managed inside Custom Skills.
2. **Tool Inspector**: Centered Modal popup with tool selector, JSON parameter editor, live execute action, formatted JSON response viewer.
3. **Env & Args Editor**: Dynamic Key-Value form for environment variables + argument rows with toggle for Raw JSON.
4. **Server Diagnostics**: Color status badge (`Connected`, `Stopped`, `Error`) with tooltip for error details.

## Implementation Structure:
- `src/app/(dashboard)/dashboard/skills/page.js`: Server component.
- `src/app/(dashboard)/dashboard/skills/SkillsPageClient.js`: State manager & tab router.
- `src/app/(dashboard)/dashboard/skills/components/`:
  - `McpServersTab.js`: Servers list, health badges, actions.
  - `McpServerModal.js`: Create/Edit modal with Stdio/SSE/HTTP transport forms + Dynamic KV/Args editor.
  - `McpToolInspectorModal.js`: Centered modal for inspecting tools and running live tests against `/api/mcp/test`.
  - `CustomSkillsTab.js`: Custom skills list, enable toggles, tag chips, and Gateway Rules subsection.
  - `SkillModal.js`: Custom skill prompt editor.
  - `GatewayRulesModal.js`: Rules configuration modal (`allow`, `deny`, `inject_skill`).
  - `StatusBadge.js`: Live status badge with error tooltip.

## Integration Targets:
- `/api/mcp/servers` (GET, POST, PUT, DELETE)
- `/api/mcp/tools` (GET)
- `/api/mcp/test` (POST)
- `/api/skills` (GET, POST, PUT, DELETE)
- `/api/skills/rules` (GET, POST, DELETE)
