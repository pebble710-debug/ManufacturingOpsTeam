# Agent Builder changelog

## 2026-11-25 — T-006 Align agents and skills with accepted ADR-001

**Reason / evidence:** The user accepted ADR-001 conditionally, pending the PoC in §12.1. They chose the
path `docs/ADR-001.md`. Agents, skills, `CLAUDE.md` and `docs/software-team.md` still pointed at
`docs/adr/ADR-001-stack-and-persistence.md`, which does not exist, and still described Python
tooling (Flask, pytest, pip-audit). ADR-001 §11.3 lists the follow-on changes. The task brief came
from the orchestrator (Olivia).

**Convention set:** ADR-001 lives at `docs/ADR-001.md`. Later ADRs (002 onward) go in
`docs/adr/ADR-<nnn>-<slug>.md`.

**Changes**
- `CLAUDE.md`:
  - Ground rule 3 now says ADR-001 is accepted conditionally and no full implementation happens until the PoC passes and the user approves. It also summarizes the stack and the ADR path convention.
  - New ground rule 7: Netlify Free plan only, with no upgrades or purchases without user approval, and local-first work.
  - Updated the ADR path, the example prompts and the repo map.
  - Status is now "Phase 1 complete pending PoC; Phase 2 design in progress".
- Skills:
  - `project-context`: rule 3 rewritten, new rule 7 (Free plan), accepted-stack table, user-decisions list, ADR rows in the docs map.
  - `architecture-decision-records`: ADR-001 is marked decided, with a historical summary. The template is kept for ADR-002 onward, now with a Free-plan rule.
  - `schema-and-seed-data`:
    - Postgres everywhere and `timestamptz` UTC.
    - Append-only triggers on the ledger, history and audit tables.
    - Native forward-only expand/contract migrations, with local reset as the only rollback.
    - The seed is not a migration, and seed data uses a fixed demo reporting date.
  - `netlify-deployment`:
    - The Python note changed from [A] to [R] (not supported).
    - Added the migrations/branches and public-repo facts.
    - New Free-plan credit budget section: no paid upgrades, add-ons or auto-purchase without approval; check the account plan before provisioning; local-first; batched deploys.
    - Updated the checklist and fallbacks.
  - `test-strategy`: Vitest with `@netlify/database-dev`, Playwright with `astro dev`, and a CI fallback.
  - `ci-pipeline`: Node/npm scripts, `npm ci`, `astro check`, `npm audit --audit-level=high`, and a rule that CI never deploys.
  - `security-review-checklist`:
    - `npm audit`; scrypt and the session cookie.
    - Bans on postgres.js `sql.unsafe` and on `set:html`.
    - New CSRF row: `checkOrigin` plus a synchronizer token.
    - Zod validation and DB-trigger append-only rules; the Quality/Supervisor verifier rule.
  - `sdlc-orchestration`: the Phase 1 output path and gate are updated, and the PoC/go-ahead and Free-plan dependency rules added.
  - `definition-of-done` and `dashboard-charts`: ADR path; Chart.js is bundled from npm.
- Agents: only paths and gate wording changed. No responsibility, tool or model changes.
  - `orchestrator`: gate text now covers the conditional acceptance, the PoC and the Free plan.
  - `software-architect`: the ADR-001 first task is marked done and its brief is kept as history. The deliverables path is updated.
  - `security-reviewer`: `pip-audit` replaced with `npm audit --audit-level=high`, and the ADR path updated.
  - `devops-engineer`, `backend-developer`, `data-model-specialist`, `dashboard-analytics-developer`: ADR path.
- `software-architect` description: changed the routing phrase. It said "Use before any implementation to evaluate the proposed Flask, SQLite…" and now says ADR-001 is decided and the agent is for follow-up ADRs and PoC review. This is delegation routing only; the agent's responsibilities are unchanged.
- `docs/software-team.md`:
  - Architect roster row and the ADR skill row updated.
  - Deliverables row now lists `docs/ADR-001.md` and `docs/adr/ADR-002…005`.
  - §6 rewritten from "open decision" to "Architecture decision (ADR-001)".

**Intentional historical mentions kept:**
- Flask and SQLite in the ADR summary (architecture-decision-records), the architect's historical ADR-001 brief, and `docs/software-team.md` §6.
- The note that SQLite is not used.

**Not edited (others own them):** `docs/project-scope.md`, `docs/ADR-001.md`, `docs/07-software-design.md`.

**Validation:**
- `validate.py`: PASS (12 agents, 19 skills, 0 warnings).
- `claude plugin validate .claude/agents`: passed.
