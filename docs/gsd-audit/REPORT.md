# GSD Skill Audit

Generated from live local skill files. No secrets included.

- Source: `/home/nguyen-thanh-hung/.agents/skills`
- Skills found: **42**
- Exhaustive capture: `/home/nguyen-thanh-hung/Documents/9router/docs/gsd-audit/skills-full.md`
- Machine inventory: `/home/nguyen-thanh-hung/Documents/9router/docs/gsd-audit/inventory.json`

## Scope and evidence

All 42 `gsd-*` SKILL.md files were read from disk. Existing non-SKILL files inside each GSD skill directory were read into exhaustive capture. Most GSD SKILL.md files delegate execution to `$HOME/.Codex/get-shit-done/...`; that directory is absent on this host, so those delegated workflows cannot be executed here without installing/providing the GSD runtime.

## Skill map

### bootstrap_and_navigation

- **gsd-help** — "Show available GSD commands and usage guide"
  - Declared tools: `Read`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/help.md
- **gsd-new-project** — "Initialize a new project with deep context gathering and PROJECT.md"
  - Declared tools: `Read, Bash, Write, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/new-project.md, MISSING $HOME/.Codex/get-shit-done/references/questioning.md, MISSING $HOME/.Codex/get-shit-done/references/ui-brand.md, MISSING $HOME/.Codex/get-shit-done/templates/project.md, MISSING $HOME/.Codex/get-shit-done/templates/requirements.md
- **gsd-resume-work** — "Resume work from previous session with full context restoration"
  - Declared tools: `Read, Bash, Write, AskUserQuestion, SlashCommand`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/resume-project.md
- **gsd-progress** — "Check progress, advance workflow, or dispatch freeform intent — the unified GSD situational command"
  - Declared tools: `Read, Bash, Grep, Glob, SlashCommand, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/progress.md, MISSING $HOME/.Codex/get-shit-done/workflows/next.md, MISSING $HOME/.Codex/get-shit-done/workflows/do.md, MISSING $HOME/.Codex/get-shit-done/references/ui-brand.md
- **gsd-manager** — "Interactive command center for managing multiple phases from one terminal"
  - Declared tools: `Read, Write, Bash, Glob, Grep, AskUserQuestion, Skill, Agent`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/manager.md, MISSING $HOME/.Codex/get-shit-done/references/ui-brand.md
- **gsd-settings** — "Configure GSD workflow toggles and model profile"
  - Declared tools: `Read, Write, Bash, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/settings.md
- **gsd-config** — "Configure GSD settings — workflow toggles, advanced knobs, integrations, and model profile"
  - Declared tools: `Read, Write, Bash, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/settings.md, MISSING $HOME/.Codex/get-shit-done/workflows/settings-advanced.md, MISSING $HOME/.Codex/get-shit-done/workflows/settings-integrations.md
- **gsd-stats** — "Display project statistics — phases, plans, requirements, git metrics, and timeline"
  - Declared tools: `Read, Bash`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/stats.md
- **gsd-thread** — "Manage persistent context threads for cross-session work"
  - Declared tools: `Read, Write, Bash`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/thread.md
- **gsd-workspace** — "Manage GSD workspaces — create, list, or remove isolated workspace environments"
  - Declared tools: `Read, Write, Bash, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/new-workspace.md, MISSING $HOME/.Codex/get-shit-done/workflows/list-workspaces.md, MISSING $HOME/.Codex/get-shit-done/workflows/remove-workspace.md, MISSING $HOME/.Codex/get-shit-done/references/ui-brand.md

### discovery_and_capture

- **gsd-explore** — "Socratic ideation and idea routing — think through ideas before committing to plans"
  - Declared tools: `Read, Write, Bash, Grep, Glob, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/explore.md
- **gsd-ns-ideate** — "exploration capture | explore sketch spike spec capture"
  - Declared tools: `Read, Skill`
  - Delegated/local references: none
- **gsd-capture** — "Capture ideas, tasks, notes, and seeds to their destination"
  - Declared tools: `Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/add-todo.md, MISSING $HOME/.Codex/get-shit-done/workflows/note.md, MISSING $HOME/.Codex/get-shit-done/workflows/add-backlog.md, MISSING $HOME/.Codex/get-shit-done/workflows/plant-seed.md, MISSING $HOME/.Codex/get-shit-done/workflows/check-todos.md, MISSING $HOME/.Codex/get-shit-done/references/ui-brand.md
- **gsd-inbox** — "Triage and review open GitHub issues and PRs against project templates and contribution guidelines."
  - Declared tools: `Read, Bash, Write, Grep, Glob, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/inbox.md
- **gsd-import** — "Ingest external plans with conflict detection against project decisions before writing anything."
  - Declared tools: `Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Agent`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/import.md, MISSING $HOME/.Codex/get-shit-done/references/ui-brand.md, MISSING $HOME/.Codex/get-shit-done/references/gate-prompts.md, MISSING $HOME/.Codex/get-shit-done/references/doc-conflict-engine.md
- **gsd-profile-user** — "Generate developer behavioral profile and create Codex-discoverable artifacts"
  - Declared tools: `Read, Write, Bash, Glob, Grep, AskUserQuestion, Agent`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/profile-user.md, MISSING $HOME/.Codex/get-shit-done/references/ui-brand.md

### planning_and_roadmap

- **gsd-discuss-phase** — "Gather phase context through adaptive questioning before planning."
  - Declared tools: `Read, Write, Bash, Glob, Grep, AskUserQuestion, Agent, mcp__context7__resolve-library-id, mcp__context7__query-docs`
  - Delegated/local references: none
- **gsd-spec-phase** — "Clarify WHAT a phase delivers with ambiguity scoring; produces a SPEC.md before discuss-phase."
  - Declared tools: `Read, Write, Bash, Glob, Grep, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/spec-phase.md, MISSING $HOME/.Codex/get-shit-done/templates/spec.md
- **gsd-phase** — "CRUD for phases in ROADMAP.md — add, insert, remove, or edit phases"
  - Declared tools: `Read, Write, Bash, Glob`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/add-phase.md, MISSING $HOME/.Codex/get-shit-done/workflows/insert-phase.md, MISSING $HOME/.Codex/get-shit-done/workflows/remove-phase.md, MISSING $HOME/.Codex/get-shit-done/workflows/edit-phase.md
- **gsd-plan-review-convergence** — "Cross-AI plan convergence loop — replan with review feedback until no HIGH concerns remain."
  - Declared tools: `Read, Write, Bash, Glob, Grep, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/plan-review-convergence.md, MISSING $HOME/.Codex/get-shit-done/references/revision-loop.md, MISSING $HOME/.Codex/get-shit-done/references/gates.md, MISSING $HOME/.Codex/get-shit-done/references/agent-contracts.md
- **gsd-review** — "Request cross-AI peer review of phase plans from external AI CLIs"
  - Declared tools: `Read, Write, Bash, Glob, Grep`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/review.md
- **gsd-quick** — "Execute a quick task with GSD guarantees (atomic commits, state tracking) but skip optional agents"
  - Declared tools: `Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/quick.md
- **gsd-fast** — "Execute a trivial task inline — no subagents, no planning overhead"
  - Declared tools: `Read, Write, Edit, Bash, Grep, Glob`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/fast.md
- **gsd-new-milestone** — "Start a new milestone cycle — update PROJECT.md and route to requirements"
  - Declared tools: `Read, Write, Bash, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/new-milestone.md, MISSING $HOME/.Codex/get-shit-done/references/questioning.md, MISSING $HOME/.Codex/get-shit-done/references/ui-brand.md, MISSING $HOME/.Codex/get-shit-done/templates/project.md, MISSING $HOME/.Codex/get-shit-done/templates/requirements.md

### execution_and_recovery

- **gsd-ns-workflow** — "workflow | discuss plan execute verify phase progress"
  - Declared tools: `Read, Skill`
  - Delegated/local references: none
- **gsd-debug** — "Systematic debugging with persistent state across context resets"
  - Declared tools: `Read, Write, Bash, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/debug.md
- **gsd-pause-work** — "Create context handoff when pausing work mid-phase"
  - Declared tools: `Read, Write, Bash`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/pause-work.md
- **gsd-ai-integration-phase** — "Generate an AI-SPEC.md design contract for phases that involve building AI systems."
  - Declared tools: `Read, Write, Bash, Glob, Grep, Agent, WebFetch, WebSearch, AskUserQuestion, mcp__context7__*`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/ai-integration-phase.md, MISSING $HOME/.Codex/get-shit-done/references/ai-frameworks.md, MISSING $HOME/.Codex/get-shit-done/references/ai-evals.md
- **gsd-gstack-sp-orchestrator** — (no description)
  - Declared tools: `not declared`
  - Delegated/local references: none

### verification_and_hardening

- **gsd-code-review** — "Review source files changed during a phase for bugs, security issues, and code quality problems"
  - Declared tools: `Read, Bash, Glob, Grep, Write, Agent`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/code-review.md
- **gsd-audit-uat** — "Cross-phase audit of all outstanding UAT and verification items"
  - Declared tools: `Read, Glob, Grep, Bash`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/audit-uat.md
- **gsd-validate-phase** — "Retroactively audit and fill Nyquist validation gaps for a completed phase"
  - Declared tools: `Read, Write, Edit, Bash, Glob, Grep, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/validate-phase.md
- **gsd-secure-phase** — "Retroactively verify threat mitigations for a completed phase"
  - Declared tools: `Read, Write, Edit, Bash, Glob, Grep, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/secure-phase.md
- **gsd-eval-review** — "Audit an executed AI phase's evaluation coverage and produce an EVAL-REVIEW.md remediation plan."
  - Declared tools: `Read, Write, Bash, Glob, Grep, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/eval-review.md, MISSING $HOME/.Codex/get-shit-done/references/ai-evals.md
- **gsd-ui-review** — "Retroactive 6-pillar visual audit of implemented frontend code"
  - Declared tools: `Read, Write, Bash, Glob, Grep, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/ui-review.md, MISSING $HOME/.Codex/get-shit-done/references/ui-brand.md
- **gsd-docs-update** — "Generate or update project documentation verified against the codebase"
  - Declared tools: `Read, Write, Edit, Bash, Glob, Grep, Agent, AskUserQuestion`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/docs-update.md

### knowledge_and_lifecycle

- **gsd-ns-context** — "codebase intelligence | map graphify docs learnings"
  - Declared tools: `Read, Skill`
  - Delegated/local references: none
- **gsd-graphify** — "Build, query, and inspect the project knowledge graph in .planning/graphs/"
  - Declared tools: `Read, Bash`
  - Delegated/local references: none
- **gsd-extract-learnings** — "Extract decisions, lessons, patterns, and surprises from completed phase artifacts"
  - Declared tools: `Read, Write, Bash, Grep, Glob, Agent`
  - Delegated/local references: MISSING $HOME/.Codex/get-shit-done/workflows/extract-learnings.md
- **gsd-complete-milestone** — "Archive completed milestone and prepare for next version"
  - Declared tools: `Read, Write, Bash`
  - Delegated/local references: none

### operations

- **gsd-disk-cleanup** — (no description)
  - Declared tools: `not declared`
  - Delegated/local references: none

## Workflow composition

1. **Orient**: `gsd-help` → `gsd-progress`/`gsd-stats`; restore with `gsd-resume-work`; configure with `gsd-config`/`gsd-settings`.
2. **Discover**: `gsd-explore` or `gsd-ns-ideate`; capture loose work with `gsd-capture`; inspect external issue intake with `gsd-inbox`/`gsd-import`.
3. **Define**: `gsd-new-project` for a new repo; `gsd-new-milestone` for release cycle; `gsd-discuss-phase` then `gsd-spec-phase`; maintain order with `gsd-phase`.
4. **Plan and execute**: `gsd-plan-review-convergence` or `gsd-review` for plan quality; `gsd-ns-workflow`/`gsd-progress` for routing; `gsd-quick` or `gsd-fast` for small work; `gsd-gstack-sp-orchestrator` for broad multi-stage orchestration.
5. **Recover**: `gsd-debug` for root-cause loops; `gsd-pause-work` before stopping; `gsd-resume-work` to restore context.
6. **Verify**: `gsd-code-review`, `gsd-audit-uat`, `gsd-validate-phase`, `gsd-secure-phase`, `gsd-eval-review`, and `gsd-ui-review` cover different evidence surfaces; `gsd-docs-update` reconciles docs with code.
7. **Close and learn**: `gsd-extract-learnings`, `gsd-graphify`, `gsd-complete-milestone`; use `gsd-stats` for final metrics.

## Strengths

- Strong lifecycle coverage: discovery → requirements → phase planning → execution → verification → milestone close.
- Explicit quality gates: review, validation, security, UAT, evaluation, and UI checks are separate rather than conflated.
- Persistent project artifacts: `.planning/`, `STATE.md`, `ROADMAP.md`, plans, summaries, graph data, and handoff files.
- Progressive disclosure: thin SKILL.md routers keep detailed workflows/references external.
- Orchestration options span quick tasks, full phases, GStack integration, and cross-AI review.

## Limits and risks

- **Blocking**: 42 skills reference `$HOME/.Codex/get-shit-done/...`, but `/home/nguyen-thanh-hung/.Codex/get-shit-done` is absent. Skills can be selected and described, but delegated GSD workflows are not executable until runtime files exist.
- `gsd-gstack-sp-orchestrator` is much larger and includes scripts/templates/dependencies; it can overlap with `gsd-ns-workflow`, `gsd-progress`, `gsd-plan-review-convergence`, and `gsd-review`.
- Several skills can mutate project files or git state (`Write`, `Edit`, `Bash`, `Agent`). Bot must ask before destructive, external, or production actions.
- `gsd-disk-cleanup` is operational/destructive and not inherently part of software lifecycle; isolate behind explicit confirmation.
- `gsd-review`, AI integration, and GStack routes depend on external CLIs, credentials, network, or browser setup.
- Hermes profiles isolate state, not filesystem access. `terminal.cwd` improves starting context but is not a sandbox.

## Overlap and dependency notes

- `gsd-config` subsumes older `gsd-settings` paths; keep both available for compatibility, but prefer `gsd-config` when advanced/integration/profile options matter.
- `gsd-ns-*` skills are compact routers that overlap with canonical GSD skills: context ↔ graphify/docs/learnings; ideate ↔ explore/capture; project ↔ milestone/audit/summary; workflow ↔ discuss/plan/execute/verify/progress.
- `gsd-quick` and `gsd-fast` both target small tasks; use `gsd-quick` when state/atomic-commit guarantees matter, `gsd-fast` only for trivial work.
- `gsd-audit-uat` and `gsd-validate-phase` are retrospective verification; `gsd-secure-phase` is security-focused; `gsd-eval-review` audits evaluation quality. Run together when acceptance evidence is uncertain.
- `gsd-new-project` and `gsd-new-milestone` both initialize planning artifacts but operate at different lifecycle levels.

## Bot recommendation

- Name: `gsd-orchestrator`.
- Role: route the full GSD skill family, inspect project state first, select the smallest valid workflow, preserve gates, and report missing runtime/credential dependencies.
- Model/provider: clone current proven `research-bot` settings, then explicitly verify `cx/gpt-5.6-luna` via `9-router`.
- Tools: `terminal,file,skills,web,code_execution,delegation,todo,clarify,session_search,memory`; keep `computer_use` available for UI review but do not enable video-only tools.
- Workspace: `/home/nguyen-thanh-hung/Documents/9router`.
- Safety: no automatic production deploy, destructive cleanup, credential edits, or history rewrite without explicit user confirmation.

