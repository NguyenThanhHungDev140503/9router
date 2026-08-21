# Phase 3 Research: Format-Aware Inbound Injection

## 1. Goal & Architecture Overview
Phase 3 establishes the inbound transformation and prompt/tool injection layer before downstream model routing.
Its primary objective is to inject active MCP Tools and Skill Prompts into incoming client requests (OpenAI, Claude, Gemini, Responses API) without breaking native client tools or degrading latency.

Key components:
1. **Tool Schema Conversion & Namespacing (`open-sse/mcp/injector.js`)**:
   - MCP tool standard schema to OpenAI format (`tools: [{type: "function", function: {name, description, parameters}}]`).
   - Claude format (`tools: [{name, description, input_schema}]`).
   - Gemini format (`tools: [{functionDeclarations: [{name, description, parameters}]}]`).
   - Responses format (`tools: [...]`).
   - Tool Namespacing: Standardized prefix `mcp__{sanitized_server}__{tool_name}` to avoid collisions with client tools and distinguish server-side executable tools.
2. **Skill Prompt Injection**:
   - Skills are formatted into XML blocks `<skills><skill name="...">...</skill></skills>` and appended/prepended into the appropriate system prompt field based on format (messages system item for OpenAI/Gemini/Claude vs dedicated `system` parameter in Claude).
3. **Filtering & Latency Preservation**:
   - `always`: Inject without trigger matching.
   - `auto`: Lexical / keyword matching against user prompt. If zero match, zero tools injected.
   - Header override support (e.g. `x-mcp-servers`).
   - Safety caps (`MAX_INJECTED_TOOLS = 30`).
   - Fail-open policy: Any failure falls back to original request cleanly.

## 2. Integration Points in Gateway Flow
- **`open-sse/handlers/chatCore.js`**:
  - Injected right before `translateRequest(sourceFormat, targetFormat, upstreamModel, body, ...)` or before passthrough handling.
  - Shallow clone / copy-on-write semantics on `body` to avoid side effects across retries.
  - Passes injected tools and skills through the translator.

## 3. Tool Schema Mapping Table
| Target Format | Tool Array Shape | Input Schema Key |
|---------------|-------------------|------------------|
| OpenAI / Compatible | `tools: [{type: "function", function: {name, description, parameters}}]` | `parameters` |
| Claude | `tools: [{name, description, input_schema}]` | `input_schema` |
| Gemini / Antigravity | `tools: [{functionDeclarations: [{name, description, parameters}]}]` | `parameters` |
| Responses API | `tools: [{type: "function", name, description, parameters}]` | `parameters` |

## 4. Test Strategy
- Unit tests in `tests/unit/mcpInjector.test.js` covering:
  - Tool prefixing and namespacing.
  - Format-specific schema conversions (OpenAI, Claude, Gemini, Responses).
  - Filtering logic (`always`, `auto` lexical keyword matching, `disabled`, header overrides).
  - Skill XML system prompt injection for each format.
  - Safety cap and fail-open resilience.
  - Integration with `chatCore.js` flow.
