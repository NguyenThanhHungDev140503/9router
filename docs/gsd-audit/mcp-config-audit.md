# MCP Configuration Audit

Date: 2026-08-22

## Hermes profiles

Configured with `hermes mcp add` (no secrets stored):

- `research-bot`: `context7`, `cognee`, `lightrag`
- `gsd-orchestrator`: `context7`, `cognee`, `lightrag`

Both profiles use HTTP/Streamable HTTP endpoints, `Auth: none` at test time, and all discovered tools enabled.

## Verification

- Context7: connected; 2 tools discovered (`resolve-library-id`, `query-docs`).
- Cognee: connected; 11 tools discovered.
- LightRAG: connected; 11 tools discovered.
- `hermes mcp test` passed for all six profile/server pairs.

## Client configuration observed

- Claude Code: `/home/nguyen-thanh-hung/.claude.json`; global `mcpServers` contains `cognee` and `lightrag` HTTP entries; Context7 plugin metadata exists.
- Codex: `/home/nguyen-thanh-hung/.codex/config.toml`; `mcp_servers` contains `cognee`, `lightrag`, plus other servers.
- OpenCode: `/home/nguyen-thanh-hung/.config/opencode/opencode.json`; `mcp` contains remote `cognee` and `lightrag` entries.

## Official configuration patterns

- Hermes: `mcp_servers.<name>.url` or `.command`/`.args`; configure with `hermes mcp add`; verify with `hermes mcp test`; restart/new session required for tool discovery.
- Context7 official docs: HTTP endpoint `https://mcp.context7.com/mcp`; OAuth endpoint `/mcp/oauth`; anonymous HTTP connected successfully here, API key optional for higher limits.
- Cognee official docs: local HTTP endpoint usually `http://localhost:8000/mcp`, or local stdio from source; this environment already has a reachable hosted endpoint.
- LightRAG official repository documents the LightRAG API, while the hosted MCP bridge exposes the MCP endpoint used here. The public third-party MCP bridge docs show stdio and Streamable HTTP modes.

## Safety and blockers

- No API keys, bearer tokens, passwords, or private key contents were read or written.
- No production deployment/restart/config/data action performed.
- MCP servers expose mutating tools (Cognee `remember`/`forget`, LightRAG ingest/delete/create operations). They are enabled because user explicitly requested full MCP capability. Use approval/read-only discipline before mutating calls.
- Remote endpoints are trusted only as configured; endpoint ownership/credential policy was not independently proven.
- Existing client configs were inspected only for names/URLs and not modified.
