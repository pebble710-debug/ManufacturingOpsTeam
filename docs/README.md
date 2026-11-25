# Research & Planning Docs — Manufacturing Shipping & Inventory Operations Dashboard

**Research date:** 2026-11-25 (all web sources accessed on this date)
**Status:** Pre-build research for an educational prototype (graduate AI class assignment)

> **Educational prototype.** This is not a production aerospace or regulated-industry system.
> Every company, customer, part number, carrier, person and record in this repository is
> **fictional**. No employer, customer or proprietary information is used.

## How to read these docs

Each document tags its statements so readers (and the AI agents building the app) can tell
fact from opinion:

| Tag | Meaning |
|-----|---------|
| **[R]** Researched | Supported by a cited public source (see the *Sources* section of each file and [sources.md](sources.md)). |
| **[A]** Assumption | Reasonable belief based on the project context or general practice, *not* verified by a source. |
| **[P]** Proposed | A design decision or feature we are recommending for this app. |

Many of the public sources are vendor blogs or software documentation rather than formal
standards. Where that matters, the file says so. Formal standards (ISO 9001, AS9100, APICS/ASCM
dictionary) are paywalled and were **not** read directly; we only cite public summaries.

## Index

| # | File | Topic |
|---|------|-------|
| 1 | [01-outgoing-shipment-tracking.md](01-outgoing-shipment-tracking.md) | Shipment dates, carriers, tracking numbers, quantities, status lifecycle, shipping documents |
| 2 | [02-packaging-quality.md](02-packaging-quality.md) | Packaging errors, incorrect labels, paperwork discrepancies, rework, mistake-proofing |
| 3 | [03-inventory-management.md](03-inventory-management.md) | Receiving, inventory transactions, stock accuracy, cycle counts, traceability |
| 4 | [04-shipping-workflows-coordination.md](04-shipping-workflows-coordination.md) | End-to-end workflow and how Shipping, Receiving, Production and Quality coordinate |
| 5 | [05-performance-metrics.md](05-performance-metrics.md) | KPI definitions and formulas (OTD, packaging error rate, rework, cycle time, inventory accuracy) |
| 6 | [06-lean-six-sigma.md](06-lean-six-sigma.md) | Standard work, poka-yoke, 5 Whys, fishbone, Pareto, DMAIC, PDCA |
| 7 | [07-software-design.md](07-software-design.md) | Simple, secure, user-friendly dashboard design recommendations |
| 8 | [08-data-model-forms-charts-reports.md](08-data-model-forms-charts-reports.md) | Data fields, forms, charts and reports for a working v1 |
| — | [project-scope.md](project-scope.md) | **Version 1 scope**, fictional sample data plan, and what is postponed to v2 |
| — | [sources.md](sources.md) | Consolidated source list with access dates |

## Project context (from the project owner)

These statements come from the project owner's practical experience and are treated as
requirements, not as researched facts:

- Shipping personnel follow standard packaging instructions.
- Employees verify parts, quantities and shipping paperwork before packaging.
- Packaging errors can require reopening and repackaging shipments.
- Incorrect paperwork or labels can create delays.
- Shipping performance is harder to maintain during high-volume periods.
- Inventory accuracy and material traceability are important.

## Suggested reading order for build agents

1. [project-scope.md](project-scope.md) — what to build.
2. [08-data-model-forms-charts-reports.md](08-data-model-forms-charts-reports.md) — exact fields, forms, charts.
3. [05-performance-metrics.md](05-performance-metrics.md) — exact KPI formulas.
4. [07-software-design.md](07-software-design.md) — architecture, security, UX rules.
5. Topic files 01–04 and 06 for domain background.
