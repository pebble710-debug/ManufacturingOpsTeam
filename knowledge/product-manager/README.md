# Knowledge — Product Manager (Priya)

Owner agent: `product-manager` (`.claude/agents/product-manager.md`)

This folder is Priya's durable working memory for the ManufacturingOpsTeam project. Priya
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `product-manager` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Requirement clarifications and the doc section they came from
- Scope decisions (v1 vs v2) and their rationale
- Notes on user roles, shop-floor pain points and demo-story ideas
- Acceptance decisions and reasons for change requests

## What does not belong here
- The backlog itself (that is `docs/plan/backlog.md`)
- Edits to `docs/project-scope.md` (those go in the file with a changelog line)
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
