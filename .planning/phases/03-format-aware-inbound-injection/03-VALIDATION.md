---
phase: 03
slug: format-aware-inbound-injection
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-23
---

# Phase 3 — Validation Strategy

> Retroactive Nyquist audit. Focused Phase 3 coverage passes; unrelated full-suite failures remain outside this phase.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 |
| **Config file** | `tests/vitest.config.js` |
| **Quick run command** | `npm --prefix tests test -- unit/mcp-format-injector.test.js unit/mcp-inbound-selection.test.js unit/mcp-skill-prompt-injector.test.js unit/mcp-chat-core-injection.test.js` |
| **Full suite command** | `npm --prefix tests test` |
| **Estimated runtime** | ~2 seconds focused |

---

## Sampling Rate

- **After every task commit:** Run focused Phase 3 command above.
- **After every plan wave:** Run relevant Phase 3 MCP suite.
- **Before `$gsd-verify-work`:** Run full suite; triage unrelated pre-existing failures separately.
- **Max feedback latency:** 5 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | MCP-INJECT-01..03 | T-03-01..04 | Provider-native conversion and deterministic namespacing | unit | `npm --prefix tests test -- unit/mcp-format-injector.test.js` | ✅ | ✅ green |
| 03-01-02 | 01 | 1 | MCP-INJECT-01..03 | T-03-01..04 | Copy-on-write merge preserves client tools; malformed schemas fail safe | unit | `npm --prefix tests test -- unit/mcp-format-injector.test.js` | ✅ | ✅ green |
| 03-01-03 | 01 | 1 | MCP-INJECT-01..03 | T-03-01..04 | Schema metadata stripped without mutation, collisions skipped | unit | `npm --prefix tests test -- unit/mcp-format-injector.test.js` | ✅ | ✅ green |
| 03-02-01 | 02 | 1 | MCP-INJECT-04 | T-03-01..04 | Activation modes, lexical matching, header allow-list, cap | unit | `npm --prefix tests test -- unit/mcp-inbound-selection.test.js` | ✅ | ✅ green |
| 03-02-02 | 02 | 1 | MCP-INJECT-04 | T-03-01..04 | Disabled or unknown servers cannot become injection targets | unit | `npm --prefix tests test -- unit/mcp-inbound-selection.test.js` | ✅ | ✅ green |
| 03-02-03 | 02 | 1 | MCP-INJECT-04 | T-03-02..03 | XML skill block uses native placement and retry idempotency | unit | `npm --prefix tests test -- unit/mcp-skill-prompt-injector.test.js` | ✅ | ✅ green |
| 03-03-01 | 03 | 2 | MCP-INJECT-01..04 | T-03-01..04 | Pipeline composes native tools and skills across four request formats | integration | `npm --prefix tests test -- unit/mcp-chat-core-injection.test.js` | ✅ | ✅ green |
| 03-03-02 | 03 | 2 | MCP-INJECT-01..04 | T-03-03..04 | Header restriction, collision ownership, immutable retry behavior | integration | `npm --prefix tests test -- unit/mcp-chat-core-injection.test.js` | ✅ | ✅ green |
| 03-03-03 | 03 | 2 | MCP-INJECT-01..04 | T-03-03..04 | Fail-open logs only counts/reason; original body reaches translation on injector error | integration | `npm --prefix tests test -- unit/mcp-chat-core-injection.test.js` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing Vitest infrastructure covers all Phase 3 requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Audit 2026-08-23

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Focused audit command passed: 4 files, 41 tests.

---

## Validation Sign-Off

- [x] All tasks have automated verification.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all MISSING references.
- [x] No watch-mode flags.
- [x] Focused feedback latency < 5 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-08-23
