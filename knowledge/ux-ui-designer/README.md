# Knowledge — UX/UI Designer (Maya)

Owner agent: `ux-ui-designer` (`.claude/agents/ux-ui-designer.md`)

This folder is Maya's durable working memory for the ManufacturingOpsTeam project. Maya
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `ux-ui-designer` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Design rationale and usability observations
- Accessibility findings and patterns that passed
- Copy/wording conventions (labels, error messages)
- Feedback from reviews of built screens

## What does not belong here
- The UI spec itself (that is `docs/design/ui-spec.md`)
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
