---
phase: 08-database-schema-hermes-repositories
reviewed: 2026-08-25T16:50:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/lib/db/migrations/003-hermes-swarm.js
  - src/lib/db/migrations/004-hermes-integrity.js
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
  warning: 10
  info: 0
  total: 12
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-08-25T16:50:00Z  
**Depth:** standard  
**Files Reviewed:** 11  
**Status:** issues_found

## Summary

Re-review found blocker fixes incomplete. Migration registers version 4 and targeted suite passes: `npm --prefix tests run test -- unit/hermes-repositories.test.js unit/hermes-schema-migration.test.js` (6 tests). Suite never opens version-3 database. Optimistic lock still has no caller-owned expected revision. Migration deletes conflicting audit data without deterministic preservation.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Blackboard API does not perform optimistic locking

**Classification:** BLOCKER  
**File:** `src/lib/db/repos/blackboardRepo.js:9-25`  
**Issue:** `updateBlackboardEntry()` reads current revision inside transaction, then uses that same revision in `WHERE`. API accepts no `expectedRevision`; a stale caller cannot make conditional write. Passing `updates.revision` also cannot help because line 18 overwrites it with current database revision plus one. Sequential stale clients both succeed; later full-row update overwrites fields from earlier client. `result.changes !== 1` only detects database interleaving between local read and write, not stale client state.

**Fix:** Require separately validated expected revision. Do not derive condition from freshly read row.
```js
export async function updateBlackboardEntry(id, updates, expectedRevision, authorId = null) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new RangeError("expectedRevision must be a non-negative integer");
  }
  // Build sanitized patch values, then:
  const result = db.run(
    `UPDATE blackboard SET ..., revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [...values, id, expectedRevision],
  );
  if (result.changes !== 1) throw new Error("Blackboard entry changed concurrently");
}
```

Add regression test: read entry twice, update using first revision, then assert second update with same revision rejects and preserves first update.

### CR-02: Integrity migration silently discards arbitrary audit and task-step records

**Classification:** BLOCKER  
**File:** `src/lib/db/migrations/004-hermes-integrity.js:28-44`  
**Issue:** Duplicate repair retains `MIN(rowid)`, not latest or otherwise canonical row. Duplicate `blackboardRevisions` keys can have different `content`, `authorBotId`, or `createdAt`; migration deletes all but first inserted record. Duplicate task steps can likewise contain different output/error states. This causes silent, irreversible data loss when upgrading existing version-3 databases. Pre-schema backup is best-effort and migration itself gives no recovery/report.

**Fix:** Stop migration with actionable conflict details, or deterministically retain documented canonical row and archive/delete conflicts only after explicit recovery policy. At minimum preserve newest record by `createdAt` plus `rowid` tiebreaker and log affected IDs before deletion.
```sql
DELETE FROM blackboardRevisions
WHERE rowid NOT IN (
  SELECT rowid FROM (
    SELECT rowid,
           ROW_NUMBER() OVER (
             PARTITION BY entryId, revision
             ORDER BY createdAt DESC, rowid DESC
           ) AS rank
    FROM blackboardRevisions
  ) WHERE rank = 1
);
```

Add upgrade fixture with divergent duplicates. Assert chosen retention policy and emitted recovery signal.

## Warnings

### WR-01: Version-3 upgrade path remains untested

**Classification:** WARNING  
**File:** `tests/unit/hermes-schema-migration.test.js:39-54,68-82`  
**Issue:** Every test starts current fresh schema. Migration `001-initial.js` creates tables from current `TABLES`, including `blackboard.revision` and unique indexes, before `004` is manually called. Test 3 removes a fresh index then calls `integrityMigration.up()` directly; it never sets `_meta.schemaVersion = 3`, never creates pre-v4 `blackboard`, and never runs migration runner. Existing version-3 upgrade can regress without test failure.

**Fix:** Create temp SQLite file with version-3 table definitions and `_meta.schemaVersion = '3'`; include old non-unique step index, no `blackboard.revision`, duplicate steps, and duplicate revisions. Initialize through `getAdapter()`/`runMigrationOnce()`. Assert version becomes 4, column backfill, indexes, retained records, and idempotent restart.

### WR-02: Revision and step index constraints do not enforce integer domain

**Classification:** WARNING  
**File:** `src/lib/db/schema.js:275,303`  
**Issue:** SQLite `INTEGER` affinity accepts values such as `0.5` unless table is `STRICT` or a `CHECK` rejects them. `stepIndex` has no range check; `revision` only rejects negative values. Direct SQL, imported data, or a future repository path can store negative/fractional step ordering and fractional revision versions, breaking task ordering and compare-and-swap semantics.

**Fix:** Enforce domain at schema level and repair/reject invalid legacy data before adding constraints.
```js
stepIndex: "INTEGER NOT NULL CHECK (stepIndex >= 0 AND stepIndex = CAST(stepIndex AS INTEGER))",
revision: "INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision = CAST(revision AS INTEGER))",
```

Add tests inserting `-1` and `0.5` directly into both tables.

### WR-03: Patch functions fabricate returned state and bypass validation

**Classification:** WARNING  
**File:** `src/lib/db/repos/hermesRepo.js:31-35`  
**File:** `src/lib/db/repos/blackboardRepo.js:15-32`  
**File:** `src/lib/db/repos/swarmRepo.js:9`  
**Issue:** Patch functions spread arbitrary caller fields into returned object while SQL writes fixed columns. Immutable/unknown values can appear successful only in return value. `updateBot()` also accepts whitespace-only names although `createBot()` rejects them. `updateBlackboardEntry()` allows caller patch to replace fields not persisted by its SQL, including `swarmId` and `authorBotId`.

**Fix:** Whitelist mutable fields, normalize and validate them, reject unknown/immutable fields, then return fresh `get*ById(id)` row after write.

### WR-04: Task error payloads are serialized but never deserialized

**Classification:** WARNING  
**File:** `src/lib/db/repos/hermesRepo.js:6,10,57,79`  
**Issue:** `failTask()` and `recordTaskStep()` store `error` with `stringifyJson()`, but `jsonFields` excludes `error`. Readers return JSON text instead of original error object. Null `result` and `output` also become `{}` because `mapRow()` uses `{}` fallback for every JSON field except `toolWhitelist`.

**Fix:** Use per-field defaults and include error payloads.
```js
const jsonDefaults = {
  toolWhitelist: [], capabilityWeights: {}, config: {}, input: {},
  output: null, result: null, error: null,
};
for (const [field, fallback] of Object.entries(jsonDefaults)) {
  if (field in out) out[field] = parseJson(out[field], fallback);
}
```

Add tests for `failTask({ code: "E" })`, failed step error, and null output/result preservation.

### WR-05: Retry and status updates produce invalid queue state

**Classification:** WARNING  
**File:** `src/lib/db/repos/hermesRepo.js:47-57`  
**Issue:** `failTask()` always moves task to `failed`, increments retry count past `maxRetries`, and has no requeue transition. If caller uses `updateTaskStatus(id, "pending")`, stale `assignedBotId`, `result`, `startedAt`, and `completedAt` remain. Pending task can appear completed and assigned.

**Fix:** Add explicit transactional requeue operation. Enforce retry limit and clear execution fields before status becomes `pending`. Reject illegal terminal-state transitions. Test completed/failed task requeue paths.

### WR-06: Task claim ignores specified capability routing and claim result

**Classification:** WARNING  
**File:** `src/lib/db/repos/hermesRepo.js:52-55`  
**Issue:** Phase contract specifies `claimNextPendingTask(botId, capabilities)`, but function accepts only `botId` and selects every pending task. It also ignores conditional update `changes`; across adapters/processes, caller can return task it did not claim after competing write. Specialist bots can receive incompatible work.

**Fix:** Add capability argument and task requirement storage/filter. Check `changes === 1` before returning a claimed task; retry selection or return `null` when claim lost. Add two-adapter/process race test plus incompatible capability test.

### WR-07: Pheromone decay permits strengthening and invalid input

**Classification:** WARNING  
**File:** `src/lib/db/repos/swarmRepo.js:15`  
**Issue:** Negative `decayFactor` makes `strength * (1 - factor)` increase. Factors above one erase values; nonnumeric values cause database errors. Stored `decayRate` has `0..1` constraint, repository operation does not.

**Fix:** Validate finite number in inclusive range before SQL.
```js
if (!Number.isFinite(decayFactor) || decayFactor < 0 || decayFactor > 1) {
  throw new RangeError("decayFactor must be between 0 and 1");
}
```

Test `-0.1`, `1.1`, `NaN`, and string input.

### WR-08: Blackboard graph drops reverse edges and returns raw JSON

**Classification:** WARNING  
**File:** `src/lib/db/repos/blackboardRepo.js:38`  
**Issue:** `getBlackboardGraph()` joins only source entries, so link pointing at swarm entry is omitted. It returns raw `metadata` string unlike `getBlackboardLinks()`. This violates bidirectional graph and repository JSON contracts.

**Fix:** Match either endpoint and map metadata.
```js
const links = db.all(
  `SELECT DISTINCT l.* FROM blackboardLinks l
   JOIN blackboard source ON source.id = l.sourceId
   JOIN blackboard target ON target.id = l.targetId
   WHERE source.swarmId = ? OR target.swarmId = ?`,
  [swarmId, swarmId],
).map((row) => ({ ...row, metadata: parseJson(row.metadata, {}) }));
```

### WR-09: Migration does not test duplicate blackboard revision repair

**Classification:** WARNING  
**File:** `tests/unit/hermes-schema-migration.test.js:68-82`  
**Issue:** Migration mutates both `hermesTaskSteps` and `blackboardRevisions`, but test covers only steps. No test proves duplicate revision removal, revision backfill from history, or uniqueness index behavior. CR-02 can ship unnoticed.

**Fix:** Extend version-3 upgrade fixture with duplicates and assert content-retention policy, `blackboard.revision = MAX(history.revision)`, and failed duplicate insert after migration.

### WR-10: Optimistic-lock regression test is absent

**Classification:** WARNING  
**File:** `tests/unit/hermes-repositories.test.js:52-65`  
**Issue:** Test makes two sequential updates without supplying or asserting a revision token. It proves revision increments, not stale-write rejection. Current CR-01 behavior passes this test.

**Fix:** Add stale expected-revision test and assert live row plus revision audit remain unchanged after rejected second write.

---

_Reviewed: 2026-08-25T16:50:00Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: standard_
