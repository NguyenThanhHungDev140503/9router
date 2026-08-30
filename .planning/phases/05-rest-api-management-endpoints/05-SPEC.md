# Phase 5: REST API Management Endpoints - Specification

**Status:** Approved
**Created:** 2026-08-23
**Target Requirements:** MCP-API-01, MCP-API-02, MCP-API-03, MCP-API-04

---

## 1. Overview & Goals

Phase 5 establishes comprehensive Next.js REST API routes under `/api/mcp/*` and `/api/skills/*` to allow the Web Dashboard and external administrative clients to manage Server-Side MCP Servers, cached tool inventories, test executions, and Custom Skills with activation rules.

### Key Objectives:
1. **MCP Server Management (`/api/mcp/servers` and `/api/mcp/servers/[id]`):**
   - Full CRUD operations with payload validation.
   - Live synchronization with `McpProcessManager` on creation, update, deletion, and toggle.
   - Status reporting (`running`, `stopped`, `crashed`, `failed`, `offline`).

2. **MCP Tool Inventory (`/api/mcp/tools`):**
   - Query all available and cached MCP tools across all or specific servers.
   - Expose namespaced format (`mcp__<server>__<tool>`) alongside original server tool schemas.

3. **MCP Tool Testing & Execution (`/api/mcp/test`):**
   - Real-time test connection against any configured or ephemeral server config.
   - Execute specific tool calls with test arguments via `McpProcessManager.callServerTool()` and return sanitized execution output/errors.

4. **Custom Skills & Gateway Tool Rules (`/api/skills` and `/api/skills/[id]`):**
   - Full CRUD operations for Custom Skills (system prompt templates, name, description, tags, enabled status).
   - Manage Gateway Tool Rules (`/api/skills/rules`) to define dynamic tool/skill activation criteria.

5. **Security & Authentication:**
   - Integrate standard Dashboard Session Authentication (`getDashboardAuthSession` / `verifyDashboardAuthToken`) for mutating endpoints, respecting global auth configuration.

---

## 2. API Contract & Endpoint Definitions

### 2.1 MCP Servers (`/api/mcp/servers`)

- **GET `/api/mcp/servers`**
  - Query Params: `?enabled=true|false`
  - Response `200 OK`:
    ```json
    {
      "servers": [
        {
          "id": "uuid",
          "name": "filesystem",
          "transport": "stdio",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          "env": {},
          "url": null,
          "enabled": true,
          "status": "running",
          "toolCount": 4,
          "createdAt": "2026-08-23T...",
          "updatedAt": "2026-08-23T..."
        }
      ]
    }
    ```

- **POST `/api/mcp/servers`**
  - Request Body:
    ```json
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": { "DEBUG": "1" },
      "url": null,
      "enabled": true
    }
    ```
  - Behavior: Creates DB record in `mcpServers`. If `enabled: true`, triggers `processManager.startServer(server)` and syncs tool cache.
  - Response `201 Created` / `400 Bad Request` / `401 Unauthorized`

- **GET `/api/mcp/servers/[id]`**
  - Response `200 OK`: Single server object with status and cached tools.

- **PUT/PATCH `/api/mcp/servers/[id]`**
  - Updates configuration or toggles `enabled`. If updated, reloads/restarts process via `processManager`.

- **DELETE `/api/mcp/servers/[id]`**
  - Behavior: Stops running session via `processManager.stopServer(id)`, removes server and cached tools from DB.
  - Response `200 OK`: `{ "success": true }`

- **POST `/api/mcp/servers/[id]/restart`**
  - Behavior: Explicitly triggers process restart and tools resync.

---

### 2.2 MCP Tools (`/api/mcp/tools`)

- **GET `/api/mcp/tools`**
  - Query Params: `?serverId=uuid&enabledOnly=true`
  - Response `200 OK`:
    ```json
    {
      "tools": [
        {
          "serverId": "uuid",
          "serverName": "filesystem",
          "name": "read_file",
          "namespacedName": "mcp__filesystem__read_file",
          "description": "Read contents of a file",
          "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } }
        }
      ]
    }
    ```

---

### 2.3 MCP Test & Execution (`/api/mcp/test`)

- **POST `/api/mcp/test`**
  - Modes:
    1. **Connection Test (`action: "ping"`):**
       ```json
       {
         "action": "ping",
         "serverId": "uuid" // or ephemeral server config object
       }
       ```
    2. **Tool Execution (`action: "call"`):**
       ```json
       {
         "action": "call",
         "serverId": "uuid",
         "toolName": "read_file",
         "arguments": { "path": "/tmp/test.txt" }
       }
       ```
  - Response `200 OK`:
    ```json
    {
      "success": true,
      "result": { "content": [{ "type": "text", "text": "file content..." }] },
      "durationMs": 42
    }
    ```
  - Error Response `400/500`:
    ```json
    {
      "success": false,
      "error": "Sanitized error message",
      "code": "MCP_TOOL_EXECUTION_ERROR"
    }
    ```

---

### 2.4 Custom Skills & Rules (`/api/skills`)

- **GET `/api/skills`**
  - Query Params: `?enabled=true|false`
  - Response `200 OK`:
    ```json
    {
      "skills": [
        {
          "id": "uuid",
          "name": "Code Reviewer",
          "description": "Enforces strict code review guidelines",
          "systemPrompt": "You are a senior code reviewer...",
          "enabled": true,
          "tags": ["review", "coding"],
          "createdAt": "2026-08-23T...",
          "updatedAt": "2026-08-23T..."
        }
      ]
    }
    ```

- **POST `/api/skills`**
  - Request Body: `{ name, description, systemPrompt, enabled, tags }`
  - Response `201 Created`

- **GET / PUT / DELETE `/api/skills/[id]`**
  - Standard CRUD for skill entity.

- **GET / POST / PUT / DELETE `/api/skills/rules`**
  - Manages `gatewayToolRules` entries (model matching, provider matching, skill association).

---

## 3. Architecture & Integration Points

1. **Repositories:**
   - `src/lib/db/repos/mcpRepo.js` (Server & Tool Cache CRUD)
   - `src/lib/db/repos/skillsRepo.js` (Skills & Rules CRUD)

2. **Process Manager Integration:**
   - Import `getProcessManager` from `@/lib/mcp/processManager.js`.
   - On server mutation (`create`, `update`, `delete`, `toggle`), dispatch appropriate process lifecycle commands.

3. **Authentication Guard:**
   - Use helper `verifySessionOrUnauthorized(request)` importing `getDashboardAuthSession` from `@/lib/auth/dashboardSession.js` and checking against `getSettings()`.

4. **Error Handling & Validation:**
   - Centralized validation for inputs (transport types, non-empty command/url, valid JSON schemas).
   - Sanitize all downstream MCP errors using `sanitizeMcpError`.

---

## 4. Test Strategy

1. **API Route Unit Tests (`tests/unit/api/mcp/` and `tests/unit/api/skills/`):**
   - Test GET, POST, PUT, DELETE routes with mocked db and process manager.
   - Verify unauthenticated requests are rejected when auth is enabled.
   - Verify invalid transport/command configurations return 400 Bad Request.
2. **Process Lifecycle Integration:**
   - Verify creating an enabled server invokes `startServer` and updates cache.
   - Verify disabling or deleting server invokes `stopServer`.
3. **Execution Endpoint Verification:**
   - Verify `/api/mcp/test` executes tool calls and formats sanitized responses.
