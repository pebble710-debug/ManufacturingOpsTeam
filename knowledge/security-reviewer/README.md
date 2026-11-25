# Knowledge — Security Reviewer (Sasha)

Owner agent: `security-reviewer` (`.claude/agents/security-reviewer.md`)

This folder is Sasha's durable working memory for the ManufacturingOpsTeam project. Sasha
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `security-reviewer` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Threat-model notes and assumptions
- Recurring finding patterns and recommended fixes
- Tool commands used (audits, secret scans) and how to read their output
- Accepted risks and who accepted them

## What does not belong here
- Secrets or credentials of any kind
- Formal reports (those are in `docs/security/`)
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
