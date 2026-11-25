---
name: definition-of-done
description: The checklist every ManufacturingOpsTeam feature must pass before it is reported DONE. Use before handing off any implementation, test or review task.
user-invocable: false
---

# Definition of Done (v1)

A feature is DONE only when **all** apply:

- [ ] Traces to a story/task ID and to the section of `docs/project-scope.md` it delivers.
- [ ] Follows accepted ADRs in `docs/adr/` and the API contract (`docs/api/`), if relevant.
- [ ] Server-side validation and role checks for every write (see `security-review-checklist`).
- [ ] Automated tests added/updated and passing locally; command and result in the hand-off.
- [ ] KPI-affecting changes covered by KPI unit tests (`kpi-definitions`).
- [ ] Seed data exercises the feature (fictional only — `fictional-data-guardrails`).
- [ ] UI meets the design spec and `accessibility-check` (status shown with text, not color alone).
- [ ] No secrets, real data, debug flags or stray files committed.
- [ ] Docs updated (README run steps, API contract, knowledge folder lessons).
- [ ] QA Tester has verified acceptance criteria; Security Reviewer has signed off on any change
      touching auth, roles, input handling, dependencies or deployment config.
