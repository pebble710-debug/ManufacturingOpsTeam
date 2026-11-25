# 6. Lean Six Sigma for Shipping Operations

**Research date:** 2026-11-25 · Tags: **[R]** researched · **[A]** assumption · **[P]** proposed

## 6.1 Principles that apply

| Principle | What it means in shipping | Tag |
|-----------|---------------------------|-----|
| **Standard work** | One documented, current best way to pack and verify each part/customer, with visual aids | [R] peak-season sources recommend documented procedures and visual aids ([Peoplevox](https://www.peoplevox.com/wp-content/uploads/2025/09/dsc_Peak_Prep_Warehouse_Checklist_to_Increase_Efficiency.pdf)) |
| **Mistake-proofing (poka-yoke)** | Make the wrong action hard: checklists, enforced steps, scanning | [R] ([Mecalux](https://www.mecalux.com/blog/poka-yoke)) |
| **Root-cause analysis** | Ask why errors happen (5 Whys, fishbone) instead of only fixing them | [R] ([UCI – LSS tools](https://dfa.uci.edu/pde/cpi/lss-tools/root-cause-analysis.php)) |
| **Pareto (80/20)** | Focus on the few error categories causing most problems | [R] used in warehouse LSS case studies ([HCMIU case study](https://keep.hcmiu.edu.vn/handle/123456789/5268)) |
| **DMAIC** | Structured, data-driven project cycle: Define, Measure, Analyze, Improve, Control | [R] ([CSU Ohio – Applying LSS](https://pressbooks.ulib.csuohio.edu/applyingleansixsigmaoe/chapter/chapter-6-the-dmaic-methodology/)) |
| **Visual management** | Make status obvious at a glance (boards, dashboards) | [A] general lean practice |
| **Continuous improvement (Kaizen / PDCA)** | Small, frequent improvements, checked with data | [A] general lean practice |

## 6.2 Standard work for packaging (applied to the project context)

- **[Context]** Shipping personnel follow standard packaging instructions and verify parts,
  quantities and paperwork before packaging.
- **[A]** A standard packaging instruction typically specifies: part number/revision, container
  type, quantity per container, protection/dunnage, label content and position, required
  documents, and photos of a correctly packed unit.
- **[P]** v1 stores a *packaging instruction reference* (ID + revision) on each part and shows it
  on the shipment screen. Full instruction authoring with photos is v2.
- **[R]** Changing standard operating procedures prevents many manual picking/shipping mistakes.
  ([Parcel Industry](https://parcelindustry.com/article-5246-It&rsquos-a-Climb-Five-Smart-Ways-to-Get-a-Head-Start-on-Next-Year&rsquos-Peak-Season.html))

## 6.3 Root-cause analysis

### 5 Whys
- **[R]** A published shipping example traces a delay through successive "whys" to a root cause of
  no cross-trained backup for a critical role.
  ([MSI – Simple LSS tools](https://www.msicertified.com/wp-content/uploads/2026/04/Streamlining-Your-Success-Simple-Lean-Six-Sigma-Tools-for-Everyday-Business-1.pdf))
- **Fictional example [A]:**
  1. Why was shipment SH-1042 late? → It was reopened to replace the packing slip.
  2. Why? → The slip listed revision B; the parts were revision C.
  3. Why? → The slip template pulled revision from an old customer PO line.
  4. Why? → Revision changes aren't pushed to the template.
  5. Why? → No step in the engineering-change process updates shipping documents.
  → Countermeasure: add a shipping-document update to the change checklist; add "revision
  matches" to the verification checklist.

### Fishbone (Ishikawa) — "6 M" categories
- **[R]** Fishbone and 5 Whys are used together in warehouse LSS work to expose process gaps.
  ([Polytechnic case study](https://app.mypolycc.edu.my/journal/PMJSSH/article/download/821/497/3971))
- **[P]** v1 uses these as the **root-cause category** dropdown on packaging errors:
  *Method* (instruction unclear/not followed), *Man/People* (training, fatigue, staffing),
  *Material* (wrong/mixed parts from upstream), *Machine* (printer, scale, scanner), *Measurement*
  (count/verification error), *Environment* (space, lighting, peak volume).

## 6.4 DMAIC applied to "reduce packaging errors" (example project)

| Phase | Activity | How the dashboard helps [P] |
|-------|----------|-----------------------------|
| Define | Problem statement, scope, goal (e.g., cut error rate from 4 % to 2 %) | Baseline KPI tiles |
| Measure | Collect consistent error data | Error form with fixed categories |
| Analyze | Pareto by category, by customer, by shift; 5 Whys on top category | Pareto chart; filters |
| Improve | Countermeasures (checklist change, label template fix) | Corrective-action field on errors |
| Control | Monitor to confirm the gain holds | Weekly trend line with target line |

- **[R]** DMAIC is a data-driven cycle for improving existing processes; combining lean tools with
  DMAIC supports continuous improvement in logistics.
  ([process.st – DMAIC](https://www.process.st/?p=77201); [Polytechnic case study](https://app.mypolycc.edu.my/journal/PMJSSH/article/download/821/497/3971))

## 6.5 Corrective-action loop in software (proposed)

**[P]** Each packaging error has: root-cause category, root-cause note (5 Whys text), corrective
action, owner, due date, status (Open / In Progress / Closed). The dashboard shows open
corrective actions and overdue ones. A full CAPA/8D module is v2.

## Sources

See inline links; full list in [sources.md](sources.md).
