---
phase: 03
slug: format-aware-inbound-injection
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-22
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| SQLite MCP cache → request injector | External MCP tool names, descriptions, and schemas are rendered into client-native tool definitions. | Cached tool metadata and JSON Schema |
| Client request/header → selection and merge | Client tools, prompts, and `x-mcp-servers` influence only request-local selection. | Request body, client tools, header value |
| Cached skills → upstream model | Enabled skill names and prompts are appended to client-owned system instructions. | Skill metadata and system prompt text |
| Pipeline → `chatCore`/translator | Injection transforms body before translation while preserving fail-open request handling. | Request body and sanitized diagnostics |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Spoofing | `namespaceToolName` | mitigate | NFKC-normalize and sanitize server/tool segments; reject empty names; skip collisions with client and generated names. Evidence: `injector.js`, format-injector collision tests. | closed |
| T-03-02 | Tampering | Schema minifier and registry | mitigate | Deep-copy/minify cached schemas, preserve source body/cache, route Antigravity through `OpenAiInjector`, reserve Gemini shape for Gemini. Evidence: `injector.js`, `mcp-format-injector.test.js`. | closed |
| T-03-03 | Information Disclosure | Diagnostics | mitigate | Injection boundary logs fixed reason plus row counts only; catch blocks do not pass error, prompt, schema, or header values. Evidence: `inboundInjectionPipeline.js`, sanitized-log test. | closed |
| T-03-04 | Denial of Service | Conversion loop | mitigate | Malformed candidates skipped; zero candidates keep identity; selection applies config-owned 30-tool cap. Evidence: `injector.js`, `inboundSelection.js`. | closed |
| T-03-05 | Elevation of Privilege | `x-mcp-servers` parser | mitigate | Header parses as restrictive allow-list and intersects enabled repository server IDs; unknown/disabled entries cannot activate. Evidence: `inboundSelection.js`, header restriction test. | closed |
| T-03-06 | Denial of Service | `selectInboundMcp` | mitigate | Imports `MAX_INJECTED_TOOLS` only from `mcpConstants.js`; malformed input returns empty selection; unmatched `auto` selects no tools. Evidence: `inboundSelection.js`, cap/no-match tests. | closed |
| T-03-07 | Tampering | XML skill prompt | mitigate | Escapes skill-name XML attributes, uses copy-on-write, and detects exact gateway marker before appending. Client-owned unmarked XML remains untouched. Evidence: `skillPromptInjector.js`, retry/XML tests. | closed |
| T-03-08 | Information Disclosure | Diagnostics | mitigate | Selector returns finite reason codes; pipeline diagnostics contain reason and counts only. Evidence: `mcpConstants.js`, `inboundInjectionPipeline.js`. | closed |
| T-03-09 | Tampering | `handleChatCore` injection call | mitigate | One pipeline call occurs after source-format detection/bypass and before translation; native injection helpers retain collision protection. Evidence: `chatCore.js`, ordering test. | closed |
| T-03-10 | Elevation of Privilege | `x-mcp-servers` flow | mitigate | `chatCore` forwards request header only into restrictive selection; pipeline reads enabled records and has no execution imports/calls. Evidence: `chatCore.js`, `inboundInjectionPipeline.js`. | closed |
| T-03-11 | Denial of Service | Pipeline failures | mitigate | Repository and composition failures return exact original body; selection cap remains 30. Evidence: `inboundInjectionPipeline.js`, fail-open tests. | closed |
| T-03-12 | Information Disclosure | Fail-open diagnostics | mitigate | Failure logger receives `invalid-input` and aggregate counts; tests prohibit raw schema, header token, user prompt, and skill prompt in logged data. | closed |
| T-03-13 | Tampering | `applyInboundInjection` retry/re-entry | mitigate | Injectors and prompt helper copy on write; duplicate generated names and gateway-marked skill block are skipped. Evidence: pipeline retry tests. | closed |
| T-03-SC | Tampering | Package installs | accept | Phase introduced no package install or dependency-file change; accepted as no applicable supply-chain surface. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-SC | No package installation or dependency change in Phase 03; no new supply-chain surface to mitigate. | Phase plan | 2026-08-22 |

---

## Security Audit 2026-08-22

| Metric | Count |
|--------|-------|
| Threats found | 14 |
| Closed | 14 |
| Open | 0 |

Verification evidence:

- `cd tests && npm test -- unit/mcp-*.test.js` passed: 10 files, 76 tests.
- Confirmed no `McpProcessManager`, `McpClient`, `callServerTool`, or `callTool` use in Phase 03 inbound injection path.
- No Phase 04 execution behavior introduced by inspected Phase 03 implementation.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-22 | 14 | 14 | 0 | `gsd-secure-phase` |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-22
