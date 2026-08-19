# Codebase Structure

**Analysis Date:** 2026-08-19

## Directory Layout

```
9router/
├── cli/                        # Independent CLI launcher and system tray package (npm: 9router)
│   ├── hooks/                  # Runtime setup hooks (sqlite, tray)
│   ├── scripts/                # CLI build and pack scripts
│   └── src/cli/                # Terminal UI, commands, menus, tray handlers
├── docs/                       # Architectural documentation and technical deep dives
├── open-sse/                   # Provider-agnostic routing, translation, and execution core
│   ├── config/                 # Static configuration, model registries, constants
│   ├── executors/              # Per-provider network executors (OpenAI, Kiro, Cursor, Devin, etc.)
│   ├── handlers/               # Core modality handlers (chat, embedding, image, tts, stt, search)
│   ├── providers/              # Provider registry definitions and capabilities
│   ├── rtk/                    # Request Token Killer (in-place payload compression)
│   ├── services/               # Account fallback, combo resolution, token refresh services
│   ├── transformer/            # Streaming protocol transformations
│   ├── translator/             # Bidirectional request/response format conversion engine
│   └── utils/                  # Stream handling, error formatting, proxy fetching utilities
├── public/                     # Static web assets (icons, images, locales)
├── scripts/                    # Maintenance, asset copying, and registry migration scripts
├── src/                        # Main Next.js application & dashboard gateway
│   ├── app/                    # Next.js App Router (UI pages and API route handlers)
│   │   ├── (dashboard)/        # Dashboard UI routes (settings, connections, combos, pricing)
│   │   ├── api/                # Next.js backend API handlers (/v1/*, auth, sync, provider-nodes)
│   │   ├── callback/           # OAuth callback pages
│   │   └── login/              # Dashboard login UI
│   ├── i18n/                   # Multi-language runtime providers (EN, ZH, JA, ES, RU, etc.)
│   ├── lib/                    # Core utilities, DB persistence, auth, tunnels, and network
│   │   ├── auth/               # Dashboard session, JWT, SAML, OIDC, login rate limiter
│   │   ├── db/                 # SQLite driver fallback chain, migrations, and repositories
│   │   ├── network/            # Outbound proxies, proxy pools, connection verification
│   │   ├── oauth/              # OAuth credential manager and provider flow helpers
│   │   └── tunnel/             # Cloudflare and Tailscale tunnel managers
│   ├── mitm/                   # Transparent MITM interception proxy & dynamic Root CA generator
│   ├── shared/                 # Reusable UI components, hooks, stores, and constants
│   ├── sse/                    # Next.js API glue connecting App routes to open-sse core
│   └── store/                  # Client-side Zustand stores (user, settings, notifications)
├── tests/                      # Dedicated Vitest test suite and baseline snapshots
│   ├── __baseline__/           # Committed regression snapshots and known-fail lists
│   ├── real/                   # Live provider integration tests
│   ├── translator/             # Format converter roundtrip and snapshot tests
│   └── unit/                   # Unit and component tests
├── custom-server.js            # Custom HTTP/1.1 & HTTP/2 server wrapper with peer trust verification
├── next.config.mjs             # Next.js build configuration (standalone output, external packages)
└── package.json                # Root project manifest (9router-app)
```

## Directory Purposes

**open-sse/**
- Purpose: Self-contained, provider-agnostic streaming and format translation engine
- Contains: Pure JavaScript modules for protocol conversion, request dispatching, and token reduction
- Key files:
  - `open-sse/handlers/chatCore.js` - Core chat processing pipeline
  - `open-sse/translator/index.js` - Central translator registry
  - `open-sse/executors/base.js` - Base class for upstream network execution
  - `open-sse/rtk/index.js` - In-place token killer entry point

**src/app/api/**
- Purpose: Next.js API routes exposing gateway endpoints and dashboard controllers
- Contains: Route handlers for `/v1/chat/completions`, `/v1/messages`, `/api/auth/*`, `/api/combos`, `/api/providers`
- Key files:
  - `src/app/api/v1/chat/completions/route.js` - OpenAI-compatible chat entry
  - `src/app/api/v1/messages/route.js` - Anthropic-compatible messages entry
  - `src/app/api/auth/route.js` - Login and session verification

**src/lib/db/**
- Purpose: Database driver, migration runner, and table repositories
- Contains: Dynamic SQLite adapters (`bunSqliteAdapter.js`, `betterSqliteAdapter.js`, `nodeSqliteAdapter.js`, `sqljsAdapter.js`)
- Key files:
  - `src/lib/db/driver.js` - Runtime driver fallback selector
  - `src/lib/db/schema.js` - Declarative SQLite schema definitions
  - `src/lib/db/migrate.js` - Migration sync coordinator

**src/mitm/**
- Purpose: Transparent HTTPS interceptor for AI IDE plugins (Cursor, Antigravity, Copilot, Kiro)
- Contains: Dynamic Root CA generator, certificate cache, DNS config, and IDE request handlers
- Key files:
  - `src/mitm/server.js` - Intercepting proxy server
  - `src/mitm/cert/rootCA.js` - Root certificate authority management

**cli/**
- Purpose: Published standalone CLI companion for managing the 9Router server process
- Contains: Node.js CLI script, system tray integration, and installer hooks

**tests/**
- Purpose: Test runner and snapshot verification suite
- Contains: Vitest config, unit tests, translator golden snapshots, and baseline regression verifiers

## Key File Locations

**Entry Points:**
- `custom-server.js` - Production HTTP/2 server entry wrapping Next standalone output
- `src/proxy.js` - Ingress proxy coordinator
- `cli/cli.js` - Global CLI entry point

**Configuration:**
- `next.config.mjs` - Next.js standalone and bundling rules
- `jsconfig.json` - Path alias mappings (`@/*`, `open-sse/*`)
- `.env.example` - Environment variable specification

**Core Business Logic:**
- `src/sse/handlers/chat.js` - Inbound chat dispatcher (combos, account ordering)
- `open-sse/handlers/chatCore.js` - Upstream execution coordinator
- `open-sse/services/tokenRefresh.js` - Universal OAuth token refresher
- `src/lib/db/repos/` - Database entity operations

**Testing:**
- `tests/vitest.config.js` - Vitest runner configuration
- `tests/__baseline__/verify-no-regression.mjs` - Baseline snapshot regression checker

## Naming Conventions

**Files:**
- camelCase.js: Most JavaScript modules and services (`chatCore.js`, `accountFallback.js`)
- PascalCase.js: React UI components (`Button.js`, `ThemeProvider.js`)
- kebab-case.js: Specific provider registry files and executors (`alicode-intl.js`, `devin-cli.js`)
- *.test.js: Test files located in `tests/unit/` or `tests/translator/`

**Directories:**
- camelCase or kebab-case: Matching domain context (`providerNodes`, `proxy-pools`, `open-sse`)
- (parentheses): Next.js Route groups (`(dashboard)`)

## Where to Add New Code

**New AI Provider:**
1. Provider definition: `open-sse/providers/registry/{provider-name}.js` (use template `open-sse/providers/REGISTRY_TEMPLATE.js`)
2. Model catalog: Add default model definitions to `open-sse/config/providerModels.js`
3. Custom executor (if non-standard protocol): `open-sse/executors/{provider-name}.js` and register in `open-sse/executors/index.js`
4. Format translator (if custom request/response): `open-sse/translator/request/` and `open-sse/translator/response/`
5. Regenerate registry: Run `node scripts/injectDisplayToRegistry.mjs`

**New Gateway Feature / Modality:**
- Handler: `open-sse/handlers/{feature}Core.js`
- API Route: `src/app/api/v1/{feature}/route.js`
- Inbound glue: `src/sse/handlers/{feature}.js`

**New Database Entity / Table:**
- Schema: Add table structure to `TABLES` and bump `SCHEMA_VERSION` in `src/lib/db/schema.js`
- Migration: Create numbered migration in `src/lib/db/migrations/` for destructive changes
- Repository: Add accessor in `src/lib/db/repos/{entity}Repo.js`

**New Dashboard UI Page / Modal:**
- Page: `src/app/(dashboard)/dashboard/{page-name}/page.js`
- Modal component: `src/shared/components/{Name}Modal.js`
- State store: `src/store/{name}Store.js`

---

*Structure analysis: 2026-08-19*
*Update when directory structure changes*
