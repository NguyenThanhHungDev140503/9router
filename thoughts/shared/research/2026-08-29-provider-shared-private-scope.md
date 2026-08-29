---
date: 2026-08-29T20:03:23+07:00
researcher: Codex
git_commit: 8752e70f
branch: master
repository: 9router
topic: "Provider xử lý shared/private thế nào, và MCP/Skill cần áp dụng pattern nào?"
tags: [research, codebase, providers, mcp, skills, authorization, multi-user]
status: complete
last_updated: 2026-08-29
last_updated_by: Codex
---

# Research: Provider shared/private scope và MCP/Skill

**Date**: 2026-08-29T20:03:23+07:00  
**Researcher**: Codex  
**Git Commit**: 8752e70f  
**Branch**: master  
**Repository**: 9router

## Research Question

Provider xử lý shared/private thế nào? MCP/Skill cần áp dụng pattern nào khi có cấu hình dùng chung và riêng từng user?

## Summary

`providerConnections` có hai scope thực tế: private theo `userId`, và shared qua `isShared=1`. Private connection được chọn trước; shared chỉ fallback khi user không có private active connection. Chỉ admin được bật/tắt `isShared`; user khác đọc shared connection nhưng không sửa/xóa.

MCP/Skill chưa áp dụng pattern này. Chúng có `userId` nhưng không có `isShared`; request pipeline, index, management API, và execution đều thiếu owner scope. Vì vậy MCP/Skill hiện global trong thực tế, không private.

Khuyến nghị: áp dụng đúng provider pattern cho MCP/Skill bằng `isShared`, owner `userId`, private-default, admin-only sharing, và authorization allowlist ở injection lẫn execution. Không dùng `userId = NULL` làm shared scope.

## Detailed Findings

### Provider connections

- Schema có `userId` và `isShared`: [schema](https://github.com/decolua/9router/blob/8752e70f/src/lib/db/schema.js#L49-L70).
- Non-admin đọc được connection của mình hoặc connection `isShared=1`: [repo](https://github.com/decolua/9router/blob/8752e70f/src/lib/db/repos/connectionsRepo.js#L80-L107), [route](https://github.com/decolua/9router/blob/8752e70f/src/app/api/providers/route.js#L53-L57).
- Non-admin chỉ update/delete row thuộc `userId` của họ; shared row không cho non-owner sửa: [route](https://github.com/decolua/9router/blob/8752e70f/src/app/api/providers/%5Bid%5D/route.js#L108-L132), [repo](https://github.com/decolua/9router/blob/8752e70f/src/lib/db/repos/connectionsRepo.js#L217-L254).
- Chỉ admin thay đổi `isShared`: [create/update route](https://github.com/decolua/9router/blob/8752e70f/src/app/api/providers/route.js#L180-L194).
- Runtime lấy private active connection trước; chỉ fallback shared khi không có private: [auth](https://github.com/decolua/9router/blob/8752e70f/src/sse/services/auth.js#L71-L82), [chat](https://github.com/decolua/9router/blob/8752e70f/src/sse/handlers/chat.js#L54-L64).

### MCP servers và Skills hiện tại

- MCP/Skill chỉ có `userId`, không có `isShared`: [MCP schema](https://github.com/decolua/9router/blob/8752e70f/src/lib/db/schema.js#L192-L220), [Skill schema](https://github.com/decolua/9router/blob/8752e70f/src/lib/db/schema.js#L224-L240).
- Inbound pipeline load toàn bộ enabled MCP, cache, Skill, không truyền `userId`: [pipeline](https://github.com/decolua/9router/blob/8752e70f/open-sse/mcp/inboundInjectionPipeline.js#L32-L78).
- `globalToolIndex` process-wide index toàn bộ config: [index](https://github.com/decolua/9router/blob/8752e70f/open-sse/mcp/search/toolIndex.js#L21-L123), [sync](https://github.com/decolua/9router/blob/8752e70f/src/lib/mcp/searchIndexSync.js#L9-L21).
- MCP execution reload server theo `serverId` không scope owner: [process manager](https://github.com/decolua/9router/blob/8752e70f/src/lib/mcp/processManager.js#L175-L205).
- MCP/Skill collection routes không lấy user context; create không gán `userId`: [MCP route](https://github.com/decolua/9router/blob/8752e70f/src/app/api/mcp/servers/route.js#L37-L120), [Skill route](https://github.com/decolua/9router/blob/8752e70f/src/app/api/skills/route.js#L7-L49).
- Item routes truyền owner filter nhưng repo methods bỏ qua filter: [MCP route](https://github.com/decolua/9router/blob/8752e70f/src/app/api/mcp/servers/%5Bid%5D/route.js#L17-L19), [MCP repo](https://github.com/decolua/9router/blob/8752e70f/src/lib/db/repos/mcpRepo.js#L75-L171); [Skill route](https://github.com/decolua/9router/blob/8752e70f/src/app/api/skills/%5Bid%5D/route.js#L14-L84), [Skill repo](https://github.com/decolua/9router/blob/8752e70f/src/lib/db/repos/skillsRepo.js#L78-L167).
- Table-level `UNIQUE(name)` chặn hai user tạo MCP/Skill cùng tên, dù có index `(userId, name)`: [schema](https://github.com/decolua/9router/blob/8752e70f/src/lib/db/schema.js#L195-L207), [schema](https://github.com/decolua/9router/blob/8752e70f/src/lib/db/schema.js#L227-L237).

### Required MCP/Skill policy

1. Add `isShared INTEGER NOT NULL DEFAULT 0` to `mcpServers` and `skills`.
2. Every row has owner `userId`; `userId = NULL` remains legacy only, not shared meaning.
3. Non-admin sees own rows plus `isShared=1`; owner/admin may modify; other users may not modify shared rows.
4. Only admin creates or changes `isShared`.
5. Private matching wins over shared matching for same logical MCP/Skill name. Shared remains available when no private same-name override exists.
6. Request `userId` threads from API key/JWT through MCP/Skill selection and tool execution.
7. Selection returns allowed server IDs. Tool executor rejects any `mcp__<serverId>__<toolName>` outside that allowlist, even if upstream model emits it.
8. Replace process-wide MCP tool index with per-user view or query-time scoped index. Do not index private data globally.
9. Drop table-global name constraints; enforce unique `(userId, name)`. Define separate shared-name collision policy.
10. Management routes and `/api/mcp/test` must require authenticated identity and scoped server authorization. Ephemeral test configs need admin-only policy or strict SSRF/command restrictions.

## Code References

- `src/lib/db/schema.js:49-70` - Provider `userId` + `isShared`.
- `src/lib/db/repos/connectionsRepo.js:80-107,217-254` - Provider visibility and mutation scope.
- `src/sse/services/auth.js:71-82` - Private-first, shared fallback.
- `open-sse/mcp/inboundInjectionPipeline.js:32-78` - Unscoped MCP/Skill injection.
- `open-sse/mcp/search/toolIndex.js:21-123` - Global in-memory index.
- `src/lib/mcp/processManager.js:175-205` - Unscoped MCP execution startup.
- `src/app/api/mcp/servers/route.js:37-120` - Unscoped MCP management collection.
- `src/app/api/skills/route.js:7-49` - Unscoped Skill management collection.

## Architecture Insights

Provider sharing is global application sharing, not tenant/workspace sharing. No app-level `tenantId` or `workspaceId` is an authorization boundary. Existing private isolation uses `userId`.

MCP/Skill must mirror provider ownership semantics but cannot copy provider credential fallback blindly: multiple MCPs/Skills can be relevant in one request. Resolve private override per logical name, then include matching shared rows without a private same-name row.

## Historical Context

No `thoughts/` directory exists in this checkout. Historical subagent lookup failed with upstream HTTP 502; live code is source of truth.

## Related Research

- `docs/superpowers/specs/2026-08-29-9router-mcp-skill-execution-design.md`

## Open Questions

- Shared MCP/Skill should be global to all users, matching provider `isShared`, or need future group ACL?
- Can a shared and private MCP/Skill use same name? Recommended: yes, private override wins.
- Does shared MCP runtime session share credentials/process across users, or need per-user session isolation for audit/rate limits?
