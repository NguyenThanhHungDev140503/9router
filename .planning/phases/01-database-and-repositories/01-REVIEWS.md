---
phase: 1
reviewers: []
reviewed_at: 2026-08-20T00:00:00+07:00
plans_reviewed:
  - 01-01-PLAN.md
external_review_status: unavailable
---

# Review — Phase 1: Database & Repositories

> Scope correction: Phase 2 is not implemented. Any stdio/SSE bridge finding below concerns pre-existing devtools code and is recorded only as a Phase 2 planning constraint.

## External reviewer status

No external review completed. Available CLIs failed before producing review output:

- Gemini: missing configured authentication.
- Claude: configured model `gemini-3.1-pro-high[1m]` unsupported by Claude CLI.
- OpenCode: configured `deepseek-v4-pro` requires China-hosted opt-in.
- Qwen: missing configured authentication.
- Cursor: installed wrapper has no `agent` subcommand.

No external-review consensus exists. Findings below come from direct phase-plan and affected-source inspection; they are not labeled as independent AI review.

## Phase 1 assessment

Plan covers Phase 1 DB goal but lacks implementation-level contracts for migration safety, relational integrity, JSON serialization validation, secret handling, and tests for upgrades from existing databases. `01-01-PLAN.md` remains `in_progress`, while `REQUIREMENTS.md` and `01-01-SUMMARY.md` mark all MCP-DB requirements complete; planning state conflicts.

### Strengths

- Scope matches MCP-DB-01 through MCP-DB-04.
- Explicit migration/version bump exists.
- Repository and unit-test deliverables named.
- Later transport kinds (`stdio`, `sse`, `http`) represented in `mcpServers`.

### Concerns

- **OUT OF SCOPE — Existing bridge isolation risk, not a Phase 2 defect.** Phase 2 has no implementation yet. Existing devtools bridge `src/lib/mcp/stdioSseBridge.js` keeps one child per plugin and broadcasts every child frame to all registered UI sessions. `src/app/api/mcp/[plugin]/message/route.js` ignores returned `sessionId`; endpoint token provides no ownership enforcement. Treat this only as an architecture constraint for future Phase 2 planning.
- **MEDIUM — Plan omits migration contract.** No explicit table columns, defaults, `NOT NULL`/`CHECK` constraints, indexes, foreign keys, or rollback/idempotence behavior.
- **MEDIUM — Plan omits secrets contract.** `mcpServers.env` may contain credentials. Storage encoding, encryption-at-rest policy, redaction in logs/API, and repository return shape unspecified.
- **MEDIUM — Plan omits invalid JSON and cache consistency cases.** `args`, `env`, tool schemas, and `matchRules` need validation/serialization behavior. Tool cache must define replace/upsert semantics and deletion cascade when server is deleted.
- **LOW — Verification too weak.** “full regression pass” does not prove migration from old schema, constraint behavior, cascade delete, timestamps, disabled-server filtering, or malformed stored JSON handling.

### Suggestions

1. Keep Phase 1 scope. Do not add process/session persistence unless product needs durable session ownership.
2. Add Phase 2 design constraint before implementation: one stdio child per `(plugin, bridgeSessionId)` by default. Bind opaque server-issued session token to `sendToChild(plugin, sessionId, jsonRpc)` and route stdout only to owning session.
3. If process sharing is later required, define strict request-ID ownership map and reject or explicitly route all notifications. Do not broadcast unscoped frames. This design is less safe than per-session children and must not be default.
4. Expand Phase 1 plan with exact schema/migration contracts: transport `CHECK`, uniqueness for server names if required, foreign key/cascade policy, indexes, UTC timestamps, JSON validation, and idempotent migration tests.
5. Define `env` secret policy: encrypted storage or documented prohibition, redacted reads/logs, never return secret values in list endpoints.
6. Add DB tests for old-schema upgrade, failed migration atomicity, server-delete cache cleanup, cache upsert/replace, malformed JSON, disabled records, and repository parameterization.
7. Reconcile plan/requirements/summary state. Mark phase completed only after source and test evidence verifies it.

## Risk assessment

**MEDIUM for Phase 1.** Database plan needs explicit migration, data-validation, and secret-handling contracts. Existing bridge isolation is a separate future-Phase-2 architecture constraint, not an implementation defect in Phase 2.

## Consensus summary

Unavailable: zero external reviewers returned usable output.

### Verified user finding

Finding is correct. Existing code proves it:

```js
entry = { proc, sessions: new Map(), buffer: "" };
for (const send of entry.sessions.values()) {
  send(`event: message\ndata: ${line}\n\n`);
}
```

`sessionId` appears only in SSE handshake URL and is not read by POST route. `findPlugin()` allowlists preset commands; this is correct RCE defense but does not provide session isolation.
