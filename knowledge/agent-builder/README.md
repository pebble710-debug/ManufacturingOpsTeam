# Knowledge — Agent Builder (Ada)

Owner agent: `agent-builder` (`.claude/agents/agent-builder.md`)

This folder is Ada's durable working memory for the ManufacturingOpsTeam project. Ada
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `agent-builder` (or `agent-builder` when restructuring) edits it.

## What belongs here
- `changelog.md`: every agent/skill change with date, reason and evidence
- Notes on Claude Code subagent/skill format changes (with doc links and dates)
- Ideas for future agents/skills and why they were or were not created
- Validator output history

## What does not belong here
- Copies of agent files (the source of truth is `.claude/`)
- Real customer, employer, supplier or proprietary information (see `fictional-data-guardrails`)
- Chat transcripts or large logs — summarize the lesson instead

## Suggested files
- `lessons.md` — short dated entries: *context → what happened → lesson*
- `decisions.md` — decisions within this role's authority, with doc references
- `checklists.md` — role-specific checklists that proved useful

## Primary references
- `docs/project-scope.md` (version 1 contract)
- `docs/software-team.md` (roster and responsibilities)
- `docs/README.md` (research index)
