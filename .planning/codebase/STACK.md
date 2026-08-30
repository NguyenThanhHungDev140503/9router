# Technology Stack

**Analysis Date:** 2026-08-19

## Languages

**Primary:**
- JavaScript (ESM / Next.js modern ECMAScript) - All application logic, dashboard UI, SSE routing engine, CLI wrapper

**Secondary:**
- CSS / Tailwind CSS v4 - UI styles and theme styling (`src/app/globals.css`, `postcss.config.mjs`)
- Bash / Shell - Startup and build automation scripts (`start.sh`, `scripts/copy-standalone-assets.mjs`)
- Markdown - Documentation, GitBook guides, agent skill instructions (`docs/`, `gitbook/`, `open-sse/AGENTS.md`)

## Runtime

**Environment:**
- Node.js >= 20.x (recommended >= 22.5.0 for native `node:sqlite`)
- Bun runtime compatible (`bun:sqlite` auto-detected in `src/lib/db/driver.js`)
- Custom HTTP/1.1 & HTTP/2 server wrapper (`custom-server.js`) handling real IP spoofing defense and background token refresh

**Package Manager:**
- npm (root `package.json` with multi-project sub-packages in `cli/` and `tests/`)
- Bun supported via specific scripts (`npm run dev:bun`, `npm run start:bun`)
- Lockfiles: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.1.6 - App Router, Standalone build output, API route handlers (`src/app/api/*`)
- React 19.2.4 / React-DOM 19.2.4 - Dashboard UI, component state, flow charts
- Express 5.2.1 - Internal server adapters and proxy handling

**Testing:**
- Vitest 1.x - Fast ESM unit, integration, golden, and real provider test runner located in `tests/`
- Chai & Vitest Spy/Expect - Test assertion libraries

**Build/Dev:**
- Webpack / Turbopack (Next.js bundler configured via `next.config.mjs`)
- PostCSS 8.5.6 with `@tailwindcss/postcss` 4.1.18
- ESLint 9 (`eslint.config.mjs`) with `eslint-config-next`

## Key Dependencies

**Critical:**
- `better-sqlite3` (v12.6.2) & `sql.js` (v1.14.1) - SQLite database persistence fallback chain (`bun:sqlite` -> `better-sqlite3` -> `node:sqlite` -> `sql.js`) in `src/lib/db/driver.js`
- `jose` (v6.1.3) & `bcryptjs` (v3.0.3) & `@node-saml/node-saml` (v5.1.0) - Dashboard JWT tokens, password hashing, and enterprise SAML authentication
- `undici` (v7.19.2) - High performance HTTP client for upstream streaming LLM requests
- `zustand` (v5.0.10) - Client-side state management for dashboard UI
- `open` (v11.0.0) - External browser launcher for OAuth authentication flows (configured as external package in `next.config.mjs`)

**UI & Infrastructure:**
- `@xyflow/react` (v12.10.1) & `@dnd-kit/*` (v6/v9/v10) - Workflow graph editor and provider priority reordering
- `@monaco-editor/react` (v4.7.0) & `monaco-editor` (v0.55.1) - In-browser code, prompt, and JSON editing
- `socks-proxy-agent` (v8.0.5) & `http-proxy-middleware` (v3.0.5) - Outbound network proxying (SOCKS5/HTTP/HTTPS) and proxy pooling
- `selfsigned` (v5.5.0) & `node-forge` (v1.3.3) - On-the-fly SSL/TLS root CA generation for MITM tool proxying (`src/mitm/cert/`)
- `node-machine-id` (v1.1.12) - Device fingerprinting for client identity spoofing / provider authorization

## Configuration

**Environment:**
- Configured via `.env` file (template in `.env.example`) and process environment variables
- Key variables:
  - `JWT_SECRET`, `INITIAL_PASSWORD`, `DATA_DIR` (Persistence directory, default `~/.9router/` or `/var/lib/9router`)
  - `PORT` (default `20128`), `BASE_URL`, `CLOUD_URL`, `REQUIRE_API_KEY`
  - `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`

**Build:**
- `next.config.mjs` - Standalone output, `proxyClientMaxBodySize` (128MB), `serverExternalPackages` (`better-sqlite3`, `sql.js`, `open`, etc.)
- `jsconfig.json` - Path aliases `@/*` -> `./src/*` and `open-sse/*` -> `./open-sse/*`
- `eslint.config.mjs` - ESLint 9 flat config
- `tests/vitest.config.js` - Vitest configuration with root path alias resolution

## Platform Requirements

**Development:**
- Cross-platform: Linux, macOS, Windows (PowerShell/CMD scripts with elevated permissions for MITM cert install)
- Node.js 20+ or Bun 1.1+

**Production:**
- Standalone Next.js Node/Bun server running via `custom-server.js` or `start.sh`
- Docker container deployment (`Dockerfile`, `docker-compose.yml`, `captain-definition`)
- CLI packaged desktop app (`cli/` with system tray support)

---

*Stack analysis: 2026-08-19*
*Update after major dependency changes*
