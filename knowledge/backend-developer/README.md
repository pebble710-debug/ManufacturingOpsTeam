# Knowledge — Back-End Developer (Diego)

Owner agent: `backend-developer` (`.claude/agents/backend-developer.md`)

This folder is Diego's durable working memory for the ManufacturingOpsTeam project. Diego
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `backend-developer` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Business-rule decisions with doc references
- Auth/session and permission implementation notes
- Testing patterns for status transitions and the ledger
- Known edge cases and how they are handled

## What does not belong here
- The API contract (that is `docs/api/contract.md`)
- Secrets
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
