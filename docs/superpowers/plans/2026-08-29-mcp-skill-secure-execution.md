# MCP and Skill Secure Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Securely select and execute authorized MCP tools across provider response formats while adding provider-style private/shared MCP and Skill ownership, bounded Skill injection, and redacted MCP observability.

**Architecture:** Derive one verified principal for dashboard routes and gateway requests, then resolve a private-first authorized MCP/Skill view for that principal. Selection emits `allowedServerIds`; ReAct execution carries it through `runToolLoop` into `McpProcessManager`. Normalize raw upstream response shapes before partitioning namespaced MCP calls, but append assistant calls and results only in source/client format so existing translation stays authoritative.

**Tech Stack:** Next.js route handlers, plain ESM JavaScript, SQLite adapter migrations, CommonJS MCP process manager, MiniSearch, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-9router-mcp-skill-execution-design.md`

## Global Constraints

- Do not modify, add, delete, stage, or commit untracked `.air/`.
- `userId = NULL` is legacy data only, never a shared/global authorization grant.
- Shared MCP/Skills are globally visible like provider connections; only owner or admin mutates them and only admin changes `isShared`.
- Private same-name MCP/Skill overrides shared row for current user.
- Never trust caller-controlled `x-user-id`, `x-user-role`, or `x-user-username` as principal identity.
- MCP executor rejects server UUIDs outside selection's `allowedServerIds`, including MCP-looking names emitted by an upstream model.
- Do not execute `custom_tool_call` as MCP in this change.
- Skill budget is 2,000 estimated tokens per request. Explicit full Skill wins; oversized explicit full prompt warns/skips, never truncates.
- Persistent logs/events must exclude credentials, authorization headers, raw tool args/results, and full Skill prompt text.
- Preserve existing fail-open chat behavior for selection/parser failures and existing ReAct soft landing.
- Do not enable `MCP_ALLOW_LOCAL_NETWORK` or alter Cognee endpoint/transport.

## File Structure

- Modify: `src/lib/auth/userContext.js` - verified dashboard session context only; no externally supplied identity headers or implicit admin fallback for protected routes.
- Modify: `src/sse/handlers/chat.js`, `open-sse/handlers/chatCore.js` - carry verified API-key principal into inbound injection and tool loop.
- Create: `src/lib/db/migrations/006-mcp-skills-scope.js` - add share flags and replace table-global name uniqueness while preserving legacy rows.
- Modify: `src/lib/db/schema.js`, `src/lib/db/migrations/index.js` - schema source and migration registration.
- Modify: `src/lib/db/repos/mcpRepo.js`, `src/lib/db/repos/skillsRepo.js` - private/shared visibility, override resolution, scoped ID/name lookup and mutations.
- Modify: `src/app/api/mcp/**`, `src/app/api/skills/**` - authenticated, owner/shared-scoped CRUD/test/activity operations.
- Modify: `src/lib/mcp/processManager.js`, `open-sse/mcp/toolExecutor.js`, `open-sse/mcp/toolLoop.js` - allowlist authorization, lazy-start authorization, redacted activity metadata.
- Modify: `open-sse/mcp/inboundInjectionPipeline.js`, `open-sse/mcp/inboundSelection.js`, `open-sse/mcp/search/toolIndex.js`, `src/lib/mcp/searchIndexSync.js` - user-scoped selection/index view and structured selection diagnostics.
- Modify: `open-sse/mcp/toolPartition.js`, `open-sse/mcp/contextInjector.js` - shape-first canonical calls and Responses continuation IDs.
- Create: `open-sse/mcp/skillBudget.js` - deterministic prompt/manifest rendering and shared token estimator.
- Modify: `open-sse/mcp/skillPromptInjector.js` - inject prepared compact/full Skill entries without duplicating full body into history.
- Create/modify tests under `tests/unit/` and `tests/e2e/` listed per task.

---

### Task 1: Verified Principal Boundary

**Files:**
- Modify: `src/lib/auth/userContext.js`
- Modify: `src/sse/handlers/chat.js:54-85`
- Modify: `open-sse/handlers/chatCore.js:350-414`
- Test: `tests/unit/auth/user-context.test.js`
- Test: `tests/unit/mcp-chat-core-injection.test.js`

**Interfaces:**
- Produces: `getUserContext(request, { required }) -> { userId, role, username, isAdmin } | null` from verified dashboard session only.
- Produces: gateway `requestPrincipal -> { userId, isAdmin }`, sourced from validated API-key record or explicitly unauthenticated local mode.
- Consumes: existing `getDashboardAuthSession()` and API-key lookup in `src/sse/services/auth.js`.

- [ ] **Step 1: Write failing user-context tests**

```js
it("rejects forged identity headers without a verified session", async () => {
  const request = new Request("http://localhost/api/skills", {
    headers: { "x-user-id": "victim", "x-user-role": "admin" },
  });
  await expect(getUserContext(request, { required: true })).resolves.toBeNull();
});

it("returns dashboard-session identity rather than spoofed headers", async () => {
  mockDashboardSession({ userId: "owner", role: "user", username: "owner" });
  const context = await getUserContext(requestWithCookieAndSpoofedHeaders(), { required: true });
  expect(context).toMatchObject({ userId: "owner", isAdmin: false });
});
```

- [ ] **Step 2: Run user-context test and verify failure**

Run: `cd tests && npx vitest run unit/auth/user-context.test.js`

Expected: FAIL because `getUserContext()` returns `x-user-id` before token verification.

- [ ] **Step 3: Make `getUserContext()` session-first and explicit about legacy local mode**

Remove external identity-header branch. Parse cookie/Bearer dashboard token, verify with `getDashboardAuthSession()`, and return its claims. Keep fallback-to-default-admin only behind `required: false`, so routes in Tasks 3-4 opt into `required: true`. Do not reuse headers as an authorization channel.

```js
export async function getUserContext(request, { required = false } = {}) {
  const token = await extractDashboardToken(request);
  const session = token ? await getDashboardAuthSession(token) : null;
  if (session?.userId) return toUserContext(session);
  return required ? null : getDefaultAdminContext();
}
```

- [ ] **Step 4: Pass gateway API-key identity into chat core**

In `handleChat`, resolve API-key information before accepting `userId`; ignore request identity headers. Pass `{ userId, isAdmin: Boolean(keyInfo?.isAdmin) }` through existing `handleSingleModelChat`/chat-core context. Local mode remains `userId: null`, which Tasks 2-5 treat as no private/shared MCP injection rather than admin access.

- [ ] **Step 5: Run focused tests**

Run: `cd tests && npx vitest run unit/auth/user-context.test.js unit/mcp-chat-core-injection.test.js`

Expected: PASS. Existing authenticated chat injection fixture receives same owner ID. Spoofed headers do not grant identity.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/userContext.js src/sse/handlers/chat.js open-sse/handlers/chatCore.js tests/unit/auth/user-context.test.js tests/unit/mcp-chat-core-injection.test.js
git commit -m "fix(auth): require verified principal for MCP scope"
```

---

### Task 2: MCP and Skill Share-Scope Migration

**Files:**
- Create: `src/lib/db/migrations/006-mcp-skills-scope.js`
- Modify: `src/lib/db/migrations/index.js`
- Modify: `src/lib/db/schema.js:192-240`
- Test: `tests/unit/mcp-skills-scope-migration.test.js`

**Interfaces:**
- Produces: `mcpServers.isShared` and `skills.isShared`, both `INTEGER NOT NULL DEFAULT 0`.
- Produces: per-owner uniqueness through `UNIQUE(userId, name)` after removal of table-global `name UNIQUE` definitions.
- Consumes: migration adapter API `run()`, `all()`, and existing migration version ordering.

- [ ] **Step 1: Write failing migration tests**

```js
it("keeps legacy owner rows private and permits duplicate names across owners", () => {
  runMigrations(adapterWithLegacyMcpAndSkillRows());
  expect(select("mcpServers", "legacy").isShared).toBe(0);
  insertServer({ userId: "user-a", name: "cognee" });
  expect(() => insertServer({ userId: "user-b", name: "cognee" })).not.toThrow();
});

it("rejects duplicate MCP or Skill names for one owner", () => {
  insertSkill({ userId: "user-a", name: "review" });
  expect(() => insertSkill({ userId: "user-a", name: "review" })).toThrow();
});
```

- [ ] **Step 2: Run migration test and verify failure**

Run: `cd tests && npx vitest run unit/mcp-skills-scope-migration.test.js`

Expected: FAIL because current tables retain `name TEXT NOT NULL UNIQUE`.

- [ ] **Step 3: Implement SQLite-safe table rebuild migration**

In migration version 6, rebuild `mcpServers` and `skills` inside a transaction: create replacement table without column-level `UNIQUE`, add `isShared INTEGER NOT NULL DEFAULT 0`, copy every existing row with `COALESCE(isShared, 0)`, rename replacement, restore indexes including `idx_*_user_name`, `idx_*_is_shared`, enabled, and user indexes. Preserve all current MCP fields including `headers` if present in live schema. Do not set `userId` to null or infer sharing from it.

```js
adapter.transaction(() => {
  rebuildTable(adapter, "mcpServers", MCP_SERVER_COLUMNS_WITH_IS_SHARED);
  adapter.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_mcpServers_user_name ON mcpServers(userId, name)");
  adapter.run("CREATE INDEX IF NOT EXISTS idx_mcpServers_is_shared ON mcpServers(isShared)");
});
```

- [ ] **Step 4: Update schema source and migration registry**

Remove `UNIQUE` from schema `name` columns, add `isShared`, and make schema index declarations match migrated indexes. Register migration after version 5 using current `migrations/index.js` export convention.

- [ ] **Step 5: Run migration and DB regression tests**

Run: `cd tests && npx vitest run unit/mcp-skills-scope-migration.test.js unit/mcp-skills-db.test.js`

Expected: PASS. Migration reruns safely, legacy rows remain private, same-owner collision fails, different-owner same name succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/migrations/006-mcp-skills-scope.js src/lib/db/migrations/index.js src/lib/db/schema.js tests/unit/mcp-skills-scope-migration.test.js
git commit -m "feat(mcp): add private and shared MCP Skill schema"
```

---

### Task 3: Scoped Repositories and Management APIs

**Files:**
- Modify: `src/lib/db/repos/mcpRepo.js`
- Modify: `src/lib/db/repos/skillsRepo.js`
- Modify: `src/app/api/mcp/servers/route.js`
- Modify: `src/app/api/mcp/servers/[id]/route.js`
- Modify: `src/app/api/mcp/test/route.js`
- Modify: `src/app/api/mcp/tools/route.js`
- Modify: `src/app/api/mcp/activity/route.js`
- Modify: `src/app/api/skills/route.js`
- Modify: `src/app/api/skills/[id]/route.js`
- Modify: `src/app/api/skills/rules/route.js`
- Modify: `src/app/api/skills/rules/[id]/route.js`
- Test: `tests/unit/api-mcp-scope.test.js`
- Test: `tests/unit/api-skills.test.js`
- Test: `tests/unit/mcp-skills-db.test.js`

**Interfaces:**
- Produces: `getAccessibleMcpServers({ userId, enabled })` and `getAccessibleSkills({ userId, enabled })`, private-first de-duplicated by `name`.
- Produces: `getMcpServerById(id, access)`, `updateMcpServer(id, patch, access)`, and equivalents for Skills, where `access = { userId, isAdmin, mutation }`.
- Produces: API 401 without verified session, 404 for inaccessible resources, 403 for forbidden sharing/mutation.
- Consumes: Task 1 `getUserContext(request, { required: true })` and Task 2 scope columns.

- [ ] **Step 1: Write failing repository visibility and mutation tests**

```js
it("returns owner private rows before same-name shared rows", async () => {
  await createMcpServer({ userId: "admin", isShared: true, name: "cognee" });
  const privateRow = await createMcpServer({ userId: "user-a", name: "cognee" });
  const rows = await getAccessibleMcpServers({ userId: "user-a" });
  expect(rows.filter((row) => row.name === "cognee")).toEqual([expect.objectContaining({ id: privateRow.id })]);
});

it("does not let a non-owner mutate another user's shared row", async () => {
  const shared = await createSkill({ userId: "admin", isShared: true, name: "review" });
  await expect(updateSkill(shared.id, { enabled: false }, { userId: "user-a", isAdmin: false, mutation: true }))
    .resolves.toBeNull();
});
```

- [ ] **Step 2: Run repository tests and verify failure**

Run: `cd tests && npx vitest run unit/mcp-skills-db.test.js unit/api-mcp-scope.test.js`

Expected: FAIL because repository ID/mutation functions ignore access filters and routes create global rows.

- [ ] **Step 3: Implement repository access primitives**

Map `isShared` in `rowToServer()` and `rowToSkill()`. Query accessible rows with `(userId = ? OR isShared = 1)`, then de-duplicate same logical name in JavaScript preferring `row.userId === userId`. Item read permits owner, shared, or admin. Mutation permits owner or admin only. Create assigns `userId` from route context. `isShared` can be passed only by admin; repository receives already-authorized boolean.

```js
export function resolvePrivateFirst(rows, userId) {
  const byName = new Map();
  for (const row of rows) {
    if (!byName.has(row.name) || row.userId === userId) byName.set(row.name, row);
  }
  return [...byName.values()];
}
```

- [ ] **Step 4: Scope every MCP/Skill management route**

Require user context on collection, item, rules, tools, activity, restart, and test routes. Apply access object to every repository read/update/delete. On POST set `userId: context.userId`; reject `isShared: true` unless `context.isAdmin`. On PATCH reject non-admin changes to `isShared` before calling repository. Make ephemeral `/api/mcp/test` admin-only; do not accept arbitrary user-owned command/network config from non-admins.

- [ ] **Step 5: Add API authorization tests**

Cover unauthenticated 401, owner CRUD, user visibility of shared row, inaccessible private row as 404, non-owner shared mutation as 404/403 according to established route convention, admin share toggle, and private same-name override in GET collections.

- [ ] **Step 6: Run focused route and repository tests**

Run: `cd tests && npx vitest run unit/api-mcp-scope.test.js unit/api-skills.test.js unit/mcp-skills-db.test.js`

Expected: PASS. User A cannot read, test, edit, or delete User B private MCP/Skill. Shared rows remain readable but immutable to User A.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/repos/mcpRepo.js src/lib/db/repos/skillsRepo.js src/app/api/mcp src/app/api/skills tests/unit/api-mcp-scope.test.js tests/unit/api-skills.test.js tests/unit/mcp-skills-db.test.js
git commit -m "fix(mcp): enforce owner and shared configuration scope"
```

---

### Task 4: Scoped Selection, Index, and Execution Allowlist

**Files:**
- Modify: `open-sse/mcp/inboundInjectionPipeline.js`
- Modify: `open-sse/mcp/inboundSelection.js`
- Modify: `open-sse/mcp/search/toolIndex.js`
- Modify: `src/lib/mcp/searchIndexSync.js`
- Modify: `open-sse/mcp/toolLoop.js`
- Modify: `open-sse/mcp/toolExecutor.js`
- Modify: `src/lib/mcp/processManager.js`
- Test: `tests/unit/mcp-inbound-selection-search.test.js`
- Test: `tests/unit/mcp-process-manager.test.js`
- Test: `tests/unit/mcp-tool-executor.test.js`

**Interfaces:**
- Produces: `applyInboundInjection({ body, sourceFormat, headers, userId, isAdmin, log }) -> { body, selection }` internally, retaining caller body on failures.
- Produces: `selectInboundMcp(...) -> { tools, skills, allowedServerIds, reason, diagnostics }`.
- Consumes: Task 3 accessible repository queries and Task 1 principal.
- Produces: `callServerTool(serverId, toolName, args, { userId, isAdmin, allowedServerIds })` refusing unauthorized IDs before lazy start.

- [ ] **Step 1: Write failing selection isolation tests**

```js
it("does not expose user-b private tool schema in user-a search", async () => {
  const result = await applyInboundInjection({ body, sourceFormat: FORMATS.OPENAI, userId: "user-a" });
  expect(serializedTools(result)).not.toContain("mcp__user_b_server__secret_tool");
});

it("returns only server IDs whose tools were authorized for this request", () => {
  const selection = selectInboundMcp({ servers: userAView, toolCache, skills, format, body });
  expect(selection.allowedServerIds).toEqual(new Set(["shared", "private-a"]));
});
```

- [ ] **Step 2: Write failing process-manager authorization tests**

```js
await expect(pm.callServerTool("private-b", "read", {}, {
  userId: "user-a", isAdmin: false, allowedServerIds: new Set(["private-a"]),
})).rejects.toMatchObject({ code: "MCP_SERVER_UNAUTHORIZED" });
expect(loadServerById).not.toHaveBeenCalled();
```

- [ ] **Step 3: Run tests and verify failure**

Run: `cd tests && npx vitest run unit/mcp-inbound-selection-search.test.js unit/mcp-process-manager.test.js unit/mcp-tool-executor.test.js`

Expected: FAIL because global index/repositories expose all rows and `callServerTool()` lazy-starts by arbitrary UUID.

- [ ] **Step 4: Replace global content index with request-scoped view**

`applyInboundInjection()` loads only `getAccessibleMcpServers({ userId, enabled: true })` and `getAccessibleSkills(...)`; fetch cache only for selected accessible IDs. Build a fresh `ToolIndexManager` from that view per injection, or cache managers keyed by user ID plus invalidation generation. Do not retain raw private schema/prompt in a process-global manager. Change `triggerSearchIndexRebuild()` to invalidate user-scoped views, not rebuild global content.

- [ ] **Step 5: Return selection allowlist and diagnostics**

Build `allowedServerIds` from every accessible enabled server eligible in current request, after private override and client `x-mcp-servers` restriction. Preserve explicit tokens, detect exact reasons (`server_not_found`, `server_disabled`, `server_unauthorized`, `server_no_cached_tools`, `server_tools_invalid`, and Skill equivalents), and fail open. `@server` selection may inject all cached tools for that server, but only if cache validates as an array of named tool schemas.

- [ ] **Step 6: Thread execution authorization through ReAct**

Pass `{ userId, isAdmin, allowedServerIds }` from injection metadata into `runToolLoop()` and then `executeToolCalls()`. Forward meta to `processManager.callServerTool()`. In `callServerTool()`, first verify set membership, then load server through scoped repository access if no running session; reject inaccessible/disabled rows with `MCP_SERVER_UNAUTHORIZED` or existing disabled/not-running errors. A running session never bypasses allowlist.

- [ ] **Step 7: Run scoped selection and executor tests**

Run: `cd tests && npx vitest run unit/mcp-inbound-selection-search.test.js unit/mcp-process-manager.test.js unit/mcp-tool-executor.test.js`

Expected: PASS. User A index never contains User B schemas/prompts. Shared server works for User A. Model-emitted User B UUID cannot execute or lazy-start.

- [ ] **Step 8: Commit**

```bash
git add open-sse/mcp/inboundInjectionPipeline.js open-sse/mcp/inboundSelection.js open-sse/mcp/search/toolIndex.js src/lib/mcp/searchIndexSync.js open-sse/mcp/toolLoop.js open-sse/mcp/toolExecutor.js src/lib/mcp/processManager.js tests/unit/mcp-inbound-selection-search.test.js tests/unit/mcp-process-manager.test.js tests/unit/mcp-tool-executor.test.js
git commit -m "fix(mcp): scope selection index and execution allowlist"
```

---

### Task 5: Shape-First Cross-Provider ReAct Parser

**Files:**
- Modify: `open-sse/mcp/toolPartition.js`
- Modify: `open-sse/mcp/toolLoop.js`
- Modify: `open-sse/handlers/chatCore.js:360-414`
- Modify: `open-sse/mcp/contextInjector.js`
- Test: `tests/unit/mcp-tool-partition.test.js`
- Test: `tests/unit/mcp-tool-loop.test.js`
- Test: `tests/e2e/mcp-react-pipeline.e2e.test.js`

**Interfaces:**
- Produces: `extractToolCallsFromResponse(response, { providerResponseFormat, targetFormat }) -> Array<{ id, name, args, protocol, rawType, raw }>`.
- Consumes: raw response object, never `sourceFormat` to decide raw parsing.
- Produces: canonical protocol values `openai`, `anthropic`, `gemini`, `responses`.
- Preserves: `appendReActTurnToContext(body, calls, results, sourceFormat)` as client/source format only.

- [ ] **Step 1: Write parser matrix tests**

```js
it.each([
  ["openai", { choices: [{ message: { tool_calls: [{ id: "o1", function: { name: MCP, arguments: '{"q":1}' } }] } }] }],
  ["anthropic", { content: [{ type: "tool_use", id: "a1", name: MCP, input: { q: 1 } }] }],
  ["gemini", { candidates: [{ content: { parts: [{ functionCall: { id: "g1", name: MCP, args: { q: 1 } } }] } }] }],
  ["responses", { output: [{ type: "function_call", call_id: "r1", name: MCP, arguments: '{"q":1}' }] }],
])("normalizes %s raw response independent of client format", (_protocol, response) => {
  expect(extractToolCallsFromResponse(response, { providerResponseFormat: FORMATS.OPENAI })).toMatchObject([
    { name: MCP, args: { q: 1 }, protocol: _protocol },
  ]);
});

it("does not classify custom_tool_call as executable MCP", () => { /* raw native custom call fixture */ });
```

- [ ] **Step 2: Run parser and loop tests to verify failure**

Run: `cd tests && npx vitest run unit/mcp-tool-partition.test.js unit/mcp-tool-loop.test.js`

Expected: FAIL because parser returns early from OpenAI client `sourceFormat` before inspecting Claude/Gemini/Responses shapes.

- [ ] **Step 3: Implement shape-first canonical extraction**

Inspect raw shape in deterministic order: OpenAI `choices[].message.tool_calls`, Claude `content[].tool_use`, Gemini `candidates[].content.parts[].functionCall`, then Responses `output[].function_call`. Only after no recognized shape use `providerResponseFormat`, then `targetFormat` for compatibility diagnostics. Emit `protocol` and `rawType`; preserve raw block for result formatting only. Do not parse any `custom_tool_call` format as MCP.

- [ ] **Step 4: Pass actual executor response format to loop**

Capture `execData.result.responseFormat || targetFormat` per turn in `executorFn` return value. Have `runToolLoop()` call canonical extraction with `{ providerResponseFormat: turnResult.responseFormat, targetFormat }`. Remove `sourceFormat` from raw-response parser decision, but retain it for `appendReActTurnToContext()`.

- [ ] **Step 5: Complete source-format continuation edge cases**

Ensure Responses assistant `function_call` and `function_call_output` keep same `call_id`; add robust JSON argument parsing in Claude/Gemini source context without throwing. Assert next client body is OpenAI for OpenAI client plus Claude raw response, Gemini for Gemini client plus OpenAI raw response, and Responses `input` for Responses client.

- [ ] **Step 6: Extend ReAct E2E test with cross-format cases**

Use mock `processManager.callServerTool`, not `callTool`. Cover OpenAI-client/Claude-raw and OpenAI-client/Gemini-raw execution; assert call server ID, tool name, parsed args, one source-format assistant/result append, final answer, and unmodified custom call behavior. Add streaming fixture: intermediate MCP turn remains buffered; final answer uses existing stream response handling.

- [ ] **Step 7: Run format matrix tests**

Run: `cd tests && npx vitest run unit/mcp-tool-partition.test.js unit/mcp-tool-loop.test.js e2e/mcp-react-pipeline.e2e.test.js`

Expected: PASS. Cross-format tool calls invoke `callServerTool()` once. Unknown shapes return final path without crashing.

- [ ] **Step 8: Commit**

```bash
git add open-sse/mcp/toolPartition.js open-sse/mcp/toolLoop.js open-sse/handlers/chatCore.js open-sse/mcp/contextInjector.js tests/unit/mcp-tool-partition.test.js tests/unit/mcp-tool-loop.test.js tests/e2e/mcp-react-pipeline.e2e.test.js
git commit -m "fix(mcp): execute cross-provider ReAct tool calls"
```

---

### Task 6: Skill Budget and Redacted Observability

**Files:**
- Create: `open-sse/mcp/skillBudget.js`
- Modify: `open-sse/config/mcpConstants.js`
- Modify: `open-sse/mcp/inboundSelection.js`
- Modify: `open-sse/mcp/skillPromptInjector.js`
- Modify: `open-sse/mcp/inboundInjectionPipeline.js`
- Modify: `src/lib/mcp/processManager.js`
- Modify: `src/app/api/mcp/activity/route.js`
- Test: `tests/unit/mcp-skill-budget.test.js`
- Test: `tests/unit/mcp-skill-prompt-injector.test.js`
- Test: `tests/unit/mcp-process-manager.test.js`

**Interfaces:**
- Produces: `estimateTokens(text) -> number`, used by production and tests.
- Produces: `prepareSkillInjection({ explicitSkills, automaticSkills, alwaysSkills, budgetTokens }) -> { entries, skipped, estimatedTokens }` where entry mode is `full` or `compact`.
- Produces: redacted events with only safe metadata including argument key names, status, duration, request/user hashes, formats, and reason.

- [ ] **Step 1: Write failing skill budget tests**

```js
it("keeps explicit full Skill first and skips it when over hard budget", () => {
  const result = prepareSkillInjection({ explicitSkills: [oversized], automaticSkills: [small], budgetTokens: 2_000 });
  expect(result.entries).not.toContainEqual(expect.objectContaining({ id: oversized.id }));
  expect(result.skipped).toContainEqual({ skillId: oversized.id, reason: "skill_budget_exceeded" });
});

it("renders automatic match as manifest without systemPrompt", () => {
  const result = prepareSkillInjection({ automaticSkills: [skill], budgetTokens: 2_000 });
  expect(result.entries[0].content).toContain(skill.description);
  expect(result.entries[0].content).not.toContain(skill.systemPrompt);
});
```

- [ ] **Step 2: Write failing redaction tests**

```js
await pm.callServerTool("server", "recall", { authorization: "secret", query: "private" }, meta);
expect(pm.getActivityLogs()[0]).toMatchObject({ argumentKeyNames: ["authorization", "query"] });
expect(JSON.stringify(pm.getActivityLogs()[0])).not.toContain("secret");
expect(JSON.stringify(pm.getActivityLogs()[0])).not.toContain("private");
```

- [ ] **Step 3: Run tests and verify failure**

Run: `cd tests && npx vitest run unit/mcp-skill-budget.test.js unit/mcp-skill-prompt-injector.test.js unit/mcp-process-manager.test.js`

Expected: FAIL because injector always emits full prompts and activity stores `args` plus `result`.

- [ ] **Step 4: Implement one deterministic Skill estimator and renderer**

Add constants including `MCP_SKILL_TOKEN_BUDGET = 2000`. Use a conservative documented estimator such as normalized character count divided by four with a minimum for non-empty content; all tests call same utility. Render full entries only for explicit `$skill` and `matchRules.mode === "always"`; render automatic entries as escaped `name`, `description`, `triggers`, and `keywords` manifest. Apply order: explicit full, always full, auto compact. Do not truncate text. If a full candidate alone exceeds remaining budget, skip it with `skill_budget_exceeded`; auto candidates may compact or drop.

- [ ] **Step 5: Inject prepared entries without history duplication**

Change `formatSkillsPrompt()` to accept prepared `{ name, content, mode }` entries. Preserve marker/idempotency. Keep output only in OpenAI system message, Claude system, Gemini systemInstruction, or Responses instructions. ReAct `appendReActTurnToContext()` must not invoke injector or duplicate marker block.

- [ ] **Step 6: Add structured redacted events and activity records**

Create a narrow event helper near MCP pipeline/process manager. Hash user ID with server-local non-secret hash/salt policy already available, record `argumentKeyNames` only, and never persist raw tool result/prompt/credentials. Replace `args` and `result` fields in `logActivity()` with `argumentKeyNames`, `isError`, `durationMs`, sanitized `errorCode`, and IDs/names. Restrict `/api/mcp/activity` to Task 3 accessible servers and return only redacted records.

- [ ] **Step 7: Add event assertions for selection/parser/execution**

Verify `mcp.selection`, `mcp.injection`, `mcp.tool_detection`, `mcp.tool_execution`, `skill.selection`, and `skill.injection` include only allowed fields. Explicit missing/disabled/unauthorized targets create warning reason but preserve chat fail-open. Unknown raw response shape logs shape metadata but not response payload.

- [ ] **Step 8: Run focused budget and redaction tests**

Run: `cd tests && npx vitest run unit/mcp-skill-budget.test.js unit/mcp-skill-prompt-injector.test.js unit/mcp-process-manager.test.js unit/api-mcp-scope.test.js`

Expected: PASS. Estimated total never exceeds 2,000. Full explicit prompt never truncates. Raw secret values absent from activity/event serialization.

- [ ] **Step 9: Commit**

```bash
git add open-sse/mcp/skillBudget.js open-sse/config/mcpConstants.js open-sse/mcp/inboundSelection.js open-sse/mcp/skillPromptInjector.js open-sse/mcp/inboundInjectionPipeline.js src/lib/mcp/processManager.js src/app/api/mcp/activity/route.js tests/unit/mcp-skill-budget.test.js tests/unit/mcp-skill-prompt-injector.test.js tests/unit/mcp-process-manager.test.js
git commit -m "feat(mcp): budget Skills and redact execution activity"
```

---

### Task 7: Regression Verification and Review Gate

**Files:**
- Modify only if verification exposes a regression in prior tasks.
- Test: focused files from Tasks 1-6 plus relevant baseline scripts.

**Interfaces:**
- Verifies: all authorization, selection, parser, ReAct, budget, and redaction contracts in spec.
- Consumes: completed Tasks 1-6.

- [ ] **Step 1: Run focused implementation suite**

Run: `cd tests && npx vitest run unit/auth/user-context.test.js unit/mcp-skills-scope-migration.test.js unit/mcp-skills-db.test.js unit/api-mcp-scope.test.js unit/api-skills.test.js unit/mcp-inbound-selection-search.test.js unit/mcp-tool-partition.test.js unit/mcp-tool-loop.test.js unit/mcp-tool-executor.test.js unit/mcp-process-manager.test.js unit/mcp-skill-budget.test.js unit/mcp-skill-prompt-injector.test.js e2e/mcp-react-pipeline.e2e.test.js`

Expected: PASS.

- [ ] **Step 2: Run repository lint**

Run: `npx eslint open-sse/mcp src/lib/auth/userContext.js src/lib/db src/lib/mcp src/app/api/mcp src/app/api/skills`

Expected: PASS with no new warnings/errors.

- [ ] **Step 3: Run relevant project regression suite**

Run: `cd tests && npx vitest run unit/mcp-client.test.js unit/mcp-sse-transport.test.js unit/mcp-chat-core-injection.test.js`

Expected: PASS. If wider suite has documented baseline failures, run `node __baseline__/verify-no-regression.mjs` and report only new failures.

- [ ] **Step 4: Review security diff before deploy**

Verify manually:

```text
No request header grants user identity.
No private MCP/Skill appears in another user selection/index/API result.
No server outside allowedServerIds is started or called.
No activity/event serializes tool args/results, headers, credentials, or full Skill prompt.
```

- [ ] **Step 5: Commit verification-only fixes if needed**

```bash
git add <only-files-fixed-by-verification>
git commit -m "test(mcp): cover secure execution regressions"
```

Leave this step unchecked if no code/test changes were needed.

## Production Verification

Deploy only after explicit user instruction and use `9router-vps-debug-deploy`. Do not place credentials in commands, logs, docs, or commits.

1. Confirm Cognee cached tools on VPS without enabling local-network MCP access.
2. As owner, send `@cognee` through OpenAI client format routed to a non-OpenAI raw upstream shape.
3. Confirm redacted `mcp.tool_detection` and `mcp.tool_execution` event, `callServerTool()` execution, and final tool-informed answer.
4. Confirm unrelated user cannot list, inject, test, or call owner-private Cognee.
5. Mark Cognee shared as admin, verify non-owner can execute but cannot edit/delete/share-toggle it.
6. Verify explicit `$skill` full injection, auto compact manifest, budget skip warning, and no repeated Skill block after ReAct turn.

## Plan Self-Review

- Spec coverage: Tasks 1-4 implement verified principal, private/shared schema, private override, API/repo/process authorization, user-scoped index, and allowlist. Task 5 implements shape-first OpenAI/Claude/Gemini/Responses parser, source-format continuation, custom-tool exclusion, streaming behavior. Task 6 implements 2,000-token Skill policy and redacted events. Task 7 verifies all required security and regression paths.
- Placeholder scan: no TBD/TODO/defer steps. Production deployment remains intentionally gated on explicit user request.
- Type consistency: `userId`, `isAdmin`, `allowedServerIds`, and `providerResponseFormat` use same names from injection through process manager; canonical calls use `id`, `name`, `args`, `protocol`, `rawType`.
