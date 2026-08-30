# Hermes infrastructure bổ sung: multi-connection, peer, API và remote topology

- Status: complete
- Scope: Tài liệu Hermes Agent hiện tại về Desktop multi-connection, Bot Mode/bot-to-bot, `hermes peer`, profiles, API Server, `hermes serve`, remote gateway, proxy mode, network/Tailscale, TLS/auth, capability discovery, health/run tracking, webhooks, limits và observability. Đối chiếu với artifact nền [`hermes-gateway.md`](./hermes-gateway.md).
- Date: 2026-08-22

## Executive findings

- Hermes có ba lớp cần tách rõ: **Desktop connection** tới backend `hermes serve`/Dashboard; **API Server** OpenAI-compatible cho agent, sessions, runs và health; **messaging gateway** kết nối Telegram/Discord/Matrix/... Hai process `hermes serve` và messaging gateway có thể cùng chạy nhưng không phải một service.[1][2][3]
- Desktop hỗ trợ registry nhiều gateway: local runtime, remote LAN/VPS/SSH và cloud; mỗi connection có backend/WebSocket riêng, chạy nền vẫn tiếp tục stream. Profile và gateway là hai chiều độc lập: profile chọn agent state; gateway chọn backend/machine.[4][5]
- Profile là boundary state, không phải network sandbox. Mỗi profile có `config.yaml`, `.env`, sessions, memory, skills, cron và gateway state riêng; không được chạy hai agent process cùng `HERMES_HOME`. Trên host, tool subprocess mặc định vẫn dùng OS `HOME`, nên CLI credentials ngoài Hermes có thể bị dùng chung giữa profiles; `home_mode: profile` mới cô lập HOME.[6][7]
- Bot Mode không tạo primitive mới: Bot chính là Hermes profile, có canonical **Bot Chat**. Local bot-to-bot dùng profile CLI; cross-machine dùng `hermes peer`, target `<peer>` hoặc `<peer>/<agent>`. Peer machine phải chạy API Server, có `API_SERVER_KEY` mạnh; roster được đưa vào Bot Mode protocol để agent discovery.[8][9]
- API Server không chỉ là `/v1/chat/completions`: source hiện tại công bố `/v1/responses`, sessions CRUD/fork/chat, `/v1/runs` + run status/events/approval/steer/stop, `/v1/capabilities`, `/health`, `/health/detailed`. Đây là control/data plane phù hợp cho orchestrator, nhưng endpoint key và profile routing phải quản trị riêng.[10][11]
- API Server mặc định bind loopback; mở network cần `API_SERVER_HOST`, `API_SERVER_KEY` và CORS allowlist nếu browser gọi trực tiếp. `GET /health` là liveness rẻ, không chạy readiness; `/health/detailed` mới dùng cho status/readiness. API server có `max_concurrent_runs` mặc định 10; `0` tắt giới hạn.[12][13]
- API Server configuration reference và multi-profile source docs là nguồn GitHub chính thức bổ sung cho env/config và profile routing.[14][15]
- Multi-profile API routing dùng `/p/<profile>/...`; key được bind theo profile. Key của default profile không còn hợp lệ trên named profile prefix. Webhook route profile cũng phải bind profile và dùng secret đúng prefix.[16]
- Proxy mode có hai nghĩa, không được trộn: `hermes proxy` là local raw-model OAuth subscription proxy, không có tool loop; `GATEWAY_PROXY_URL` là platform-adapter proxy, gateway mỏng chuyển message tới API Server/agent ở host khác.[8][18]
- Tailscale là topology được docs khuyến nghị cho remote Desktop/backend username-password: bind backend vào Tailscale IP, chỉ cho tailnet truy cập; không expose password backend trực tiếp Internet. Với public Internet, docs ưu tiên OAuth provider. Reverse proxy path prefix được hỗ trợ cho remote Dashboard, nhưng TLS termination/reverse-proxy header policy cần triển khai bên ngoài Hermes; chưa có tài liệu chính thức chứng minh Hermes tự quản lý Nginx/Caddy certificates.[5]
- Webhook có HMAC route secret, event/filter/script/payload controls, idempotency cho delivery IDs, body limit 1 MB mặc định và rate limit 30 request/phút/route mặc định. `deliver_only` tránh LLM run khi chỉ cần notification. HMAC xác thực sender, không biến payload business thành trusted input; webhook route mặc định toolset hạn chế.[6][10]
- Relay là connector experimental, không phải API Server hay peer. Gateway dial-out WebSocket tới connector, nhận capability descriptor/`supported_ops`, không giữ platform credentials; wire contract và auth có thể đổi không deprecation cycle.[7]
- Hermes docs tuyên bố không telemetry/usage analytics tập trung; dữ liệu session/memory/skills lưu local. Observability thực dụng hiện là logs, `hermes status`, `hermes doctor`, `hermes dump`, `hermes logs`, `/health/detailed`, run events/SSE và optional Langfuse plugin.[3][10][11]

## Evidence

### Codebase / artifact nền

- Artifact nền đã mô tả Gateway là process messaging lâu dài, session routing, pairing, delivery, webhook/API adapters, service lifecycle và security baseline. Báo cáo này bổ sung các thay đổi/chi tiết hiện tại của docs mà artifact nền chưa bao phủ.[Artifact nền](./hermes-gateway.md)
- Không sửa product source 9Router. Nguồn code Hermes dùng trong nghiên cứu là upstream repository; endpoint inventory được lấy từ `gateway/platforms/api_server.py`, không suy đoán từ tên CLI.[10]

### Internet / primary sources

#### 1. Desktop, connections, profiles

- Desktop dùng cùng agent core/config/API keys/sessions/skills/memory với CLI và gateway; desktop mặc định tự chạy local backend, nhưng có thể connect `hermes serve` remote. Remote connection cấu hình theo profile.[5]
- Multi-connection Desktop đăng ký local, remote LAN/VPS/SSH và cloud trong một registry; connection persist và mỗi backend/WebSocket độc lập. Khi nhiều gateway, UI có gateway selector riêng với profile selector riêng; không biến backend thành profile.[4][15][17]
- Profile là directory/home riêng. Docs cảnh báo không chạy hai process trên cùng Hermes home vì memory/session writes chồng nhau. Profile không sandbox filesystem; local terminal vẫn có quyền OS user.[6]
- Mỗi profile gateway có process/service riêng, bot token riêng; token locks chặn hai profiles dùng cùng token trên platform được hỗ trợ. Dùng systemd/launchd per-profile; Docker official image dùng s6-overlay per-profile supervision.[6][16]
- Docs cho phép một multiplexing gateway phục vụ nhiều profile trên một inbound process, phù hợp host/container nhiều profile nhưng thay đổi failure domain và access-control model so với one-process-per-profile. Cần xác nhận chi tiết config của release đang deploy trước khi chọn mô hình.[16][19]

#### 2. Bot-to-bot và peer

- Bot Mode map 1:1 Bot ↔ profile; canonical Bot Chat được tạo/pin khi Bot sinh ra. CLI `hermes -p <bot> chat` dùng cùng state.[8]
- `hermes peer add <name> --url <URL> [--key <KEY>]` lưu URL trong `config.yaml` (`bot_peers`), key trong profile `.env` dưới biến `HERMES_PEER_<NAME>_KEY`; `hermes peer dm <peer>[/<agent>]` gọi Bot Chat remote và in reply.[9][10]
- Peer target named profile qua `/p/<profile>/` mirror. Cross-machine Bot Mode tự nhận roster khi peer đã đăng ký; không cần SOUL edit thủ công.[9]
- Peer trust boundary là API Server bearer key + network reachability. Docs yêu cầu peer machine chạy `api_server` và key mạnh; LAN/Tailscale/VPN là trách nhiệm topology, không phải transport encryption do peer tự cung cấp.[8]

#### 3. API Server, capability discovery, runs và health

- API Server là OpenAI-compatible agent backend, chạy full toolset/memory/skills; docs quick start dùng `API_SERVER_ENABLED=true`, `API_SERVER_KEY`, optional `API_SERVER_CORS_ORIGINS`.[3]
- Endpoint hiện tại trong source: `/v1/chat/completions`, `/v1/responses`, response retrieval/deletion, `/v1/models`, `/v1/capabilities`, sessions API, `/v1/runs` asynchronous start, run status/events/approval/steer/stop, `/health`, `/health/detailed`. `POST /v1/runs` trả `202` + `run_id`; events là SSE.[10]
- `/v1/capabilities` là capability discovery machine-readable cho UI bên ngoài. Orchestrator nên discover endpoint/capabilities thay vì hardcode feature assumptions.[10]
- `/health` chỉ liveness, luôn có thể `200` dù readiness degraded; đọc `status` và `readiness.checks` từ `/health/detailed` để phân biệt process alive với agent/provider/session readiness.[12]
- API config hỗ trợ `port`, `host`, `key`, `cors_origins`, `model_name`; env override config. `max_concurrent_runs` mặc định 10, `0` disable.[12]
- Session continuity phải chọn explicit mechanism: Chat Completions stateless mặc định, `X-Hermes-Session-Id`/`X-Hermes-Session-Key` opt-in; Responses API dùng `previous_response_id`; runs/session endpoints dùng persisted session. Đây là điểm cần thiết kế rõ trong orchestrator để tránh nhầm HTTP connection với conversation identity.[10]

#### 4. Remote backend, auth, TLS và network

- Remote Desktop backend là `hermes serve`, không phải messaging gateway. App không tự start remote process; operator hoặc systemd giữ process sống. Messaging gateway cần chạy riêng nếu cần Telegram/Discord/etc.[5]
- Username/password backend dành trusted LAN/VPN. Docs cảnh báo không expose trực tiếp public Internet; Tailscale recommendation là bind `--host <tailscale-ip>` và dùng `http://<tailscale-ip>:9119`. Public deployment nên dùng OAuth provider.[5]
- Docs không cung cấp canonical Nginx/Caddy config, certificate rotation, forwarded-header allowlist hoặc mTLS recipe; các điểm này là implementation assumptions cần gsd-orchestrator chốt bằng reverse-proxy standard riêng.[5][20]
- API Server và Desktop remote backend là hai listener/planes: API Server thường `8642`; `hermes serve`/Dashboard remote docs dùng `9119`. Không dùng nhầm `API_SERVER_KEY` cho Dashboard auth hoặc ngược lại.[3][5]
- `hermes proxy` mặc định loopback `127.0.0.1:8645`; `--host 0.0.0.0` mở cho LAN nhưng proxy accepts any bearer and has no own auth. Docs yêu cầu firewall/VPN/reverse proxy auth khi expose beyond trusted network.[8]
- Tailscale/WireGuard không được Hermes abstract thành config primitive trong tài liệu đã thu thập. Tailscale có recommendation cụ thể; WireGuard chỉ là equivalent VPN assumption, chưa có Hermes-native integration evidence.[5][unverified]

#### 5. Platform proxy mode

- API Server là backend cho gateway proxy mode. Instance khác đặt `GATEWAY_PROXY_URL` sẽ forward messages thay vì chạy agent locally; phù hợp Matrix E2EE container/host split hoặc platform adapter chạy network-isolated environment.[18][3]
- Proxy mode không thay thế API key, network ACL hoặc profile routing. Remote thin adapter vẫn có inbound credentials/platform state; backend vẫn owns model/tools/memory.[18][3]
- `hermes proxy` khác hẳn: raw inference passthrough dùng OAuth subscription, không agent loop/tool calls; mọi caller share Portal RPM/TPM quota.[8]

#### 6. Webhooks, limits và untrusted input

- Webhook route yêu cầu secret; hỗ trợ HMAC headers theo provider, event allowlist, declarative filters, optional transform scripts trong `~/.hermes/scripts/`, prompt templates và cross-platform delivery.[6]
- Default route rate limit 30 requests/minute fixed-window; body limit 1 MB; duplicate delivery IDs được suppress trong 1 giờ; status `429` là webhook route limit, khác API Server run cap và upstream LLM 429.[6]
- `deliver_only: true` gửi rendered prompt literal, không chạy agent/LLM; phù hợp alert notification và giảm quota pressure. Route toolsets mặc định restricted vì payload third-party có thể prompt-inject; authenticated sender không đồng nghĩa trusted business content.[6]

#### 7. Relay, capability negotiation và observability

- Relay experimental connector dùng gateway outbound authenticated WebSocket. Connector advertises `supported_ops` và per-platform flags; gateway chỉ dùng op đã advertise, thiếu capability thì degrade text. Một relay connection có thể front nhiều platforms.[7]
- Relay enrollment secrets được ghi profile `.env`; `hermes gateway enroll` single-use token; revoke sau successful handshake code `4401` làm relay disabled thay vì reconnect vô hạn. Restart cần sau enrollment.[7]
- Logs theo profile nằm dưới `<profile>/logs` / `~/.hermes/logs` theo active home; `hermes logs` hỗ trợ agent/errors/gateway/gui/desktop, follow, level, since, session, component và rotation.[10]
- `hermes status --all --deep`, `hermes doctor`, `hermes dump`, `hermes debug share --local` là operator surfaces. `hermes dump` redacts key status; `debug share` redacts by default nhưng có `--no-redact`, không dùng cờ đó trong incident sharing.[10]
- Langfuse observability plugin có env/config cho endpoint, environment/release, sample rate, truncation và debug; cần enable plugin trước. Dữ liệu observability phải coi là sensitive vì trace có thể chứa prompt/tool metadata.[11]
- Official FAQ tuyên bố Hermes không collect telemetry/usage analytics trung tâm; local logs/database vẫn cần retention, access control và backup policy.[19]

## Flow or data model

### Recommended topology A: local Desktop + VPS agent

```text
Desktop
  ├─ Desktop Gateway connection ──HTTPS/WSS──> VPS `hermes serve`/Dashboard :9119
  └─ optional local backend

VPS
  ├─ remote backend owns profile config, .env, sessions, memory, tools
  ├─ optional messaging gateway (separate process)
  ├─ optional API Server :8642 for OpenAI clients / peer / proxy mode
  └─ reverse proxy or Tailscale boundary
```

Use Tailscale-only binding for trusted operator access. Use OAuth for public exposure. Keep `API_SERVER_KEY`, Dashboard auth/session secret, peer keys, webhook secrets and provider credentials distinct.

### Recommended topology B: multi-profile single host

- Default: one service/process per profile. Strong failure isolation, clear logs/tokens/ports, more processes.
- Multiplex: one inbound gateway/API listener routes `/p/<profile>/...`; lower process/port overhead, but profile key binding, webhook profile binding, scheduler and failure domain need explicit tests.[16]
- Do not share one `HERMES_HOME` among independent processes. Use profiles or external memory provider.[6]

### Recommended topology C: thin platform adapter + remote agent

```text
Matrix/other platform container
  └─ platform adapter + `GATEWAY_PROXY_URL`
        ── authenticated private network ──> API Server / agent host
                                               └─ model + tools + sessions
```

- Choose this when platform dependency/E2EE/container isolation differs from agent host. Validate stream behavior, profile prefix, API key, reconnect and backpressure before production.[18][3]

### Recommended topology D: peer mesh

```text
Hermes A Bot Chat
  └─ `hermes peer dm peerB[/agent]`
       ── private network + API_SERVER_KEY ──> Hermes B API Server
                                               └─ canonical Bot Chat of target profile
```

Peer is application-level DM, not generic RPC. Use separate peer key per remote target and route through Tailscale/WireGuard/private LAN.[8][9]

## Risks and unknowns

- **Release drift:** docs are live/current but project deployment version is not recorded here. Verify exact Hermes commit/version before relying on endpoint or env names.
- **Dashboard vs API Server confusion:** `hermes serve`/Dashboard remote path uses `9119`; API Server commonly uses `8642`; auth schemes and endpoint sets differ. Do not infer interoperability from port numbers alone.[3][5]
- **Reverse proxy hardening unspecified:** canonical docs mention path prefixes and HTTPS/Tailscale but do not define a blessed Nginx/Caddy config, HSTS, WebSocket timeout, forwarded-header trust, mTLS, or rate-limit policy. Treat these as gsd-orchestrator design work.[unverified]
- **WireGuard:** no Hermes-specific WireGuard integration found in official docs; only generic VPN equivalence is reasoned.[unverified]
- **Capability schema:** `/v1/capabilities` existence is source-confirmed, but exact field schema and compatibility negotiation policy must be read from target release source or probed at runtime.[10]
- **Run semantics:** source lists run lifecycle endpoints; exact persistence, TTL, reconnect/replay and idempotency guarantees need runtime tests against target build.[10]
- **Concurrency limits:** API Server cap 10 is process/config scope, not provider quota. Other limits (LLM provider, messaging platform, webhook route, host CPU/RAM) remain separate.[12][6]
- **Proxy mode backpressure:** docs explain forwarding but do not provide complete queue, timeout, retry and circuit-breaker guarantees. Test failure behavior before using as durable queue.
- **Shared quota:** multiple profiles/gateways may share same upstream provider credential/project; process isolation does not create quota isolation. This is an inference, not an Hermes guarantee.[unverified]
- **Secret leakage:** `hermes proxy` accepts arbitrary bearer locally; `hermes peer` keys and `API_SERVER_KEY` are credentials; `debug share --no-redact` can leak sensitive logs.[10][8]
- **Webhook trust:** valid HMAC does not make PR/issue text safe; keep route toolsets narrow and require explicit widening for trusted internal producers.[6]

## Implications for implementation

- gsd-orchestrator should model **machine/backend**, **profile/agent**, **platform gateway**, **API Server**, **Dashboard/serve**, **peer**, and **proxy** as separate entities and health checks.
- Create connection inventory with: `connection_id`, endpoint type (`serve`, API Server, peer, relay), network path, auth scheme, profile scope, TLS/VPN boundary, expected capability set, last health, last run, and owner.
- Add capability discovery handshake: probe `/health`, `/health/detailed`, `/v1/capabilities`, `/v1/models`; cache with TTL; invalidate on reconnect/version change. Never assume `/v1/capabilities` fields without schema validation.
- Add run tracker keyed by `{backend, profile, run_id}`; consume `/v1/runs/{id}/events` SSE; record start/end/status/error/approval/stop and reconnect state. Do not confuse `run_id` with conversation/session ID.
- Enforce auth matrix:
  - Dashboard/`serve`: OAuth or trusted-network username/password + stable session signing secret.
  - API Server: distinct bearer `API_SERVER_KEY`, profile-specific key on `/p/<profile>/`.
  - Peer: distinct peer key stored secret-side, URL config-side.
  - Webhook: per-route HMAC secret; no public route without auth.
  - Relay: per-gateway connector secret; experimental contract.
- Prefer private network first: Tailscale for simplest official path. WireGuard can be allowed as infrastructure layer only after independent security/operations design; do not advertise Hermes-native support.
- Reverse proxy checklist: TLS certificate automation, WebSocket upgrade, SSE idle timeout, request/body limits, explicit upstream allowlist, forwarded-header trust, auth passthrough, per-route rate limits, access logs with secret/prompt redaction, and health endpoint policy.
- For many VPS/local gateways, use one service manager per profile or explicit multiplex mode; reserve unique ports where separate listeners exist; prevent duplicate bot token usage; add startup collision check and host resource budgets.
- Observability baseline: structured access log with `connection_id`, `profile`, `session_id`, `run_id`, endpoint, status, latency, bytes, retry count; never log bearer/API keys, prompt bodies, raw webhook payloads or OAuth tokens. Sample traces and cap payload field sizes.
- Webhook automation should default to `deliver_only` for notifications and restricted toolsets for agent routes. Deduplicate provider delivery IDs before dispatch.
- 9Router integration should consume Hermes’s selected endpoint and auth contract, not infer topology from provider model strings. Keep upstream 429, API Server cap 10, webhook 429 and reverse-proxy 429 as distinct error classes.

## Verification plan for gsd-orchestrator

1. Record target Hermes version/commit and active profile paths.
2. For each backend, run redacted probes:
   - `GET /health`
   - `GET /health/detailed`
   - `GET /v1/capabilities`
   - `GET /v1/models`
3. Start one controlled `POST /v1/runs`; capture `run_id`, SSE events, terminal status, stop and approval behavior.
4. Verify profile routing with default and named profile keys; assert wrong key returns `401`.
5. Verify peer DM to default and named profile, then remove peer and confirm failure is bounded.
6. Run webhook tests for valid/invalid HMAC, duplicate delivery ID, >1 MB body, route rate threshold and filtered payload.
7. Run proxy mode failure tests: backend unavailable, stale key, profile prefix mismatch, streaming disconnect, timeout/retry.
8. Run one profile process-per-profile and one multiplex configuration on disposable host; compare ports, memory, failure scope, logs and token-lock behavior.
9. Verify remote Desktop through Tailscale and through reverse proxy TLS; test WebSocket/SSE idle periods, reconnect and certificate rotation.
10. Run `hermes status --all --deep`, `hermes doctor`, `hermes dump` and inspect redaction before attaching diagnostics.

## Recommendations to gsd-orchestrator

- Adopt Tailscale-first topology for local↔VPS management. Do not expose username/password `hermes serve` directly to Internet. For public SaaS-like access, use OAuth and a hardened TLS reverse proxy.
- Keep one canonical API Server per backend/profile unless multiplex mode is explicitly required. Treat profile keys, peer keys and Dashboard credentials as separate secret classes.
- Use `/v1/capabilities` plus health/readiness probes as discovery contract; maintain compatibility fallback to `/v1/models` and `/health` only when capability endpoint is unavailable.
- Track asynchronous runs and SSE events as first-class records. Persist correlation IDs but redact content.
- Separate process supervision from application health: systemd/s6 restart proves process liveness, not provider readiness or model availability.
- Put webhook and API rate limits in topology budget. A `429` can be webhook route cap, API Server concurrent-run cap, reverse proxy, messaging platform or upstream model; preserve source in error taxonomy.
- For bot-to-bot orchestration, use `hermes peer dm` for human-readable agent turns, not high-volume task queue transport. Use API runs/session endpoints or a dedicated queue for machine workload after verifying idempotency/backpressure.
- Keep Relay disabled unless connector deployment requires it; it is experimental and introduces another control plane/capability negotiation boundary.
- Require a redacted incident bundle: Hermes version, profile/connection IDs, endpoint type, health/readiness, capability snapshot, run IDs/timestamps/status, latency/error class, service logs. Exclude credentials, tokens, prompts and raw webhook payloads.

## Sources

[1] https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode
[2] https://hermes-agent.nousresearch.com/docs/user-guide/messaging
[3] https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
[4] https://hermes-agent.nousresearch.com/docs/user-guide/profiles
[5] https://hermes-agent.nousresearch.com/docs/user-guide/desktop
[6] https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks
[7] https://hermes-agent.nousresearch.com/docs/user-guide/messaging/relay
[8] https://hermes-agent.nousresearch.com/docs/user-guide/features/subscription-proxy
[9] https://hermes-agent.nousresearch.com/docs/user-guide/configuration
[10] https://hermes-agent.nousresearch.com/docs/reference/cli-commands
[11] https://hermes-agent.nousresearch.com/docs/reference/environment-variables
[12] https://github.com/NousResearch/hermes-agent/blob/main/gateway/platforms/api_server.py
[13] https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md
[14] https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/multi-profile-gateways.md
[15] https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/multi-connection-desktop.md
[16] https://hermes-agent.nousresearch.com/docs/user-guide/multi-profile-gateways
[17] https://hermes-agent.nousresearch.com/docs/user-guide/multi-connection-desktop
[18] https://hermes-agent.nousresearch.com/docs/user-guide/messaging/matrix
[19] https://hermes-agent.nousresearch.com/docs/reference/faq
[20] https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard
