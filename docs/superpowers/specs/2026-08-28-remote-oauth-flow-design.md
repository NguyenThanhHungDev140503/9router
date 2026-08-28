# Remote OAuth Flow Design

**Date:** 2026-08-28  
**Status:** Design approved for implementation planning  
**Scope:** OAuth login from local and remotely deployed 9Router dashboards

## 1. Problem

`src/shared/components/OAuthModal.js` currently creates browser callback URLs with
`localhost` or `127.0.0.1`. This works when dashboard and browser run on one
machine, but fails for a remote deployment because browser `localhost` points to
the user's machine, not the VPS.

Current OAuth proxy sessions also live in process memory. They are not durable
across restart and are not safe as the ownership boundary for a multi-user
dashboard.

The target design must support:

- Public callback OAuth providers on local and remote origins.
- Codex remote login without a localhost callback.
- Existing local-only provider flows without regression.
- Multiple users and concurrent login attempts.
- Server-side token exchange and connection ownership.

## 2. Goals

1. Select callback origin from actual runtime mode:
   - Local dashboard: `http://localhost:<port>/...`
   - Remote dashboard: `https://<deployed-domain>/...`
2. Keep provider-specific protocol constraints explicit.
3. Bind every OAuth login attempt to authenticated dashboard user and provider.
4. Keep authorization code, PKCE verifier, device code, and provider tokens out
   of URLs, logs, browser storage, and normal API responses where possible.
5. Make login sessions durable, expiring, cancellable, and safe across restart.
6. Store resulting provider connection under correct `userId`.
7. Preserve existing provider connection management and sharing rules.

## 3. Non-goals

- Do not force fixed-loopback providers to accept public callback URLs.
- Do not redesign provider token refresh logic.
- Do not add wildcard OAuth redirect URIs.
- Do not expose provider access tokens through dashboard APIs.
- Do not make unauthenticated remote OAuth management available when
  `requireLogin=false`.
- Do not redesign Zed native authentication in first implementation.

## 4. Provider flow policy

Provider configuration must declare supported local and remote modes. The UI
must not infer protocol from arbitrary provider names or hardcode callback URLs
in one shared branch.

| Provider group | Local mode | Remote mode | First implementation |
|---|---|---|---|
| Claude, Gemini CLI, iFlow, Cline, ClinePass, GitLab | Public callback | Public callback | Implement |
| Codex | `localhost:1455/auth/callback` browser flow | Device-code flow | Implement both |
| xAI | Fixed loopback proxy `127.0.0.1:56121` | Manual callback/token or verified public callback | Keep local; remote manual path |
| Trae | Dynamic loopback proxy | Manual callback/token or verified public callback | Keep local; remote manual path |
| Windsurf | Dynamic loopback proxy | Manual callback/token or verified public callback | Keep local; remote manual path |
| Zed | Native local proxy and RSA callback | Not supported in first implementation | Keep local-only |

Remote public callback is allowed only when provider registration accepts the
exact configured callback URI.

## 5. Architecture

### 5.1 Trusted public origin

Create one server-side public-origin helper used by OAuth routes and other
callback-generating routes.

Resolution order:

1. `BASE_URL`, when configured and valid.
2. `NEXT_PUBLIC_BASE_URL`, when configured and valid.
3. Trusted reverse-proxy headers:
   - `X-Forwarded-Proto`
   - `X-Forwarded-Host`
4. `request.url` origin.

Rules:

- Normalize trailing slash.
- Allow only `http` and `https`.
- Reject credentials, path, query, and fragment in base origin config.
- Never use an untrusted arbitrary `redirect_uri` as public origin.
- Local loopback origins are allowed only for providers explicitly marked
  `local_loopback`.

### 5.2 OAuth session service

Add a durable OAuth login-session service. It owns state, PKCE data, device
credentials, provider metadata, expiry, and completion status.

Each session contains:

```text
id
userId
provider
flowType
status
stateHash
codeVerifierEncrypted
deviceCodeEncrypted
providerMetadataEncrypted
redirectUri
expiresAt
createdAt
completedAt
consumedAt
connectionId
errorCode
errorMessage
```

Raw `state`, PKCE verifier, device code, and provider secrets are never returned
from database reads or logs. `stateHash` uses a keyed hash or cryptographic
hash of a high-entropy state value. The raw state is supplied only to the
provider authorize request and callback validation.

Session status values:

```text
pending
completing
completed
failed
expired
cancelled
```

State transitions are one-way except `pending -> cancelled` and
`pending -> expired`.

### 5.3 Server-side public callback

Public callback providers use a provider-specific callback endpoint:

```text
/api/oauth/callback/<provider>
```

Flow:

```text
Authenticated user
→ server creates OAuth session and PKCE values
→ server builds provider authorize URL
→ provider redirects to callback endpoint
→ server validates state/provider/expiry
→ server exchanges code using stored verifier
→ server encrypts and saves tokens with session.userId
→ server marks session completed
→ server redirects to dashboard result route
```

The callback endpoint must not accept a client-supplied destination. Success
redirect is a fixed same-origin dashboard route.

### 5.4 Codex remote device flow

Codex remote login uses device authentication, not browser localhost callback.
The server-side Codex adapter obtains a device-login handle, stores its
device credential, and returns only:

```json
{
  "loginId": "opaque-id",
  "verificationUrl": "https://...",
  "userCode": "ABCD-1234",
  "expiresAt": "..."
}
```

The browser polls session status:

```text
GET /api/oauth/sessions/<loginId>
POST /api/oauth/sessions/<loginId>/cancel
```

The server waits or polls the provider and saves the resulting Codex token
under the authenticated user. The device code itself stays server-side.

Codex local login keeps the existing loopback browser flow because local
Codex tooling expects `localhost:1455/auth/callback`.

### 5.5 Local proxy flows

Existing xAI, Trae, Windsurf, and Zed proxy behavior remains local-only in
first implementation. The UI must label these flows clearly:

```text
Works only when dashboard and callback proxy run on same machine.
```

Remote fallback uses manual callback/token input only where the provider parser
can safely validate the returned payload. Manual input is submitted over HTTPS
to an authenticated endpoint and is never persisted in browser storage.

## 6. API design

### Start public callback flow

```text
POST /api/oauth/<provider>/sessions
```

Server derives user from dashboard authentication. Request contains only
provider-specific non-secret options that have passed validation.

Response:

```json
{
  "loginId": "opaque-id",
  "authUrl": "https://provider.example/authorize?...",
  "flowType": "public_callback",
  "expiresAt": "..."
}
```

### Start Codex device flow

```text
POST /api/oauth/codex/sessions
```

Response:

```json
{
  "loginId": "opaque-id",
  "verificationUrl": "https://...",
  "userCode": "ABCD-1234",
  "flowType": "device_code",
  "expiresAt": "..."
}
```

### Read session status

```text
GET /api/oauth/sessions/<loginId>
```

Response exposes only:

```json
{
  "loginId": "opaque-id",
  "provider": "codex",
  "status": "pending",
  "connection": null,
  "error": null,
  "expiresAt": "..."
}
```

Completed response includes safe connection metadata only:

```json
{
  "connection": {
    "id": "connection-id",
    "provider": "codex",
    "email": "user@example.com",
    "displayName": "..."
  }
}
```

### Cancel session

```text
POST /api/oauth/sessions/<loginId>/cancel
```

Only session owner or authorized admin may cancel. Cancellation stops polling
and invalidates any pending provider credential.

### Legacy endpoints

Existing `/api/oauth/<provider>/authorize`, `/exchange`, `/poll`, and proxy
endpoints remain only during migration. New UI flow uses the session API. Legacy
endpoints must enforce the same ownership, redirect, and secret-handling rules
before removal.

## 7. Security controls

### Authentication and authorization

- OAuth start, status, cancel, exchange, and manual-submit endpoints require a
  valid dashboard session.
- `userId` comes from server-side auth context, never request body.
- `requireLogin=false` does not bypass OAuth management authentication.
- Every session query checks `session.userId === currentUser.userId`.
- Admin access follows existing explicit admin policy; it does not silently
  convert another user's connection into a global connection.
- New connections set `userId` from the OAuth session.
- Sharing remains an explicit admin action after connection creation.

### CSRF and session binding

- Generate at least 128 bits of unpredictable `state`.
- Store only a hash of state.
- Bind state to provider, user, session ID, redirect URI, and creation time.
- Accept state exactly once.
- Reject missing, mismatched, expired, cancelled, or completed state.
- Use PKCE S256 for providers that support it.
- Bind callback code to the stored verifier; never accept verifier from client.
- Use SameSite and secure dashboard cookie settings already required by auth.
- Add CSRF protection to state-changing dashboard POST endpoints where cookie
  authentication is used.

### Redirect protection

- Server generates callback URI.
- Provider redirect URI is selected from provider capability and trusted origin.
- Reject arbitrary external callback origins.
- Validate configured `BASE_URL` and forwarded headers.
- Redirect after callback only to fixed same-origin dashboard route.
- Do not log authorization URLs containing codes, state, or device credentials.

### Secret handling

- Encrypt access token, refresh token, ID token, PKCE verifier, device code, and
  provider metadata at rest.
- Keep encryption key in runtime secret configuration.
- Never return token fields from provider listing or OAuth session APIs.
- Redact secrets from error messages and structured logs.
- Clear temporary secrets after exchange, failure, cancellation, or expiry.
- Do not store OAuth payloads in `localStorage`, `BroadcastChannel`, or URL
  parameters for server-side flows.

### Abuse controls

- Rate-limit session creation, status polling, callback attempts, and manual
  submission.
- Enforce provider-specific session expiration.
- Apply bounded polling interval and backoff.
- Limit one active session per user/provider unless explicit concurrency is
  needed.
- Reject excessive metadata size and unknown provider options.
- Clean expired sessions and encrypted temporary credentials.

### Provider and SSRF controls

- Provider name must resolve from static registry.
- GitLab `baseUrl` and similar metadata require an allowlist or explicit safe
  validation before server fetch.
- Never fetch arbitrary URLs supplied through callback data.
- Provider-specific callback parsers validate expected state and payload shape.

## 8. Data and lifecycle rules

1. Session created only after authentication.
2. Session owns all temporary OAuth material.
3. Connection created only after successful token exchange.
4. Connection receives `userId` from session.
5. Session stores `connectionId` and becomes `completed`.
6. Any later status request returns safe metadata only.
7. Expiry/cancel/replay prevents token exchange.
8. Deleting connection removes or revokes provider credentials where provider
   supports revocation; otherwise encrypted local credentials are deleted.

## 9. Error handling

User-visible errors are stable categories:

```text
oauth_not_authenticated
oauth_provider_not_supported
oauth_session_expired
oauth_session_cancelled
oauth_state_invalid
oauth_callback_mismatch
oauth_provider_denied
oauth_token_exchange_failed
oauth_device_pending
oauth_device_slow_down
oauth_provider_unavailable
oauth_remote_flow_unavailable
```

Logs include session ID hash, provider, user ID hash, status transition, and
request ID. Logs exclude state, code, verifier, device code, access token,
refresh token, authorization URL query, and manual callback payload.

Callbacks return a safe HTML/result redirect, not raw provider errors or token
data.

## 10. Migration plan

### Step 1: Shared policy and session storage

- Add provider capability metadata.
- Add trusted public-origin helper.
- Add durable OAuth session repository and cleanup.
- Add encryption boundary for temporary secrets and tokens.

### Step 2: Public callback providers

- Implement session start/callback/status for Claude, Gemini CLI, iFlow,
  Cline, ClinePass, and GitLab.
- Update provider registration instructions with exact local and remote URIs.
- Keep legacy flow behind compatibility path until regression tests pass.

### Step 3: Codex

- Keep local browser callback.
- Add remote device-code adapter.
- Store device credential server-side.
- Add status polling, expiry, cancellation, and user ownership.

### Step 4: Local-proxy providers

- Keep local xAI, Trae, Windsurf, and Zed flows.
- Expose clear remote availability state.
- Add manual remote path only after provider payload validation.

### Step 5: Remove unsafe compatibility behavior

- Remove hardcoded generic localhost fallback.
- Reject client-selected external redirect URI.
- Remove process-memory session ownership from new flows.
- Remove legacy endpoints after migration coverage is verified.

## 11. Testing strategy

### Unit tests

- Public-origin resolution for local, HTTPS, forwarded headers, and configured
  base URL.
- Reject invalid origin schemes, credentials, paths, and external redirects.
- State generation, hashing, binding, expiry, one-time consumption, and replay.
- Session ownership checks for same user, different user, and admin.
- Provider capability routing.
- Token/secret redaction.
- Connection creation always carries session `userId`.

### Integration tests

- Public callback completes exchange and saves connection for correct user.
- Invalid state cannot exchange.
- Replayed callback cannot exchange.
- Expired/cancelled session cannot exchange.
- Codex device flow returns URL/code but never device code or token.
- Polling completion creates one connection only.
- Concurrent User A/User B sessions remain isolated.
- Restart preserves pending durable session.
- Remote origin never emits localhost for public callback providers.
- Local Codex still emits `localhost:1455/auth/callback`.

### Security tests

- Cross-user `loginId` access returns `403` or indistinguishable `404`.
- Unauthenticated OAuth management returns `401`.
- `requireLogin=false` does not expose OAuth management.
- Callback open redirect attempts fail.
- Malicious forwarded headers cannot override trusted proxy policy.
- Provider metadata SSRF attempts fail.
- Logs contain no OAuth secret patterns.

## 12. Observability

Record structured events:

```text
oauth_session_created
oauth_callback_received
oauth_exchange_started
oauth_exchange_completed
oauth_session_failed
oauth_session_expired
oauth_session_cancelled
oauth_connection_created
```

Each event includes provider, flow type, user ID hash, session ID hash, status,
duration, and request ID. Never include OAuth secrets.

Metrics:

- session completion rate by provider and flow
- callback validation failure rate
- device login pending duration
- token exchange failure rate
- expired/cancelled session count
- cross-user access denial count

## 13. Acceptance criteria

1. Remote public-callback providers redirect to configured deployed domain.
2. Local public-callback providers redirect to current local origin.
3. Remote Codex login completes without port `1455` or localhost callback.
4. Local Codex login remains compatible with port `1455`.
5. Every created OAuth connection has correct `userId`.
6. OAuth session secrets never appear in client response, URL, browser storage,
   or logs.
7. State replay, cross-user access, open redirect, and unauthenticated access
   tests fail safely.
8. Server restart does not orphan durable session state.
9. xAI, Trae, Windsurf, and Zed local flows are not falsely advertised as
   remote-compatible.
10. No implementation starts until provider callback registrations and Codex
    remote adapter contract are confirmed.

## 14. Security decision

The design is acceptable only with all controls in Section 7. The following are
blocking requirements, not optional hardening:

```text
authenticated session ownership
server-side exchange
one-time state
PKCE verifier protection
trusted redirect generation
userId-bound connection creation
encrypted secret storage
durable session lifecycle
```
