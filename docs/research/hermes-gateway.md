# Hermes Gateway: architecture, setup, API, security, limits, and usage

- Status: complete
- Scope: Official Hermes Agent messaging gateway and OpenAI-compatible API server; installation, configuration, runtime flow, CLI/API surface, security controls, limits, examples, and 9router integration points.
- Date: 2026-08-22

## Executive findings

- Hermes Gateway is a long-running adapter process for 20+ messaging platforms. Each adapter receives a message, maps it to a per-chat session, dispatches an `AIAgent`, and delivers the result; the same process also runs a cron scheduler that checks due jobs every 60 seconds. [6], sections “Architecture Overview” and “Message Flow”
- The API Server is one gateway adapter, not a pure LLM proxy: requests execute a full Hermes agent with terminal, file, web, memory, and skill capabilities on the API-server host. [4], “Quick Start” and “Authentication”; [4], “Architecture”
- API Server is disabled by default, listens on `127.0.0.1:8642` by default, and requires a bearer key even on loopback. [4], “Configuration” and “Authentication”
- Core HTTP surfaces include OpenAI-compatible `/v1/chat/completions`, `/v1/responses`, `/v1/models`, `/v1/capabilities`, health endpoints, a long-running `/v1/runs` API with SSE events and stop/approval controls, REST sessions, jobs, skills, and toolset discovery. [4], “Endpoints”, “Runs API”, “Jobs API”, “Sessions API”, and “Skills and toolsets discovery”; upstream adapter source lists the route contract in its module docstring. [9]
- Messaging authorization defaults fail-closed: users must match an allowlist or complete DM pairing. API Server authentication is independent and uses `Authorization: Bearer <API_SERVER_KEY>`. [3], “Security”; [4], “Authentication”
- Main documented operational limits: API request body 10 MB, stored Responses records 100 with LRU eviction, default API concurrent-run cap 10, webhook rate limit 30 requests/minute per route, webhook body limit 1 MB, webhook delivery-id deduplication for 1 hour, and webhook SSE event-buffer expiry after 5 minutes. [9], module constants; [4], “Concurrent-run cap” and “Limitations”.
- 9router has a first-party Hermes Agent custom-tool integration: it detects/install-checks Hermes, writes a custom OpenAI-compatible endpoint configuration, and recognizes Hermes/Ollama image and attachment shapes for vision routing. [cliTools.js:153-160](../../src/shared/constants/cliTools.js); [HermesToolCard.js:10-18,85-128,168-179](../../src/app/(dashboard)/dashboard/cli-tools/components/HermesToolCard.js); [combo.js:144-180](../../open-sse/services/combo.js)

## Evidence

### Codebase

- 9router labels Hermes as `Hermes Agent`, describes it as a Nous Research self-improving agent, and treats it as a `custom` configuration target. [cliTools.js:153-160](../../src/shared/constants/cliTools.js)
- The dashboard calls `/api/cli-tools/hermes-settings` to inspect, apply, and reset local Hermes settings. The apply payload contains `baseUrl`, `apiKey`, and `model`; the manual configuration view emits `~/.hermes/config.yaml` plus `~/.hermes/.env`. [HermesToolCard.js:10-18,85-128,143-179](../../src/app/(dashboard)/dashboard/cli-tools/components/HermesToolCard.js)
- 9router's combo modality detector recognizes Hermes/Ollama `images[]`, Hermes attachments, message-level image/audio fields, and inline image/audio/PDF data URIs. [combo.js:144-180](../../open-sse/services/combo.js)
- The repository changelog records the Hermes vision-shape support and a Hermes YAML `api_key` configuration addition. [CHANGELOG.md:38-41,64-65](../../CHANGELOG.md)
- Project rules define 9router itself as an OpenAI-compatible routing gateway and state that the repository exposes `/v1/*`; this is context for why the Hermes integration uses a custom OpenAI-compatible base URL. [CLAUDE.md:5-13](../../CLAUDE.md)

### Data

- No local Hermes installation, gateway process, credentials, or runtime logs were inspected. Findings about Hermes runtime behavior come from official Hermes documentation and upstream source, not a local process test.
- Repository read-only checks: `git status --short --branch` returned `## master...origin/master [ahead 22]`; no working-tree changes were present.

### Internet / primary sources

- Official installation supports a desktop installer on macOS/Windows, a shell installer on Linux/macOS/WSL2/Termux, and a PowerShell installer on native Windows. The installer provisions dependencies, repository, virtual environment, launcher, and provider setup. [1], “Quick Install” and “What the Installer Does”
- Official quickstart recommends `hermes setup`, `hermes model`, and `hermes gateway setup`; it states that Hermes requires a model context window of at least 64,000 tokens. [2], “The fastest path”, “Install Hermes Agent”, “Choose a Provider”, and “Minimum context: 64K tokens”
- Official CLI reference defines gateway lifecycle commands (`hermes gateway run|install|start|stop|restart|status|setup`), API/proxy commands, profiles, webhooks, cron, and session management. [7]
- Official configuration guidance separates secrets in `~/.hermes/.env` from non-secret settings in `~/.hermes/config.yaml`, with `hermes config set` as the supported writer. [8]; [2], “How settings are stored”
- Official Gateway Internals documents `GatewayRunner`, `SessionStore`, delivery, pairing, adapter registry, platform adapters, token locks, hooks, and profile-scoped process management. [6]

## Flow or data model

### Messaging gateway flow

1. A platform adapter receives an inbound `MessageEvent`.
2. Gateway authorization checks platform-specific allowlists, global allowlists, or pairing state.
3. Gateway derives a session key from platform, chat type, chat ID, and optional thread context; the docs give the shape `agent:main:{platform}:{chat_type}:{chat_id}` and warn not to construct it manually.
4. `GatewayRunner` handles slash commands and normal messages. Active-session guards can queue/interrupt new messages; control commands such as `/stop`, `/approve`, and `/deny` receive special handling.
5. The runner creates or resumes an `AIAgent`; tool calls execute using the gateway host's configured tool backends.
6. The response travels through `gateway/delivery.py` to the originating or configured destination. Cron deliveries use separate cron sessions and are not mirrored into ordinary gateway history.

Evidence: [6], “Architecture Overview”, “Message Flow”, “Two-Level Message Guard”, “Delivery Path”, and “Process Management”.

### API Server request flow

1. Client sends a bearer-authenticated request to `http://<host>:8642/v1` by default.
2. API adapter authenticates the key, resolves the profile (including optional `/p/<profile>/` multiplexing), and parses OpenAI Chat Completions, Responses, session, or Runs input.
3. Hermes creates an agent runtime on the API-server host. A remote client does not execute terminal/file/browser tools locally.
4. The agent runs tools and provider calls. Streaming clients receive OpenAI SSE or Runs SSE lifecycle events.
5. The API returns the final response, usage metadata, run status, or persisted session data.

Evidence: [4], “Endpoints”, “Runs API”, “Sessions API”, and “Authentication”; [4], “Architecture” and “How It Works”.

### Configuration/data boundaries

- `$HERMES_HOME` defaults to `~/.hermes`; profiles use isolated subdirectories.
- `.env` holds API keys, bot tokens, OAuth secrets, and API-server key material.
- `config.yaml` holds model, tool, display, gateway, and other behavior settings.
- API Server model advertisement is intentionally minimal: `/v1/models` exposes the configured agent model name, not every provider/model combination. Hermes-aware clients can use `/api/model/options` for richer provider/model metadata.

Evidence: [8]; [4], “GET /v1/models”, “GET /api/model/options”, and “Configuration”.

## Installation and configuration

### CLI-only install

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc   # or source ~/.zshrc
hermes setup
hermes model
hermes doctor
```

Native Windows uses:

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

The official installer supports Linux, macOS, WSL2, Termux, and native Windows. Review installer source and platform-specific prerequisites before unattended production use. [1]

### Messaging gateway

```bash
hermes gateway setup       # interactive platform setup
hermes gateway run         # foreground
hermes gateway install     # user service / launchd
hermes gateway start
hermes gateway status
```

Linux systemd user service example:

```bash
hermes gateway install
hermes gateway start
journalctl --user -u hermes-gateway -f
sudo loginctl enable-linger "$USER"  # keep user service alive after logout
```

Use `hermes gateway install --system` only when a system service is intentional. Official docs warn against running ambiguous user and system units together. [3], “Gateway Commands” and “Service Management”.

### OpenAI-compatible API Server

Recommended local setup:

```bash
hermes config set API_SERVER_ENABLED true
hermes config set API_SERVER_KEY 'replace-with-a-long-random-secret'
hermes gateway

curl -s http://127.0.0.1:8642/health
curl -s \
  -H 'Authorization: Bearer replace-with-a-long-random-secret' \
  http://127.0.0.1:8642/v1/models

curl -s -X POST http://127.0.0.1:8642/v1/chat/completions \
  -H 'Authorization: Bearer replace-with-a-long-random-secret' \
  -H 'Content-Type: application/json' \
  -d '{"model":"hermes-agent","messages":[{"role":"user","content":"Hello"}]}'
```

Equivalent API-server settings can be placed in `gateway.api_server` in `config.yaml`; environment variables take precedence. Defaults: `API_SERVER_ENABLED=false`, `API_SERVER_PORT=8642`, `API_SERVER_HOST=127.0.0.1`, `API_SERVER_KEY` required. [4], “Quick Start” and “Configuration”.

### Webhook trigger

```bash
hermes gateway setup
hermes webhook subscribe github-prs \
  --events "pull_request" \
  --prompt "Review PR #{pull_request.number}: {pull_request.title}" \
  --skills "github-code-review" \
  --deliver github_comment
hermes webhook list
hermes webhook test github-prs
curl http://localhost:8644/health
```

Webhook routes require a secret. GitHub HMAC signatures and GitLab token headers are validated; route payload text remains untrusted agent input. [5], “Setup”, “Configuring Routes”, “Security”, and “Authenticated does not mean trusted”.

## API and CLI surface

### CLI

- `hermes gateway run|install|start|stop|restart|status|setup`: lifecycle and setup.
- `hermes config show|get|set|unset|check|migrate`: configuration management.
- `hermes model`, `hermes auth`, `hermes fallback`: provider/model and credential management.
- `hermes webhook subscribe|list|remove|test`: dynamic webhook subscriptions.
- `hermes cron list|create|edit|pause|resume|run|remove|status`: durable schedules.
- `hermes sessions list|browse|rename|delete|export|prune|stats`: session operations.
- `hermes profile create|list|use|show|delete`: isolated configurations and gateway instances.
- `hermes proxy`: local OpenAI-compatible proxy using OAuth provider credentials.

Evidence: [7]; [5]; [7] (the cron docs are linked from the official CLI reference).

### HTTP

| Surface | Purpose |
| --- | --- |
| `GET /health`, `GET /v1/health` | Cheap liveness check |
| `GET /health/detailed` | Authenticated readiness/status counts |
| `GET /v1/models` | Minimal OpenAI model discovery |
| `GET /v1/capabilities` | Feature/capability discovery |
| `POST /v1/chat/completions` | OpenAI Chat Completions |
| `POST /v1/responses` | OpenAI Responses API; response chaining |
| `GET/DELETE /v1/responses/{id}` | Stored response access |
| `POST /v1/runs` | Start asynchronous agent run; returns `run_id` |
| `GET /v1/runs/{id}` | Poll run status |
| `GET /v1/runs/{id}/events` | SSE tool/token/lifecycle events |
| `POST /v1/runs/{id}/approval` | Resolve pending approval |
| `POST /v1/runs/{id}/stop` | Request interruption |
| `/api/sessions/*` | Session CRUD, history, fork, synchronous/SSE chat |
| `/api/jobs/*` | Scheduled job CRUD and immediate run |
| `GET /v1/skills`, `GET /v1/toolsets` | Capability discovery |

Evidence: [4] and [9].

## Security controls

- **API authentication:** bearer token required for API Server, including loopback deployments. Keep `API_SERVER_KEY` in `.env`; do not place secrets in committed YAML.
- **Network exposure:** default bind is loopback. If binding publicly or on a LAN, put TLS/authentication and network policy in front; official docs do not describe built-in TLS termination for API Server.
- **Browser access:** CORS is disabled by default. If direct browser calls are needed, set a narrow explicit `API_SERVER_CORS_ORIGINS` list; server-to-server Open WebUI does not need CORS.
- **Profile isolation:** with `gateway.multiplex_profiles`, `/p/<profile>/...` routes to profiles and authentication is bound to the target profile key; reusing the default key for a named profile returns `401`.
- **Messaging authorization:** allowlists or DM pairing are required by default; `GATEWAY_ALLOW_ALL_USERS=true` is explicitly discouraged for bots with terminal access. Pairing codes expire after one hour and are rate-limited.
- **Webhook authenticity:** every route needs a secret; HMAC authenticates the sender, not the business content. Treat PR titles, commit messages, issue bodies, web pages, files, and tool output as untrusted input. `INSECURE_NO_AUTH` is for loopback testing only and is refused on non-loopback binds.
- **Response headers:** official API docs list `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`; upstream source additionally defines CSP, frame-deny, permissions policy, HSTS, and `X-XSS-Protection: 0` in its security-header map. Verify deployed behavior before relying on every header.
- **Tool authority:** API Server exposes terminal and file capabilities. Treat the API key as remote code-execution authority over the server host; isolate the host, restrict network access, use least-privilege OS accounts, and avoid public exposure without a trusted access layer.

Evidence: [4], “Authentication”, “CORS”, “Security Headers”, and “Multi-profile routing”; [3], “Security”; [5], “Security” and “Authenticated does not mean trusted”.

## Limits and operational constraints

| Area | Documented behavior |
| --- | --- |
| Model context | Minimum 64,000-token context recommended/required by quickstart |
| API request body | 10,000,000 bytes in upstream API adapter constant |
| Stored Responses | Maximum 100, LRU eviction |
| API concurrent runs | Default 10; `0` disables; negative values clamp to 0; excess starts return HTTP 429 |
| Normalized text | 65,536 characters in upstream adapter constant |
| Content array | 1,000 items in upstream adapter constant |
| Responses history | Auto-truncation history limit 100 in upstream adapter constant |
| Webhook route rate | 30 requests/minute fixed window by default |
| Webhook body | 1 MB default; configurable |
| Webhook deduplication | Delivery IDs retained for 1 hour |
| Runs SSE buffers | Unconsumed buffers expire after 5 minutes; active runs remain tracked |
| Inline content | Inline images supported; uploaded files (`file`, `input_file`, `file_id`) and non-image documents are unsupported through API Server |

Evidence: [2], “Minimum context: 64K tokens”; [4], “Limitations” and “Concurrent-run cap”; [9], module constants.

## Implications for 9router integration

- Use 9router's Hermes custom-tool configuration path when a user wants Hermes to call 9router's OpenAI-compatible `/v1` endpoint. The dashboard already emits `base_url` plus an API key and selected model into Hermes config files. [HermesToolCard.js:100-179](../../src/app/(dashboard)/dashboard/cli-tools/components/HermesToolCard.js)
- Keep the API-server distinction clear: pointing a frontend at Hermes makes Hermes the agent runtime, while pointing Hermes at 9router makes 9router the upstream model-routing endpoint. They can be chained, but tool execution occurs at whichever Hermes API-server host owns the agent process. [4]; [4]
- Preserve multimodal compatibility. 9router already detects Hermes image arrays and attachments; regressions here can prevent the vision adapter from activating. [combo.js:144-180](../../open-sse/services/combo.js)
- Do not assume Hermes `/v1/models` is a full provider catalog. If a UI needs provider/model metadata, Hermes documents `/api/model/options`; 9router's model selection should not infer all Hermes capabilities from `/v1/models` alone. [4], “GET /v1/models” and “GET /api/model/options”

## Risks and unknowns

- The public docs and upstream source are live and release-sensitive. Exact endpoint details, defaults, plugin names, and security headers can change; re-check the pinned Hermes version before implementation or deployment.
- No local Hermes runtime was started, so this artifact does not verify installed-version behavior, actual bind/listener state, auth responses, or provider credentials.
- The API docs list two security headers while the current upstream source defines a larger map. This may reflect docs lag or middleware conditionality; verify with an actual deployed `curl -I` request.
- The official install command is a remote shell/PowerShell bootstrap. Review or pin installer source for controlled production environments; no checksum/signature verification procedure was found in the retrieved installation page.
- “20+ platforms” is a documented count, not a stable API guarantee; plugins and platform availability vary by release and optional dependencies.
- API Server has broad tool authority. Documentation explains capability exposure but does not provide a complete threat model for hostile multi-tenant users; assume one API key grants the agent's configured tools unless separately constrained.
- The public API docs describe unsupported uploaded files and non-image documents, but 9router's own modality detector recognizes PDF-shaped input. These are different boundaries: detector routing does not prove Hermes API Server accepts a given payload.

## Implications for implementation

- Pin Hermes version and test the exact API contract (`/health`, `/v1/models`, `/v1/chat/completions`, streaming, `401`, `429`) before shipping an integration.
- Store Hermes secrets only through `hermes config set` or the profile `.env`; never generate committed secrets or expose them in dashboard logs.
- Default integrations to loopback or a private network. Require explicit operator action for non-loopback binds, narrow CORS, reverse-proxy TLS, and profile-specific keys.
- Model API Server as remote code execution over the host. Use a dedicated OS account/container, least-privilege filesystem, egress controls, and monitoring.
- Handle `429 Too Many Concurrent Runs` with bounded exponential backoff. For webhook senders, honor `429` and idempotency behavior to avoid duplicate runs.
- Use `/v1/capabilities` before relying on Runs, approvals, stop, session continuity, or toolset discovery; avoid private Python imports in integrations.
- Keep `/v1/models` handling compatible with Hermes' intentionally minimal model advertisement; use richer Hermes endpoints only when the client is Hermes-aware.

## Sources

[1] https://hermes-agent.nousresearch.com/docs/getting-started/installation
[2] https://hermes-agent.nousresearch.com/docs/getting-started/quickstart
[3] https://hermes-agent.nousresearch.com/docs/user-guide/messaging
[4] https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
[5] https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks
[6] https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-internals
[7] https://hermes-agent.nousresearch.com/docs/reference/cli-commands
[8] https://hermes-agent.nousresearch.com/docs/reference/environment-variables
[9] https://github.com/NousResearch/hermes-agent/blob/main/gateway/platforms/api_server.py
