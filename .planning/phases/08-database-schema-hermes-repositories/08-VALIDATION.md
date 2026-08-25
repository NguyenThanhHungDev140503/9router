---
phase: 08
slug: database-schema-hermes-repositories
status: partial
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-25
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `tests/vitest.config.js` |
| **Quick run command** | `npm --prefix tests test unit/hermes-schema-migration.test.js unit/hermes-repositories.test.js unit/db-migration-chain.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2 seconds focused |

---

## Sampling Rate

- **After every task commit:** Run focused command.
- **After every plan wave:** Run `npm test`.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 30 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | HERMES-01 | — | Version 3 DB upgrade adds integrity schema without losing blackboard data | integration | focused command | ✅ | ✅ green |
| 08-01-01 | 01 | 1 | HERMES-03 | — | Hermes schema constraints and indexes exist | unit | focused command | ✅ | ✅ green |
| 08-01-01 | 01 | 1 | SWARM-01 | — | Swarm session and membership schema exists | unit | focused command | ✅ | ✅ green |
| 08-01-01 | 01 | 1 | SWARM-02 | — | Pheromone schema and decay storage exist | unit | focused command | ✅ | ✅ green |
| 08-01-01 | 01 | 1 | SWARM-03 | — | Colony iteration and convergence schema exists | unit | focused command | ✅ | ✅ green |
| 08-01-01 | 01 | 1 | MEMORY-01 | — | Blackboard schema, revisions, and optimistic-lock field exist | unit | focused command | ✅ | ✅ green |
| 08-01-01 | 01 | 1 | MEMORY-02 | — | Blackboard-link schema supports both endpoints | unit | focused command | ✅ | ⚠️ red |
| 08-02-01 | 02 | 2 | HERMES-01 | — | Bot and task CRUD serialize JSON correctly | unit | focused command | ✅ | ✅ green |
| 08-02-01 | 02 | 2 | HERMES-02 | — | Failed-task error returns structured JSON payload | unit | focused command | ✅ | ⚠️ red |
| 08-02-01 | 02 | 2 | HERMES-03 | — | Task steps are ordered and unique per task | unit | focused command | ✅ | ✅ green |
| 08-02-02 | 02 | 2 | SWARM-01 | — | Swarm membership lifecycle persists | unit | focused command | ✅ | ✅ green |
| 08-02-02 | 02 | 2 | SWARM-02 | — | Pheromone deposit and decay persist | unit | focused command | ✅ | ✅ green |
| 08-02-02 | 02 | 2 | SWARM-03 | — | Iterations and convergence metadata round-trip | unit | focused command | ✅ | ✅ green |
| 08-02-03 | 02 | 2 | MEMORY-01 | — | Blackboard stale writes reject by expected revision | unit | focused command | ✅ | ✅ green |
| 08-02-03 | 02 | 2 | MEMORY-02 | — | Graph links return parsed JSON metadata from both endpoints | unit | focused command | ✅ | ⚠️ red |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing Vitest infrastructure covers all Phase 8 requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Failed-task error JSON round-trip | HERMES-02 | Automated test fails: `mapRow()` leaves `error` serialized | Fix `src/lib/db/repos/hermesRepo.js`, then run focused command |
| Bidirectional blackboard graph JSON contract | MEMORY-02 | Automated test fails: graph returns raw link `metadata` and excludes reverse endpoint edges | Fix `src/lib/db/repos/blackboardRepo.js`, then run focused command |
| Pre-schema backup across all tables | — | Upgrade test logs `no such table: bak.swarmSessions`; migration still succeeds | Inspect `backupDbLite()` attach/copy behavior against every current schema table |

---

## Validation Audit 2026-08-25

| Metric | Count |
|--------|-------|
| Gaps found | 5 |
| Resolved | 3 |
| Escalated | 2 |

---

## Validation Sign-Off

- [x] All tasks have automated verification or explicit escalation.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all MISSING references.
- [x] No watch-mode flags.
- [x] Feedback latency < 30 seconds.
- [ ] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending implementation fixes for HERMES-02 and MEMORY-02.
