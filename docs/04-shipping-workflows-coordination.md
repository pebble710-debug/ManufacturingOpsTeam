# 4. Manufacturing Shipping Workflows & Cross-Department Coordination

**Research date:** 2026-11-25 · Tags: **[R]** researched · **[A]** assumption · **[P]** proposed · **[Context]** from project owner

## 4.1 End-to-end flow

The flow below combines researched concepts (receiving, MRB, ASN, pick-to-ship) with the
project owner's context. Specific hand-offs are **[A]** — they are typical but vary by company.

```
 Supplier ──► RECEIVING ──► (Receiving inspection) ──► Stock ──► PRODUCTION ──► Finished goods
                 │                    │                                │
                 │               QUALITY: hold / MRB              QUALITY: final release
                 ▼                                                     ▼
          Inventory RECEIPT txn                         SHIPPING: Ready to Pack
                                                              │
                                     Pack per standard packaging instruction
                                                              │
                         Verify parts, qty, labels, paperwork (2nd person)
                                   │ pass                     │ fail
                                   ▼                          ▼
                          Ship: carrier + tracking      Rework → re-verify
                                   │
                         Inventory SHIP txn, customer notified (ASN)
```

- **[R]** Pick-to-ship cycle time (APQC) runs from order release for picking to shipment —
  i.e., it measures the shipping department's own portion of the flow.
  ([APQC – Pick-to-ship](https://www.apqc.org/resources/benchmarking/open-standards-benchmarking/measures/pick-ship-cycle-time-hours-customer))
- **[R]** ASNs let the receiving party plan dock space and labor ahead of arrival.
  ([SPS Commerce – ASN](https://www.spscommerce.com/blog/order-visibility-with-advanced-shipping-notice/))
- **[R]** Nonconforming material is segregated and dispositioned by a cross-functional MRB
  (Quality, Engineering, Manufacturing, sometimes Purchasing); no single function should
  unilaterally "use as is." ([Tulip – MRB](https://tulip.co/blog/material-review-board/);
  [Open Exam Prep](https://open-exam-prep.com/study-guides/cqe/product-and-process-control/material-control-and-disposition))

## 4.2 Who does what (RACI-style, proposed)

| Activity | Shipping | Receiving | Production | Quality | Supervisor |
|----------|:-------:|:--------:|:---------:|:------:|:---------:|
| Create/plan shipment | R | | C | | A |
| Receive & record material | | R | | C | A |
| Receiving inspection / hold | | C | | R | A |
| Complete production, move to FG | | | R | C | |
| Final quality release | I | | C | R/A | |
| Pack per instruction | R | | | | A |
| Verify parts/qty/paperwork | R (2nd person) | | | C (audit) | A |
| Log packaging error / rework | R | | | C | A |
| Root-cause & corrective action | C | C | C | R | A |
| Cycle count | | R | | | A |
| Inventory adjustment approval | | | | | R/A |

R = Responsible, A = Accountable, C = Consulted, I = Informed. **[P]** These map to app roles in
[07-software-design.md](07-software-design.md).

## 4.3 Coordination pain points and what the dashboard can do

| Pain point | Tag | Dashboard response (proposed) |
|------------|-----|------------------------------|
| Shipping doesn't know what Production will finish today | [A] | "Due in next 3 days" list with status *Planned* vs *Ready to Pack* |
| Quality hold stops a shipment without Shipping knowing why | [A] | *On Hold* status with required hold reason and owner department |
| Paperwork errors found at the dock delay pickup | [Context] | Checklist-enforced verification; paperwork-error Pareto |
| Errors repeat because fixes aren't fed back | [R] Rabot | Every error has root-cause category + corrective action field |
| Peak volume overwhelms the team | [Context] [R] | Daily volume vs error-rate chart; backlog by status |
| Inventory says parts exist but shelf is empty | [A] | Ledger-based on-hand + cycle count accuracy KPI |

## 4.4 Daily operating rhythm

- **[A]** Many plants run a short daily tier meeting at a visual board reviewing yesterday's
  performance (safety, quality, delivery) and today's priorities.
- **[P]** The dashboard home page is designed to be that board: yesterday's shipments/on-time %,
  open errors, today's due list, items on hold — readable on a wall-mounted screen.

## Sources

See inline links; full list in [sources.md](sources.md).
