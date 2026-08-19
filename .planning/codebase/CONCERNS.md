# Codebase Concerns

**Analysis Date:** 2026-08-19

## Tech Debt

**Dual Project & Packaging Split (Next.js App vs. Standalone CLI):**
- Issue: The repository houses both the web application gateway (`9router-app` in root) and the standalone CLI package (`9router` in `cli/`). Asset copying, standalone tracing, and dependency hoisting require custom scripts (`scripts/copy-standalone-assets.mjs`, `cli/scripts/build-cli.js`).
- Files: `package.json`, `cli/package.json`, `next.config.mjs`, `scripts/copy-standalone-assets.mjs`
- Why: Needed to distribute a lightweight single-command desktop launcher via npm while keeping the Next.js App Router for web UI.
- Impact: Modifying root dependencies or Next.js standalone tracing settings can inadvertently break the CLI packaging or omit required runtime files.
- Fix approach: Maintain continuous packaging verification tests (`tests/unit/cli-build-artifacts.test.js`).

**Backward-Compatibility Persistence Shim:**
- Issue: `src/lib/localDb.js` acts as a backward-compatibility layer re-exporting `src/lib/db/index.js`. Older references might still expect `db.json` legacy patterns.
- Files: `src/lib/localDb.js`, `src/lib/db/index.js`, `src/lib/db/driver.js`
- Why: Seamless migration from file-based JSON store to SQLite without breaking legacy callers.
- Impact: Minor cognitive overhead for new contributors discovering two database entry points.
- Fix approach: Systematically migrate remaining imports from `@/lib/localDb` to `@/lib/db/repos/*`.

## Known Issues & Test Nuances

**Incomplete Suite Pass Rate on Plain Checkout:**
- Symptoms: Running `npx vitest run` produces ~26 known failures on a fresh repository clone.
- Trigger: Missing local API credentials for live providers or referencing out-of-tree cloud worker modules (`cloud/src/handlers/embeddings.js`).
- Files: `tests/__baseline__/known-fails.txt`, `tests/unit/embeddings.cloud.test.js`, `tests/unit/xai-oauth-service.test.js`
- Workaround: Evaluate regressions using `node tests/__baseline__/verify-no-regression.mjs` rather than relying on a 100% green raw test run.
- Root cause: Integration tests interacting with cloud-only services and unmocked external OAuth endpoints.

**Lossy Double-Hop in Intermediate OpenAI Bridge:**
- Symptoms: Complex features like reasoning/thinking blocks, custom tool IDs, non-base64 image URLs, or `is_error` flags may lose metadata when translated through OpenAI intermediate format.
- Files: `open-sse/translator/index.js`, `open-sse/translator/request/`, `open-sse/translator/response/`
- Workaround: Implement direct pair translators (e.g. `claude:kiro`, `claude:gemini`) for delicate protocol pairs.
- Fix approach: Expand direct routes whenever adding support for new proprietary thinking or tool metadata schemas.

## Security Considerations

**Dynamic Root CA Generation & Interception (MITM Proxy):**
- Risk: Generating and installing a local Root CA certificate allows full HTTPS decryption for intercepted IDE tools. If the generated CA private key is compromised, it could theoretically sign forged certificates for other domains on the local machine.
- Files: `src/mitm/cert/rootCA.js`, `src/mitm/server.js`, `src/mitm/winElevated.js`
- Current mitigation: CA certificates are generated per-machine with strict file permissions in `~/.9router/mitm/ca/` and scope-restricted to configured tool hostnames.
- Recommendations: Maintain strict file access mode (0600) on generated private keys and ensure uninstallation scripts completely revoke the CA from the OS trust store.

**SSRF Protection on User-Configured Endpoints:**
- Risk: Users can configure custom OpenAI-compatible provider endpoints, custom SearXNG URLs, or proxy nodes, which could target internal localhost services.
- Files: `src/shared/utils/ssrfGuard.js`, `open-sse/handlers/search/callers.js`
- Current mitigation: `ssrfGuard.js` validates target hosts and blocks restricted local IP ranges unless explicitly whitelisted.
- Recommendations: Keep SSRF validation active on all dynamic fetch endpoints and proxy pool health checks.

## Fragile Areas

**Registry Auto-Generation:**
- Files: `open-sse/providers/registry/index.js`, `open-sse/providers/REGISTRY_TEMPLATE.js`
- Why fragile: `registry/index.js` is an auto-generated static import file. Hand-editing it will be overwritten by migration scripts, and forgetting to exclude `REGISTRY_TEMPLATE.js` breaks the build.
- Safe modification: Always run `node scripts/injectDisplayToRegistry.mjs` or `scripts/migrate-registry.mjs` after adding a provider.
- Test coverage: Verified by `tests/__baseline__/verify-providers.mjs`.

**HTTP Ingress Peer Trust Verification:**
- Files: `custom-server.js`, `src/proxy.js`, `src/lib/auth/trustedPeer.js`
- Why fragile: Real IP rate-limiting and access control depend on the custom `NINEROUTER_PEER_TOKEN` secret injected by `custom-server.js`. Running via a bare `next start` bypasses `custom-server.js`, preventing IP trust assertion.
- Safe modification: Always use `node custom-server.js` or `start.sh` in production environments.

## Scaling Limits & Performance

**In-Memory SQLite Drivers vs. Concurrency:**
- Driver: Pure-JS `sql.js` fallback writes SQLite state via full buffer serialization on change.
- Symptoms at high load: If `better-sqlite3` or `node:sqlite` is unavailable, high-frequency writes under `sql.js` can cause I/O latency spikes.
- Recommended configuration: Deploy on Node >= 22.5.0 (for built-in `node:sqlite`) or ensure build tools exist for native `better-sqlite3`.

---

*Concerns audit: 2026-08-19*
*Update as issues are fixed or new ones discovered*
