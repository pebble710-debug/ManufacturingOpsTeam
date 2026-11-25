# Knowledge — QA Tester (Quinn)

Owner agent: `qa-tester` (`.claude/agents/qa-tester.md`)

This folder is Quinn's durable working memory for the ManufacturingOpsTeam project. Quinn
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `qa-tester` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Test heuristics and recurring bug patterns
- Flaky-test notes and their root causes
- Environment/setup notes for running E2E and accessibility checks
- Lessons from past releases

## What does not belong here
- Test reports and the acceptance matrix (those are in `docs/qa/`)
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
