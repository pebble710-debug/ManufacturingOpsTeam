# Knowledge — Dashboard & Analytics Developer (Kenji)

Owner agent: `dashboard-analytics-developer` (`.claude/agents/dashboard-analytics-developer.md`)

This folder is Kenji's durable working memory for the ManufacturingOpsTeam project. Kenji
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `dashboard-analytics-developer` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Hand calculations that validate each KPI
- Chart design decisions and accessibility alternatives
- Edge cases found in KPI logic
- Seed-data KPI baselines for regression checks

## What does not belong here
- KPI definitions (those are in `docs/05-performance-metrics.md`)
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
