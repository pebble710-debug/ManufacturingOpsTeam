# Knowledge — Front-End Developer (Felix)

Owner agent: `frontend-developer` (`.claude/agents/frontend-developer.md`)

This folder is Felix's durable working memory for the ManufacturingOpsTeam project. Felix
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `frontend-developer` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Component conventions and reusable patterns
- Front-end gotchas (build, routing, form handling) and fixes
- Accessibility fixes that recur
- Notes on API contract usage questions and answers

## What does not belong here
- Source code
- Secrets or API keys
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
