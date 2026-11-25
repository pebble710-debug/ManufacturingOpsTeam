---
name: handoff-protocol
description: The standard way ManufacturingOpsTeam agents receive tasks, report results, flag blockers and hand work to the next agent. Use at the start and end of every delegated task.
user-invocable: false
---

# Hand-off protocol

## When you receive a task
1. Confirm the task ID (e.g., `T-012`) and acceptance criteria from the Orchestrator's brief or
   `docs/plan/backlog.md`. If either is missing, state your assumption at the top of your report.
2. Read your `knowledge/<agent-name>/` folder and the docs the task references.
3. Check dependencies: if an upstream deliverable (ADR, schema, API contract, design spec) is
   missing or unaccepted, **stop and report BLOCKED** rather than inventing it.

## While working
- Stay inside your role. If the task needs another role's decision, record it as a question.
- Keep changes small and on the branch the Orchestrator named.
- Never push to `main` unless the Orchestrator's brief says the user approved it.

## Report format (your final message)

```
## Hand-off: <task ID> — <title>
Agent: <agent-name> (<first name>)
Status: DONE | PARTIAL | BLOCKED
### What I did
- ...
### Files changed
- path — one-line purpose
### How to verify
- exact command(s) or steps, and their result when you ran them
### Decisions & assumptions
- [A] ... / [P] ...
### Open questions / risks
- ... (owner: <agent-name>)
### Next suggested task
- <agent-name>: ...
```

Report test results faithfully: if something failed or was skipped, say so with the output.

## After the task
Append durable lessons to `knowledge/<agent-name>/` (e.g., `lessons.md`) — not chat transcripts.
