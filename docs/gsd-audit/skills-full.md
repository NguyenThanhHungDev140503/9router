# Exhaustive GSD skill and linked-file capture



===== gsd-ai-integration-phase | /home/nguyen-thanh-hung/.agents/skills/gsd-ai-integration-phase/SKILL.md =====

---
name: gsd-ai-integration-phase
description: "Generate an AI-SPEC.md design contract for phases that involve building AI systems."
argument-hint: "[phase number]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - WebFetch
  - WebSearch
  - AskUserQuestion
  - mcp__context7__*
---

<objective>
Create an AI design contract (AI-SPEC.md) for a phase involving AI system development.
Orchestrates gsd-framework-selector → gsd-ai-researcher → gsd-domain-researcher → gsd-eval-planner.
Flow: Select Framework → Research Docs → Research Domain → Design Eval Strategy → Done
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/ai-integration-phase.md
@$HOME/.Codex/get-shit-done/references/ai-frameworks.md
@$HOME/.Codex/get-shit-done/references/ai-evals.md
</execution_context>

<context>
Phase number: $ARGUMENTS — optional, auto-detects next unplanned phase if omitted.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates.
</process>


===== gsd-audit-uat | /home/nguyen-thanh-hung/.agents/skills/gsd-audit-uat/SKILL.md =====

---
name: gsd-audit-uat
description: "Cross-phase audit of all outstanding UAT and verification items"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

<objective>
Scan all phases for pending, skipped, blocked, and human_needed UAT items. Cross-reference against codebase to detect stale documentation. Produce prioritized human test plan.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/audit-uat.md
</execution_context>

<context>
Core planning files are loaded in-workflow via CLI.

**Scope:**
Glob: .planning/phases/*/*-UAT.md
Glob: .planning/phases/*/*-VERIFICATION.md
</context>


===== gsd-capture | /home/nguyen-thanh-hung/.agents/skills/gsd-capture/SKILL.md =====

---
name: gsd-capture
description: "Capture ideas, tasks, notes, and seeds to their destination"
argument-hint: "[--note | --backlog | --seed | --list] [text]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---


<objective>
Capture ideas, tasks, notes, and seeds to their appropriate destination in the GSD system.

Mode routing:
- **default** (no flag): Capture as a structured todo for later work → add-todo workflow
- **--note**: Zero-friction idea capture (append/list/promote) → note workflow
- **--backlog**: Add an idea to the backlog parking lot (999.x numbering) → add-backlog workflow
- **--seed**: Capture a forward-looking idea with trigger conditions → plant-seed workflow
- **--list**: List pending todos and select one to work on → check-todos workflow
</objective>

<routing>

| Flag | Destination | Workflow |
|------|-------------|----------|
| (none) | Structured todo in .planning/todos/ | add-todo |
| --note | Timestamped note file, list, or promote | note |
| --backlog | ROADMAP.md backlog section (999.x) | add-backlog |
| --seed | .planning/seeds/SEED-NNN-slug.md | plant-seed |
| --list | Interactive todo browser + action router | check-todos |

</routing>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/add-todo.md
@$HOME/.Codex/get-shit-done/workflows/note.md
@$HOME/.Codex/get-shit-done/workflows/add-backlog.md
@$HOME/.Codex/get-shit-done/workflows/plant-seed.md
@$HOME/.Codex/get-shit-done/workflows/check-todos.md
@$HOME/.Codex/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Arguments: $ARGUMENTS

Parse the first token of $ARGUMENTS:
- If it is `--note`: strip the flag, pass remainder to note workflow
- If it is `--backlog`: strip the flag, pass remainder to add-backlog workflow
- If it is `--seed`: strip the flag, pass remainder to plant-seed workflow
- If it is `--list`: pass remainder (optional area filter) to check-todos workflow
- Otherwise: pass all of $ARGUMENTS to add-todo workflow
</context>

<process>
1. Parse the leading flag (if any) from $ARGUMENTS.
2. Load and execute the appropriate workflow end-to-end based on the routing table above.
3. Preserve all workflow gates from the target workflow (directory structure, duplicate detection, commits, etc.).
</process>


===== gsd-code-review | /home/nguyen-thanh-hung/.agents/skills/gsd-code-review/SKILL.md =====

---
name: gsd-code-review
description: "Review source files changed during a phase for bugs, security issues, and code quality problems"
argument-hint: "<phase-number> [--depth=quick|standard|deep] [--files file1,file2,...] [--fix [--all] [--auto]]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Agent
---

<objective>
Review source files changed during a phase for bugs, security vulnerabilities, and code quality problems.

Spawns the gsd-code-reviewer agent to analyze code at the specified depth level. Produces REVIEW.md artifact in the phase directory with severity-classified findings.

Arguments:
- Phase number (required) — which phase's changes to review (e.g., "2" or "02")
- `--depth=quick|standard|deep` (optional) — review depth level, overrides workflow.code_review_depth config
  - quick: Pattern-matching only (~2 min)
  - standard: Per-file analysis with language-specific checks (~5-15 min, default)
  - deep: Cross-file analysis including import graphs and call chains (~15-30 min)
- `--files file1,file2,...` (optional) — explicit comma-separated file list, skips SUMMARY/git scoping (highest precedence for scoping)
- `--fix` (optional) — after review completes (or if REVIEW.md already exists), auto-apply fixes found. Spawns gsd-code-fixer agent. Accepts sub-flags:
  - `--all` — include Info findings in fix scope (default: Critical + Warning only)
  - `--auto` — enable fix + re-review iteration loop, capped at 3 iterations

Output: {padded_phase}-REVIEW.md in phase directory + inline summary of findings
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/code-review.md
</execution_context>

<context>
Phase: $ARGUMENTS (first positional argument is phase number)

Optional flags parsed from $ARGUMENTS:
- `--depth=VALUE` — Depth override (quick|standard|deep). If provided, overrides workflow.code_review_depth config.
- `--files=file1,file2,...` — Explicit file list override. Has highest precedence for file scoping per D-08. When provided, workflow skips SUMMARY.md extraction and git diff fallback entirely.

Context files (AGENTS.md, SUMMARY.md, phase state) are resolved inside the workflow via `gsd-sdk query init.phase-op` and delegated to agent via `<files_to_read>` blocks.
</context>

<process>
This command is a thin dispatch layer. It parses arguments and delegates to the workflow.

Execute end-to-end.

The workflow (not this command) enforces these gates:
- Phase validation (before config gate)
- Config gate check (workflow.code_review)
- File scoping (--files override > SUMMARY.md > git diff fallback)
- Empty scope check (skip if no files)
- Agent spawning (gsd-code-reviewer)
- Result presentation (inline summary + next steps)
</process>


===== gsd-complete-milestone | /home/nguyen-thanh-hung/.agents/skills/gsd-complete-milestone/SKILL.md =====

---
name: gsd-complete-milestone
description: "Archive completed milestone and prepare for next version"
argument-hint: "<version>"
allowed-tools:
  - Read
  - Write
  - Bash
---


<objective>
Mark milestone {{version}} complete, archive to milestones/, and update ROADMAP.md and REQUIREMENTS.md.

Purpose: Create historical record of shipped version, archive milestone artifacts (roadmap + requirements), and prepare for next milestone.
Output: Milestone archived (roadmap + requirements), PROJECT.md evolved, git tagged.
</objective>

<execution_context>
**Load these files NOW (before proceeding):**

- @$HOME/.Codex/get-shit-done/workflows/complete-milestone.md (main workflow)
- @$HOME/.Codex/get-shit-done/templates/milestone-archive.md (archive template)
  </execution_context>

<context>
**Project files:**
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/PROJECT.md`

**User input:**

- Version: {{version}} (e.g., "1.0", "1.1", "2.0")
  </context>

<process>

**Follow complete-milestone.md workflow:**

0. **Check for audit:**

   - Look for `.planning/v{{version}}-MILESTONE-AUDIT.md`
   - If missing or stale: recommend `/gsd:audit-milestone` first
   - If audit status is `gaps_found`: recommend closing the gaps inline
     (the audit output already enumerates them — insert closure phases
     via `/gsd:phase --insert <N>` plus the standard
     discuss/plan/execute chain) before proceeding.
   - If audit status is `passed`: proceed to step 1

   ```markdown
   ## Pre-flight Check

   {If no v{{version}}-MILESTONE-AUDIT.md:}
   ⚠ No milestone audit found. Run `/gsd:audit-milestone` first to verify
   requirements coverage, cross-phase integration, and E2E flows.

   {If audit has gaps:}
   ⚠ Milestone audit found gaps. The audit output already enumerates the
   unsatisfied requirements, cross-phase issues, and broken flows — insert
   a closure phase per gap with `/gsd:phase --insert <N>` and run the
   standard `/gsd:discuss-phase` → `/gsd:plan-phase` → `/gsd:execute-phase`
   chain. Or proceed anyway to accept the gaps as tech debt.

   {If audit passed:}
   ✓ Milestone audit passed. Proceeding with completion.
   ```

1. **Verify readiness:**

   - Check all phases in milestone have completed plans (SUMMARY.md exists)
   - Present milestone scope and stats
   - Wait for confirmation

2. **Gather stats:**

   - Count phases, plans, tasks
   - Calculate git range, file changes, LOC
   - Extract timeline from git log
   - Present summary, confirm

3. **Extract accomplishments:**

   - Read all phase SUMMARY.md files in milestone range
   - Extract 4-6 key accomplishments
   - Present for approval

4. **Archive milestone:**

   - Create `.planning/milestones/v{{version}}-ROADMAP.md`
   - Extract full phase details from ROADMAP.md
   - Fill milestone-archive.md template
   - Update ROADMAP.md to one-line summary with link

5. **Archive requirements:**

   - Create `.planning/milestones/v{{version}}-REQUIREMENTS.md`
   - Mark all v1 requirements as complete (checkboxes checked)
   - Note requirement outcomes (validated, adjusted, dropped)
   - Delete `.planning/REQUIREMENTS.md` (fresh one created for next milestone)

6. **Update PROJECT.md:**

   - Add "Current State" section with shipped version
   - Add "Next Milestone Goals" section
   - Archive previous content in `<details>` (if v1.1+)

7. **Commit and tag:**

   - Stage: MILESTONES.md, PROJECT.md, ROADMAP.md, STATE.md, archive files
   - Commit: `chore: archive v{{version}} milestone`
   - Tag: `git tag -a v{{version}} -m "[milestone summary]"`
   - Ask about pushing tag

8. **Offer next steps:**
   - `/gsd:new-milestone` — start next milestone (questioning → research → requirements → roadmap)

</process>

<success_criteria>

- Milestone archived to `.planning/milestones/v{{version}}-ROADMAP.md`
- Requirements archived to `.planning/milestones/v{{version}}-REQUIREMENTS.md`
- `.planning/REQUIREMENTS.md` deleted (fresh for next milestone)
- ROADMAP.md collapsed to one-line entry
- PROJECT.md updated with current state
- Git tag v{{version}} created (if `git.create_tag` enabled)
- Commit successful
- User knows next steps (including need for fresh requirements)
  </success_criteria>

<critical_rules>

- **Load workflow first:** Read complete-milestone.md before executing
- **Verify completion:** All phases must have SUMMARY.md files
- **User confirmation:** Wait for approval at verification gates
- **Archive before deleting:** Always create archive files before updating/deleting originals
- **One-line summary:** Collapsed milestone in ROADMAP.md should be single line with link
- **Context efficiency:** Archive keeps ROADMAP.md and REQUIREMENTS.md constant size per milestone
- **Fresh requirements:** Next milestone starts with `/gsd:new-milestone` which includes requirements definition
  </critical_rules>


===== gsd-config | /home/nguyen-thanh-hung/.agents/skills/gsd-config/SKILL.md =====

---
name: gsd-config
description: "Configure GSD settings — workflow toggles, advanced knobs, integrations, and model profile"
argument-hint: "[--advanced | --integrations | --profile <name>]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---


<objective>
Configure GSD settings interactively with a single consolidated command.

Mode routing:
- **default** (no flag): Common-case toggles (model, research, plan_check, verifier, branching) → settings workflow
- **--advanced**: Power-user knobs (planning tuning, timeouts, branch templates, cross-AI execution) → settings-advanced workflow
- **--integrations**: Third-party API keys, code-review CLI routing, agent-skill injection → settings-integrations workflow
- **--profile <name>**: Switch model profile (quality|balanced|budget|inherit) → set-profile (inline)
</objective>

<routing>

| Flag | Action | Workflow |
|------|--------|----------|
| (none) | Interactive 5-question common-case config prompt | settings |
| --advanced | Power-user knobs: planning, execution, discussion, cross-AI, git, runtime | settings-advanced |
| --integrations | API keys (Brave/Firecrawl/Exa), review CLI routing, agent skills | settings-integrations |
| --profile &lt;name&gt; | Switch model profile without interactive prompt | gsd-sdk config-set-model-profile |

</routing>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/settings.md
@$HOME/.Codex/get-shit-done/workflows/settings-advanced.md
@$HOME/.Codex/get-shit-done/workflows/settings-integrations.md
</execution_context>

<context>
Arguments: $ARGUMENTS

Parse the first token of $ARGUMENTS:
- If it is `--advanced`: strip the flag, execute settings-advanced workflow
- If it is `--integrations`: strip the flag, execute settings-integrations workflow
- If it starts with `--profile`: extract the profile name (remainder after `--profile`), then:
  1. **Pre-flight check (#2439):** verify `gsd-sdk` is on PATH via `command -v gsd-sdk`.
     If absent, emit the install hint `Install GSD via 'npm i -g get-shit-done'` and stop —
     do NOT invoke `gsd-sdk` directly (avoids the opaque `command not found: gsd-sdk` failure).
  2. Run: `gsd-sdk query config-set-model-profile <profile-name> --raw` and display the output verbatim.
- Otherwise: execute settings workflow (no argument needed)
</context>

<process>
1. Parse the leading flag (if any) from $ARGUMENTS.
2. Load and execute the appropriate workflow end-to-end, or run the inline SDK command for --profile.
3. Preserve all workflow gates from the target workflow.
</process>


===== gsd-debug | /home/nguyen-thanh-hung/.agents/skills/gsd-debug/SKILL.md =====

---
name: gsd-debug
description: "Systematic debugging with persistent state across context resets"
argument-hint: "[list | status <slug> | continue <slug> | --diagnose] [issue description]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Agent
  - AskUserQuestion
---


<objective>
Debug issues using scientific method with subagent isolation.

**Orchestrator role:** Gather symptoms, spawn gsd-debugger agent, handle checkpoints, spawn continuations.

**Flags:**
- `--diagnose` — Diagnose only. Returns a Root Cause Report without applying a fix.

**Subcommands:** `list` · `status <slug>` · `continue <slug>`
</objective>

<available_agent_types>
Valid GSD subagent types (use exact names — do not fall back to 'general-purpose'):
- gsd-debug-session-manager — manages debug checkpoint/continuation loop in isolated context
- gsd-debugger — investigates bugs using scientific method
</available_agent_types>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/debug.md
</execution_context>

<context>
User's input: $ARGUMENTS

Parse subcommands and flags from $ARGUMENTS BEFORE the active-session check:
- If $ARGUMENTS starts with "list": SUBCMD=list, no further args
- If $ARGUMENTS starts with "status ": SUBCMD=status, SLUG=remainder (trim whitespace)
- If $ARGUMENTS starts with "continue ": SUBCMD=continue, SLUG=remainder (trim whitespace)
- If $ARGUMENTS contains `--diagnose`: SUBCMD=debug, diagnose_only=true, strip `--diagnose` from description
- Otherwise: SUBCMD=debug, diagnose_only=false

Check for active sessions (used for non-list/status/continue flows):
```bash
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | head -5
```
</context>

<process>
Execute end-to-end.
</process>


===== gsd-discuss-phase | /home/nguyen-thanh-hung/.agents/skills/gsd-discuss-phase/SKILL.md =====

---
name: gsd-discuss-phase
description: "Gather phase context through adaptive questioning before planning."
argument-hint: "<phase> [--all] [--auto] [--chain] [--batch] [--analyze] [--text] [--power] [--assumptions]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
  - mcp__context7__resolve-library-id
  - mcp__context7__query-docs
---


<objective>
Extract implementation decisions that downstream agents need — researcher and planner will use CONTEXT.md to know what to investigate and what choices are locked.

**How it works:**
1. Load prior context (PROJECT.md, REQUIREMENTS.md, STATE.md, prior CONTEXT.md files)
2. Scout codebase for reusable assets and patterns
3. Analyze phase — skip gray areas already decided in prior phases
4. Present remaining gray areas — user selects which to discuss
5. Deep-dive each selected area until satisfied
6. Create CONTEXT.md with decisions that guide research and planning

**Output:** `{phase_num}-CONTEXT.md` — decisions clear enough that downstream agents can act without asking the user again
</objective>

<execution_context>
Workflow files are loaded on-demand in the <process> section below — not upfront.
Do not pre-load any workflow files before reading the mode routing instructions.
</execution_context>

<runtime_note>
**Copilot (VS Code):** Use `vscode_askquestions` wherever this workflow calls `AskUserQuestion`. They are equivalent — `vscode_askquestions` is the VS Code Copilot implementation of the same interactive question API.
</runtime_note>

<context>
Phase number: $ARGUMENTS (required)

Context files are resolved in-workflow using `init phase-op` and roadmap/state tool calls.
</context>

<process>
**Mode routing:**
```bash
DISCUSS_MODE=$(gsd-sdk query config-get workflow.discuss_mode 2>/dev/null || echo "discuss")
```

If `--assumptions` is in $ARGUMENTS:
Read and execute `$HOME/.Codex/get-shit-done/workflows/list-phase-assumptions.md` end-to-end.
Stop here.

Otherwise, if `DISCUSS_MODE` is `"assumptions"`:
Read and execute `$HOME/.Codex/get-shit-done/workflows/discuss-phase-assumptions.md` end-to-end.

Otherwise (`"discuss"` / unset / any other value):
Read and execute `$HOME/.Codex/get-shit-done/workflows/discuss-phase.md` end-to-end.

**MANDATORY:** Read the appropriate workflow file BEFORE taking any action. The objective and success_criteria sections in this command file are summaries — the workflow file contains the complete step-by-step process with all required behaviors, config checks, and interaction patterns. Do not improvise from the summary.

**Lazy loading:** `templates/context.md` is loaded inside the `write_context` step of the active workflow. `discuss-phase-power.md` is loaded inside `discuss-phase.md` when `--power` is detected. Do not load either here.
</process>

<success_criteria>
- Prior context loaded and applied (no re-asking decided questions)
- Gray areas identified through intelligent analysis
- User chose which areas to discuss
- Each selected area explored until satisfied
- Scope creep redirected to deferred ideas
- CONTEXT.md captures decisions, not vague vision
- User knows next steps
</success_criteria>


===== gsd-disk-cleanup | /home/nguyen-thanh-hung/.agents/skills/gsd-disk-cleanup/SKILL.md =====

---
name: gsd-disk-cleanup
description: |
  Thorough disk space analysis and cleanup for Ubuntu Linux. Analyzes disk usage,
  identifies space hogs (package caches, Docker, Snap revisions, old toolchains,
  JDKs, build artifacts), then safely cleans them. Use this skill whenever the
  user mentions disk full, low disk space, cleanup, dọn ổ cứng, need more space,
  "disk is full", "out of space", "100% disk", or wants to optimize storage.
  Proactively suggest this skill when `df` shows >85% disk usage.
---

# Disk Cleanup Skill

## Overview

This skill runs a comprehensive disk analysis and cleanup pipeline for Ubuntu Linux. It identifies the biggest space consumers and safely cleans caches, old versions, and build artifacts. Always **analyze first, report to user, then clean** — never delete without confirmation for destructive operations.

## Workflow

### Phase 1: Analyze

Run these commands to understand disk layout:

```bash
# Overall disk usage
df -h /

# Top-level directories
du -sh /* 2>/dev/null | sort -rh | head -20

# User home breakdown (visible dirs)
du -sh /home/nguyen-thanh-hung/*/ 2>/dev/null | sort -rh | head -20

# User home hidden dirs
du -sh /home/nguyen-thanh-hung/.* 2>/dev/null | sort -rh | head -30

# Dig deeper into suspiciously large directories
du -sh /home/nguyen-thanh-hung/.local/share/*/ 2>/dev/null | sort -rh | head -15
du -sh /home/nguyen-thanh-hung/.config/*/ 2>/dev/null | sort -rh | head -15
du -sh /var/*/ 2>/dev/null | sort -rh | head -10

# Docker
docker system df 2>/dev/null

# Snap
snap list --all 2>/dev/null

# Journal
journalctl --disk-usage 2>/dev/null
```

### Phase 2: Report

Present findings to the user with estimated reclaimable size per category. Ask which items to clean before proceeding. Group into:

1. **Package manager caches** (safe to clean):
   - `npm cache clean --force`
   - `pnpm store prune`
   - `yarn cache clean`
   - `bun pm cache rm` (run from a dir with package.json, or manually delete `.bun/install/cache/` and `.bun/.cache/`)
   - `rm -rf ~/.cargo/registry/cache/*`
   - `nuget locals all -clear` (or manually `rm -rf ~/.nuget/* ~/.local/share/NuGet/*`)
   - `sudo apt clean`
   - `rm -rf ~/.gradle/caches/* ~/.gradle/wrapper/dists/*`
   - `rm -rf ~/.cache/*`
   - `rm -rf ~/.local/share/hatch/*`
   - `rm -rf ~/.local/share/uv/cache/*`

2. **Docker** (confirm with user which images to keep):
   - List containers and images
   - Remove all images except those user wants to keep
   - `docker system prune -f` to clear build cache

3. **Snap old revisions**:
   ```bash
   snap list --all | grep disabled | while read name ver rev rest; do
     rev=$(echo $rev | tr -d '()')
     sudo snap remove --revision "$rev" "$name"
   done
   ```

4. **NVM old Node versions** (confirm which to keep):
   - List: `ls ~/.nvm/versions/node/`
   - Remove: `rm -rf ~/.nvm/versions/node/<version>` or `nvm uninstall <version>`

5. **Rustup old toolchains** (keep stable):
   - List: `rustup toolchain list`
   - Remove: `rustup toolchain remove <toolchain>` or `rm -rf ~/.rustup/toolchains/<toolchain>`

6. **Old JDKs** (keep latest only):
   - List: `ls ~/.jdks/`
   - Check modify dates with `ls -lt ~/.jdks/`
   - Remove: `rm -rf ~/.jdks/<old-version>`

7. **Old kernels + apt autoremove**:
   - `sudo apt autoremove --purge -y`

8. **Claude-3p vm_bundles** (if present, check ~/.config/Claude-3p/vm_bundles/):
   - These are VM disk images for the Claude desktop app
   - Chat history is stored separately in `local-agent-mode-sessions/` — xóa vm_bundles không mất chat history
   - But Claude desktop will need to rebuild VM on next launch

9. **Swap file** (if /swap.img is large, ask before resizing)

### Phase 3: Execute

After user confirms which items to clean, execute the corresponding commands. Run independent cleanups in parallel where possible.

### Phase 4: Summary

After cleanup, show:
```bash
df -h /
```
And report total space reclaimed with before/after comparison.

## Important notes

- Always ask user before destructive operations (docker rmi, rm -rf on user directories, snap remove, apt autoremove)
- Package manager caches and build artifacts are generally safe to clean without asking
- Use `sudo` when needed (snap, apt, docker)
- Some commands (bun, cargo-cache) may not be available; use manual directory removal as fallback
- If `nvm uninstall` fails due to missing nvm shell function, fall back to `rm -rf ~/.nvm/versions/node/<version>`


===== gsd-docs-update | /home/nguyen-thanh-hung/.agents/skills/gsd-docs-update/SKILL.md =====

---
name: gsd-docs-update
description: "Generate or update project documentation verified against the codebase"
argument-hint: "[--force] [--verify-only]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---

<objective>
Generate and update up to 9 documentation files for the current project. Each doc type is written by a gsd-doc-writer subagent that explores the codebase directly — no hallucinated paths, phantom endpoints, or stale signatures.

Flag handling rule:
- The optional flags documented below are available behaviors, not implied active behaviors
- A flag is active only when its literal token appears in `$ARGUMENTS`
- If a documented flag is absent from `$ARGUMENTS`, treat it as inactive
- `--force`: skip preservation prompts, regenerate all docs regardless of existing content or GSD markers
- `--verify-only`: check existing docs for accuracy against codebase, no generation (full verification requires Phase 4 verifier)
- If `--force` and `--verify-only` both appear in `$ARGUMENTS`, `--force` takes precedence
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/docs-update.md
</execution_context>

<context>
Arguments: $ARGUMENTS

**Available optional flags (documentation only — not automatically active):**
- `--force` — Regenerate all docs. Overwrites hand-written and GSD docs alike. No preservation prompts.
- `--verify-only` — Check existing docs for accuracy against the codebase. No files are written. Reports VERIFY marker count. Full codebase fact-checking requires the gsd-doc-verifier agent (Phase 4).

**Active flags must be derived from `$ARGUMENTS`:**
- `--force` is active only if the literal `--force` token is present in `$ARGUMENTS`
- `--verify-only` is active only if the literal `--verify-only` token is present in `$ARGUMENTS`
- If neither token appears, run the standard full-phase generation flow
- Do not infer that a flag is active just because it is documented in this prompt
</context>

<process>
Execute end-to-end.
Preserve all workflow gates (preservation_check, flag handling, wave execution, monorepo dispatch, commit, reporting).
</process>


===== gsd-eval-review | /home/nguyen-thanh-hung/.agents/skills/gsd-eval-review/SKILL.md =====

---
name: gsd-eval-review
description: "Audit an executed AI phase's evaluation coverage and produce an EVAL-REVIEW.md remediation plan."
argument-hint: "[phase number]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---

<objective>
Conduct a retroactive evaluation coverage audit of a completed AI phase.
Checks whether the evaluation strategy from AI-SPEC.md was implemented.
Produces EVAL-REVIEW.md with score, verdict, gaps, and remediation plan.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/eval-review.md
@$HOME/.Codex/get-shit-done/references/ai-evals.md
</execution_context>

<context>
Phase: $ARGUMENTS — optional, defaults to last completed phase.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates.
</process>


===== gsd-explore | /home/nguyen-thanh-hung/.agents/skills/gsd-explore/SKILL.md =====

---
name: gsd-explore
description: "Socratic ideation and idea routing — think through ideas before committing to plans"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
---

<objective>
Open-ended Socratic ideation session. Guides the developer through exploring an idea via
probing questions, optionally spawns research, then routes outputs to the appropriate GSD
artifacts (notes, todos, seeds, research questions, requirements, or new phases).

Accepts an optional topic argument: `/gsd:explore authentication strategy`
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/explore.md
</execution_context>

<process>
Execute end-to-end.
</process>


===== gsd-extract-learnings | /home/nguyen-thanh-hung/.agents/skills/gsd-extract-learnings/SKILL.md =====

---
name: gsd-extract-learnings
description: "Extract decisions, lessons, patterns, and surprises from completed phase artifacts"
argument-hint: "<phase-number>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - Agent
---

<objective>
Extract structured learnings from completed phase artifacts (PLAN.md, SUMMARY.md, VERIFICATION.md, UAT.md, STATE.md) into a LEARNINGS.md file that captures decisions, lessons learned, patterns discovered, and surprises encountered.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/extract-learnings.md
</execution_context>

Execute the extract-learnings workflow from @$HOME/.Codex/get-shit-done/workflows/extract-learnings.md end-to-end.


===== gsd-fast | /home/nguyen-thanh-hung/.agents/skills/gsd-fast/SKILL.md =====

---
name: gsd-fast
description: "Execute a trivial task inline — no subagents, no planning overhead"
argument-hint: "[task description]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
---


<objective>
Execute a trivial task directly in the current context without spawning subagents
or generating PLAN.md files. For tasks too small to justify planning overhead:
typo fixes, config changes, small refactors, forgotten commits, simple additions.

This is NOT a replacement for /gsd:quick — use /gsd:quick for anything that
needs research, multi-step planning, or verification. /gsd:fast is for tasks
you could describe in one sentence and execute in under 2 minutes.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/fast.md
</execution_context>

<process>
Execute end-to-end.
</process>


===== gsd-graphify | /home/nguyen-thanh-hung/.agents/skills/gsd-graphify/SKILL.md =====

---
name: gsd-graphify
description: "Build, query, and inspect the project knowledge graph in .planning/graphs/"
argument-hint: "[build|query <term>|status|diff]"
allowed-tools:
  - Read
  - Bash
---


**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Codex's command system. Using the Read tool on this file wastes tokens. Begin executing Step 0 immediately.**

**CJS-only (graphify):** `graphify` subcommands are not registered on `gsd-sdk query`. Use `node $HOME/.Codex/get-shit-done/bin/gsd-tools.cjs graphify …` as documented in this command and in `docs/CLI-TOOLS.md`. Other tooling may still use `gsd-sdk query` where a handler exists.

## Step 0 -- Banner

**Before ANY tool calls**, display this banner:

```
GSD > GRAPHIFY
```

Then proceed to Step 1.

## Step 1 -- Config Gate

Check if graphify is enabled by reading `.planning/config.json` directly using the Read tool.

**DO NOT use the gsd-tools config get-value command** -- it hard-exits on missing keys.

1. Read `.planning/config.json` using the Read tool
2. If the file does not exist: display the disabled message below and **STOP**
3. Parse the JSON content. Check if `config.graphify && config.graphify.enabled === true`
4. If `graphify.enabled` is NOT explicitly `true`: display the disabled message below and **STOP**
5. If `graphify.enabled` is `true`: proceed to Step 2

**Disabled message:**

```
GSD > GRAPHIFY

Knowledge graph is disabled. To activate:

  node $HOME/.Codex/get-shit-done/bin/gsd-tools.cjs config-set graphify.enabled true

Then run /gsd:graphify build to create the initial graph.
```

---

## Step 2 -- Parse Argument

Parse `$ARGUMENTS` to determine the operation mode:

| Argument | Action |
|----------|--------|
| `build` | Run inline build (Step 3) |
| `query <term>` | Run inline query (Step 2a) |
| `status` | Run inline status check (Step 2b) |
| `diff` | Run inline diff check (Step 2c) |
| No argument or unknown | Show usage message |

**Usage message** (shown when no argument or unrecognized argument):

```
GSD > GRAPHIFY

Usage: /gsd:graphify <mode>

Modes:
  build           Build or rebuild the knowledge graph
  query <term>    Search the graph for a term
  status          Show graph freshness and statistics
  diff            Show changes since last build
```

### Step 2a -- Query

Run:

```bash
node $HOME/.Codex/get-shit-done/bin/gsd-tools.cjs graphify query <term>
```

Parse the JSON output and display results:
- If the output contains `"disabled": true`, display the disabled message from Step 1 and **STOP**
- If the output contains `"error"` field, display the error message and **STOP**
- If no nodes found, display: `No graph matches for '<term>'. Try /gsd:graphify build to create or rebuild the graph.`
- Otherwise, display matched nodes grouped by type, with edge relationships and confidence tiers (EXTRACTED/INFERRED/AMBIGUOUS)

**STOP** after displaying results. Do not spawn an agent.

### Step 2b -- Status

Run:

```bash
node $HOME/.Codex/get-shit-done/bin/gsd-tools.cjs graphify status
```

Parse the JSON output and display:
- If `exists: false`, display the message field
- Otherwise show last build time, node/edge/hyperedge counts, and STALE or FRESH indicator
- If `built_at_commit` is non-null, also display a `Source commit:` line:
  - `commit_stale === false` (rebuilt at HEAD): `Source commit: <built_at_commit> (current)`
  - `commit_stale === true` (graph behind HEAD): `Source commit: <built_at_commit> (<commits_behind> commits behind HEAD)`
  - `commit_stale === null` (unreachable commit / no git): `Source commit: <built_at_commit> (freshness unknown)`
- If `built_at_commit` is null (pre-graphify-v0.7 graph), omit the source-commit line entirely — do not render "Source commit: unknown"

The mtime-based STALE/FRESH flag and the commit-based `commit_stale` measure
different things and can disagree (e.g., a CI-built graph rebuilt minutes ago
against an old checkout reads as FRESH on mtime but `commit_stale: true`).
Surface both so the agent can choose.

**STOP** after displaying status. Do not spawn an agent.

### Step 2c -- Diff

Run:

```bash
node $HOME/.Codex/get-shit-done/bin/gsd-tools.cjs graphify diff
```

Parse the JSON output and display:
- If `no_baseline: true`, display the message field
- Otherwise show node and edge change counts (added/removed/changed)

If no snapshot exists, suggest running `build` twice (first to create, second to generate a diff baseline).

**STOP** after displaying diff. Do not spawn an agent.

---

## Step 3 -- Build (Inline)

Run the pre-flight check first:

```bash
node "$HOME/.Codex/get-shit-done/bin/gsd-tools.cjs" graphify build
```

Parse the JSON output:
- If `disabled: true`: display the disabled message from Step 1 and **STOP**
- If `error`: display the error message and **STOP**
- If `action: "spawn_agent"`: pre-flight passed -- proceed with the inline build below

(The `spawn_agent` action name is historical. The skill now performs the build inline because graphify v0.7+ split the build into a fast AST-extraction phase and a separate clustering + report-write phase. Sub-agent isolation kept the cached extraction phase alive but SIGTERM'd the post-extraction phase when the agent exited, leaving the cache populated but no `graph.json` artifacts written. The CLI still emits the `spawn_agent` signal so external callers and tests keep working.)

Display:

```text
GSD > Building knowledge graph...
```

Run the build, copy artifacts, write the diff snapshot, and report the summary in a single foreground Bash call so the whole pipeline survives to completion. Use a `timeout` of `600000` ms (10 minutes), which covers the `graphify.build_timeout` ceiling (default 300 s) with margin:

```bash
graphify update . \
  && cp graphify-out/graph.json .planning/graphs/graph.json \
  && cp graphify-out/graph.html .planning/graphs/graph.html \
  && cp graphify-out/GRAPH_REPORT.md .planning/graphs/GRAPH_REPORT.md \
  && node "$HOME/.Codex/get-shit-done/bin/gsd-tools.cjs" graphify build snapshot \
  && node "$HOME/.Codex/get-shit-done/bin/gsd-tools.cjs" graphify status
```

Do NOT pass `run_in_background: true`. Typical builds complete in 15-60 seconds and the entire chain must run foreground.

If the chain fails (non-zero exit):
- Display: `## GRAPHIFY BUILD FAILED` followed by the captured stderr
- Do NOT delete `.planning/graphs/` -- the prior valid graph remains available
- **STOP**

If the chain succeeds:
- Parse the trailing `graphify status` JSON
- Display: `## GRAPHIFY BUILD COMPLETE` with the node, edge, and hyperedge counts

---

## MVP-Mode Node Rendering

**MVP-mode rendering.** When a phase has `**Mode:** mvp` in ROADMAP.md (resolved via `gsd-sdk query roadmap.get-phase --pick mode`), render its graph node with two distinct visual signals:

1. **Distinct fill color.** Use `#22c55e` (green) for MVP-mode phase nodes. Standard phases keep the default fill color. Two-channel signaling (color + label) handles color-blind and grayscale renders.
2. **`MVP` label suffix.** Append ` (MVP)` to the node's label text. Example: a phase originally labeled `Phase 1: User Auth` renders as `Phase 1: User Auth (MVP)`.

Both signals fire together — never just one. Per PRD Q5 decision, the goal is unambiguous visual distinction in any render context.

When the phase mode is null/absent, render with the standard color and label — no behavioral change for non-MVP phases.

---

## Anti-Patterns

1. DO NOT spawn an agent for any operation -- build, query, status, and diff all run inline. Sub-agent isolation terminates background bash when the agent exits, which previously truncated graphify builds mid-write and left only the cache populated (#3166).
2. DO NOT pass `run_in_background: true` for the build chain -- the operation is fast and must complete in the foreground.
3. DO NOT modify graph files directly -- always go through `graphify update .` and the snapshot CLI.
4. DO NOT skip the config gate check.
5. DO NOT use `gsd-tools config get-value` for the config gate -- it exits on missing keys.


===== gsd-gstack-sp-orchestrator | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/SKILL.md =====

---
name: gsd-gstack-sp-orchestrator
description: >
  Full development orchestrator for Codex. Coordinates GSD planning, GStack reviews,
  Superpowers Brainstorming gate, and TDD execution through a structured loop:
  plan milestones → review decisions → brainstorm design → execute → QA → dispatch.
  Trigger with: "orchestrate", "start gss loop", "build this project with planning",
  "run the full development loop". Uses Codex-native subagents plus concrete skill IDs.
---

# GSS Orchestrator — Codex Edition

## IDENTITY

You are the GSS Orchestrator.

In Codex, skills are **instruction bundles**, not callable tools.
To load a skill, the spawned subagent's **initial message** must mention the
concrete `$skill-name`.

Rules:
- There is **no** `invoke skill ...` command
- There is **no** Claude Code `Task(...)` syntax
- Do **not** use umbrella ids like `$gsd`, `$gstack`, or `$superpowers`
- Do **not** treat a skill's metadata/frontmatter as completion
- After each subagent completes, return here and advance this state machine

Read state at every turn:
```bash
cat .planning/GSS_STATE.json 2>/dev/null || echo '{"loop_state":"IDLE"}'
```

## BOOTSTRAP — RESOLVE SKILL HOME FIRST

Resolve where this skill is installed (project-local or global), cache the
absolute path in `.planning/.gss_home`, then run setup. Every later command
reads `$(cat .planning/.gss_home)/scripts/...`, so it works regardless of
install location.

```bash
# >>> gss-resolve
mkdir -p .planning
SKILL_NAME="gsd-gstack-sp-orchestrator"
for cand in ".agents/skills/$SKILL_NAME" "$HOME/.agents/skills/$SKILL_NAME" \
            ".claude/skills/$SKILL_NAME" "$HOME/.claude/skills/$SKILL_NAME"; do
  if [ -f "$cand/scripts/setup.sh" ]; then
    GSS_HOME="$(cd "$cand" && pwd)"
    break
  fi
done
if [ -z "${GSS_HOME:-}" ]; then
  echo "ERROR: cannot locate $SKILL_NAME (looked in .agents and ~/.agents)" >&2
else
  printf '%s\n' "$GSS_HOME" > .planning/.gss_home
  bash "$GSS_HOME/scripts/setup.sh"
fi
# <<< gss-resolve
```

---

## HOW TO LOAD SKILLS IN CODEX

Bad patterns:
```text
Any literal "invoke skill ..." command
Any umbrella skill id such as $gsd / $gstack / $superpowers
Any Claude Code Task(...) block
```

Correct patterns:

Planning subagent:
```text
$gsd-new-project --auto
[the rest of the instructions]
```

CEO review subagent:
```text
$plan-ceo-review
[the rest of the instructions]
```

Engineering review subagent:
```text
$plan-eng-review
[the rest of the instructions]
```

Design plan review subagent:
```text
$plan-design-review
[the rest of the instructions]
```

Developer experience review subagent:
```text
$plan-devex-review
[the rest of the instructions]
```

Design QA subagent:
```text
$design-review
[the rest of the instructions]
```

Documentation subagent:
```text
$document-release
[the rest of the instructions]
```

QA review subagent:
```text
$qa
[the rest of the instructions]
```

Brainstorming gate subagent:
```text
$brainstorming
$writing-plans
[the rest of the instructions]
```

Execution subagent:
```text
$test-driven-development
$verification-before-completion
[the rest of the instructions]
```

Use only concrete skill ids that exist in Codex.

---

## STATE MACHINE

```text
IDLE → PROJECT_INTAKE → RESEARCH → PLANNING → GSTACK_REVIEW → GSTACK_DX_REVIEW → GSTACK_DESIGN_PLAN → SP_BRAINSTORM → SP_EXECUTING
          │                           ↑                ↑                ↑                                         ↕
          └─ existing project         │                │         (skip if no                             BLOCKED:DESIGN
             → PROJECT_DISCOVERY ─────┘                │          devex_surface)                       (→ GStack routing
                                                       │                                                 → retry brainstorm)
                                                       │
                                                       └── GSD_DISPATCH ← GSTACK_DOCS ← GSTACK_DESIGN_QA ← GSTACK_QA
                                                                        NEXT_PHASE loop

Failure retry path:
GSTACK_QA / GSTACK_DESIGN_QA / GSTACK_DOCS failure → SP_DEBUGGING → SP_EXECUTING
```

---

## PHASE 0A — PROJECT INTAKE

**Trigger:** `loop_state` is `IDLE`

Save requirements and classify project mode before research. This branch keeps
greenfield projects fast while making existing projects plan from current
reality.

Save requirements and initialize Obsidian metadata:
```bash
mkdir -p .planning
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh init-project "<project-name>"
cat > .planning/REQUIREMENTS.md << 'EOF'
[paste user's requirements here]
EOF
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh normalize-known
```

Classify project mode:
```bash
if [ -f .planning/ROADMAP.md ]; then
  PROJECT_MODE="existing_project_with_planning"
elif find . -maxdepth 2 -type f \( -name package.json -o -name pyproject.toml -o -name go.mod -o -name Cargo.toml -o -name README.md \) \
  -not -path "./.planning/*" | head -1 | grep -q .; then
  PROJECT_MODE="existing_project"
else
  PROJECT_MODE="new_project"
fi

NEXT_STATE="$([ "$PROJECT_MODE" = "new_project" ] && echo RESEARCH || echo PROJECT_DISCOVERY)"
bash $(cat .planning/.gss_home)/scripts/update_state.sh "$NEXT_STATE" "" "" "" "$PROJECT_MODE"
```

**If `PROJECT_MODE=new_project`** → PHASE 0.
**If `PROJECT_MODE=existing_project` or `existing_project_with_planning`** → PHASE 0B.

---

## PHASE 0B — PROJECT DISCOVERY

**Trigger:** `loop_state` is `PROJECT_DISCOVERY`

Existing projects need a factual map before research/planning. Discovery writes
brownfield artifacts so Phase 1 creates a **delta roadmap**, not a greenfield
roadmap.

Spawn one discovery subagent. Its **initial message must begin with**:
```text
You are gss-discoverer.

Read repository files, existing docs, manifests, tests, and existing .planning
artifacts if present. Run obvious baseline verification commands and capture
pass/fail summaries only. Do not implement code.

Project mode: [project_mode from .planning/GSS_STATE.json]
Requirements: .planning/REQUIREMENTS.md

Write:
- .planning/CURRENT_STATE.md
- .planning/CODEBASE_MAP.md
- .planning/BASELINE.md
- .planning/DOCS_INGEST.md
- .planning/INTEGRATION_RISKS.md

Use scripts/obsidian_meta.sh to normalize metadata; do not hand-write YAML.

When finished, output only:
DISCOVERY_COMPLETE
[3-line summary of current state, baseline, and main integration risk]
```

After `DISCOVERY_COMPLETE`:
```bash
ls -la .planning/CURRENT_STATE.md .planning/CODEBASE_MAP.md .planning/BASELINE.md .planning/DOCS_INGEST.md .planning/INTEGRATION_RISKS.md
bash $(cat .planning/.gss_home)/scripts/update_state.sh "RESEARCH"
```

→ PHASE 0

---

## PHASE 0 — RESEARCH

**Trigger:** `loop_state` is `RESEARCH`

Pre-planning web research feeds GSD with a compact `RESEARCH.md` so it does not
need to dispatch nested research agents. For brownfield projects, research must
validate the existing stack and integration risks from `.planning/CURRENT_STATE.md`,
`.planning/CODEBASE_MAP.md`, `.planning/BASELINE.md`, `.planning/DOCS_INGEST.md`,
and `.planning/INTEGRATION_RISKS.md`.

Spawn one researcher subagent. Its **initial message must begin with**:
```text
You are gss-researcher.

Use WebSearch and WebFetch directly — you have those tools.
Do NOT try to spawn subagents.

Read .planning/REQUIREMENTS.md plus brownfield discovery files if present:
- .planning/CURRENT_STATE.md
- .planning/CODEBASE_MAP.md
- .planning/BASELINE.md
- .planning/DOCS_INGEST.md
- .planning/INTEGRATION_RISKS.md

Gather:
- Tech stack validation (best libraries/frameworks, versions, deprecations)
- Architecture patterns (production evidence, trade-offs)
- Implementation specifics (API/schema/auth/security/perf)
- Dependency risks (compatibility, breaking changes)

Write .planning/RESEARCH.md (max 500 lines, actionable decisions only).

When finished, output only:
RESEARCH_COMPLETE
[3-line summary of most important findings]
```

After `RESEARCH_COMPLETE`:
```bash
ls -la .planning/RESEARCH.md
bash $(cat .planning/.gss_home)/scripts/update_state.sh "PLANNING"
```

→ PHASE 1

---

## PHASE 1 — PLANNING

**Trigger:** `loop_state` is `PLANNING`

GSD handles interview, roadmap, and PLAN.md draft.
Pre-planning research has already produced `.planning/RESEARCH.md` in Phase 0 —
GSD MUST consume that file as research context and SKIP its own internal research
dispatch.
For brownfield projects, GSD MUST also consume discovery artifacts and produce a
**delta roadmap** from current state to target state.

Verify Phase 0 outputs exist:
```bash
PROJECT_MODE=$(jq -r '.project_mode // "new_project"' .planning/GSS_STATE.json)
ls -la .planning/REQUIREMENTS.md .planning/RESEARCH.md
if [ "$PROJECT_MODE" != "new_project" ]; then
  ls -la .planning/CURRENT_STATE.md .planning/CODEBASE_MAP.md .planning/BASELINE.md .planning/DOCS_INGEST.md .planning/INTEGRATION_RISKS.md
fi
```

Required files must exist. If research is missing, return to PHASE 0. If brownfield
discovery files are missing, return to PHASE 0B. Do not dispatch GSD without the
right context for the project mode.

Spawn one planning subagent. Its **initial message must begin with**:
```text
$gsd-new-project --auto
Initialize planning artifacts for this project.

Requirements: .planning/REQUIREMENTS.md
Research context: .planning/RESEARCH.md  (already produced in Phase 0)
Project mode: [paste .planning/GSS_STATE.json project_mode]
Brownfield context if project_mode is not new_project:
- .planning/CURRENT_STATE.md
- .planning/CODEBASE_MAP.md
- .planning/BASELINE.md
- .planning/DOCS_INGEST.md
- .planning/INTEGRATION_RISKS.md

Run the GSD workflow using the supplied research.
SKIP GSD's internal research dispatch — RESEARCH.md is on disk and is the
authoritative research context for this milestone.
If project_mode=new_project, create a roadmap for the full new system.
If project_mode is existing_project or existing_project_with_planning, create a
delta roadmap from CURRENT_STATE/CODEBASE_MAP/BASELINE to the target in
REQUIREMENTS.md. Preserve existing architecture unless a requirement or GStack
decision explicitly changes it.
Answer any AskUserQuestion gates using the requirements when possible.
When finished, output only:
PLANNING_DONE: [current milestone name]
DEVEX_SURFACE: true or false
DEVEX_RATIONALE: [one sentence]
```

After subagent outputs `PLANNING_DONE`:
```bash
cat .planning/STATE.md
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh normalize-known
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh write-bases
DEVEX_SURFACE="<true-or-false-from-planning-output>"
DEVEX_RATIONALE="<one-sentence-rationale-from-planning-output>"
PROJECT_MODE="<new_project-or-existing_project-or-existing_project_with_planning>"
bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_REVIEW" "<milestone>" "$DEVEX_SURFACE" "$DEVEX_RATIONALE" "$PROJECT_MODE"
```

Research stays in the single file `.planning/RESEARCH.md` (compatible mode); it
is not split into per-dimension files. Frontmatter and `.planning/bases/*.base`
are managed by `scripts/obsidian_meta.sh`.

---

## PHASE 2 — GSTACK REVIEW

**Trigger:** `loop_state` is `GSTACK_REVIEW`

Read milestone plan:
```bash
source $(cat .planning/.gss_home)/scripts/resolve_gsd_paths.sh
cat "$GSD_PLAN_FILE" 2>/dev/null || cat .planning/ROADMAP.md
```

### CEO Review

Spawn one review subagent. Its **initial message must begin with**:
```text
$plan-ceo-review
Review this milestone plan. Focus on user value, scope, acceptance criteria, risk.

Plan to review:
[paste plan content]

Return only:
DECISIONS_START
1. ...
2. ...
DECISIONS_END
CEO_DONE
```

After `CEO_DONE`, log decisions:
```bash
bash $(cat .planning/.gss_home)/scripts/log_decision.sh \
  "ceo-review" "[extracted numbered decisions]"
```

### Engineering Review

Spawn one review subagent. Its **initial message must begin with**:
```text
$plan-eng-review
Review this milestone plan for architecture, dependencies, constraints, testability.

Plan to review:
[paste plan content]

CEO decisions already made:
[paste logged CEO decisions]

Return only:
DECISIONS_START
1. ...
2. ...
DECISIONS_END
ENG_DONE
```

After `ENG_DONE`:
```bash
bash $(cat .planning/.gss_home)/scripts/log_decision.sh \
  "eng-review" "[extracted numbered decisions]"

DEVEX=$(jq -r '.devex_surface // false' .planning/GSS_STATE.json)
if [ "$DEVEX" = "true" ]; then
  bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_DX_REVIEW"
else
  bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_DESIGN_PLAN"
fi

bash $(cat .planning/.gss_home)/scripts/checkpoint.sh
```

---

## PHASE 2.3 — GSTACK_DX_REVIEW

**Trigger:** `loop_state` is `GSTACK_DX_REVIEW`

Skip path:
```bash
source $(cat .planning/.gss_home)/scripts/resolve_gsd_paths.sh
DEVEX=$(jq -r '.devex_surface // false' .planning/GSS_STATE.json)
if [ "$DEVEX" != "true" ]; then
  echo "No developer-facing surface detected — skipping DX review"
  bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_DESIGN_PLAN"
  bash $(cat .planning/.gss_home)/scripts/checkpoint.sh
fi
```

If `DEVEX` is not `true`, do not spawn the DX review subagent; re-enter the loop
at PHASE 2.5 (`GSTACK_DESIGN_PLAN`) immediately.

If `DEVEX=true`, read the persisted rationale:
```bash
DEVEX_RATIONALE=$(jq -r '.devex_rationale // ""' .planning/GSS_STATE.json)
```

Then spawn one DX review subagent. Its **initial message must begin with**:
```text
$plan-devex-review
Review this milestone plan for developer experience gaps: getting-started
friction, API/CLI ergonomics, error messages, integration docs, and TTHW.

Read:
- PLAN.md
- DECISIONS.md
- REQUIREMENTS.md
- RESEARCH.md
- shared_context.md

devex_rationale: [paste DEVEX_RATIONALE from .planning/GSS_STATE.json]

Write compact DX findings to .planning/phases/<phase>/DEVEX_REVIEW.md.
Use scripts/obsidian_meta.sh to normalize metadata; do not hand-write YAML.

Return only:
DX_DECISIONS_START
1. ...
2. ...
DX_DECISIONS_END
DX_GAPS: [list]
TTHW_ESTIMATE: [estimate or unknown]
DX_STATUS: APPROVED or NEEDS_CLARIFICATION
DX_DONE
```

After `DX_DONE`:

**If `DX_STATUS: APPROVED`:**
```bash
bash $(cat .planning/.gss_home)/scripts/log_decision.sh \
  "dx-review" "[extracted numbered DX decisions]"
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh normalize-known
bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_DESIGN_PLAN"
bash $(cat .planning/.gss_home)/scripts/checkpoint.sh
```
→ PHASE 2.5

**If `DX_STATUS: NEEDS_CLARIFICATION`:**
```bash
bash $(cat .planning/.gss_home)/scripts/inject_answer.sh \
  "DX REVIEW NEEDS CLARIFICATION: [open questions]"
bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_REVIEW"
```
→ Return to PHASE 2 with DX clarification in context

---

## PHASE 2.5 — GSTACK DESIGN PLAN REVIEW

**Trigger:** `loop_state` is `GSTACK_DESIGN_PLAN`

Spawn one design subagent. Its **initial message must begin with**:
```text
$plan-design-review
Review this milestone plan for UI/UX, interaction design, visual hierarchy,
accessibility, product-design risk, and fit with existing design direction.

Plan to review:
[paste plan content]

Existing decisions:
[paste logged CEO/engineering decisions]

Developer experience review:
[paste DEVEX_REVIEW.md if present]

Use $design-consultation if no design direction exists.
Use $design-shotgun if multiple visual directions are needed.
Use $design-html if a concrete HTML design artifact is required.

Write compact design notes to .planning/phases/<phase>/DESIGN.md when needed.
Use scripts/obsidian_meta.sh to normalize metadata; do not hand-write YAML.

Return only:
DESIGN_DECISIONS_START
1. ...
2. ...
DESIGN_DECISIONS_END
DESIGN_PLAN_STATUS: APPROVED or NEEDS_CLARIFICATION
DESIGN_PLAN_DONE
```

After `DESIGN_PLAN_DONE`:

**If `DESIGN_PLAN_STATUS: APPROVED`:**
```bash
bash $(cat .planning/.gss_home)/scripts/log_decision.sh \
  "design-plan" "[extracted numbered design decisions]"
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh normalize-known
bash $(cat .planning/.gss_home)/scripts/update_state.sh "SP_BRAINSTORM"
bash $(cat .planning/.gss_home)/scripts/checkpoint.sh
```
→ PHASE 3

**If `DESIGN_PLAN_STATUS: NEEDS_CLARIFICATION`:**
```bash
bash $(cat .planning/.gss_home)/scripts/inject_answer.sh \
  "DESIGN PLAN NEEDS CLARIFICATION: [open questions]"
bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_REVIEW"
```
→ Return to PHASE 2 with design clarification in context

---

## PHASE 3 — SUPERPOWERS BRAINSTORMING GATE

**Trigger:** `loop_state` is `SP_BRAINSTORM`

This is a **HARD GATE** — execution cannot start until design is confirmed here.
The brainstormer reads codebase + DECISIONS.md, proposes 2-3 approaches with YAGNI
filter, confirms the best approach, then refines PLAN.md with implementation details.

Spawn one brainstorming subagent. Its **initial message must begin with**:
```text
$brainstorming
$writing-plans

You are the design gate for GSS Orchestrator. Your job:
1. Read codebase structure + DECISIONS.md + PLAN.md draft
2. Propose 2-3 implementation approaches for this milestone (apply YAGNI filter)
3. Confirm the best approach using DECISIONS.md constraints (HARD GATE — do not guess)
4. Refine PLAN.md in place with implementation details and test stubs
5. Write BRAINSTORM_DOC.md with the confirmed approach rationale

Current milestone: [milestone id from STATE.md]
Decisions: .planning/phases/<milestone>/DECISIONS.md
PLAN.md draft: .planning/phases/<milestone>/PLAN.md

If no approach can be confirmed from DECISIONS.md alone, output:
BRAINSTORM_BLOCKED: [question with 2-3 options A) B) C)]
STOP.

If design is confirmed, output:
BRAINSTORM_DONE: [selected approach name]
```

After subagent output:

**If `BRAINSTORM_DONE`:**
```bash
bash $(cat .planning/.gss_home)/scripts/write_exec_prompt_codex.sh
bash $(cat .planning/.gss_home)/scripts/update_state.sh "SP_EXECUTING"
bash $(cat .planning/.gss_home)/scripts/checkpoint.sh
```
→ PHASE 4

**If `BRAINSTORM_BLOCKED`:**

Route the design question to GStack. Spawn one review subagent:
```text
$plan-eng-review
Answer this design question from the Superpowers brainstorming gate.

Question:
[paste BRAINSTORM_BLOCKED question]

Return only:
ROLE: ENG
DECISION: [single clear answer]
QA_ANSWER_DONE
```
(Use `$plan-ceo-review` if question is about product scope or acceptance criteria.)

After `QA_ANSWER_DONE`:
```bash
bash $(cat .planning/.gss_home)/scripts/log_decision.sh \
  "brainstorm-gate" "[role + decision]"
bash $(cat .planning/.gss_home)/scripts/inject_answer.sh "[decision]"
```
→ Re-spawn brainstorming subagent (return to top of Phase 3)

---

## PHASE 4 — EXECUTE (HEADLESS TDD)

**Trigger:** `loop_state` is `SP_EXECUTING`

Build the Codex execution prompt:
```bash
source $(cat .planning/.gss_home)/scripts/resolve_gsd_paths.sh
bash $(cat .planning/.gss_home)/scripts/write_exec_prompt_codex.sh
cat "$GSD_EXEC_PROMPT"
```

Spawn one execution subagent and use the full contents of `EXEC_PROMPT.md`
as the **initial message**. That prompt already starts with:
```text
$test-driven-development
$verification-before-completion
```

Expected subagent outputs:
- `PHASE_COMPLETE`
- `PHASE_BLOCKED:[question with 2-3 options]`
- `PHASE_BLOCKED:TECH:[description]`

After subagent completes:

**If output contains `PHASE_COMPLETE`:**
```bash
bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_QA"
```
→ PHASE 5

**If output contains `PHASE_BLOCKED:`:**
Extract the question → route via GStack (same pattern as Phase 3 routing) → re-spawn executor

**If no signal** — check implicit done:
```bash
grep -c "^\- \[ \]" "$GSD_PLAN_FILE" && echo "tasks pending" || echo "all done"
```

### Phase 4b — Route Blocked Question

```bash
bash $(cat .planning/.gss_home)/scripts/route_question.sh "<question>"
```

Route by role (CEO or ENG), spawn GStack subagent, receive `QA_ANSWER_DONE`:
```bash
bash $(cat .planning/.gss_home)/scripts/log_decision.sh \
  "sp-blocked" "[role + decision]"
bash $(cat .planning/.gss_home)/scripts/inject_answer.sh "[decision]"
```
→ Re-spawn execution subagent (return to Phase 4)

---

## PHASE 5 — QA VALIDATION

**Trigger:** `loop_state` is `GSTACK_QA`

```bash
source $(cat .planning/.gss_home)/scripts/resolve_gsd_paths.sh
grep -A10 -i "acceptance criteria" "$GSD_PLAN_FILE" | head -15
```

Spawn one GStack QA review subagent. Its **initial message must begin with**:
```text
$qa
Validate this completed milestone against PLAN.md acceptance criteria.

Read:
- PLAN.md
- DECISIONS.md
- BRAINSTORM_DOC.md
- shared_context.md

Then:
1. Use the GStack QA role to decide what validation is required
2. Run or request the relevant test commands/checks
3. Check whether all unchecked tasks are done
4. Compare acceptance criteria against observed coverage

Return only:
QA_STATUS: PASSED or FAILED
ISSUES: [list issues if failed, or "none"]
QA_DONE
```

After `QA_DONE`:

**If `QA_STATUS: PASSED`:**
```bash
bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_DESIGN_QA"
```
→ PHASE 5.5

**If `QA_STATUS: FAILED`:**
```bash
bash $(cat .planning/.gss_home)/scripts/inject_answer.sh "QA FAILED: [issues]. Run systematic debugging before fixing."
bash $(cat .planning/.gss_home)/scripts/update_state.sh "SP_DEBUGGING"
```
→ PHASE 5.7

---

## PHASE 5.5 — GSTACK DESIGN QA

**Trigger:** `loop_state` is `GSTACK_DESIGN_QA`

Spawn one design QA subagent. Its **initial message must begin with**:
```text
$design-review
Run post-implementation visual/design QA for this completed milestone.

Read:
- PLAN.md
- DECISIONS.md
- BRAINSTORM_DOC.md
- .planning/DESIGN.md and .planning/phases/<phase>/DESIGN.md if present
- implementation artifacts and relevant screenshots/test evidence

Write the compact report to .planning/phases/<phase>/DESIGN_QA.md.
Use scripts/obsidian_meta.sh to normalize metadata; do not hand-write YAML.

Return only:
DESIGN_QA_STATUS: PASSED or FAILED or SKIPPED
ISSUES: [list issues if failed, or "none"]
DESIGN_QA_DONE
```

After `DESIGN_QA_DONE`:

**If `DESIGN_QA_STATUS: PASSED` or `SKIPPED`:**
```bash
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh normalize-known
bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_DOCS"
```
→ PHASE 5.6

**If `DESIGN_QA_STATUS: FAILED`:**
```bash
bash $(cat .planning/.gss_home)/scripts/inject_answer.sh \
  "DESIGN QA FAILED: [issues]. Run systematic debugging before fixing."
bash $(cat .planning/.gss_home)/scripts/update_state.sh "SP_DEBUGGING"
```
→ PHASE 5.7

---

## PHASE 5.6 — GSTACK DOCUMENTATION

**Trigger:** `loop_state` is `GSTACK_DOCS`

Spawn one documentation subagent. Its **initial message must begin with**:
```text
$document-release
Update release documentation for the completed milestone after functional QA and
design QA have passed.

Read:
- PLAN.md
- DECISIONS.md
- BRAINSTORM_DOC.md
- DEVEX_REVIEW.md if present
- DESIGN_QA.md
- changed files from git

Use $document-generate only for missing feature/module/user docs.
Use $make-pdf only when this milestone explicitly requires a PDF.

Write the compact report to .planning/phases/<phase>/DOCS_REPORT.md.
Use scripts/obsidian_meta.sh to normalize metadata; do not hand-write YAML.

Return only:
DOCS_STATUS: DOCS_DONE or NEEDS_CLARIFICATION
DOCS_UPDATED: [list]
DOCS_CREATED: [list]
DOCS_DONE
```

After `DOCS_DONE`:

**If `DOCS_STATUS: DOCS_DONE`:**
```bash
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh normalize-known
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh write-bases
bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSD_DISPATCH"
```
→ PHASE 6

**If `DOCS_STATUS: NEEDS_CLARIFICATION`:**
```bash
bash $(cat .planning/.gss_home)/scripts/inject_answer.sh \
  "DOCS NEED CLARIFICATION: [open questions]. Run systematic debugging before fixing."
bash $(cat .planning/.gss_home)/scripts/update_state.sh "SP_DEBUGGING"
```
→ PHASE 5.7

---

## PHASE 5.7 — SUPERPOWERS SYSTEMATIC DEBUGGING

**Trigger:** `loop_state` is `SP_DEBUGGING`

Validation failures do not go straight back to implementation. First, run a
root-cause pass so the executor fixes the cause, not the symptom.

Spawn one debugging subagent. Its **initial message must begin with**:
```text
$systematic-debugging
Investigate the latest validation failure before implementation retry.

Read:
- PLAN.md
- DECISIONS.md
- BRAINSTORM_DOC.md
- DESIGN_QA.md if present
- DOCS_REPORT.md if present
- DEBUG_REPORT.md if present
- logs under .planning/phases/<phase>/logs
- current EXEC_PROMPT.md injected failure context

Follow the systematic-debugging workflow: reproduce or inspect the failure,
compare against working patterns, identify root cause, and prepare a fix handoff.
Do not modify implementation code.

Write .planning/phases/<phase>/DEBUG_REPORT.md.
Use scripts/obsidian_meta.sh to normalize metadata; do not hand-write YAML.
Inject the concise root-cause handoff into EXEC_PROMPT.md with inject_answer.sh.

Return only:
DEBUG_STATUS: ROOT_CAUSE_FOUND or NEEDS_MORE_EVIDENCE
ROOT_CAUSE: [specific cause]
FAILING_TEST: [specific behavior executor should test]
MINIMAL_FIX: [specific direction]
DEBUG_DONE
```

After `DEBUG_DONE`:

**If `DEBUG_STATUS: ROOT_CAUSE_FOUND`:**
```bash
bash $(cat .planning/.gss_home)/scripts/update_state.sh "SP_EXECUTING"
```
→ PHASE 4

**If `DEBUG_STATUS: NEEDS_MORE_EVIDENCE`:**
Surface the requested evidence to the user or the appropriate GStack reviewer.
Do not return to execution until root cause is known.

---

## PHASE 6 — DISPATCH NEXT MILESTONE

**Trigger:** `loop_state` is `GSD_DISPATCH`

Spawn one dispatch subagent. Its **initial message must begin with**:
```text
$gsd-complete-milestone
$gsd-progress --next --force

Complete the current milestone and advance to the next.

Completed milestone: [milestone name]
Completed milestones so far: [list from GSS_STATE.json]

Roadmap:
[paste ROADMAP.md]

After GSD completion/progress finishes, run the deterministic sync script for
completed milestone before returning NEXT_PHASE or DELIVERED:
```bash
bash $(cat .planning/.gss_home)/scripts/mark_milestone_done.sh "[milestone name]"
```

Return only one of:
NEXT_PHASE: [milestone-id]
DELIVERED
```

**If `NEXT_PHASE: <id>`:**
```bash
bash $(cat .planning/.gss_home)/scripts/mark_milestone_done.sh "<completed-milestone-id>"
bash $(cat .planning/.gss_home)/scripts/update_shared_context.sh
bash $(cat .planning/.gss_home)/scripts/update_state.sh "GSTACK_REVIEW" "<id>"
bash $(cat .planning/.gss_home)/scripts/checkpoint.sh --milestone
```
→ Return to PHASE 2

**If `DELIVERED`:**
```bash
bash $(cat .planning/.gss_home)/scripts/mark_milestone_done.sh "<completed-milestone-id>"
bash $(cat .planning/.gss_home)/scripts/update_state.sh "DELIVERED"
bash $(cat .planning/.gss_home)/scripts/print_summary.sh
```

---

## CONTEXT HYGIENE

After every subagent completion, run:
```bash
bash $(cat .planning/.gss_home)/scripts/checkpoint.sh
```

After each phase, run:
```bash
bash $(cat .planning/.gss_home)/scripts/checkpoint.sh --phase
```

---

## FILE COMMUNICATION CONTRACT

| File | Written by | Read by |
|------|-----------|---------|
| `REQUIREMENTS.md` | Orchestrator | Planning subagent (GSD) |
| `CURRENT_STATE.md` | Discovery subagent | Researcher, planning subagent, GStack reviewers |
| `CODEBASE_MAP.md` | Discovery subagent | Researcher, planning subagent, brainstorming gate |
| `BASELINE.md` | Discovery subagent | Planning subagent, QA/debugging subagents |
| `DOCS_INGEST.md` | Discovery subagent | Planning and docs subagents |
| `INTEGRATION_RISKS.md` | Discovery subagent | Researcher, planning subagent, GStack reviewers |
| `RESEARCH.md` | Researcher subagent | Planning subagent (GSD) |
| `ROADMAP.md` | Planning subagent (GSD) | Orchestrator, review subagents |
| `PLAN.md` (draft) | Planning subagent (GSD) | Brainstorming gate subagent |
| `DECISIONS.md` | Review subagents (GStack) | Brainstorming gate, executor |
| `DESIGN.md` | Design subagent (GStack) | Brainstorming gate, executor, docs subagent |
| `DEVEX_REVIEW.md` | DX review subagent (GStack) | Design subagent, docs subagent |
| `BRAINSTORM_DOC.md` | Brainstorming gate subagent | Executor (via EXEC_PROMPT) |
| `PLAN.md` (refined) | Brainstorming gate subagent | Executor |
| `EXEC_PROMPT.md` | write_exec_prompt_codex.sh | Executor subagent |
| `DESIGN_QA.md` | Design subagent (GStack) | Docs subagent, dispatch summary |
| `DEBUG_REPORT.md` | Debugging subagent (Superpowers) | Executor subagent |
| `DOCS_REPORT.md` | Docs subagent (GStack) | Dispatch summary |

---

## RECOVERY

```bash
cat .planning/GSS_STATE.json
cat .planning/STATE.md
```

Resume from `loop_state` shown. Orchestrator identity resumes immediately.

---

## OBSIDIAN DOCUMENT STANDARD

All `.planning/` documents carry Obsidian YAML frontmatter so they can be queried
via `.planning/bases/*.base` in any Obsidian vault. Frontmatter is written and
maintained by `scripts/obsidian_meta.sh` — the orchestrator and subagents should
not hand-write it.

This orchestrator runs in **compatible mode**: research lives in the single file
`.planning/RESEARCH.md` (frontmatter `type: research`, `research_dimension:
summary`). Research is not split into per-dimension files under a research/
subfolder.

### Project Slug

Derived once in Phase 0 and stored in `.planning/.project_slug`. Format:
lowercase, hyphenated, alphanumeric only.

```bash
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh init-project "<project name>"
cat .planning/.project_slug
```

`init-project "<name>"` sets the slug intentionally and overrides a placeholder
derived earlier from the directory name. The argument-less `init-project` used by
the every-turn bootstrap is no-clobber: it only derives a slug from the directory
when none exists yet, so it never overwrites the name chosen here in Phase 0.

### Normalizing Frontmatter

After any subagent writes or updates a known artifact, normalize metadata:

```bash
bash $(cat .planning/.gss_home)/scripts/obsidian_meta.sh normalize-known
```

`normalize-known` manages frontmatter for these document types:

| File | type |
|------|------|
| `REQUIREMENTS.md` | `requirements` |
| `RESEARCH.md` | `research` (`research_dimension: summary`) |
| `PROJECT.md` | `project` |
| `ROADMAP.md` | `roadmap` |
| `DECISIONS.md` | `decision-log` |
| `DESIGN.md` | `design` |
| `shared_context.md` | `shared-context` |
| `CURRENT_STATE.md` | `current-state` |
| `CODEBASE_MAP.md` | `codebase-map` |
| `BASELINE.md` | `baseline` |
| `DOCS_INGEST.md` | `docs-ingest` |
| `INTEGRATION_RISKS.md` | `integration-risks` |
| `CHECKPOINT_HISTORY.md` | `checkpoint-log` |
| `phases/<phase>/PLAN.md` | `plan` |
| `phases/<phase>/DECISIONS.md` | `decision-log` |
| `phases/<phase>/DESIGN.md` | `design` |
| `phases/<phase>/DESIGN_QA.md` | `design-qa` |
| `phases/<phase>/DEVEX_REVIEW.md` | `devex-review` |
| `phases/<phase>/DEBUG_REPORT.md` | `debug-report` |
| `phases/<phase>/DOCS_REPORT.md` | `documentation` |
| `phases/<phase>/BRAINSTORM_DOC.md` | `brainstorm` |
| `phases/<phase>/EXEC_PROMPT.md` | `execution-prompt` |

The helper preserves existing body content and unmanaged frontmatter fields,
keeps the original `created` date, refreshes `updated`, and adds `project`,
`phase`, and wikilink fields where applicable.

### Bases Files

Generated into `.planning/bases/` by `scripts/obsidian_meta.sh write-bases`:

| File | Queries |
|------|---------|
| `project-dashboard.base` | All documents grouped by type |
| `phases.base` | All PLAN.md files with status |
| `research.base` | Research docs by dimension |
| `decisions.base` | Decision logs grouped by phase |


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/.codex-plugin/plugin.json =====

{
  "name": "gsd-gstack-sp-orchestrator",
  "version": "1.0.1",
  "description": "GSS Orchestrator: GSD + GStack + Superpowers development loop",
  "skills": "../",
  "publisher": "gss-orchestrator",
  "license": "MIT"
}


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/agents/openai.yaml =====

display_name: "GSS Orchestrator"
description: >
  Full development orchestrator: GSD planning → GStack review →
  Superpowers TDD execution → QA validation → phase dispatch.
allow_implicit_invocation: true
dependencies:
  skills:
    - gsd-new-project
    - gsd-progress
    - plan-ceo-review
    - plan-eng-review
    - plan-devex-review
    - plan-design-review
    - design-review
    - design-consultation
    - design-shotgun
    - design-html
    - document-generate
    - document-release
    - make-pdf
    - qa
    - systematic-debugging
    - test-driven-development
    - verification-before-completion
policy:
  require_confirmation_before_scripts: false
  allow_file_modification: true


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/references/decisions-template.md =====

---
title: "Decisions"
type: decision-log
project_slug: project
tags:
  - gsd
  - decision-log
  - project/project
created: 1970-01-01
updated: 1970-01-01
---

# DECISIONS.md — GSS Audit Trail

Mọi quyết định từ GStack đều được ghi vào đây.
Đây là nguồn sự thật khi có conflict hoặc cần replay.

Format mỗi entry:
```
### [timestamp] <type>: <gstack-skill-used>
**Context:** <đang làm gì>
**Question / Topic:** <câu hỏi hoặc chủ đề review>
**Decision:** <quyết định cụ thể>
**Rationale:** <lý do ngắn gọn>
**Impact:** <tasks hoặc phases bị ảnh hưởng>
```

---

<!-- Entries được append tự động bởi log_decision.sh -->
<!-- Frontmatter được normalize bởi scripts/obsidian_meta.sh -->


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/references/exec-prompt-template.md =====

# EXEC_PROMPT.md — Template cho ralph-loop

File này được tạo tự động bởi `write_exec_prompt.sh`.
Đây là prompt được feed vào `/ralph-loop` — mỗi iteration Claude đọc lại file này.

## Cấu trúc

```
[1] MISSION         — tóm tắt mục tiêu của loop
[2] GSTACK DECISIONS — decisions đã approved, authoritative
[3] SHARED CONTEXT  — artifacts từ milestones trước
[4] PLAN.md         — danh sách tasks với trạng thái [ ]/[x]
[5] TDD PROTOCOL    — RED/GREEN/REFACTOR mandatory
[6] COMPLETION SIGNALS — cách output promise
[7] ITERATION AWARENESS — context về loop behavior
[8] GSTACK ANSWER (optional) — append bởi inject_answer.sh khi có blocking
```

## Tại sao PLAN.md nằm trong prompt?

Ralph-loop re-feed cùng một prompt mỗi iteration. Nhưng PLAN.md là **live file** —
Claude check off tasks [x] trong quá trình execute. Khi prompt được re-feed,
Claude đọc lại PLAN.md từ disk (không phải từ prompt text cố định), biết chính xác
task nào còn lại mà không bị confused bởi trạng thái cũ trong prompt.

Script `write_exec_prompt.sh` embed nội dung PLAN.md vào prompt lúc tạo,
nhưng Claude được instructed luôn đọc file thực từ disk trước khi bắt đầu mỗi iteration.

## Completion promise design

| Tình huống | Output | ralph-loop action |
|---|---|---|
| Tất cả tasks done, tests pass | `<promise>PHASE_COMPLETE</promise>` | Loop exit → orchestrator → GStack QA |
| Cần GStack decision | `<promise>BLOCKED:<question></promise>` | Loop exit → orchestrator → route_question → inject_answer → restart |
| Technical blocker | `<promise>BLOCKED:TECH:<desc></promise>` | Loop exit → orchestrator → /plan-eng-review → restart |
| Còn tasks nhưng chưa xong | _(không output gì)_ | Stop hook re-feed prompt → Claude tiếp tục |

## Max iterations guidance

- `15` — mặc định cho milestones bình thường
- `10` — QA retry sau failure
- `20+` — milestones phức tạp với nhiều tasks
- Luôn set `--max-iterations` — không để loop vô hạn


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/references/plugin-commands.md =====

# Plugin Commands — GSS Orchestrator

## Execute Engine — run_phase.sh (bash while loop + claude -p)

**Nguyên tắc:** Không chạy bất kỳ implementation code nào trong orchestrator session.
Mọi execution đi qua `run_phase.sh` → subprocess riêng → context sạch.

| Lệnh | Dùng khi |
|---|---|
| `bash scripts/run_phase.sh` | Execute phase, dùng max_iter từ config |
| `bash scripts/run_phase.sh --max-iterations 25` | Override max iterations |
| `bash scripts/run_phase.sh --mode qa_retry` | Sau QA fail, dùng qa_retry_max_iterations |

**Cấu hình max-iterations** (sửa trong `.planning/config.json`):
```json
"ralph_loop": {
  "default_max_iterations": 15,
  "qa_retry_max_iterations": 10
}
```

**Output:**
- exit 0 → DONE, all tasks complete
- exit 1 → BLOCKED, đọc `.planning/milestones/current/BLOCKED_QUESTION.txt`
- exit 2 → max iterations reached, cần review logs

---

## GSD

| Command | Dùng khi |
|---|---|
| `/gsd-new-project` | Bắt đầu project mới |
| `/gsd-new-milestone "name"` | Tạo milestone mới |
| `/gsd-complete-milestone` | Archive milestone, dispatch kế |
| `/gsd:quick "task"` | Task nhỏ, skip planning |
| `/gsd-resume` | Resume sau interrupt |

---

## GStack

| Command | Role | Dùng khi |
|---|---|---|
| `/gstack:ceo` | CEO/PM | User problem, scope, acceptance criteria |
| `/plan-ceo-review` | CEO | Full plan review từ product perspective |
| `/plan-eng-review` | Eng Manager | Architecture, feasibility, dependencies |
| `/gstack:engineer` | Tech Lead | Blocked question từ run_phase.sh |
| `/gstack:qa` | QA Lead | Validate milestone vs acceptance criteria |
| `/gstack:release-manager` | Release Mgr | Changelog, deployment |

**Routing BLOCKED_QUESTION → GStack:**
```
Question chứa                    → GStack skill
────────────────────────────────────────────────
business/user/scope/requirement → /gstack:ceo
architecture/pattern/schema/api → /plan-eng-review
implement/library/how to        → /gstack:engineer
edge case/validate/error/test   → /gstack:qa
deploy/infra/env/ci             → /gstack:release-manager
security/auth/permission        → /plan-eng-review
```

**Quan trọng:** GStack chạy trong orchestrator session — context nhẹ vì không có
implementation details. Đây là lý do orchestrator session phải giữ sạch.

---

## Flow đầy đủ

```bash
# Setup
bash scripts/setup.sh

# Milestone
/gsd-new-project
/plan-ceo-review && bash scripts/log_decision.sh "ceo-review" "..."
/plan-eng-review && bash scripts/log_decision.sh "eng-review" "..."

# Execute — subagent loop, KHÔNG dùng /ralph-loop
bash scripts/write_exec_prompt.sh
bash scripts/run_phase.sh
# → exit 0: tiếp tục QA
# → exit 1: blocked
#     bash scripts/route_question.sh "$(cat .planning/milestones/current/BLOCKED_QUESTION.txt)"
#     /gstack:engineer  (hoặc skill phù hợp)
#     bash scripts/inject_answer.sh "<answer>"
#     bash scripts/run_phase.sh  ← restart

# QA + Dispatch
/gstack:qa
/gsd-complete-milestone
bash scripts/update_shared_context.sh
# → next milestone: lặp lại từ /gsd-new-milestone
# → no more: bash scripts/print_summary.sh
```


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/checkpoint.sh =====

#!/usr/bin/env bash
# scripts/checkpoint.sh
# Compact checkpoint — gọi trước /compact để đảm bảo state đầy đủ.
# Sau /compact, GSD tự resume qua HANDOFF.json.
# Script này bổ sung thêm GSS-specific state vào HANDOFF.json.
#
# Usage:
#   bash scripts/checkpoint.sh              ← checkpoint thường
#   bash scripts/checkpoint.sh --milestone  ← sau khi complete milestone
#   bash scripts/checkpoint.sh --phase      ← sau khi complete phase

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/resolve_gsd_paths.sh"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

MODE="${1:---normal}"
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STATE_FILE=".planning/GSS_STATE.json"
HANDOFF_FILE=".planning/HANDOFF.json"
CHECKPOINT_LOG=".planning/CHECKPOINT_HISTORY.md"
OBSIDIAN_META="$SCRIPT_DIR/obsidian_meta.sh"

# ── 1. Đọc state hiện tại ──────────────────────────────────────────────────
CURRENT_STATE=$(cat "$STATE_FILE" 2>/dev/null || echo "{}")
CURRENT_PHASE="${GSD_CURRENT_PHASE:-unknown}"
PLAN_FILE="${GSD_PLAN_FILE:-none}"

# Tasks còn lại
PENDING_TASKS=0
DONE_TASKS=0
if [ -f "$PLAN_FILE" ]; then
  PENDING_TASKS=$(grep -c "^\- \[ \]" "$PLAN_FILE" 2>/dev/null || echo 0)
  DONE_TASKS=$(grep -c "^\- \[x\]" "$PLAN_FILE" 2>/dev/null || echo 0)
fi

# ── 2. Ghi GSS addon vào HANDOFF.json ─────────────────────────────────────
# GSD tự quản lý HANDOFF.json — chúng ta chỉ merge thêm gss_state
if [ -f "$HANDOFF_FILE" ] && command -v jq &>/dev/null; then
  GSS_ADDON=$(cat << JSON
{
  "gss_state": {
    "checkpoint_at": "$TS",
    "mode": "$MODE",
    "current_phase": "$CURRENT_PHASE",
    "plan_file": "$PLAN_FILE",
    "tasks_done": $DONE_TASKS,
    "tasks_pending": $PENDING_TASKS,
    "exec_prompt_exists": $([ -f "$GSD_EXEC_PROMPT" ] && echo true || echo false),
    "blocked_question": "$(cat "$GSD_BLOCKED_FILE" 2>/dev/null | head -1 | tr '"' "'")",
    "loop_state": $(echo "$CURRENT_STATE" | jq -r '.loop_state // "unknown"' | xargs -I{} echo '"{}"')
  }
}
JSON
)
  jq ". + $GSS_ADDON" "$HANDOFF_FILE" > "${HANDOFF_FILE}.tmp" 2>/dev/null \
    && mv "${HANDOFF_FILE}.tmp" "$HANDOFF_FILE" \
    || true  # nếu jq fail, HANDOFF.json vẫn nguyên vẹn
else
  # Tạo minimal HANDOFF nếu chưa có (GSD sẽ overwrite khi /compact)
  cat > "$HANDOFF_FILE" << JSON
{
  "gss_state": {
    "checkpoint_at": "$TS",
    "current_phase": "$CURRENT_PHASE",
    "plan_file": "$PLAN_FILE",
    "tasks_done": $DONE_TASKS,
    "tasks_pending": $PENDING_TASKS,
    "loop_state": "CHECKPOINT"
  }
}
JSON
fi

# ── 3. Ghi DECISIONS.md summary ngắn để context sau compact không bị mất ──
LAST_DECISIONS=$(cat "$GSD_DECISIONS_FILE" 2>/dev/null | tail -60 || echo "none")
RESUMPTION_HINT=""

if [ "$PENDING_TASKS" -gt 0 ]; then
  RESUMPTION_HINT="Phase $CURRENT_PHASE in progress. $DONE_TASKS tasks done, $PENDING_TASKS pending. Run: bash scripts/run_phase.sh"
elif [ -f "$GSD_BLOCKED_FILE" ]; then
  Q=$(cat "$GSD_BLOCKED_FILE" 2>/dev/null | head -1)
  RESUMPTION_HINT="BLOCKED waiting for GStack decision: $Q. Run: bash scripts/route_question.sh"
else
  RESUMPTION_HINT="Phase $CURRENT_PHASE complete. Run GStack QA, design QA, docs, then GSD dispatch"
fi

# ── 4. Append vào checkpoint history ──────────────────────────────────────
touch "$CHECKPOINT_LOG"
if [ -x "$OBSIDIAN_META" ]; then
  bash "$OBSIDIAN_META" ensure-frontmatter "$CHECKPOINT_LOG" checkpoint-log
fi

cat >> "$CHECKPOINT_LOG" << LOG

---
## Checkpoint [$TS] mode=$MODE
- Phase: $CURRENT_PHASE
- Tasks: $DONE_TASKS done / $PENDING_TASKS pending
- Loop state: $(echo "$CURRENT_STATE" | grep -o '"loop_state": "[^"]*"' | head -1)
- Resumption: $RESUMPTION_HINT
LOG

# ── 5. Print tối giản ra stdout ───────────────────────────────────────────
echo ""
echo "━━ GSS Checkpoint [$MODE] ━━"
echo "  Phase  : $CURRENT_PHASE"
echo "  Tasks  : ✓$DONE_TASKS pending:$PENDING_TASKS"
echo "  Resume : $RESUMPTION_HINT"
echo ""
echo -e "${GREEN}✓ State saved to HANDOFF.json + CHECKPOINT_HISTORY.md${NC}"
echo ""
echo -e "${YELLOW}Now run /compact in Claude Code.${NC}"
echo "GSD will auto-resume from HANDOFF.json when session restarts."
echo "After resuming, re-run: bash scripts/checkpoint.sh --verify"


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/inject_answer.sh =====

#!/usr/bin/env bash
# scripts/inject_answer.sh
# Append GStack answer vào EXEC_PROMPT.md để Task tool retry với context đầy đủ.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/resolve_gsd_paths.sh"

ANSWER="${1:-}"
[ -z "$ANSWER" ] && echo "Usage: inject_answer.sh '<answer>'" && exit 1

EXEC_PROMPT="$GSD_EXEC_PROMPT"
DECISIONS_FILE="$GSD_DECISIONS_FILE"
OBSIDIAN_META="$SCRIPT_DIR/obsidian_meta.sh"

[ ! -f "$EXEC_PROMPT" ] && \
  echo "ERROR: EXEC_PROMPT.md not found. Run write_exec_prompt.sh first." && exit 1

TS=$(date -u +"%Y-%m-%d %H:%M UTC")

# Append vào EXEC_PROMPT — Task tool sẽ thấy khi retry
cat >> "$EXEC_PROMPT" << INJECT

━━ GSTACK ANSWER [$TS] ━━
Decision applied — do NOT ask this again.
$ANSWER

Resume executing next unchecked [ ] task with this decision.
INJECT

# Đồng thời log vào DECISIONS.md
mkdir -p "$(dirname "$DECISIONS_FILE")"
touch "$DECISIONS_FILE"
if [ -x "$OBSIDIAN_META" ]; then
  bash "$OBSIDIAN_META" ensure-frontmatter "$DECISIONS_FILE" decision-log "${GSD_CURRENT_PHASE:-}"
fi

{
  echo ""
  echo "---"
  echo "### [$TS] injected-answer"
  echo "$ANSWER"
} >> "$DECISIONS_FILE"

echo "✓ Answer injected into EXEC_PROMPT.md ($TS)"
echo "  Task tool retry will have this context."


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/install_browser_automation_deps.sh =====

#!/usr/bin/env bash
# install_browser_automation_deps.sh
# Install Playwright + Stagehand and scaffold custom-provider config.

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Checking browser automation dependencies..."

if [ ! -f "package.json" ]; then
  echo -e "  ${YELLOW}⚠${NC} package.json not found — skipped Playwright/Stagehand install"
  echo "     Run inside a Node.js project, or create package.json first."
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} node not found — cannot install Playwright/Stagehand"
  exit 1
fi

copy_template() {
  local src="$1"
  local dest="$2"
  local label="$3"

  if [ -f "$dest" ]; then
    echo -e "  ${YELLOW}↺${NC} $label exists — skipped"
    return
  fi

  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  echo -e "  ${GREEN}✓${NC} $label → $dest"
}

has_installed_package() {
  local pkg="$1"
  node -e '
    try {
      require.resolve(process.argv[1]);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  ' "$pkg"
}

PM=""
INSTALL_CMD=""
PLAYWRIGHT_CMD=""

if [ -f "pnpm-lock.yaml" ] && command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
  INSTALL_CMD="pnpm add -D playwright @playwright/test @browserbasehq/stagehand"
  PLAYWRIGHT_CMD="pnpm exec playwright install"
elif [ -f "yarn.lock" ] && command -v yarn >/dev/null 2>&1; then
  PM="yarn"
  INSTALL_CMD="yarn add -D playwright @playwright/test @browserbasehq/stagehand"
  PLAYWRIGHT_CMD="yarn playwright install"
elif [ -f "bun.lockb" ] && command -v bun >/dev/null 2>&1; then
  PM="bun"
  INSTALL_CMD="bun add -d playwright @playwright/test @browserbasehq/stagehand"
  PLAYWRIGHT_CMD="bunx playwright install"
elif [ -f "package-lock.json" ] && command -v npm >/dev/null 2>&1; then
  PM="npm"
  INSTALL_CMD="npm install --save-dev playwright @playwright/test @browserbasehq/stagehand"
  PLAYWRIGHT_CMD="npx playwright install"
elif command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
  INSTALL_CMD="pnpm add -D playwright @playwright/test @browserbasehq/stagehand"
  PLAYWRIGHT_CMD="pnpm exec playwright install"
elif command -v npm >/dev/null 2>&1; then
  PM="npm"
  INSTALL_CMD="npm install --save-dev playwright @playwright/test @browserbasehq/stagehand"
  PLAYWRIGHT_CMD="npx playwright install"
else
  echo -e "  ${RED}✗${NC} No supported package manager found (pnpm/npm/yarn/bun)"
  exit 1
fi

echo -e "  ${GREEN}✓${NC} package manager: $PM"

MISSING_PACKAGES=()
has_installed_package "playwright" || MISSING_PACKAGES+=("playwright")
has_installed_package "@playwright/test" || MISSING_PACKAGES+=("@playwright/test")
has_installed_package "@browserbasehq/stagehand" || MISSING_PACKAGES+=("@browserbasehq/stagehand")

if [ "${GSS_BROWSER_AUTOMATION_SKIP_INSTALL:-0}" = "1" ]; then
  echo -e "  ${YELLOW}↺${NC} Package install skipped by GSS_BROWSER_AUTOMATION_SKIP_INSTALL=1"
elif [ ${#MISSING_PACKAGES[@]} -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC} Playwright + Stagehand packages already installed"
else
  echo -e "  ${DIM}$INSTALL_CMD${NC}"
  if $INSTALL_CMD; then
    echo -e "  ${GREEN}✓${NC} Playwright + Stagehand packages installed"
  else
    echo -e "  ${RED}✗${NC} Package install failed"
    exit 1
  fi
fi

if [ "${GSS_BROWSER_AUTOMATION_SKIP_INSTALL:-0}" = "1" ]; then
  echo -e "  ${YELLOW}↺${NC} Playwright browser install skipped by GSS_BROWSER_AUTOMATION_SKIP_INSTALL=1"
else
  echo -e "  ${DIM}$PLAYWRIGHT_CMD${NC}"
  if $PLAYWRIGHT_CMD; then
    echo -e "  ${GREEN}✓${NC} Playwright browser binaries installed"
  else
    echo -e "  ${YELLOW}⚠${NC} Playwright browser install failed"
    echo "     Retry manually: $PLAYWRIGHT_CMD"
  fi
fi

echo ""
echo "Scaffolding Stagehand custom provider config..."

copy_template \
  "$SKILL_DIR/references/env.stagehand.example.template" \
  ".env.stagehand.example" \
  ".env.stagehand.example"

copy_template \
  "$SKILL_DIR/references/stagehand.config.ts.template" \
  "stagehand.config.ts" \
  "stagehand.config.ts"

copy_template \
  "$SKILL_DIR/references/stagehand.example.spec.ts.template" \
  "tests/stagehand/example.spec.ts" \
  "tests/stagehand/example.spec.ts"

echo "  Stagehand provider env: STAGEHAND_MODEL_NAME, STAGEHAND_API_KEY, STAGEHAND_BASE_URL"


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/log_decision.sh =====

#!/usr/bin/env bash
# scripts/log_decision.sh
TYPE="${1:-}" CONTENT="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/resolve_gsd_paths.sh"
MILESTONE_FILE="${GSD_DECISIONS_FILE:-.planning/milestones/current/DECISIONS.md}"
GLOBAL_FILE="${GSD_GLOBAL_DECISIONS:-.planning/DECISIONS.md}"
OBSIDIAN_META="$SCRIPT_DIR/obsidian_meta.sh"
TS=$(date -u +"%Y-%m-%d %H:%M UTC")

mkdir -p "$(dirname "$MILESTONE_FILE")" "$(dirname "$GLOBAL_FILE")"
touch "$MILESTONE_FILE" "$GLOBAL_FILE"

if [ -x "$OBSIDIAN_META" ]; then
  bash "$OBSIDIAN_META" ensure-frontmatter "$MILESTONE_FILE" decision-log "${GSD_CURRENT_PHASE:-}"
  bash "$OBSIDIAN_META" ensure-frontmatter "$GLOBAL_FILE" decision-log
fi

ENTRY="
---
### [$TS] $TYPE
$CONTENT
"
echo "$ENTRY" >> "$MILESTONE_FILE"
echo "$ENTRY" >> "$GLOBAL_FILE"
echo "✓ Decision logged: $TYPE ($(wc -c <<< "$CONTENT") chars)"


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/mark_milestone_done.sh =====

#!/usr/bin/env bash
# scripts/mark_milestone_done.sh
# Mark current GSD phase/milestone done in deterministic local state.
# Usage:
#   bash scripts/mark_milestone_done.sh [phase-id]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/resolve_gsd_paths.sh"

PHASE="${1:-$GSD_CURRENT_PHASE}"
STATE_FILE=".planning/GSS_STATE.json"
PHASE_STATE=".planning/phases/$PHASE/STATE.md"

if [ -z "$PHASE" ]; then
  echo "Usage: mark_milestone_done.sh [phase-id]"
  echo "Could not resolve current phase from .planning/STATE.md"
  exit 1
fi

mkdir -p .planning

# Mark phase-local state done when present.
if [ -f "$PHASE_STATE" ]; then
  if grep -qi '^status:' "$PHASE_STATE"; then
    sed -i 's/^status:.*/status: done/I' "$PHASE_STATE"
  else
    printf '\nstatus: done\n' >> "$PHASE_STATE"
  fi
fi

# Keep GSS state in sync.
if command -v jq >/dev/null 2>&1; then
  if [ ! -f "$STATE_FILE" ]; then
    cat > "$STATE_FILE" <<EOF
{
  "loop_state": "GSD_DISPATCH",
  "current_milestone": "$PHASE",
  "milestones_done": [],
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  fi

  tmp=$(mktemp)
  jq --arg phase "$PHASE" '
    .current_milestone = $phase |
    .milestones_done = ((.milestones_done // []) + [$phase] | unique)
  ' "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
else
  echo "WARN: jq not found; skipped GSS_STATE milestones_done update" >&2
fi

echo "✓ Milestone done → $PHASE"


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/obsidian_meta.sh =====

#!/usr/bin/env bash
set -euo pipefail

PLANNING_DIR="${GSS_PLANNING_DIR:-.planning}"
SLUG_FILE="$PLANNING_DIR/.project_slug"

today() {
  date +%Y-%m-%d
}

slugify() {
  local raw="${1:-}"
  if [ -z "$raw" ]; then
    raw="$(basename "$PWD")"
  fi

  printf '%s' "$raw" \
    | tr '[:upper:]' '[:lower:]' \
    | tr ' _' '--' \
    | sed 's/[^a-z0-9-]//g; s/--*/-/g; s/^-//; s/-$//'
}

write_slug() {
  mkdir -p "$PLANNING_DIR"

  local slug
  slug="$(slugify "${1:-}")"
  if [ -z "$slug" ]; then
    slug="project"
  fi

  printf '%s\n' "$slug" > "$SLUG_FILE"
  printf '%s\n' "$slug"
}

project_slug() {
  if [ -s "$SLUG_FILE" ]; then
    cat "$SLUG_FILE"
    return 0
  fi

  # Read-only resolution: compute from cwd without persisting a slug file.
  local slug
  slug="$(slugify "$(basename "$PWD")")"
  [ -z "$slug" ] && slug="project"
  printf '%s\n' "$slug"
}

# init-project has two intents:
#   * with a name  -> intentional set; overrides any existing (e.g. derived) slug
#   * without a name -> no-clobber bootstrap; only derive from the directory name
#     when no slug exists yet, so the every-turn bootstrap never overwrites a
#     real name chosen in Phase 0.
init_project() {
  mkdir -p "$PLANNING_DIR"
  local name="${1:-}"

  if [ -n "$name" ]; then
    write_slug "$name"
    return 0
  fi

  if [ -s "$SLUG_FILE" ]; then
    cat "$SLUG_FILE"
    return 0
  fi
  write_slug ""
}

has_frontmatter() {
  local file="$1"

  [ -f "$file" ] || return 1
  frontmatter_end_line "$file" >/dev/null
}

frontmatter_end_line() {
  local file="$1"

  [ -f "$file" ] || return 1
  awk '
    NR == 1 && $0 != "---" { exit 1 }
    NR == 1 { next }
    $0 == "---" {
      print NR
      found = 1
      exit
    }
    END {
      if (!found) exit 1
    }
  ' "$file"
}

frontmatter_for() {
  local file="$1"
  local type="$2"
  local phase="${3:-}"
  local slug="$4"
  local created="$5"
  local updated="$6"
  local extras="${7:-}"
  local title
  title="$(basename "$file" .md)"

  cat <<EOF
---
title: "$title"
type: $type
project_slug: $slug
tags:
  - gsd
  - $type
  - project/$slug
created: $created
updated: $updated
EOF

  if [ "$type" = "research" ]; then
    echo "research_dimension: summary"
  fi

  if [ -n "$phase" ]; then
    cat <<EOF
phase: $phase
project: "[[../../PROJECT]]"
EOF
  elif [ "$file" != "$PLANNING_DIR/PROJECT.md" ]; then
    echo 'project: "[[PROJECT]]"'
  fi

  case "$type" in
    decision-log)
      if [ -n "$phase" ]; then
        echo 'plan: "[[PLAN]]"'
      fi
      ;;
    brainstorm)
      echo 'plan: "[[PLAN]]"'
      echo 'decisions: "[[DECISIONS]]"'
      ;;
    design)
      if [ -n "$phase" ]; then
        echo 'plan: "[[PLAN]]"'
        echo 'decisions: "[[DECISIONS]]"'
      else
        echo 'related:'
        echo '  - "[[PROJECT]]"'
        echo '  - "[[ROADMAP]]"'
      fi
      ;;
    design-qa)
      echo 'plan: "[[PLAN]]"'
      echo 'decisions: "[[DECISIONS]]"'
      echo 'design: "[[DESIGN]]"'
      ;;
    devex-review)
      echo 'plan: "[[PLAN]]"'
      echo 'decisions: "[[DECISIONS]]"'
      ;;
    debug-report)
      echo 'plan: "[[PLAN]]"'
      echo 'decisions: "[[DECISIONS]]"'
      echo 'brainstorm: "[[BRAINSTORM_DOC]]"'
      ;;
    documentation)
      if [ -n "$phase" ]; then
        echo 'plan: "[[PLAN]]"'
        echo 'decisions: "[[DECISIONS]]"'
      else
        echo 'related:'
        echo '  - "[[PROJECT]]"'
      fi
      ;;
    roadmap)
      echo 'related:'
      echo '  - "[[REQUIREMENTS]]"'
      echo '  - "[[PROJECT]]"'
      ;;
    requirements)
      echo 'related:'
      echo '  - "[[ROADMAP]]"'
      echo '  - "[[PROJECT]]"'
      ;;
  esac

  if [ -n "$extras" ] && [ -s "$extras" ]; then
    cat "$extras"
  fi

  echo "---"
}

ensure_frontmatter() {
  local file="${1:-}"
  local type="${2:-}"
  local phase="${3:-}"

  if [ -z "$file" ] || [ -z "$type" ]; then
    echo "Usage: obsidian_meta.sh ensure-frontmatter <path> <type> [phase]" >&2
    exit 1
  fi

  [ -f "$file" ] || return 0

  local slug today_date created updated tmp extras
  slug="$(project_slug)"
  today_date="$(today)"
  tmp="$(mktemp)"
  extras="$(mktemp)"

  if has_frontmatter "$file"; then
    local end_line
    end_line="$(frontmatter_end_line "$file")"

    # Preserve the original created date when present.
    created="$(sed -n "2,${end_line}p" "$file" | sed -n 's/^created:[[:space:]]*//p' | head -1)"
    [ -z "$created" ] && created="$today_date"

    # Preserve unmanaged frontmatter so re-normalize is non-destructive.
    # Drop helper-managed keys and the list items they own (tags/related).
    sed -n "2,$((end_line - 1))p" "$file" | awk '
      BEGIN { skipping = 0 }
      /^[A-Za-z0-9_]+:/ {
        key = $0
        sub(/:.*/, "", key)
        managed = (key == "title" || key == "type" || key == "project_slug"           || key == "tags" || key == "created" || key == "updated"           || key == "research_dimension" || key == "phase" || key == "project"           || key == "plan" || key == "decisions" || key == "related")
        if (managed) { skipping = 1; next }
        skipping = 0
        print
        next
      }
      /^[[:space:]]*-/ { if (skipping) next; print; next }
      /^[[:space:]]/ { if (skipping) next; print; next }
      { skipping = 0; print }
    ' > "$extras"

    updated="$today_date"
    frontmatter_for "$file" "$type" "$phase" "$slug" "$created" "$updated" "$extras" > "$tmp"
    printf '\n' >> "$tmp"
    tail -n +"$((end_line + 1))" "$file" >> "$tmp"
  elif [ "$(sed -n '1p' "$file")" = "---" ]; then
    echo "WARN: malformed frontmatter in $file; left unchanged" >&2
    rm -f "$tmp" "$extras"
    return 0
  else
    created="$today_date"
    updated="$today_date"
    frontmatter_for "$file" "$type" "$phase" "$slug" "$created" "$updated" "" > "$tmp"
    printf '\n' >> "$tmp"
    cat "$file" >> "$tmp"
  fi

  rm -f "$extras"
  mv "$tmp" "$file"
}

normalize_known() {
  ensure_frontmatter "$PLANNING_DIR/REQUIREMENTS.md" requirements
  ensure_frontmatter "$PLANNING_DIR/RESEARCH.md" research
  ensure_frontmatter "$PLANNING_DIR/PROJECT.md" project
  ensure_frontmatter "$PLANNING_DIR/ROADMAP.md" roadmap
  ensure_frontmatter "$PLANNING_DIR/DECISIONS.md" decision-log
  ensure_frontmatter "$PLANNING_DIR/DESIGN.md" design
  ensure_frontmatter "$PLANNING_DIR/shared_context.md" shared-context
  ensure_frontmatter "$PLANNING_DIR/CURRENT_STATE.md" current-state
  ensure_frontmatter "$PLANNING_DIR/CODEBASE_MAP.md" codebase-map
  ensure_frontmatter "$PLANNING_DIR/BASELINE.md" baseline
  ensure_frontmatter "$PLANNING_DIR/DOCS_INGEST.md" docs-ingest
  ensure_frontmatter "$PLANNING_DIR/INTEGRATION_RISKS.md" integration-risks
  ensure_frontmatter "$PLANNING_DIR/CHECKPOINT_HISTORY.md" checkpoint-log

  local phase_dir phase
  for phase_dir in "$PLANNING_DIR"/phases/*; do
    [ -d "$phase_dir" ] || continue
    phase="$(basename "$phase_dir")"
    ensure_frontmatter "$phase_dir/PLAN.md" plan "$phase"
    ensure_frontmatter "$phase_dir/DECISIONS.md" decision-log "$phase"
    ensure_frontmatter "$phase_dir/DESIGN.md" design "$phase"
    ensure_frontmatter "$phase_dir/DESIGN_QA.md" design-qa "$phase"
    ensure_frontmatter "$phase_dir/DEVEX_REVIEW.md" devex-review "$phase"
    ensure_frontmatter "$phase_dir/DEBUG_REPORT.md" debug-report "$phase"
    ensure_frontmatter "$phase_dir/DOCS_REPORT.md" documentation "$phase"
    ensure_frontmatter "$phase_dir/BRAINSTORM_DOC.md" brainstorm "$phase"
    ensure_frontmatter "$phase_dir/EXEC_PROMPT.md" execution-prompt "$phase"
  done
}

write_bases() {
  local slug
  slug="$(project_slug)"
  mkdir -p "$PLANNING_DIR/bases"

  cat > "$PLANNING_DIR/bases/project-dashboard.base" <<EOF
filters:
  and:
    - file.hasTag("gsd")
    - file.hasTag("project/$slug")

properties:
  type:
    displayName: "Type"
  status:
    displayName: "Status"
  phase:
    displayName: "Phase"

views:
  - type: table
    name: "All Documents"
    order:
      - file.name
      - type
      - status
      - file.mtime
    groupBy:
      property: type
      direction: ASC
EOF

  cat > "$PLANNING_DIR/bases/phases.base" <<EOF
filters:
  and:
    - file.hasTag("gsd")
    - type == "plan"
    - file.hasTag("project/$slug")

views:
  - type: table
    name: "All Phases"
    order:
      - file.name
      - phase
      - status
      - file.mtime
EOF

  cat > "$PLANNING_DIR/bases/research.base" <<EOF
filters:
  and:
    - file.hasTag("gsd")
    - type == "research"
    - file.hasTag("project/$slug")

views:
  - type: table
    name: "Research Docs"
    order:
      - file.name
      - research_dimension
      - file.mtime
EOF

  cat > "$PLANNING_DIR/bases/decisions.base" <<EOF
filters:
  and:
    - file.hasTag("gsd")
    - type == "decision-log"
    - file.hasTag("project/$slug")

views:
  - type: table
    name: "All Decisions"
    order:
      - file.name
      - phase
      - file.mtime
EOF
}

cmd="${1:-}"
case "$cmd" in
  init-project)
    init_project "${2:-}"
    ;;
  ensure-frontmatter)
    ensure_frontmatter "${2:-}" "${3:-}" "${4:-}"
    ;;
  normalize-known)
    normalize_known
    ;;
  write-bases)
    write_bases
    ;;
  *)
    echo "Usage: obsidian_meta.sh init-project [name] | ensure-frontmatter <path> <type> [phase] | normalize-known | write-bases" >&2
    exit 1
    ;;
esac


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/print_summary.sh =====

#!/usr/bin/env bash
# scripts/print_summary.sh
STATE=".planning/GSS_STATE.json"
DECISIONS=".planning/DECISIONS.md"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   GSS Orchestrator — DELIVERED ✅            ║"
echo "║   GSD + GStack + Superpowers + ralph-loop    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

M=$(ls -d .planning/archive/milestone-* 2>/dev/null | wc -l || echo 0)
D=$(grep -c "^###" "$DECISIONS" 2>/dev/null || echo 0)
L=$(find .planning -name "EXEC_PROMPT.md" 2>/dev/null | wc -l || echo 0)

echo "Milestones completed : $M"
echo "GStack decisions     : $D"
echo "ralph-loop phases    : $L"
echo ""
echo "Audit trail  : .planning/DECISIONS.md"
echo "Shared ctx   : .planning/shared_context.md"
echo "Archive      : .planning/archive/"
echo ""
START=$(grep started_at "$STATE" 2>/dev/null | grep -o '"[^"]*Z"' | tr -d '"' || echo "unknown")
echo "Started  : $START"
echo "Finished : $(date -u +"%Y-%m-%d %H:%M UTC")"


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/read_plugin_skill.sh =====

#!/usr/bin/env bash
# scripts/read_plugin_skill.sh
# Đọc SKILL.md của một plugin đã cài, dùng để inject vào Task tool prompt.
#
# Usage:
#   bash scripts/read_plugin_skill.sh gsd
#   bash scripts/read_plugin_skill.sh gstack
#   bash scripts/read_plugin_skill.sh superpowers

PLUGIN="${1:-}"
[ -z "$PLUGIN" ] && echo "Usage: read_plugin_skill.sh <plugin-name>" && exit 1

# Tìm SKILL.md theo tên plugin
find_skill() {
  local name="$1"
  # ~/.claude/plugins/<name>*
  local f
  f=$(find ~/.claude/plugins -maxdepth 3 -ipath "*${name}*/SKILL.md" 2>/dev/null | head -1)
  [ -n "$f" ] && echo "$f" && return
  # ~/.claude/skills/<name>*
  f=$(find ~/.claude/skills -maxdepth 3 -ipath "*${name}*/SKILL.md" 2>/dev/null | head -1)
  [ -n "$f" ] && echo "$f" && return
  echo ""
}

SKILL_PATH=$(find_skill "$PLUGIN")

if [ -z "$SKILL_PATH" ]; then
  echo "ERROR: SKILL.md not found for plugin: $PLUGIN"
  echo "Checked: ~/.claude/plugins/ and ~/.claude/skills/"
  exit 1
fi

cat "$SKILL_PATH"


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/resolve_gsd_paths.sh =====

#!/usr/bin/env bash
# scripts/resolve_gsd_paths.sh
# Đọc cấu trúc thực của GSD và export các path đúng.
# Source file này trong các script khác: source scripts/resolve_gsd_paths.sh

PLANNING_DIR=".planning"
STATE_FILE="$PLANNING_DIR/STATE.md"
ROADMAP_FILE="$PLANNING_DIR/ROADMAP.md"

resolve_project_slug() {
  local slug_file="$PLANNING_DIR/.project_slug"
  if [ -s "$slug_file" ]; then
    cat "$slug_file"
    return
  fi

  local slug
  slug="$(basename "$PWD" \
    | tr '[:upper:]' '[:lower:]' \
    | tr ' _' '--' \
    | sed 's/[^a-z0-9-]//g; s/--*/-/g; s/^-//; s/-$//')"
  # Match obsidian_meta.sh fallback for empty/odd directory names.
  [ -z "$slug" ] && slug="project"
  printf '%s\n' "$slug"
}

# ── Tìm active phase từ STATE.md ──────────────────────────────────────────
resolve_current_phase() {
  if [ ! -f "$STATE_FILE" ]; then
    echo "" ; return
  fi

  local candidate

  # GSD ghi "Current Phase: 01-demo" hoặc "Active: 01-demo" trong STATE.md.
  # Chỉ nhận label value nếu toàn bộ value là phase id, tránh prose như
  # "Phase: 1 of 4 (MVP ...)" bị hiểu thành tên thư mục.
  candidate="$(
    awk '
      {
        line = $0
        lowered = tolower(line)
        if (lowered ~ /^[[:space:]]*(current phase|active phase|active|phase):/) {
          sub(/^[^:]*:[[:space:]]*/, "", line)
          sub(/[[:space:]]+$/, "", line)
          if (line ~ /^[0-9][0-9]-[A-Za-z][A-Za-z0-9-]*$/) {
            print line
            exit
          }
        }
      }
    ' "$STATE_FILE" 2>/dev/null || true
  )"
  if [ -n "$candidate" ]; then
    echo "$candidate"
    return
  fi

  candidate="$(grep -oE '[0-9]{2}-[A-Za-z][A-Za-z0-9-]*' "$STATE_FILE" 2>/dev/null | head -1 || true)"
  if [ -n "$candidate" ]; then
    echo "$candidate"
    return
  fi

  ls "$PLANNING_DIR/phases/" 2>/dev/null | sort | tail -1
}

# ── Tìm PLAN.md hiện tại trong phase ─────────────────────────────────────
resolve_plan_file() {
  local phase="${1:-$(resolve_current_phase)}"
  local phase_dir="$PLANNING_DIR/phases/$phase"

  if [ -z "$phase" ] || [ ! -d "$phase_dir" ]; then
    # Fallback: tìm PLAN.md bất kỳ trong phases/
    find "$PLANNING_DIR/phases" -name "*-PLAN.md" -o -name "PLAN.md" 2>/dev/null \
      | sort | tail -1
    return
  fi

  # Ưu tiên file plan chưa có SUMMARY tương ứng (chưa done)
  local pending
  pending=$(for f in "$phase_dir"/*-PLAN.md "$phase_dir"/PLAN.md; do
    [ -f "$f" ] || continue
    base="${f%-PLAN.md}"
    summary="${base}-SUMMARY.md"
    [ ! -f "$summary" ] && echo "$f"
  done | sort | head -1)

  if [ -n "$pending" ]; then
    echo "$pending"
  else
    # Tất cả đã có SUMMARY → lấy cái cuối cùng
    ls "$phase_dir"/*-PLAN.md "$phase_dir"/PLAN.md 2>/dev/null | sort | tail -1
  fi
}

# ── Export ────────────────────────────────────────────────────────────────
GSD_STATE_FILE="$STATE_FILE"
GSD_ROADMAP_FILE="$ROADMAP_FILE"
GSD_CURRENT_PHASE=$(resolve_current_phase)
GSD_PHASE_DIR="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE"
GSD_PLAN_FILE=$(resolve_plan_file "$GSD_CURRENT_PHASE")
GSD_EXEC_PROMPT="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/EXEC_PROMPT.md"
GSD_DECISIONS_FILE="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/DECISIONS.md"
GSD_BLOCKED_FILE="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/BLOCKED_QUESTION.txt"
GSD_BLOCKED_TYPE_FILE="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/BLOCKED_TYPE.txt"
GSD_LOG_DIR="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/logs"
GSD_GLOBAL_DECISIONS="$PLANNING_DIR/DECISIONS.md"
GSD_SHARED_CONTEXT="$PLANNING_DIR/shared_context.md"
GSD_CURRENT_STATE="$PLANNING_DIR/CURRENT_STATE.md"
GSD_CODEBASE_MAP="$PLANNING_DIR/CODEBASE_MAP.md"
GSD_BASELINE="$PLANNING_DIR/BASELINE.md"
GSD_DOCS_INGEST="$PLANNING_DIR/DOCS_INGEST.md"
GSD_INTEGRATION_RISKS="$PLANNING_DIR/INTEGRATION_RISKS.md"
GSD_BRAINSTORM_DOC="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/BRAINSTORM_DOC.md"
GSD_PROJECT_DESIGN="$PLANNING_DIR/DESIGN.md"
GSD_PHASE_DESIGN="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/DESIGN.md"
GSD_DESIGN_QA_REPORT="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/DESIGN_QA.md"
GSD_DEVEX_REVIEW="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/DEVEX_REVIEW.md"
GSD_DEBUG_REPORT="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/DEBUG_REPORT.md"
GSD_DOCS_REPORT="$PLANNING_DIR/phases/$GSD_CURRENT_PHASE/DOCS_REPORT.md"
GSD_PROJECT_SLUG_FILE="$PLANNING_DIR/.project_slug"
GSD_PROJECT_SLUG="$(resolve_project_slug)"
GSD_BASES_DIR="$PLANNING_DIR/bases"

# Legacy fallback nếu dùng cấu trúc milestones cũ
if [ -z "$GSD_PLAN_FILE" ] || [ ! -f "$GSD_PLAN_FILE" ]; then
  for legacy in \
    ".planning/milestones/current/PLAN.md" \
    ".planning/PLAN.md"; do
    if [ -f "$legacy" ]; then
      GSD_PLAN_FILE="$legacy"
      GSD_EXEC_PROMPT="$(dirname "$legacy")/EXEC_PROMPT.md"
      GSD_DECISIONS_FILE="$(dirname "$legacy")/DECISIONS.md"
      GSD_BLOCKED_FILE="$(dirname "$legacy")/BLOCKED_QUESTION.txt"
      GSD_BLOCKED_TYPE_FILE="$(dirname "$legacy")/BLOCKED_TYPE.txt"
      GSD_LOG_DIR="$(dirname "$legacy")/logs"
      break
    fi
  done
fi

export GSD_STATE_FILE GSD_ROADMAP_FILE GSD_CURRENT_PHASE \
       GSD_PHASE_DIR GSD_PLAN_FILE GSD_EXEC_PROMPT \
       GSD_DECISIONS_FILE GSD_BLOCKED_FILE GSD_BLOCKED_TYPE_FILE \
       GSD_LOG_DIR GSD_GLOBAL_DECISIONS GSD_SHARED_CONTEXT \
       GSD_CURRENT_STATE GSD_CODEBASE_MAP GSD_BASELINE GSD_DOCS_INGEST GSD_INTEGRATION_RISKS \
       GSD_BRAINSTORM_DOC GSD_PROJECT_DESIGN GSD_PHASE_DESIGN \
       GSD_DESIGN_QA_REPORT GSD_DEVEX_REVIEW GSD_DEBUG_REPORT GSD_DOCS_REPORT \
       GSD_PROJECT_SLUG_FILE GSD_PROJECT_SLUG GSD_BASES_DIR

# Debug info (chỉ in khi GSS_DEBUG=1)
if [ "${GSS_DEBUG:-0}" = "1" ]; then
  echo "[resolve_gsd_paths]"
  echo "  phase    : $GSD_CURRENT_PHASE"
  echo "  phase_dir: $GSD_PHASE_DIR"
  echo "  plan     : $GSD_PLAN_FILE"
  echo "  exec_p   : $GSD_EXEC_PROMPT"
fi


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/route_question.sh =====

#!/usr/bin/env bash
# ralph-loop/scripts/route_question.sh
# Phân tích câu hỏi blocking và recommend đúng GStack skill

QUESTION="${1:-}"

if [ -z "$QUESTION" ]; then
  echo "Usage: route_question.sh '<question>'"
  exit 1
fi

echo ""
echo "━━ Question routing ━━"
echo "Question: $QUESTION"
echo ""

# Keyword routing rules (đơn giản nhưng hiệu quả)
Q_LOWER=$(echo "$QUESTION" | tr '[:upper:]' '[:lower:]')

# CEO / product / business
if echo "$Q_LOWER" | grep -qE "business|requirement|user|feature|scope|priority|product|why|should we|do we need"; then
  echo "→ Route to: /gstack:ceo"
  echo "   Reason: product/business decision"
  echo "ROUTE=/gstack:ceo"

# Architecture / design
elif echo "$Q_LOWER" | grep -qE "architect|pattern|design|database|schema|api|interface|contract|struct|model|service|layer|module"; then
  echo "→ Route to: /plan-eng-review"
  echo "   Reason: architecture/design decision"
  echo "ROUTE=/plan-eng-review"

# Technical implementation
elif echo "$Q_LOWER" | grep -qE "implement|how to|library|package|algorithm|performance|cache|index|query|optimiz"; then
  echo "→ Route to: /gstack:engineer"
  echo "   Reason: technical implementation decision"
  echo "ROUTE=/gstack:engineer"

# QA / edge case / validation
elif echo "$Q_LOWER" | grep -qE "edge case|validat|error|fail|exception|null|empty|boundary|test|verify|check"; then
  echo "→ Route to: /gstack:qa"
  echo "   Reason: QA/validation decision"
  echo "ROUTE=/gstack:qa"

# Security
elif echo "$Q_LOWER" | grep -qE "security|auth|permission|encrypt|token|secret|vulnerab|inject|xss|csrf"; then
  echo "→ Route to: /plan-eng-review"
  echo "   Reason: security requires architecture review"
  echo "ROUTE=/plan-eng-review"

# Deployment / infra
elif echo "$Q_LOWER" | grep -qE "deploy|infra|env|config|docker|k8s|ci|cd|pipeline|server|port|host"; then
  echo "→ Route to: /gstack:release-manager"
  echo "   Reason: deployment/infra decision"
  echo "ROUTE=/gstack:release-manager"

# Default — engineer
else
  echo "→ Route to: /gstack:engineer  (default)"
  echo "   Reason: no specific keyword match, defaulting to engineer"
  echo "ROUTE=/gstack:engineer"
fi

echo ""
echo "After calling the GStack skill:"
echo "  bash .claude/skills/ralph-loop/scripts/log_decision.sh 'task-question' '<q_and_a>'"
echo "  Then retry: bash .claude/skills/ralph-loop/scripts/execute_task.sh '<task_id>' '<task_content_with_answer>'"


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/run_phase.sh =====

#!/usr/bin/env bash
# scripts/run_phase.sh
# Fallback executor khi Task tool không available.
# Implement ralph-style loop qua claude -p subprocess.
# Orchestrator chỉ thấy signal cuối — không thấy implementation.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/resolve_gsd_paths.sh"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

MAX_ITER=""; MODE="normal"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-iterations) MAX_ITER="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --verify) VERIFY=true; shift ;;
    *) shift ;;
  esac
done

CFG=".planning/config.json"
if [ -z "$MAX_ITER" ] && [ -f "$CFG" ] && command -v jq &>/dev/null; then
  [ "$MODE" = "qa_retry" ] \
    && MAX_ITER=$(jq -r '.ralph_loop.qa_retry_max_iterations // 10' "$CFG") \
    || MAX_ITER=$(jq -r '.ralph_loop.default_max_iterations // 15' "$CFG")
fi
MAX_ITER="${MAX_ITER:-15}"

EXEC_PROMPT="$GSD_EXEC_PROMPT"
LOG_DIR="$GSD_LOG_DIR"
PLAN_FILE="$GSD_PLAN_FILE"
PLAN_BASENAME="${PLAN_FILE%-PLAN.md}"
RESULT_FILE="$LOG_DIR/phase_result.json"
mkdir -p "$LOG_DIR"

[ ! -f "$EXEC_PROMPT" ] && \
  echo -e "${RED}ERROR: EXEC_PROMPT.md not found. Run write_exec_prompt.sh first.${NC}" && exit 1

check_implicit_done() {
  [ ! -f "$PLAN_FILE" ] && return 1
  [ "$(grep -c "^\- \[ \]" "$PLAN_FILE" 2>/dev/null || echo 1)" -eq 0 ]
}

parse_signal() {
  grep -E "<promise>" "$1" 2>/dev/null | tail -1 || echo ""
}

write_artifacts() {
  local summary="${PLAN_BASENAME}-SUMMARY.md"
  local verify="${PLAN_BASENAME}-VERIFICATION.md"
  {
    echo "# Summary — $(basename "$PLAN_BASENAME")"
    echo "$(date -u +'%Y-%m-%d %H:%M UTC') | iter: $ITER/$MAX_ITER"
    echo ""; echo "## Done"
    grep "^\- \[x\]" "$PLAN_FILE" 2>/dev/null || echo "_none_"
    echo ""; echo "## Pending"
    grep "^\- \[ \]" "$PLAN_FILE" 2>/dev/null || echo "_none_"
  } > "$summary"
  {
    echo "# Verification — $(basename "$PLAN_BASENAME")"
    echo "$(date -u +'%Y-%m-%d %H:%M UTC')"
    echo ""; git log --oneline -10 2>/dev/null || echo "no git"
  } > "$verify"
  echo "  → $(basename "$summary")"
  echo "  → $(basename "$verify")"
}

echo ""
echo "━━ Phase execution (fallback: claude -p loop) ━━"
echo "  Plan: $(basename "$PLAN_FILE")"
echo "  Max: $MAX_ITER | mode: $MODE"

# Recovery
if check_implicit_done; then
  echo -e "${YELLOW}⚡ All [x] already — implicit done${NC}"
  ITER=0; write_artifacts
  echo '{"status":"DONE","note":"recovered"}' > "$RESULT_FILE"
  bash "$SCRIPT_DIR/update_state.sh" "GSTACK_QA"
  echo -e "${GREEN}✅ Done${NC}"; echo "Next: GStack QA, then design QA, then docs"; exit 0
fi

ITER=0; RESULT="UNKNOWN"

while [ $ITER -lt $MAX_ITER ]; do
  ITER=$((ITER + 1))
  LOG_FILE="$LOG_DIR/iter_${ITER}_$(date +%s).log"
  echo "── Iter $ITER/$MAX_ITER ──"
  check_implicit_done && { RESULT="DONE"; break; }

  # subprocess — output vào log, không vào stdout
  claude -p "$(cat "$EXEC_PROMPT")" \
    --allowedTools "Bash,Read,Write,Edit" \
    --output-format text \
    > "$LOG_FILE" 2>&1 || true

  SIG=$(parse_signal "$LOG_FILE")

  if echo "$SIG" | grep -q "PHASE_COMPLETE"; then
    echo -e "  ${GREEN}✓ PHASE_COMPLETE${NC}"; RESULT="DONE"; break
  elif echo "$SIG" | grep -q "PHASE_BLOCKED:TECH:"; then
    Q=$(echo "$SIG" | sed 's/.*PHASE_BLOCKED:TECH://;s|</promise>||')
    echo "$Q" > "$GSD_BLOCKED_FILE"; echo "TECH" > "$GSD_BLOCKED_TYPE_FILE"
    RESULT="BLOCKED_TECH"; break
  elif echo "$SIG" | grep -q "PHASE_BLOCKED"; then
    Q=$(echo "$SIG" | sed 's/.*PHASE_BLOCKED://;s|</promise>||')
    echo "$Q" > "$GSD_BLOCKED_FILE"; echo "DECISION" > "$GSD_BLOCKED_TYPE_FILE"
    RESULT="BLOCKED"; break
  else
    check_implicit_done && { RESULT="DONE"; break; }
    sleep 2
  fi
done

echo ""
case "$RESULT" in
  "DONE")
    write_artifacts
    echo '{"status":"DONE"}' > "$RESULT_FILE"
    bash "$SCRIPT_DIR/update_state.sh" "GSTACK_QA"
    echo -e "${GREEN}✅ Phase complete — $ITER iter(s)${NC}"
    echo "Next: GStack QA, then design QA, then docs"
    exit 0 ;;
  "BLOCKED"|"BLOCKED_TECH")
    Q=$(cat "$GSD_BLOCKED_FILE" 2>/dev/null)
    TYPE=$(cat "$GSD_BLOCKED_TYPE_FILE" 2>/dev/null)
    echo '{"status":"BLOCKED"}' > "$RESULT_FILE"
    bash "$SCRIPT_DIR/update_state.sh" "SP_EXECUTING"
    echo -e "${YELLOW}⏸ BLOCKED [$TYPE]: $Q${NC}"
    echo "Next: invoke GStack skill with question, then inject_answer.sh, then retry"
    exit 1 ;;
  *)
    echo -e "${RED}⚠ Max iter reached${NC}"
    echo "Logs: $LOG_DIR/"
    exit 2 ;;
esac


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/setup.sh =====

#!/usr/bin/env bash
# scripts/setup.sh
# Kiểm tra prerequisites và khởi tạo .planning/ structure cho GSS Orchestrator.
# Chạy một lần trước khi bắt đầu loop.
#
# Usage:
#   bash .claude/skills/gsd-gstack-sp-orchestrator/scripts/setup.sh
#   bash .agents/skills/gsd-gstack-sp-orchestrator/scripts/setup.sh  (Codex)

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OBSIDIAN_META="$SKILL_DIR/scripts/obsidian_meta.sh"

sync_agents() {
  local src="$SKILL_DIR/agents"
  local dest=".claude/agents"
  [ ! -d "$src" ] && return
  mkdir -p "$dest"
  for f in "$src"/gss-*.md; do
    [ -f "$f" ] || continue
    cp -f "$f" "$dest/"
    echo -e "  ${GREEN}✓${NC} $(basename "$f")"
  done
}

echo "=== GSS Orchestrator Setup ==="
echo ""

# ── 1. Kiểm tra jq ────────────────────────────────────────────────────────
echo "Checking dependencies..."
if command -v jq &>/dev/null; then
  echo -e "  ${GREEN}✓${NC} jq $(jq --version)"
else
  echo -e "  ${YELLOW}⚠${NC} jq not found — installing..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y jq -q && echo -e "  ${GREEN}✓${NC} jq installed"
  elif command -v brew &>/dev/null; then
    brew install jq && echo -e "  ${GREEN}✓${NC} jq installed"
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y jq -q && echo -e "  ${GREEN}✓${NC} jq installed"
  else
    echo -e "  ${RED}✗${NC} Install jq manually: https://jqlang.github.io/jq/"
    exit 1
  fi
fi

# ── 2. Kiểm tra git repo ─────────────────────────────────────────────────
echo ""
echo "Checking git repository..."
if git rev-parse --git-dir &>/dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} git repo detected"
else
  echo -e "  ${YELLOW}⚠${NC} Not a git repository"
  echo ""
  echo "  Claude Code subagents require a git repo to avoid worktree errors."
  echo "  Fix with:"
  echo "    git init && git add -A && git commit -m 'init'"
  echo ""
  read -rp "  Initialize git repo now? [Y/n]: " GIT_INIT
  if [[ "${GIT_INIT:-Y}" =~ ^[Yy]$ ]]; then
    git init
    git add -A
    git commit -m "chore: init repo for GSS Orchestrator" --allow-empty
    echo -e "  ${GREEN}✓${NC} git repo initialized"
  else
    echo -e "  ${YELLOW}⚠${NC} Continuing without git — subagents may fail"
    echo "     Workaround: add to .claude/settings.json:"
    echo '     { "env": { "CLAUDE_CODE_FORK_SUBAGENT": "0" } }'
  fi
fi

# ── 3. Kiểm tra plugins/skills đã cài ────────────────────────────────────
echo ""
echo "Checking required plugins..."

MISSING=()

# Tìm plugin trong cả Claude Code và Codex paths
find_plugin() {
  local name="$1"
  local found
  # Claude Code: ~/.claude/plugins/ và ~/.claude/skills/
  found=$(find ~/.claude/plugins ~/.claude/skills -maxdepth 3 \
    -iname "${name}*" -type d 2>/dev/null | head -1)
  [ -n "$found" ] && echo "$found" && return
  # Codex: ~/.agents/skills/ và ~/.codex/skills/
  found=$(find ~/.agents/skills ~/.codex/skills -maxdepth 3 \
    -iname "${name}*" -type d 2>/dev/null | head -1)
  [ -n "$found" ] && echo "$found" && return
  # Tìm qua SKILL.md
  found=$(find ~/.claude ~/.agents ~/.codex -maxdepth 5 \
    -name "SKILL.md" 2>/dev/null \
    | xargs grep -li "^name: ${name}" 2>/dev/null | head -1)
  [ -n "$found" ] && dirname "$found" && return
  echo ""
}

check_plugin() {
  local label="$1" name="$2" hint="$3"
  local path
  path=$(find_plugin "$name")
  if [ -n "$path" ]; then
    echo -e "  ${GREEN}✓${NC} $label"
  else
    echo -e "  ${RED}✗${NC} $label — not found"
    [ -n "$hint" ] && echo "     Hint: $hint"
    MISSING+=("$label")
  fi
}

check_plugin "GSD"         "gsd"         "/plugin marketplace add jnuyens/gsd-plugin && /plugin install gsd@gsd-plugin"
check_plugin "GStack"      "gstack"      "/plugin marketplace add garrytan/gstack && /plugin install gstack@gstack"
check_plugin "Superpowers" "superpowers" "/plugin install superpowers@claude-plugins-official"

if [ ${#MISSING[@]} -gt 0 ]; then
  echo ""
  echo -e "  ${RED}Missing: ${MISSING[*]}${NC}"
  echo "  Install missing plugins in a Claude Code / Codex session, then re-run setup."
  exit 1
fi

# ── 3. Cấu hình Worktree hooks cho Claude Code ─────────────────────────────
echo ""
echo "Configuring .claude/settings.json hooks..."

mkdir -p .claude
SETTINGS_FILE=".claude/settings.json"
TMP_FILE="$(mktemp)"

if [ ! -f "$SETTINGS_FILE" ]; then
  cat > "$SETTINGS_FILE" << 'EOF'
{}
EOF
fi

jq '
  .hooks.WorktreeCreate = [
    {
      hooks: [
        {
          type: "command",
          command: "ts=$(date +%s); rnd=${RANDOM:-0}; p=.claude/worktrees/wt-${ts}-${rnd}; b=cc-wt-${ts}-${rnd}; mkdir -p .claude/worktrees && git worktree add -b \"$b\" \"$p\" >/dev/null && printf \"%s\" \"$p\""
        }
      ]
    }
  ]
  | .hooks.WorktreeRemove = [
    {
      hooks: [
        {
          type: "command",
          command: "payload=$(cat); p=$(printf \"%s\" \"$payload\" | jq -r '\''.. | objects | (.worktree_path? // .path? // .worktreePath? // .worktreeDir? // .target_path? // .targetPath?) // empty'\'' | head -n1); [ -n \"$p\" ] || p=$(git worktree list --porcelain | awk '\''/^worktree /{print $2}'\'' | grep '\''.claude/worktrees/'\'' | tail -n1); [ -n \"$p\" ] && git worktree remove \"$p\""
        }
      ]
    }
  ]
' "$SETTINGS_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$SETTINGS_FILE"
echo -e "  ${GREEN}✓${NC} .claude/settings.json hooks configured"

# ── 4. Tạo .planning/ structure ───────────────────────────────────────────
echo ""
echo "Setting up .planning/ ..."

# GSD tạo phases/ — không tạo milestones/ nữa
mkdir -p .planning/phases .planning/archive

# config.json — không còn ralph-loop
if [ ! -f ".planning/config.json" ]; then
  cat > .planning/config.json << 'EOF'
{
  "orchestrator": "gsd-gstack-sp-orchestrator",
  "strategy": "spec-first",
  "execute_engine": "superpowers-tdd",
  "superpowers": {
    "tdd_mode": true,
    "completion_signal": "PHASE_COMPLETE",
    "blocked_signal": "PHASE_BLOCKED",
    "default_max_iterations": 15,
    "qa_retry_max_iterations": 10
  },
  "verification": {
    "require_passing_tests": true,
    "require_gstack_qa": true
  },
  "context_keys_shared": [
    "db_schema",
    "api_contracts",
    "arch_decisions",
    "env_variables",
    "type_definitions"
  ]
}
EOF
  echo -e "  ${GREEN}✓${NC} .planning/config.json"
else
  echo -e "  ${YELLOW}↺${NC} .planning/config.json exists — skipped"
fi

# Initialize project slug (no-clobber) before template files are created so they
# pick up the correct slug. Frontmatter + bases are written after, below.
if [ -x "$OBSIDIAN_META" ]; then
  # No-clobber: derive a slug from the directory name only if none exists yet.
  # Phase 0 sets the real project name via: init-project "<project name>".
  bash "$OBSIDIAN_META" init-project >/dev/null
  echo -e "  ${GREEN}✓${NC} Obsidian project slug"
fi

# GSS_STATE.json
if [ ! -f ".planning/GSS_STATE.json" ]; then
  cat > .planning/GSS_STATE.json << EOF
{
  "loop_state": "IDLE",
  "current_phase": null,
  "milestones_done": [],
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  echo -e "  ${GREEN}✓${NC} .planning/GSS_STATE.json"
else
  echo -e "  ${YELLOW}↺${NC} .planning/GSS_STATE.json exists — skipped"
fi

# DECISIONS.md
if [ ! -f ".planning/DECISIONS.md" ]; then
  cp "$SKILL_DIR/references/decisions-template.md" .planning/DECISIONS.md
  echo -e "  ${GREEN}✓${NC} .planning/DECISIONS.md"
else
  echo -e "  ${YELLOW}↺${NC} .planning/DECISIONS.md exists — skipped"
fi

# shared_context.md
if [ ! -f ".planning/shared_context.md" ]; then
  cat > .planning/shared_context.md << 'EOF'
# Shared Context — GSS Orchestrator
## db_schema
_pending_
## api_contracts
_pending_
## arch_decisions
_pending_
## env_variables
_pending_
## type_definitions
_pending_
EOF
  echo -e "  ${GREEN}✓${NC} .planning/shared_context.md"
else
  echo -e "  ${YELLOW}↺${NC} .planning/shared_context.md exists — skipped"
fi

# Normalize Obsidian frontmatter on all known artifacts (incl. the freshly
# copied DECISIONS.md template) and regenerate Bases query files.
if [ -x "$OBSIDIAN_META" ]; then
  bash "$OBSIDIAN_META" normalize-known >/dev/null
  bash "$OBSIDIAN_META" write-bases >/dev/null
  echo -e "  ${GREEN}✓${NC} Obsidian metadata normalized"
fi

# ── 5. Browser automation dependencies ────────────────────────────────────
echo ""
echo "Setting up browser automation..."
if [ -f "$SKILL_DIR/scripts/install_browser_automation_deps.sh" ]; then
  bash "$SKILL_DIR/scripts/install_browser_automation_deps.sh"
else
  echo -e "  ${YELLOW}⚠${NC} install_browser_automation_deps.sh not found — skipped"
fi

# ── 6. Sync agent files ───────────────────────────────────────────────────
echo ""
echo "Syncing subagent files to .claude/agents/ ..."
sync_agents

# ── 7. Summary ────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=== Setup complete ===${NC}"
echo ""
echo "Trigger the orchestrator in your agent session:"
echo "  \"orchestrate this project for me\""
echo "  \"start gss loop\""


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/summarize_gstack.sh =====

#!/usr/bin/env bash
# scripts/summarize_gstack.sh
# Compress GStack output thành bullet decisions trước khi vào orchestrator context.
# Gọi NGAY SAU mỗi GStack invocation — đây là lớp bảo vệ context hygiene chính.
#
# Usage:
#   bash scripts/summarize_gstack.sh "<paste GStack output>"
#   echo "<output>" | bash scripts/summarize_gstack.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/resolve_gsd_paths.sh"

GREEN='\033[0;32m'; NC='\033[0m'

DECISIONS_FILE="${GSD_DECISIONS_FILE:-.planning/DECISIONS.md}"
GLOBAL_FILE="${GSD_GLOBAL_DECISIONS:-.planning/DECISIONS.md}"
LOG_DIR="${GSD_LOG_DIR:-.planning/logs}"
OBSIDIAN_META="$SCRIPT_DIR/obsidian_meta.sh"
mkdir -p "$LOG_DIR"

GSTACK_OUTPUT="${1:-}"
[ -z "$GSTACK_OUTPUT" ] && GSTACK_OUTPUT=$(cat)
[ -z "$GSTACK_OUTPUT" ] && echo "No input." && exit 1

SUMMARY_LOG="$LOG_DIR/gstack_full_$(date +%s).log"
SUMMARY_RESULT="$LOG_DIR/gstack_summary_$(date +%s).md"

# Full output vào log — orchestrator không thấy
echo "$GSTACK_OUTPUT" > "$SUMMARY_LOG"

# claude -p compress — output vào file, không stdout
claude -p "Extract actionable decisions from this GStack review output.
Max 10 bullets. Each: [ROLE] decision. No prose, no preamble.

$GSTACK_OUTPUT" \
  --allowedTools "" \
  --output-format text \
  > "$SUMMARY_RESULT" 2>&1 || true

SUMMARY=$(cat "$SUMMARY_RESULT")
TS=$(date -u +"%Y-%m-%d %H:%M UTC")

# Log vào DECISIONS.md
mkdir -p "$(dirname "$DECISIONS_FILE")" "$(dirname "$GLOBAL_FILE")"
touch "$DECISIONS_FILE" "$GLOBAL_FILE"
if [ -x "$OBSIDIAN_META" ]; then
  bash "$OBSIDIAN_META" ensure-frontmatter "$DECISIONS_FILE" decision-log "${GSD_CURRENT_PHASE:-}"
  bash "$OBSIDIAN_META" ensure-frontmatter "$GLOBAL_FILE" decision-log
fi

{
  echo ""
  echo "---"
  echo "### [$TS] gstack-summary"
  echo "$SUMMARY"
} >> "$DECISIONS_FILE"

[ "$DECISIONS_FILE" != "$GLOBAL_FILE" ] && \
  printf "\n---\n### [%s] gstack-summary\n%s\n" "$TS" "$SUMMARY" >> "$GLOBAL_FILE"

# Chỉ print summary ngắn + paths — đây là tất cả vào orchestrator context
echo ""
echo "━━ GStack Summary ━━"
echo "$SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ Logged → $DECISIONS_FILE${NC}"
echo "  Full output: $SUMMARY_LOG"


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/update_shared_context.sh =====

#!/usr/bin/env bash
# scripts/update_shared_context.sh
# Nhắc orchestrator extract artifacts từ milestone vừa xong vào shared_context.md

echo "━━ Shared Context Update ━━"
echo ""
echo "Extract artifacts từ milestone vừa xong vào .planning/shared_context.md"
echo "Chỉ update các keys trong config.json[context_keys_shared]:"
echo "  db_schema, api_contracts, arch_decisions, env_variables, type_definitions"
echo ""
echo "Sau khi update xong, chạy /gsd-complete-milestone"
echo "GSD sẽ hỏi milestone kế — trả lời và quay lại BƯỚC 2 (GStack review)."


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/update_state.sh =====

#!/usr/bin/env bash
# scripts/update_state.sh
# Update GSS_STATE.json deterministic — không phụ thuộc Claude parse/remember state.
# Đây là source of truth duy nhất cho orchestrator loop.
#
# Usage:
#   bash scripts/update_state.sh GSTACK_REVIEW "phase-01-auth"
#   bash scripts/update_state.sh SP_EXECUTING
#   bash scripts/update_state.sh GSTACK_REVIEW "phase-01-auth" true "REST API and CLI"

set -e
STATE_FILE=".planning/GSS_STATE.json"
NEW_STATE="${1:-}"
MILESTONE="${2:-}"
DEVEX="${3:-}"
DEVEX_RATIONALE="${4:-}"
PROJECT_MODE="${5:-}"

[ -z "$NEW_STATE" ] && echo "Usage: update_state.sh <STATE> [milestone] [devex_surface] [devex_rationale] [project_mode]" && exit 1

mkdir -p .planning

if [ -f "$STATE_FILE" ] && command -v jq &>/dev/null; then
  TMP=$(mktemp)
  jq ".loop_state = \"$NEW_STATE\"" "$STATE_FILE" > "$TMP"
  [ -n "$MILESTONE" ] && jq ".current_milestone = \"$MILESTONE\"" "$TMP" > "${TMP}2" \
    && mv "${TMP}2" "$TMP"
  [ -n "$DEVEX" ] && jq --argjson d "$DEVEX" '.devex_surface = $d' "$TMP" > "${TMP}3" \
    && mv "${TMP}3" "$TMP"
  [ -n "$DEVEX_RATIONALE" ] && jq --arg r "$DEVEX_RATIONALE" '.devex_rationale = $r' "$TMP" > "${TMP}4" \
    && mv "${TMP}4" "$TMP"
  [ -n "$PROJECT_MODE" ] && jq --arg m "$PROJECT_MODE" '.project_mode = $m' "$TMP" > "${TMP}5" \
    && mv "${TMP}5" "$TMP"
  mv "$TMP" "$STATE_FILE"
elif [ -f "$STATE_FILE" ]; then
  TMP=$(mktemp)
  cp "$STATE_FILE" "$TMP"
  sed -i "s/\"loop_state\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"loop_state\": \"$NEW_STATE\"/" "$TMP"
  [ -n "$MILESTONE" ] && sed -i "s/\"current_milestone\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"current_milestone\": \"$MILESTONE\"/" "$TMP"
  if [ -n "$DEVEX" ]; then
    if grep -q '"devex_surface"' "$TMP"; then
      sed -i "s/\"devex_surface\"[[:space:]]*:[[:space:]]*[^,}]*/\"devex_surface\": $DEVEX/" "$TMP"
    else
      sed -i "s/\"current_milestone\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/&,\n  \"devex_surface\": $DEVEX/" "$TMP"
    fi
  fi
  if [ -n "$DEVEX_RATIONALE" ]; then
    ESCAPED_RATIONALE=$(printf '%s' "$DEVEX_RATIONALE" | sed 's/[\/&]/\\&/g')
    if grep -q '"devex_rationale"' "$TMP"; then
      sed -i "s/\"devex_rationale\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"devex_rationale\": \"$ESCAPED_RATIONALE\"/" "$TMP"
    else
      sed -i "s/\"current_milestone\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/&,\n  \"devex_rationale\": \"$ESCAPED_RATIONALE\"/" "$TMP"
    fi
  fi
  if [ -n "$PROJECT_MODE" ]; then
    ESCAPED_PROJECT_MODE=$(printf '%s' "$PROJECT_MODE" | sed 's/[\/&]/\\&/g')
    if grep -q '"project_mode"' "$TMP"; then
      sed -i "s/\"project_mode\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"project_mode\": \"$ESCAPED_PROJECT_MODE\"/" "$TMP"
    else
      sed -i "s/\"current_milestone\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/&,\n  \"project_mode\": \"$ESCAPED_PROJECT_MODE\"/" "$TMP"
    fi
  fi
  mv "$TMP" "$STATE_FILE"
else
  DEVEX_FIELD=""
  [ -n "$DEVEX" ] && DEVEX_FIELD="  \"devex_surface\": $DEVEX,"
  DEVEX_RATIONALE_FIELD=""
  [ -n "$DEVEX_RATIONALE" ] && DEVEX_RATIONALE_FIELD="  \"devex_rationale\": \"$DEVEX_RATIONALE\","
  PROJECT_MODE_FIELD=""
  [ -n "$PROJECT_MODE" ] && PROJECT_MODE_FIELD="  \"project_mode\": \"$PROJECT_MODE\","
  cat > "$STATE_FILE" << EOF
{
  "loop_state": "$NEW_STATE",
  "current_milestone": "${MILESTONE:-null}",
$DEVEX_FIELD
$DEVEX_RATIONALE_FIELD
$PROJECT_MODE_FIELD
  "milestones_done": [],
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
fi

echo "✓ State → $NEW_STATE${MILESTONE:+ (milestone: $MILESTONE)}${DEVEX:+ (devex_surface: $DEVEX)}${DEVEX_RATIONALE:+ (devex_rationale saved)}${PROJECT_MODE:+ (project_mode: $PROJECT_MODE)}"


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/write_exec_prompt.sh =====

#!/usr/bin/env bash
# scripts/write_exec_prompt.sh
# Build EXEC_PROMPT.md từ PLAN.md + DECISIONS.md — file này feed vào Task tool.
# Không bao giờ inline content vào orchestrator conversation.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/resolve_gsd_paths.sh"

CFG=".planning/config.json"
PLAN_FILE="$GSD_PLAN_FILE"
DECISIONS_FILE="$GSD_DECISIONS_FILE"
SHARED_CTX="$GSD_SHARED_CONTEXT"
OUT="$GSD_EXEC_PROMPT"
mkdir -p "$(dirname "$OUT")"

if [ -z "$PLAN_FILE" ] || [ ! -f "$PLAN_FILE" ]; then
  echo "ERROR: No PLAN.md found. Check .planning/phases/ structure."
  exit 1
fi

MAX_ITER=15
[ -f "$CFG" ] && command -v jq &>/dev/null && \
  MAX_ITER=$(jq -r '.ralph_loop.default_max_iterations // 15' "$CFG")

cat > "$OUT" << PROMPT
You are executing a development milestone as part of GSS Orchestrator.
Superpowers TDD skill is active — invoke it via the Skills tool: invoke skill superpowers:test-driven-development

━━ MISSION ━━
Execute ALL unchecked [ ] tasks in PLAN.md using strict RED/GREEN/REFACTOR TDD.
Completed [x] tasks are done — do not redo them.
PLAN.md has already been refined by the Superpowers Brainstorming gate — read it carefully.

━━ GSTACK DECISIONS (authoritative) ━━
$(cat "$DECISIONS_FILE" 2>/dev/null || echo "none")

━━ BRAINSTORM DESIGN DOC (confirmed approach) ━━
$(cat "$GSD_BRAINSTORM_DOC" 2>/dev/null || echo "none — read PLAN.md implementation hints directly")

━━ SHARED CONTEXT ━━
$(cat "$SHARED_CTX" 2>/dev/null || echo "none")

━━ PLAN.md (refined with implementation details) ━━
$(cat "$PLAN_FILE")

━━ TDD PROTOCOL ━━
Per task: RED (failing test) → GREEN (minimal impl) → REFACTOR → commit → mark [x]
Use BRAINSTORM DESIGN DOC and GSTACK DECISIONS as implementation guide during RED phase.

━━ AMBIGUITY HANDLING ━━
Design questions were resolved by the brainstorming gate before this execution started.
If BRAINSTORM_DOC + DECISIONS together answer the question → decide and proceed.
Only block if a scenario is genuinely uncovered by both documents:
  - Collect ALL remaining questions into: $(dirname "$GSD_PLAN_FILE")/OPEN_QUESTIONS.md
  - Format: Q: <question> | Options: A)... B)... C)...
  - Output: <promise>PHASE_BLOCKED:QUESTIONS</promise>
  - Stop — do not guess.

━━ COMPLETION SIGNALS ━━
All tasks [x] and tests pass: <promise>PHASE_COMPLETE</promise>
Need GStack decision: <promise>PHASE_BLOCKED:<question with options></promise>
Technical blocker: <promise>PHASE_BLOCKED:TECH:<description></promise>

━━ ITERATION AWARENESS ━━
Max iterations: $MAX_ITER. Read PLAN.md from disk each iteration to see current [x] state.
PROMPT

echo "✓ EXEC_PROMPT.md → $OUT"
echo "  size: $(wc -c < "$OUT") bytes"
echo ""
echo "Next: pass content to Task tool for gss-executor subagent"


===== LINKED LOCAL FILE | /home/nguyen-thanh-hung/.agents/skills/gsd-gstack-sp-orchestrator/scripts/write_exec_prompt_codex.sh =====

#!/usr/bin/env bash
# scripts/write_exec_prompt_codex.sh
# Build EXEC_PROMPT.md for Codex subagents.
# The generated prompt uses concrete skill ids in-band; no "invoke skill" syntax.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/resolve_gsd_paths.sh"

CFG=".planning/config.json"
PLAN_FILE="$GSD_PLAN_FILE"
DECISIONS_FILE="$GSD_DECISIONS_FILE"
SHARED_CTX="$GSD_SHARED_CONTEXT"
OUT="$GSD_EXEC_PROMPT"
mkdir -p "$(dirname "$OUT")"

if [ -z "$PLAN_FILE" ] || [ ! -f "$PLAN_FILE" ]; then
  echo "ERROR: No PLAN.md found. Check .planning/phases/ structure."
  exit 1
fi

MAX_ITER=15
if [ -f "$CFG" ] && command -v jq &>/dev/null; then
  MAX_ITER=$(jq -r '
    .superpowers.default_max_iterations //
    .ralph_loop.default_max_iterations //
    15
  ' "$CFG")
fi

cat > "$OUT" << PROMPT
\$test-driven-development
\$verification-before-completion

You are executing a development milestone as part of GSS Orchestrator in Codex.
The skill ids above are intentional. There is no separate "invoke skill" command.

━━ MISSION ━━
Execute ALL unchecked [ ] tasks in PLAN.md using strict RED/GREEN/REFACTOR TDD.
Completed [x] tasks are done — do not redo them.
PLAN.md has already been refined by the Superpowers Brainstorming gate — read it carefully.

━━ GSTACK DECISIONS (authoritative) ━━
$(cat "$DECISIONS_FILE" 2>/dev/null || echo "none")

━━ BRAINSTORM DESIGN DOC (confirmed approach) ━━
$(cat "$GSD_BRAINSTORM_DOC" 2>/dev/null || echo "none — read PLAN.md implementation hints directly")

━━ SHARED CONTEXT ━━
$(cat "$SHARED_CTX" 2>/dev/null || echo "none")

━━ PLAN.md (refined with implementation details) ━━
$(cat "$PLAN_FILE")

━━ TDD PROTOCOL ━━
Per task: RED (failing test) → GREEN (minimal impl) → REFACTOR → verify → commit → mark [x]
Use BRAINSTORM DESIGN DOC and GSTACK DECISIONS as implementation guide during RED phase.

━━ AMBIGUITY HANDLING ━━
Design questions were resolved by the brainstorming gate before this execution started.
Do not load \$brainstorming here — it will deadlock autonomous execution.
If BRAINSTORM_DOC + DECISIONS together answer the question → decide and proceed.
Only block if a scenario is genuinely uncovered by both documents:
  - Collect ALL remaining questions into: $(dirname "$GSD_PLAN_FILE")/OPEN_QUESTIONS.md
  - Format: Q: <question> | Options: A)... B)... C)...
  - Output: <promise>PHASE_BLOCKED:QUESTIONS</promise>
  - Stop — do not guess.

━━ VERIFICATION GATE ━━
Before outputting PHASE_COMPLETE, run the relevant full verification commands and
confirm they pass. Do not claim completion from inspection alone.

━━ COMPLETION SIGNALS ━━
All tasks [x] and tests pass: <promise>PHASE_COMPLETE</promise>
Need GStack decision: <promise>PHASE_BLOCKED:<question with options></promise>
Technical blocker: <promise>PHASE_BLOCKED:TECH:<description></promise>

━━ ITERATION AWARENESS ━━
Max iterations: $MAX_ITER. Read PLAN.md from disk each iteration to see current [x] state.
PROMPT

echo "✓ EXEC_PROMPT.md → $OUT"
echo "  size: $(wc -c < "$OUT") bytes"
echo ""
echo "Next: pass content to a Codex subagent as the initial message"


===== gsd-help | /home/nguyen-thanh-hung/.agents/skills/gsd-help/SKILL.md =====

---
name: gsd-help
description: "Show available GSD commands and usage guide"
allowed-tools:
  - Read
---

<objective>
Display the complete GSD command reference.

Output ONLY the reference content below. Do NOT add:
- Project-specific analysis
- Git status or file context
- Next-step suggestions
- Any commentary beyond the reference
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/help.md
</execution_context>

<process>
Execute end-to-end.
Display the reference content directly — no additions or modifications.
</process>


===== gsd-import | /home/nguyen-thanh-hung/.agents/skills/gsd-import/SKILL.md =====

---
name: gsd-import
description: "Ingest external plans with conflict detection against project decisions before writing anything."
argument-hint: "--from <filepath> | --from-gsd2"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
---


<objective>
Import external plan files into the GSD planning system with conflict detection against PROJECT.md decisions.

- **--from**: Import an external plan file, detect conflicts, write as GSD PLAN.md, validate via gsd-plan-checker.
- **--from-gsd2**: Reverse-migrate a GSD-2 project (`.gsd/` directory) back to GSD v1 (`.planning/`) format. Runs `gsd-tools.cjs from-gsd2`. Pass `--path <dir>` to migrate a project at a different path.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/import.md
@$HOME/.Codex/get-shit-done/references/ui-brand.md
@$HOME/.Codex/get-shit-done/references/gate-prompts.md
@$HOME/.Codex/get-shit-done/references/doc-conflict-engine.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
If `--from-gsd2` is in $ARGUMENTS:
Run: `node "$HOME/.Codex/get-shit-done/bin/gsd-tools.cjs" from-gsd2`
Pass `--path <dir>` if provided. Present the migration result to the user.
Stop here (do not run the standard import workflow).

Otherwise, execute the import workflow end-to-end.
</process>


===== gsd-inbox | /home/nguyen-thanh-hung/.agents/skills/gsd-inbox/SKILL.md =====

---
name: gsd-inbox
description: "Triage and review open GitHub issues and PRs against project templates and contribution guidelines."
argument-hint: "[--issues] [--prs] [--label] [--close-incomplete] [--repo owner/repo]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Grep
  - Glob
  - AskUserQuestion
---

<objective>
One-command triage of the project's GitHub inbox. Fetches all open issues and PRs,
reviews each against the corresponding template requirements (feature, enhancement,
bug, chore, fix PR, enhancement PR, feature PR), reports completeness and compliance,
and optionally applies labels or closes non-compliant submissions.

**Flow:** Detect repo → Fetch open issues + PRs → Classify each by type → Review against template → Report findings → Optionally act (label, comment, close)
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/inbox.md
</execution_context>

<context>
**Flags:**
- `--issues` — Review only issues (skip PRs)
- `--prs` — Review only PRs (skip issues)
- `--label` — Auto-apply recommended labels after review
- `--close-incomplete` — Close issues/PRs that fail template compliance (with comment explaining why)
- `--repo owner/repo` — Override auto-detected repository (defaults to current git remote)
</context>

<process>
Execute end-to-end.
Parse flags from arguments and pass to workflow.
</process>


===== gsd-manager | /home/nguyen-thanh-hung/.agents/skills/gsd-manager/SKILL.md =====

---
name: gsd-manager
description: "Interactive command center for managing multiple phases from one terminal"
argument-hint: "[--analyze-deps]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Skill
  - Agent
---

<objective>
Single-terminal command center for managing a milestone. Shows a dashboard of all phases with visual status indicators, recommends optimal next actions, and dispatches work — discuss runs inline, plan/execute run as background agents.

Designed for power users who want to parallelize work across phases from one terminal: discuss a phase while another plans or executes in the background.

**Creates/Updates:**
- No files created directly — dispatches to existing GSD commands via Skill() and background Task agents.
- Reads `.planning/STATE.md`, `.planning/ROADMAP.md`, phase directories for status.

**After:** User exits when done managing, or all phases complete and milestone lifecycle is suggested.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/manager.md
@$HOME/.Codex/get-shit-done/references/ui-brand.md
</execution_context>

<context>
No arguments required. Requires an active milestone with ROADMAP.md and STATE.md.

Project context, phase list, dependencies, and recommendations are resolved inside the workflow using `gsd-sdk query init.manager`. No upfront context loading needed.
</context>

<process>
If `--analyze-deps` is in $ARGUMENTS:
Read and execute `$HOME/.Codex/get-shit-done/workflows/analyze-dependencies.md` end-to-end.

Execute end-to-end.
Maintain the dashboard refresh loop until the user exits or all phases complete.
</process>


===== gsd-new-milestone | /home/nguyen-thanh-hung/.agents/skills/gsd-new-milestone/SKILL.md =====

---
name: gsd-new-milestone
description: "Start a new milestone cycle — update PROJECT.md and route to requirements"
argument-hint: "[milestone name, e.g., 'v1.1 Notifications']"
allowed-tools:
  - Read
  - Write
  - Bash
  - Agent
  - AskUserQuestion
---

<objective>
Start a new milestone: questioning → research (optional) → requirements → roadmap.

Brownfield equivalent of new-project. Project exists, PROJECT.md has history. Gathers "what's next", updates PROJECT.md, then runs requirements → roadmap cycle.

**Creates/Updates:**
- `.planning/PROJECT.md` — updated with new milestone goals
- `.planning/research/` — domain research (optional, NEW features only)
- `.planning/REQUIREMENTS.md` — scoped requirements for this milestone
- `.planning/ROADMAP.md` — phase structure (continues numbering)
- `.planning/STATE.md` — reset for new milestone

**After:** `/gsd:plan-phase [N]` to start execution.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/new-milestone.md
@$HOME/.Codex/get-shit-done/references/questioning.md
@$HOME/.Codex/get-shit-done/references/ui-brand.md
@$HOME/.Codex/get-shit-done/templates/project.md
@$HOME/.Codex/get-shit-done/templates/requirements.md
</execution_context>

<context>
Milestone name: $ARGUMENTS (optional - will prompt if not provided)

Project and milestone context files are resolved inside the workflow (`init new-milestone`) and delegated via `<files_to_read>` blocks where subagents are used.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates (validation, questioning, research, requirements, roadmap approval, commits).
</process>


===== gsd-new-project | /home/nguyen-thanh-hung/.agents/skills/gsd-new-project/SKILL.md =====

---
name: gsd-new-project
description: "Initialize a new project with deep context gathering and PROJECT.md"
argument-hint: "[--auto]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Agent
  - AskUserQuestion
---

<runtime_note>
**Copilot (VS Code):** Use `vscode_askquestions` wherever this workflow calls `AskUserQuestion`. They are equivalent — `vscode_askquestions` is the VS Code Copilot implementation of the same interactive question API.
</runtime_note>

<context>
**Flags:**
- `--auto` — Automatic mode. After config questions, runs research → requirements → roadmap without further interaction. Expects idea document via @ reference.
</context>

<objective>
Initialize a new project through unified flow: questioning → research (optional) → requirements → roadmap.

**Creates:**
- `.planning/PROJECT.md` — project context
- `.planning/config.json` — workflow preferences
- `.planning/research/` — domain research (optional)
- `.planning/REQUIREMENTS.md` — scoped requirements
- `.planning/ROADMAP.md` — phase structure
- `.planning/STATE.md` — project memory

**After this command:** Run `/gsd:plan-phase 1` to start execution.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/new-project.md
@$HOME/.Codex/get-shit-done/references/questioning.md
@$HOME/.Codex/get-shit-done/references/ui-brand.md
@$HOME/.Codex/get-shit-done/templates/project.md
@$HOME/.Codex/get-shit-done/templates/requirements.md
</execution_context>

<process>
Execute end-to-end.
Preserve all workflow gates (validation, approvals, commits, routing).
</process>


===== gsd-ns-context | /home/nguyen-thanh-hung/.agents/skills/gsd-ns-context/SKILL.md =====

---
name: gsd-ns-context
description: "codebase intelligence | map graphify docs learnings"
allowed-tools:
  - Read
  - Skill
---


Route to the appropriate codebase-intelligence skill based on the user's intent.
`gsd-scan` and `gsd-intel` were folded into `gsd-map-codebase` flags by #2790.

| User wants | Invoke |
|---|---|
| Map the full codebase structure | gsd-map-codebase |
| Quick lightweight codebase scan | gsd-map-codebase --fast |
| Query mapped intelligence files | gsd-map-codebase --query |
| Generate a knowledge graph | gsd-graphify |
| Update project documentation | gsd-docs-update |
| Extract learnings from a completed phase | gsd-extract-learnings |

Invoke the matched skill directly using the Skill tool.


===== gsd-ns-ideate | /home/nguyen-thanh-hung/.agents/skills/gsd-ns-ideate/SKILL.md =====

---
name: gsd-ns-ideate
description: "exploration capture | explore sketch spike spec capture"
allowed-tools:
  - Read
  - Skill
---


Route to the appropriate exploration / capture skill based on the user's intent.
`gsd-note`, `gsd-add-todo`, `gsd-add-backlog`, and `gsd-plant-seed` were folded
into `gsd-capture` (with `--note`, default, `--backlog`, `--seed` modes) by
#2790. The capture target lists pending todos via `--list`.

| User wants | Invoke |
|---|---|
| Explore an idea or opportunity | gsd-explore |
| Sketch out a rough design or plan | gsd-sketch |
| Time-boxed technical spike | gsd-spike |
| Write a spec for a phase | gsd-spec-phase |
| Capture a thought (todo / note / backlog / seed) | gsd-capture |

Invoke the matched skill directly using the Skill tool.


===== gsd-ns-project | /home/nguyen-thanh-hung/.agents/skills/gsd-ns-project/SKILL.md =====

---
name: gsd-ns-project
description: "project lifecycle | milestones audits summary"
allowed-tools:
  - Read
  - Skill
---


Route to the appropriate project / milestone skill based on the user's intent.
`gsd-plan-milestone-gaps` was deleted by #2790 — gap planning now happens
inline as part of `gsd-audit-milestone`'s output.

| User wants | Invoke |
|---|---|
| Start a new project | gsd-new-project |
| Create a new milestone | gsd-new-milestone |
| Complete the current milestone | gsd-complete-milestone |
| Audit a milestone for issues | gsd-audit-milestone |
| Summarize milestone status | gsd-milestone-summary |

Invoke the matched skill directly using the Skill tool.


===== gsd-ns-workflow | /home/nguyen-thanh-hung/.agents/skills/gsd-ns-workflow/SKILL.md =====

---
name: gsd-ns-workflow
description: "workflow | discuss plan execute verify phase progress"
allowed-tools:
  - Read
  - Skill
---


Route to the appropriate phase-pipeline skill based on the user's intent.
Sub-skill names below are post-#2790 consolidated targets — `gsd-phase`
absorbs the former add/insert/remove/edit-phase commands and `gsd-progress`
absorbs the former next/do commands.

| User wants | Invoke |
|---|---|
| Gather context before planning | gsd-discuss-phase |
| Clarify what a phase delivers | gsd-spec-phase |
| Create a PLAN.md | gsd-plan-phase |
| Execute plans in a phase | gsd-execute-phase |
| Verify built features through UAT | gsd-verify-work |
| Add / insert / remove / edit a phase | gsd-phase |
| Advance to the next logical step | gsd-progress |
| Offload planning to the ultraplan cloud | gsd-ultraplan-phase |
| Cross-AI plan review convergence loop | gsd-plan-review-convergence |

Invoke the matched skill directly using the Skill tool.


===== gsd-pause-work | /home/nguyen-thanh-hung/.agents/skills/gsd-pause-work/SKILL.md =====

---
name: gsd-pause-work
description: "Create context handoff when pausing work mid-phase"
argument-hint: "[--report]"
allowed-tools:
  - Read
  - Write
  - Bash
---


<objective>
Create `.continue-here.md` handoff file to preserve complete work state across sessions.

Routes to the pause-work workflow which handles:
- Current phase detection from recent files
- Complete state gathering (position, completed work, remaining work, decisions, blockers)
- Handoff file creation with all context sections
- Git commit as WIP
- Resume instructions
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/pause-work.md
</execution_context>

<context>
State and phase progress are gathered in-workflow with targeted reads.
</context>

<process>
If `--report` is in $ARGUMENTS:
Read and execute `$HOME/.Codex/get-shit-done/workflows/session-report.md` end-to-end.

**Follow the pause-work workflow**.

The workflow handles all logic including:
1. Phase directory detection
2. State gathering with user clarifications
3. Handoff file writing with timestamp
4. Git commit
5. Confirmation with resume instructions
</process>


===== gsd-phase | /home/nguyen-thanh-hung/.agents/skills/gsd-phase/SKILL.md =====

---
name: gsd-phase
description: "CRUD for phases in ROADMAP.md — add, insert, remove, or edit phases"
argument-hint: "[--insert | --remove | --edit] <phase-name-or-number>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---


<objective>
Manage phases in ROADMAP.md with a single consolidated command.

Mode routing:
- **default** (no flag): Add a new integer phase to the end of the current milestone → add-phase workflow
- **--insert**: Insert urgent work as a decimal phase (e.g., 72.1) between existing phases → insert-phase workflow
- **--remove**: Remove a future phase and renumber subsequent phases → remove-phase workflow
- **--edit**: Edit any field of an existing phase in place → edit-phase workflow
</objective>

<routing>

| Flag | Action | Workflow |
|------|--------|----------|
| (none) | Add new integer phase at end of milestone | add-phase |
| --insert | Insert decimal phase (e.g., 72.1) after specified phase | insert-phase |
| --remove | Remove future phase, renumber subsequent | remove-phase |
| --edit | Edit fields of existing phase in place | edit-phase |

</routing>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/add-phase.md
@$HOME/.Codex/get-shit-done/workflows/insert-phase.md
@$HOME/.Codex/get-shit-done/workflows/remove-phase.md
@$HOME/.Codex/get-shit-done/workflows/edit-phase.md
</execution_context>

<context>
Arguments: $ARGUMENTS

Parse the first token of $ARGUMENTS:
- If it is `--insert`: strip the flag, pass remainder (format: <after-phase-number> <description>) to insert-phase workflow
- If it is `--remove`: strip the flag, pass remainder (phase number) to remove-phase workflow
- If it is `--edit`: strip the flag, pass remainder (phase-number [--force]) to edit-phase workflow
- Otherwise: pass all of $ARGUMENTS (phase description) to add-phase workflow

Roadmap and state are resolved in-workflow via `init phase-op` and targeted reads.
</context>

<process>
1. Parse the leading flag (if any) from $ARGUMENTS.
2. Load and execute the appropriate workflow end-to-end based on the routing table above.
3. Preserve all validation gates from the target workflow.
</process>


===== gsd-plan-review-convergence | /home/nguyen-thanh-hung/.agents/skills/gsd-plan-review-convergence/SKILL.md =====

---
name: gsd-plan-review-convergence
description: "Cross-AI plan convergence loop — replan with review feedback until no HIGH concerns remain."
argument-hint: "<phase> [--codex] [--gemini] [--Codex] [--opencode] [--ollama] [--lm-studio] [--llama-cpp] [--text] [--ws <name>] [--all] [--max-cycles N]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---


<objective>
Cross-AI plan convergence loop — an outer revision gate around gsd-review and gsd-planner.
Repeatedly: review plans with external AI CLIs → if HIGH concerns found → replan with --reviews feedback → re-review. Stops when no HIGH concerns remain or max cycles reached.

**Flow:** Agent→Skill("gsd-plan-phase") → Agent→Skill("gsd-review") → check HIGHs → Agent→Skill("gsd-plan-phase --reviews") → Agent→Skill("gsd-review") → ... → Converge or escalate

Replaces gsd-plan-phase's internal gsd-plan-checker with external AI reviewers (codex, gemini, etc.). Each step runs inside an isolated Agent that calls the corresponding existing Skill — orchestrator only does loop control.

**Orchestrator role:** Parse arguments, validate phase, spawn Agents for existing Skills, check HIGHs, stall detection, escalation gate.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/plan-review-convergence.md
@$HOME/.Codex/get-shit-done/references/revision-loop.md
@$HOME/.Codex/get-shit-done/references/gates.md
@$HOME/.Codex/get-shit-done/references/agent-contracts.md
</execution_context>

<runtime_note>
**Copilot (VS Code):** Use `vscode_askquestions` wherever this workflow calls `AskUserQuestion`. They are equivalent — `vscode_askquestions` is the VS Code Copilot implementation of the same interactive question API. Do not skip questioning steps because `AskUserQuestion` appears unavailable; use `vscode_askquestions` instead.
</runtime_note>

<context>
Phase number: extracted from $ARGUMENTS (required)

**Flags:**
- `--codex` — Use Codex CLI as reviewer (default if no reviewer specified)
- `--gemini` — Use Gemini CLI as reviewer
- `--Codex` — Use Codex CLI as reviewer (separate session)
- `--opencode` — Use OpenCode as reviewer
- `--ollama` — Use local Ollama server as reviewer (OpenAI-compatible, default host `http://localhost:11434`; configure model via `review.models.ollama`)
- `--lm-studio` — Use local LM Studio server as reviewer (OpenAI-compatible, default host `http://localhost:1234`; configure model via `review.models.lm_studio`)
- `--llama-cpp` — Use local llama.cpp server as reviewer (OpenAI-compatible, default host `http://localhost:8080`; configure model via `review.models.llama_cpp`)
- `--all` — Use all available CLIs and running local model servers
- `--max-cycles N` — Maximum replan→review cycles (default: 3)

**Feature gate:** This command requires `workflow.plan_review_convergence=true`. Enable with:
`gsd config-set workflow.plan_review_convergence true`
</context>

<process>
Execute end-to-end.
Preserve all workflow gates (pre-flight, revision loop, stall detection, escalation).
</process>


===== gsd-profile-user | /home/nguyen-thanh-hung/.agents/skills/gsd-profile-user/SKILL.md =====

---
name: gsd-profile-user
description: "Generate developer behavioral profile and create Codex-discoverable artifacts"
argument-hint: "[--questionnaire] [--refresh]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
---


<objective>
Generate a developer behavioral profile from session analysis (or questionnaire) and produce artifacts (USER-PROFILE.md, /gsd-dev-preferences, AGENTS.md section) that personalize Codex's responses.

Routes to the profile-user workflow which orchestrates the full flow: consent gate, session analysis or questionnaire fallback, profile generation, result display, and artifact selection.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/profile-user.md
@$HOME/.Codex/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Flags from $ARGUMENTS:
- `--questionnaire` -- Skip session analysis entirely, use questionnaire-only path
- `--refresh` -- Rebuild profile even when one exists, backup old profile, show dimension diff
</context>

<process>
Execute the profile-user workflow end-to-end.

The workflow handles all logic including:
1. Initialization and existing profile detection
2. Consent gate before session analysis
3. Session scanning and data sufficiency checks
4. Session analysis (profiler agent) or questionnaire fallback
5. Cross-project split resolution
6. Profile writing to USER-PROFILE.md
7. Result display with report card and highlights
8. Artifact selection (dev-preferences, AGENTS.md sections)
9. Sequential artifact generation
10. Summary with refresh diff (if applicable)
</process>


===== gsd-progress | /home/nguyen-thanh-hung/.agents/skills/gsd-progress/SKILL.md =====

---
name: gsd-progress
description: "Check progress, advance workflow, or dispatch freeform intent — the unified GSD situational command"
argument-hint: "[--forensic | --next | --do \\\"task description\\\"]"
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - SlashCommand
  - AskUserQuestion
---

<objective>
Check project progress, summarize recent work and what's ahead, then intelligently route to the next action.

Three modes:
- **default**: Show progress report + intelligently route to the next action (execute or plan). Provides situational awareness before continuing work.
- **--next**: Automatically advance to the next logical step without manual route selection. Reads STATE.md, ROADMAP.md, and phase directories. Supports `--force` to bypass safety gates.
- **--do "task description"**: Analyze freeform natural language and dispatch to the most appropriate GSD command. Never does the work itself — matches intent, confirms, hands off.
- **--forensic**: Append a 6-check integrity audit after the standard progress report.
</objective>

<flags>
- **--next**: Detect current project state and automatically invoke the next logical GSD workflow step. Scans all prior phases for incomplete work before routing. `--next --force` bypasses safety gates.
- **--do "..."**: Smart dispatcher — match freeform intent to the best GSD command using routing rules, confirm the match, then hand off.
- **--forensic**: Run 6-check integrity audit after the standard progress report.
- **(no flag)**: Standard progress check + intelligent routing (Routes A through F).
</flags>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/progress.md
@$HOME/.Codex/get-shit-done/workflows/next.md
@$HOME/.Codex/get-shit-done/workflows/do.md
@$HOME/.Codex/get-shit-done/references/ui-brand.md
</execution_context>

<process>
Arguments provided: "$ARGUMENTS"
Parse the first token from the provided arguments:
- If it is `--next`: strip the flag, execute the next workflow (passing remaining args e.g. --force).
- If it is `--do`: strip the flag, pass remainder as freeform intent to the do workflow.
- Otherwise: execute the progress workflow end-to-end (pass --forensic through if present).

Preserve all routing logic from the target workflow.
</process>


===== gsd-quick | /home/nguyen-thanh-hung/.agents/skills/gsd-quick/SKILL.md =====

---
name: gsd-quick
description: "Execute a quick task with GSD guarantees (atomic commits, state tracking) but skip optional agents"
argument-hint: "[list | status <slug> | resume <slug> | --full] [--validate] [--discuss] [--research] [task description]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Agent
  - AskUserQuestion
---

<objective>
Execute small, ad-hoc tasks with GSD guarantees (atomic commits, STATE.md tracking).

Quick mode is the same system with a shorter path:
- Spawns gsd-planner (quick mode) + gsd-executor(s)
- Quick tasks live in `.planning/quick/` separate from planned phases
- Updates STATE.md "Quick Tasks Completed" table (NOT ROADMAP.md)

**Default:** Skips research, discussion, plan-checker, verifier. Use when you know exactly what to do.

**`--discuss` flag:** Lightweight discussion phase before planning. Surfaces assumptions, clarifies gray areas, captures decisions in CONTEXT.md. Use when the task has ambiguity worth resolving upfront.

**`--full` flag:** Enables the complete quality pipeline — discussion + research + plan-checking + verification. One flag for everything.

**`--validate` flag:** Enables plan-checking (max 2 iterations) and post-execution verification only. Use when you want quality guarantees without discussion or research.

**`--research` flag:** Spawns a focused research agent before planning. Investigates implementation approaches, library options, and pitfalls for the task. Use when you're unsure of the best approach.

Granular flags are composable: `--discuss --research --validate` gives the same result as `--full`.

**Subcommands:**
- `list` — List all quick tasks with status
- `status <slug>` — Show status of a specific quick task
- `resume <slug>` — Resume a specific quick task by slug
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/quick.md
</execution_context>

<context>
$ARGUMENTS

Context files are resolved inside the workflow (`init quick`) and delegated via `<files_to_read>` blocks.
</context>

<process>

**Parse $ARGUMENTS for subcommands FIRST:**

- If $ARGUMENTS starts with "list": SUBCMD=list
- If $ARGUMENTS starts with "status ": SUBCMD=status, SLUG=remainder (strip whitespace, sanitize)
- If $ARGUMENTS starts with "resume ": SUBCMD=resume, SLUG=remainder (strip whitespace, sanitize)
- Otherwise: SUBCMD=run, pass full $ARGUMENTS to the quick workflow as-is

**Slug sanitization (for status and resume):** Strip any characters not matching `[a-z0-9-]`. Reject slugs longer than 60 chars or containing `..` or `/`. If invalid, output "Invalid session slug." and stop.

## LIST subcommand

When SUBCMD=list:

```bash
ls -d .planning/quick/*/  2>/dev/null
```

For each directory found:
- Check if PLAN.md exists
- Check if SUMMARY.md exists; if so, read `status` from its frontmatter via:
  ```bash
  gsd-sdk query frontmatter.get .planning/quick/{dir}/SUMMARY.md status
  ```
- Determine directory creation date: `stat -f "%SB" -t "%Y-%m-%d"` (macOS) or `stat -c "%w"` (Linux); fall back to the date prefix in the directory name (format: `YYYYMMDD-` prefix)
- Derive display status:
  - SUMMARY.md exists, frontmatter status=complete → `complete ✓`
  - SUMMARY.md exists, frontmatter status=incomplete OR status missing → `incomplete`
  - SUMMARY.md missing, dir created <7 days ago → `in-progress`
  - SUMMARY.md missing, dir created ≥7 days ago → `abandoned? (>7 days, no summary)`

**SECURITY:** Directory names are read from the filesystem. Before displaying any slug, sanitize: strip non-printable characters, ANSI escape sequences, and path separators using: `name.replace(/[^\x20-\x7E]/g, '').replace(/[/\\]/g, '')`. Never pass raw directory names to shell commands via string interpolation.

Display format:
```
Quick Tasks
────────────────────────────────────────────────────────────
slug                           date        status
backup-s3-policy               2026-04-10  in-progress
auth-token-refresh-fix         2026-04-09  complete ✓
update-node-deps               2026-04-08  abandoned? (>7 days, no summary)
────────────────────────────────────────────────────────────
3 tasks (1 complete, 2 incomplete/in-progress)
```

If no directories found: print `No quick tasks found.` and stop.

STOP after displaying the list. Do NOT proceed to further steps.

## STATUS subcommand

When SUBCMD=status and SLUG is set (already sanitized):

Find directory matching `*-{SLUG}` pattern:
```bash
dir=$(ls -d .planning/quick/*-{SLUG}/ 2>/dev/null | head -1)
```

If no directory found, print `No quick task found with slug: {SLUG}` and stop.

Read PLAN.md and SUMMARY.md (if exists) for the given slug. Display:
```
Quick Task: {slug}
─────────────────────────────────────
Plan file: .planning/quick/{dir}/PLAN.md
Status: {status from SUMMARY.md frontmatter, or "no summary yet"}
Description: {first non-empty line from PLAN.md after frontmatter}
Last action: {last meaningful line of SUMMARY.md, or "none"}
─────────────────────────────────────
Resume with: /gsd:quick resume {slug}
```

No agent spawn. STOP after printing.

## RESUME subcommand

When SUBCMD=resume and SLUG is set (already sanitized):

1. Find the directory matching `*-{SLUG}` pattern:
   ```bash
   dir=$(ls -d .planning/quick/*-{SLUG}/ 2>/dev/null | head -1)
   ```
2. If no directory found, print `No quick task found with slug: {SLUG}` and stop.

3. Read PLAN.md to extract description and SUMMARY.md (if exists) to extract status.

4. Print before spawning:
   ```
   [quick] Resuming: .planning/quick/{dir}/
   [quick] Plan: {description from PLAN.md}
   [quick] Status: {status from SUMMARY.md, or "in-progress"}
   ```

5. Load context via:
   ```bash
   gsd-sdk query init.quick
   ```

6. Proceed to execute the quick workflow with resume context, passing the slug and plan directory so the executor picks up where it left off.

## RUN subcommand (default)

When SUBCMD=run:

Execute end-to-end.
Preserve all workflow gates (validation, task description, planning, execution, state updates, commits).

</process>

<notes>
- Quick tasks live in `.planning/quick/` — separate from phases, not tracked in ROADMAP.md
- Each quick task gets a `YYYYMMDD-{slug}/` directory with PLAN.md and eventually SUMMARY.md
- STATE.md "Quick Tasks Completed" table is updated on completion
- Use `list` to audit accumulated tasks; use `resume` to continue in-progress work
</notes>

<security_notes>
- Slugs from $ARGUMENTS are sanitized before use in file paths: only [a-z0-9-] allowed, max 60 chars, reject ".." and "/"
- File names from readdir/ls are sanitized before display: strip non-printable chars and ANSI sequences
- Artifact content (plan descriptions, task titles) rendered as plain text only — never executed or passed to agent prompts without DATA_START/DATA_END boundaries
- Status fields read via `gsd-sdk query frontmatter.get` — never eval'd or shell-expanded
</security_notes>


===== gsd-resume-work | /home/nguyen-thanh-hung/.agents/skills/gsd-resume-work/SKILL.md =====

---
name: gsd-resume-work
description: "Resume work from previous session with full context restoration"
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
  - SlashCommand
---


<objective>
Restore complete project context and resume work seamlessly from previous session.

Routes to the resume-project workflow which handles:

- STATE.md loading (or reconstruction if missing)
- Checkpoint detection (.continue-here files)
- Incomplete work detection (PLAN without SUMMARY)
- Status presentation
- Context-aware next action routing
  </objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/resume-project.md
</execution_context>

<process>
Execute end-to-end.
</process>


===== gsd-review | /home/nguyen-thanh-hung/.agents/skills/gsd-review/SKILL.md =====

---
name: gsd-review
description: "Request cross-AI peer review of phase plans from external AI CLIs"
argument-hint: "--phase N [--gemini] [--Codex] [--codex] [--opencode] [--qwen] [--cursor] [--all]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---


<objective>
Invoke external AI CLIs (Gemini, Codex, Codex, OpenCode, Qwen Code, Cursor) to independently review phase plans.
Produces a structured REVIEWS.md with per-reviewer feedback that can be fed back into
planning via /gsd:plan-phase --reviews.

**Flow:** Detect CLIs → Build review prompt → Invoke each CLI → Collect responses → Write REVIEWS.md
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/review.md
</execution_context>

<context>
Phase number: extracted from $ARGUMENTS (required)

**Flags:**
- `--gemini` — Include Gemini CLI review
- `--Codex` — Include Codex CLI review (uses separate session)
- `--codex` — Include Codex CLI review
- `--opencode` — Include OpenCode review (uses model from user's OpenCode config)
- `--qwen` — Include Qwen Code review (Alibaba Qwen models)
- `--cursor` — Include Cursor agent review
- `--all` — Include all available CLIs
</context>

<process>
Execute end-to-end.
</process>


===== gsd-secure-phase | /home/nguyen-thanh-hung/.agents/skills/gsd-secure-phase/SKILL.md =====

---
name: gsd-secure-phase
description: "Retroactively verify threat mitigations for a completed phase"
argument-hint: "[phase number]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---

<objective>
Verify threat mitigations for a completed phase. Three states:
- (A) SECURITY.md exists — audit and verify mitigations
- (B) No SECURITY.md, PLAN.md with threat model exists — run from artifacts
- (C) Phase not executed — exit with guidance

Output: updated SECURITY.md.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/secure-phase.md
</execution_context>

<context>
Phase: $ARGUMENTS — optional, defaults to last completed phase.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates.
</process>


===== gsd-settings | /home/nguyen-thanh-hung/.agents/skills/gsd-settings/SKILL.md =====

---
name: gsd-settings
description: "Configure GSD workflow toggles and model profile"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---


<objective>
Interactive configuration of GSD workflow agents and model profile via multi-question prompt.

Routes to the settings workflow which handles:
- Config existence ensuring
- Current settings reading and parsing
- Interactive 5-question prompt (model, research, plan_check, verifier, branching)
- Config merging and writing
- Confirmation display with quick command references
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/settings.md
</execution_context>

<process>
Execute end-to-end.
</process>


===== gsd-spec-phase | /home/nguyen-thanh-hung/.agents/skills/gsd-spec-phase/SKILL.md =====

---
name: gsd-spec-phase
description: "Clarify WHAT a phase delivers with ambiguity scoring; produces a SPEC.md before discuss-phase."
argument-hint: "<phase> [--auto] [--text]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---


<objective>
Clarify phase requirements through structured Socratic questioning with quantitative ambiguity scoring.

**Position in workflow:** `spec-phase → discuss-phase → plan-phase → execute-phase → verify`

**How it works:**
1. Load phase context (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md)
2. Scout the codebase — understand current state before asking questions
3. Run Socratic interview loop (up to 6 rounds, rotating perspectives)
4. Score ambiguity across 4 weighted dimensions after each round
5. Gate: ambiguity ≤ 0.20 AND all dimensions meet minimums → write SPEC.md
6. Commit SPEC.md — discuss-phase picks it up automatically on next run

**Output:** `{phase_dir}/{padded_phase}-SPEC.md` — falsifiable requirements that lock "what/why" before discuss-phase handles "how"
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/spec-phase.md
@$HOME/.Codex/get-shit-done/templates/spec.md
</execution_context>

<runtime_note>
**Copilot (VS Code):** Use `vscode_askquestions` wherever this workflow calls `AskUserQuestion`. They are equivalent.
</runtime_note>

<context>
Phase number: $ARGUMENTS (required)

**Flags:**
- `--auto` — Skip interactive questions; Codex selects recommended defaults and writes SPEC.md
- `--text` — Use plain-text numbered lists instead of TUI menus (required for `/rc` remote sessions)

Context files are resolved in-workflow using `init phase-op`.
</context>

<process>
Execute end-to-end.

**MANDATORY:** Read the workflow file BEFORE taking any action. The workflow contains the complete step-by-step process including the Socratic interview loop, ambiguity scoring gate, and SPEC.md generation. Do not improvise from the objective summary above.
</process>

<success_criteria>
- Codebase scouted for current state before questioning begins
- All 4 ambiguity dimensions scored after each interview round
- Gate passed: ambiguity ≤ 0.20 AND all dimension minimums met
- SPEC.md written with falsifiable requirements, explicit boundaries, and acceptance criteria
- SPEC.md committed atomically
- User knows they can now run /gsd:discuss-phase which will load SPEC.md automatically
</success_criteria>


===== gsd-stats | /home/nguyen-thanh-hung/.agents/skills/gsd-stats/SKILL.md =====

---
name: gsd-stats
description: "Display project statistics — phases, plans, requirements, git metrics, and timeline"
allowed-tools:
  - Read
  - Bash
---

<objective>
Display comprehensive project statistics including phase progress, plan execution metrics, requirements completion, git history stats, and project timeline.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/stats.md
</execution_context>

<process>
Execute end-to-end.
</process>


===== gsd-thread | /home/nguyen-thanh-hung/.agents/skills/gsd-thread/SKILL.md =====

---
name: gsd-thread
description: "Manage persistent context threads for cross-session work"
argument-hint: "[list [--open | --resolved] | close <slug> | status <slug> | name | description]"
allowed-tools:
  - Read
  - Write
  - Bash
---


<objective>
Create, list, close, or resume persistent context threads. Threads are lightweight
cross-session knowledge stores for work that spans multiple sessions but
doesn't belong to any specific phase.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/thread.md
</execution_context>

<process>
Execute end-to-end.
</process>


===== gsd-ui-review | /home/nguyen-thanh-hung/.agents/skills/gsd-ui-review/SKILL.md =====

---
name: gsd-ui-review
description: "Retroactive 6-pillar visual audit of implemented frontend code"
argument-hint: "[phase]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---

<objective>
Conduct a retroactive 6-pillar visual audit. Produces UI-REVIEW.md with
graded assessment (1-4 per pillar). Works on any project.
Output: {phase_num}-UI-REVIEW.md
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/ui-review.md
@$HOME/.Codex/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Phase: $ARGUMENTS — optional, defaults to last completed phase.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates.
</process>


===== gsd-validate-phase | /home/nguyen-thanh-hung/.agents/skills/gsd-validate-phase/SKILL.md =====

---
name: gsd-validate-phase
description: "Retroactively audit and fill Nyquist validation gaps for a completed phase"
argument-hint: "[phase number]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---

<objective>
Audit Nyquist validation coverage for a completed phase. Three states:
- (A) VALIDATION.md exists — audit and fill gaps
- (B) No VALIDATION.md, SUMMARY.md exists — reconstruct from artifacts
- (C) Phase not executed — exit with guidance

Output: updated VALIDATION.md + generated test files.
</objective>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/validate-phase.md
</execution_context>

<context>
Phase: $ARGUMENTS — optional, defaults to last completed phase.
</context>

<process>
Execute end-to-end.
Preserve all workflow gates.
</process>


===== gsd-workspace | /home/nguyen-thanh-hung/.agents/skills/gsd-workspace/SKILL.md =====

---
name: gsd-workspace
description: "Manage GSD workspaces — create, list, or remove isolated workspace environments"
argument-hint: "[--new | --list | --remove] [name]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---


<objective>
Manage GSD workspaces with a single consolidated command.

Mode routing:
- **--new**: Create an isolated workspace with repo copies and independent .planning/ → new-workspace workflow
- **--list**: List active GSD workspaces and their status → list-workspaces workflow
- **--remove**: Remove a GSD workspace and clean up worktrees → remove-workspace workflow
</objective>

<routing>

| Flag | Action | Workflow |
|------|--------|----------|
| --new | Create workspace with worktree/clone strategy | new-workspace |
| --list | Scan ~/gsd-workspaces/, show summary table | list-workspaces |
| --remove | Confirm and remove workspace directory | remove-workspace |

</routing>

<execution_context>
@$HOME/.Codex/get-shit-done/workflows/new-workspace.md
@$HOME/.Codex/get-shit-done/workflows/list-workspaces.md
@$HOME/.Codex/get-shit-done/workflows/remove-workspace.md
@$HOME/.Codex/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Arguments: $ARGUMENTS

Parse the first token of $ARGUMENTS:
- If it is `--new`: strip the flag, pass remainder (--name, --repos, --path, --strategy, --branch, --auto flags) to new-workspace workflow
- If it is `--list`: execute list-workspaces workflow (no argument needed)
- If it is `--remove`: strip the flag, pass remainder (workspace-name) to remove-workspace workflow
- Otherwise (no flag): show usage — one of --new, --list, or --remove is required
</context>

<process>
1. Parse the leading flag from $ARGUMENTS.
2. Load and execute the appropriate workflow end-to-end based on the routing table above.
3. Preserve all workflow gates from the target workflow (validation, approvals, commits, routing).
</process>
