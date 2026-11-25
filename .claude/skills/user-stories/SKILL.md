---
name: user-stories
description: Turn the v1 scope into prioritized user stories with testable acceptance criteria and traceability. Use when writing or refining the backlog, clarifying requirements, or checking whether a request is in v1 scope.
user-invocable: false
---

# User stories & backlog

## Story format

```
### US-<nnn> <short title>
As a <role from docs/07 §7.2>, I want <capability> so that <benefit>.
Scope ref: project-scope.md §<x.y>   Docs: <01–08 refs>
Priority: Must | Should | Could     Size: S | M | L
Acceptance criteria (Given/When/Then):
- Given ..., when ..., then ...
Out of scope: ...
```

## Rules
- Every item in `docs/project-scope.md` §3 maps to ≥ 1 story; every story maps back to §3.
- The 9 acceptance criteria in scope §5 become explicit, testable stories or story criteria.
- Anything in scope §4 (v2) is rejected with "Deferred to v2 — see project-scope.md §4".
- Roles: Viewer, Shipping, Receiving/Inventory, Quality, Supervisor, Admin.
- Acceptance criteria must be checkable by the QA Tester without asking the author.
- Keep the backlog in `docs/plan/backlog.md`, ordered by scope §6 build order.

## Scope-change procedure
1. Write the proposed change and its reason.
2. Ask the user (via the Orchestrator) to approve.
3. Only then edit `docs/project-scope.md`, with a changelog line at the bottom.
