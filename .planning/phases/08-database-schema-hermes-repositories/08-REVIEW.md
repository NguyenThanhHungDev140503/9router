---
phase: 08-database-schema-hermes-repositories
reviewed: 2026-08-25T16:13:25Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/lib/db/migrations/003-hermes-swarm.js
  - src/lib/db/migrations/index.js
  - src/lib/db/repos/blackboardRepo.js
  - src/lib/db/repos/hermesRepo.js
  - src/lib/db/repos/index.js
  - src/lib/db/repos/swarmRepo.js
  - src/lib/db/schema.js
  - src/models/index.js
  - tests/unit/hermes-repositories.test.js
  - tests/unit/hermes-schema-migration.test.js
findings:
  critical: 2
  warning: 7
  info: 0
  total: 9
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-08-25T16:13:25Z  
**Depth:** standard  
**Files Reviewed:** 10  
**Status:** issues_found

## Summary

Repositories, migration, schema, exports, tests reviewed. Targeted Vitest suite passes, but misses concurrency, patch-contract, migration-upgrade, and queue-state failures. Do not ship unchanged.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Concurrent blackboard edits lose fields

**Classification:** BLOCKER  
**File:** `src/lib/db/repos/blackboardRepo.js:9`  
**Issue:** `updateBlackboardEntry()` reads row before transaction, merges patch outside transaction, then replaces every mutable column. Two callers updating different fields both start from same stale row. Last transaction overwrites first caller's fields. Revision rows record both writes, but live blackboard silently loses one update. Blackboard is shared swarm state; this breaks data integrity.

**Fix:**
```js
// Add a revision/version column, then include it in read and conditional write.
const result = db.run(
  `UPDATE blackboard
   SET content=?, tags=?, category=?, validityScore=?, confidenceScore=?,
       metadata=?, source=?, updatedAt=?, expiresAt=?, revision=revision+1
   WHERE id=? AND revision=?`,
  [...values, id, existing.revision],
);
if (result.changes !== 1) throw new Error("Blackboard entry changed concurrently");
```

Move read, conditional update, and revision insert into one transaction. Add `UNIQUE(entryId, revision)` to `blackboardRevisions`.

### CR-02: Task step order is not unique

**Classification:** BLOCKER  
**File:** `src/lib/db/schema.js:271-288`  
**File:** `src/lib/db/repos/hermesRepo.js:58-59`  
**Issue:** `hermesTaskSteps` has no uniqueness constraint for `(taskId, stepIndex)`. `recordTaskStep()` defaults omitted `stepIndex` to `0`. Repeated writes create multiple step-zero rows, while `getTaskSteps()` sorts only by that duplicate value. Execution trace becomes ambiguous and cannot identify latest/correct step.

**Fix:**
```js
indexes: [
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_hermesTaskSteps_task_step ON hermesTaskSteps(taskId, stepIndex);",
  "CREATE INDEX IF NOT EXISTS idx_hermesTaskSteps_status ON hermesTaskSteps(status);",
]
```

Validate non-negative integer `stepIndex`; either require it or allocate next index atomically. Add migration for existing databases plus duplicate-step regression test.

## Warnings

### WR-01: Patch APIs return data never persisted and bypass create validation

**Classification:** WARNING  
**File:** `src/lib/db/repos/hermesRepo.js:31-35`  
**File:** `src/lib/db/repos/blackboardRepo.js:9`  
**File:** `src/lib/db/repos/swarmRepo.js:9`  
**Issue:** All three patch functions spread arbitrary `changes`/`updates` into returned object, but SQL updates only selected columns. Passing `id`, `createdAt`, unknown keys, or blackboard `swarmId`/`authorBotId` returns fabricated state not present in DB. `updateBot()` also bypasses `createBot()` name trim/non-empty validation, allowing whitespace-only names.

**Fix:** Whitelist mutable fields, validate normalized patch values, build SQL from same whitelist, then return fresh `get*ById(id)` result. Reject immutable and unknown keys.

### WR-02: Task retry transition leaves completed state on pending work

**Classification:** WARNING  
**File:** `src/lib/db/repos/hermesRepo.js:47-57`  
**Issue:** `failTask()` increments `retryCount` but always sets `failed` and never checks `maxRetries`. If caller reschedules through `updateTaskStatus(id, "pending")`, function leaves `assignedBotId`, `result`, `startedAt`, and `completedAt` intact. Queue can contain pending task shown as completed and already assigned.

**Fix:** Use explicit transition functions. Requeue only while `retryCount < maxRetries`; when requeueing, clear assignment, result, error as needed, `startedAt`, and `completedAt` in same transaction. Reject invalid transitions.

### WR-03: Task claim ignores required capability routing

**Classification:** WARNING  
**File:** `src/lib/db/repos/hermesRepo.js:52-55`  
**Issue:** Phase plan requires `claimNextPendingTask(botId, capabilities)`, but implementation accepts only `botId` and selects every pending task. Specialist bots can claim work outside declared capability assignment.

**Fix:** Add `capabilities` parameter and task capability requirement storage/filtering, or remove capability-routing requirement from phase contract. Test incompatible task stays pending.

### WR-04: Pheromone decay accepts invalid factors and can increase trails

**Classification:** WARNING  
**File:** `src/lib/db/repos/swarmRepo.js:15`  
**Issue:** `decayPheromones()` accepts any value. Negative `decayFactor` calculates `strength * (1 - negative)`, increasing pheromone strength. Values above `1` erase all strength. Schema constrains stored `decayRate` to `0..1`, but repository does not apply equivalent boundary validation.

**Fix:**
```js
if (!Number.isFinite(decayFactor) || decayFactor < 0 || decayFactor > 1) {
  throw new RangeError("decayFactor must be between 0 and 1");
}
```

Add tests for `-0.1`, `1.1`, and non-numeric values.

### WR-05: Blackboard graph breaks JSON read contract and only reads source-side edges

**Classification:** WARNING  
**File:** `src/lib/db/repos/blackboardRepo.js:14`  
**Issue:** `getBlackboardGraph()` returns raw `blackboardLinks.metadata` JSON strings, unlike `getBlackboardLinks()`. It also filters only links whose `sourceId` entry belongs to swarm. Links pointed at a swarm entry are omitted, despite phase contract requiring bidirectional graph links.

**Fix:**
```js
const links = db.all(
  `SELECT DISTINCT l.*
   FROM blackboardLinks l
   JOIN blackboard source ON source.id = l.sourceId
   JOIN blackboard target ON target.id = l.targetId
   WHERE source.swarmId = ? OR target.swarmId = ?`,
  [swarmId, swarmId],
).map((row) => ({ ...row, metadata: parseJson(row.metadata, {}) }));
```

Define whether cross-swarm edges are allowed; otherwise require both endpoints to share `swarmId`.

### WR-06: Migration test never proves version-3 upgrade path

**Classification:** WARNING  
**File:** `tests/unit/hermes-schema-migration.test.js:39-52`  
**Issue:** Test starts fresh DB. Migration `001-initial.js` iterates current `TABLES`, so fresh setup already creates Hermes tables before migration 003 runs. Test therefore passes even if migration 003 omits a table or index. No test creates version-2 database then upgrades to version 3.

**Fix:** Build DB with pre-Hermes version-2 schema and `_meta.schemaVersion = 2`, run migration runner, then assert all 11 new tables, FKs, defaults, and indexes. Test rerun remains idempotent.

### WR-07: Tests omit required error and state-integrity paths

**Classification:** WARNING  
**File:** `tests/unit/hermes-repositories.test.js:25-61`  
**Issue:** Tests cover only happy paths. Phase plan requires task state transitions, retry counter, step history, and bidirectional graph linking. No test covers duplicate task step indexes, invalid decay values, retry reset behavior, stale concurrent blackboard patch, reverse graph edge, or JSON shape returned by graph links.

**Fix:** Add regression tests for CR-01, CR-02, WR-02, WR-04, and WR-05 before fix work. Include concurrency simulation with two adapters against same SQLite file.

---

_Reviewed: 2026-08-25T16:13:25Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: standard_
