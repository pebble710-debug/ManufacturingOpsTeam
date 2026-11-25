# Knowledge — Database / Data Model Specialist (Dana)

Owner agent: `data-model-specialist` (`.claude/agents/data-model-specialist.md`)

This folder is Dana's durable working memory for the ManufacturingOpsTeam project. Dana
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `data-model-specialist` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Schema design rationale and constraint decisions
- Seed-data distributions, random seed and resulting KPI values
- Lot-trace query notes and performance observations
- Migration lessons

## What does not belong here
- The schema doc (that is `docs/data-model/schema.md`)
- Real company names or any non-fictional data
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
