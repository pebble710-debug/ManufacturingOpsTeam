---
name: accessibility-check
description: WCAG 2.2 AA checklist tailored to the ManufacturingOpsTeam dashboard's forms, tables, status badges and charts. Use when designing, building or testing any screen.
user-invocable: false
---

# Accessibility check (WCAG 2.2 AA target)

Reference: [W3C – WCAG 2.2](https://www.w3.org/TR/WCAG22/) (also ISO/IEC 40500:2025).

- [ ] Text contrast ≥ 4.5:1 (large text ≥ 3:1); UI components & chart marks ≥ 3:1.
- [ ] Status, KPI direction and chart series never rely on color alone (text, icon, pattern).
- [ ] Every form input has a visible `<label>`; errors are announced (`aria-describedby`/`aria-live`).
- [ ] Full keyboard operation; visible focus indicator not obscured by sticky headers.
- [ ] Target size ≥ 24×24 CSS px (project rule: 44 px for primary actions).
- [ ] Headings in order; landmarks (`header`, `nav`, `main`); page `<title>` per screen.
- [ ] Tables use `<th scope>`; sortable headers expose sort state.
- [ ] Each chart has a text summary and an accessible data-table alternative.
- [ ] No content flashes; motion respects `prefers-reduced-motion`.
- [ ] Automated check (e.g., axe-core via Playwright) runs in CI on key pages; manual keyboard pass
      recorded in the QA report.
