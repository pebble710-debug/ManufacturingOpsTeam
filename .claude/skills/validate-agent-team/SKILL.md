---
name: validate-agent-team
description: Validate the ManufacturingOpsTeam agent team configuration — subagent frontmatter, models, tools, skill references, knowledge folders and roster docs. Use after creating or editing any file in .claude/agents/ or .claude/skills/, or when asked to check the team setup.
argument-hint: "[--strict]"
---

# Validate the agent team

Run from the repository root:

```bash
python3 .claude/skills/validate-agent-team/validate.py
```

Optionally also run Claude Code's own parser check on the agents directory:

```bash
claude plugin validate .claude/agents
```

## What `validate.py` checks
1. Every `.claude/agents/*.md` starts with `---` on line 1 and its YAML frontmatter parses.
2. `name` present, lowercase-hyphen, no `:`, not starting with `-`, unique across agents.
3. `description` present and non-trivial.
4. Only documented subagent frontmatter fields are used (catches silent typos).
5. `model` is one of `sonnet`, `opus`, `haiku`, `fable`, `inherit` or a `claude-*` model ID.
6. `color` (if set) is a supported value.
7. Every skill in `skills:` exists at `.claude/skills/<skill>/SKILL.md`.
8. Every `SKILL.md` has parseable frontmatter with a `description`; `name` matches its folder;
   preloaded skills do not set `disable-model-invocation: true`; under 500 lines.
9. Every agent has `knowledge/<agent-name>/README.md`.
10. Every agent appears in `docs/software-team.md` and `CLAUDE.md`.
11. Every agent named in the orchestrator's `Agent(...)` list exists, and every other agent is in it.
12. Reports skills not used by any agent (warning only).

Exit code 0 = no errors (warnings allowed). Report the full output in your hand-off.
