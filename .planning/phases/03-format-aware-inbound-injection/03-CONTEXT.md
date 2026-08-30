# Phase 3 Context: Format-Aware Inbound Injection

## 1. Injection Point & Architecture
- **Location**: Executed in `open-sse/handlers/chatCore.js` immediately after request format detection (`sourceFormat`) and BEFORE request translation (`translateRequest`).
- **Mutation Strategy**: Selective shallow copy / Structural sharing (Copy-on-Write) to avoid CPU/GC overhead on large contexts/images while preventing duplicate injection on retries.
- **Class Hierarchy**: Strategy pattern with `BaseFormatInjector` and dedicated subclasses:
  - `OpenAiInjector` (handles OpenAI, Antigravity, DeepSeek, Groq, Mistral, Ollama via registry aliasing)
  - `ClaudeInjector` (handles Claude native schemas)
  - `GeminiInjector` (handles Gemini `functionDeclarations`)
  - `ResponsesInjector` (handles OpenAI Responses API format)
- **Extensibility**: Provider Registry pattern ($1 \to N$ Canonical MCP JSON Schema mapping). New OpenAI-compatible providers require 0 code changes (registry aliasing); exotic providers require a single isolated subclass.

## 2. Tool Namespacing & Formatting
- **Namespace Rule**: Mandatory prefix for MCP tools: `mcp__{server}__{tool}`.
- **Client Tools**: Native client tools are preserved without modification.
- **Schema Minification**: Unnecessary schema metadata (verbose descriptions, empty titles) stripped to save token budget.

## 3. Skill & Tool Dynamic Filtering (Zero-Latency In-Memory)
- **Activation Modes**:
  - `always`: Core tools/skills, always injected.
  - `auto` (Default): Dynamic keyword / lexical matching between user message and tool/skill triggers + descriptions. If no match, inject 0 tools (Zero-Tool Pass-through to preserve token budget).
  - `disabled`: Tool/skill excluded.
- **Header Override**: Client can explicitly filter servers via headers (e.g., `x-mcp-servers`).
- **Skill Prompt Injection**: Skills wrapped in XML format `<skills><skill name="...">...</skill></skills>` in system prompt.

## 4. Error Handling & Safety Limits
- **Fail-Open Policy**: Any injection failure logs sanitized diagnostics and falls back cleanly to the unmodified client request.
- **Safety Cap**: Strict upper bound on injected tools (`MAX_INJECTED_TOOLS = 30`) to prevent context overflow and LLM confusion.
