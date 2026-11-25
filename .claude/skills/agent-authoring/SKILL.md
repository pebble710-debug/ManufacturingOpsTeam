---
name: agent-authoring
description: How to create or improve ManufacturingOpsTeam subagents and skills in line with the official Claude Code subagent and skill formats, including naming, models, tools, personalities, knowledge folders and roster updates. Use when adding a new agent, changing an agent's prompt/tools/model, or creating a skill.
user-invocable: false
---

# Agent & skill authoring

References (read before changing formats):
[Claude Code – Subagents](https://code.claude.com/docs/en/sub-agents) ·
[Claude Code – Skills](https://code.claude.com/docs/en/skills) (both reviewed 2026-11-25).

## Subagent file: `.claude/agents/<name>.md`
- Frontmatter must start on line 1 with `---`. Required: `name` (lowercase-hyphen, no `:`,
  not starting with `-`) and `description` (when to delegate). Unknown fields are silently
  ignored — spell them exactly (camelCase: `disallowedTools`, `maxTurns`).
- Fields used in this project: `name`, `description`, `tools`, `model`, `skills`, `color`
  (optional `effort`, `maxTurns`).
- `model`: `opus` for heavy reasoning/coordination (orchestration, architecture, security,
  agent design); `sonnet` for implementation, design, QA and DevOps; `haiku` for narrow,
  high-volume, low-risk tasks; `inherit` only if deliberately following the parent session.
- `tools`: least privilege. Reviewers don't need Edit on source; only the Orchestrator lists
  `Agent(...)`. Use `skills:` to preload skills (full content is injected) — do not add `Skill`
  to tools for that purpose.
- Preloaded skills must **not** set `disable-model-invocation: true` (that blocks preloading).
- Body = system prompt: identity & personality (first name, style), mission, responsibilities,
  deliverables (with file paths), collaboration rules, docs to read, boundaries, hand-off.

## Skill file: `.claude/skills/<skill-name>/SKILL.md`
- Directory name = skill name (lowercase-hyphen). Frontmatter: `name`, `description` (key use
  case first; description + when_to_use ≤ 1,536 chars), `user-invocable: false` for background
  knowledge. Keep SKILL.md under 500 lines; put long references in supporting files.

## Every new or changed agent must also
1. Have `knowledge/<agent-name>/README.md`.
2. Be listed in `docs/software-team.md` (roster, model, skills) and `CLAUDE.md` team table.
3. Be added to the Orchestrator's `Agent(...)` tool list if the Orchestrator should delegate to it.
4. Pass `python3 .claude/skills/validate-agent-team/validate.py`.
5. Get a commit message explaining why the change was needed.

## Improving an agent
Collect evidence (hand-offs where it went out of role, missed rules, repeated blockers), change
the smallest thing (description, a rule, a skill), and record the change and reason in
`knowledge/agent-builder/changelog.md`.
