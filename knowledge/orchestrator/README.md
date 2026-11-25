# Knowledge — Orchestrator (Olivia)

Owner agent: `orchestrator` (`.claude/agents/orchestrator.md`)

This folder is Olivia's durable working memory for the ManufacturingOpsTeam project. Olivia
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `orchestrator` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Phase summaries and lessons about sequencing and gates
- Recurring blockers and how they were resolved
- Delegation brief examples that worked well
- Decisions on parallelizing vs serializing tasks

## What does not belong here
- Live task status (that is `docs/plan/status.md`)
- Feature code or test output dumps
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
