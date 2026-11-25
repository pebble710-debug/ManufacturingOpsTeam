# Knowledge — DevOps Engineer (Theo)

Owner agent: `devops-engineer` (`.claude/agents/devops-engineer.md`)

This folder is Theo's durable working memory for the ManufacturingOpsTeam project. Theo
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `devops-engineer` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Verified Netlify configuration notes and limits
- CI troubleshooting notes
- Environment variable inventory (names and purpose only, never values)
- Release and rollback runbook drafts

## What does not belong here
- Secret values, tokens or `.env` files
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
