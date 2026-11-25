# 2. Packaging Quality: Errors, Labels, Paperwork and Rework

**Research date:** 2026-11-25 · Tags: **[R]** researched · **[A]** assumption · **[P]** proposed

## 2.1 Why packaging quality matters

- **[Context]** Packaging errors can require reopening and repackaging shipments, and incorrect
  paperwork or labels create delays (project owner).
- **[R]** Packing errors grow where instructions are vague; when packers choose their own box,
  void fill and label placement, inconsistency is inevitable. Station layout (similar parts side
  by side, reaching into the wrong tote) also turns errors into "a matter of probability."
  ([Rabot – Reduce packing errors](https://rabot.us/blog/reduce-packing-errors/);
  [Racklify – Prevent mispacks](https://racklify.com/encyclopedia/how-to-prevent-mispacks-in-your-warehouse-processes-and-technology/))
- **[R]** Every packing error should feed into a root-cause process rather than just being fixed.
  ([Rabot](https://rabot.us/blog/reduce-packing-errors/))

## 2.2 Error taxonomy (proposed for v1)

**[P]** A fixed list of error categories keeps data analyzable (Pareto charts need consistent
categories). Categories are derived from the project context plus the research above.

| Category | Examples | Typical detection point |
|----------|----------|------------------------|
| Wrong part | Wrong part number or revision packed | Verification / customer |
| Wrong quantity | Short, over, mixed counts | Verification / customer |
| Incorrect label | Wrong part no., qty, lot, address; missing or unreadable barcode; wrong placement | Verification |
| Paperwork discrepancy | Packing slip ≠ contents; C of C wrong lot/rev; BOL mismatch; missing document | Verification / shipping office |
| Packaging method | Wrong container, missing protection/dunnage, not per packaging instruction | Verification / Quality audit |
| Damage | Part damaged during packing/handling | Packing / customer |
| Traceability | Lot/serial not recorded or mixed lots in one package | Verification / Quality |
| Other | Free-text, must be reviewed and recategorized | — |

Additional fields per error (**[P]**): severity (Minor / Major / Critical), detected by
(Packer, Verifier, Quality, Customer), detected stage (Before ship / After ship), and root-cause
category (see 6 M below).

- **[A]** Errors detected **after** shipment (customer-found) are far more costly than internally
  caught ones and should be tracked and charted separately ("escapes").

## 2.3 Rework

- **[R]** First-pass yield (FPY) counts only units that pass without rework, scrap or repair;
  anything needing rework counts as a first-pass failure regardless of final outcome.
  ([Wikipedia – First-pass yield](https://en.wikipedia.org/wiki/First-pass_yield);
  [Tractian – FPY](https://tractian.com/en/glossary/first-pass-yield))
- **[R]** A high final yield can hide significant rework ("hidden factory"), which still costs
  time and money. ([Rework.com – FPY & RTY](https://resources.rework.com/fr/libraries/process-management/first-pass-yield))
- **[P]** v1 rework record: linked shipment, linked error(s), action taken (relabel, repack,
  reprint paperwork, replace part, recount), start/end time → **rework minutes**, performed by,
  and verified-after-rework flag.
- **[P]** Applied to shipments: **Packaging FPY = shipments verified with no error on first
  verification ÷ shipments verified.** See [05-performance-metrics.md](05-performance-metrics.md).

## 2.4 Prevention: mistake-proofing (poka-yoke)

- **[R]** Poka-yoke ("mistake-proofing") originated at Toyota; in logistics it aims to prevent
  inadvertent errors and correct them when they occur. Types include *informational* (visual or
  audio guidance, pick-to-light), *sequential* (system forces steps in order) and *physical*
  (barriers/partitions). ([Mecalux – Poka-yoke](https://www.mecalux.com/blog/poka-yoke);
  [Keyence – Preventing mistakes](https://www.keyence.com/ss/products/auto_id/logistics/improvement/preclude-mistakes.jsp))
- **[R]** Common pack-station controls: barcode scanning at pick and pack, weight checks, and
  verification cameras. ([Racklify](https://racklify.com/encyclopedia/how-to-prevent-mispacks-in-your-warehouse-processes-and-technology/);
  [Linnworks – Picking errors](https://www.linnworks.com/blog/picking-errors/))
- **[A]** A **two-person verification** (packer + independent verifier) against a checklist is a
  common low-tech control and matches the project context ("employees verify parts, quantities
  and paperwork before packaging").

**[P]** How the software itself can mistake-proof in v1 (sequential poka-yoke):

1. Shipment cannot move to *Verified* until every checklist item is ticked: part number matches,
   revision matches, quantity matches, lot recorded, labels match, packing slip matches, C of C
   present (if required), packaging instruction followed.
2. Verifier must be a different user than the packer (configurable).
3. Shipment cannot move to *Shipped* without carrier + tracking number (or "Customer Pickup").
4. Any failed checklist item opens a pre-filled packaging-error form and moves the shipment to
   *Rework*.

**[P – v2]** Barcode scanning of part/lot labels against the shipment lines; label/packing-slip
generation from the same data so they cannot disagree.

## 2.5 Paperwork discrepancies

- **[R]** We found little public material specifically on paperwork discrepancies beyond general
  advice to use system-based matching. (Search gap noted 2026-11-25.)
- **[A]** The root problem is usually **the same data typed in multiple places** (ERP, label
  printer, packing slip template, C of C). Generating all documents from one record is the
  strongest fix — a v2 feature.
- **[P]** v1 records paperwork discrepancies as a packaging-error category with a sub-type
  (Packing slip, BOL, C of C, Customer-specific form, Commercial invoice).

## 2.6 High-volume periods

- **[R]** Peak-period errors are linked more to rushed onboarding of temporary/new staff and
  undocumented "tribal knowledge" than to volume alone; clear standard procedures and visual aids
  are recommended. ([SPS Commerce – Seasonal staffing](https://www.spscommerce.com/community/articles/seasonal-warehouse-staffing-and-edi-a-guide-to-order-accuracy);
  [Peoplevox – Peak prep checklist](https://www.peoplevox.com/wp-content/uploads/2025/09/dsc_Peak_Prep_Warehouse_Checklist_to_Increase_Efficiency.pdf))
  *(vendor sources – directional, not measured)*
- **[P]** Record shipments-per-day and error rate on the same timeline so the dashboard can show
  whether error rate rises with volume. Record packer experience level (e.g., trained < 90 days)
  as an optional field — v2.

## Sources

See inline links; full list in [sources.md](sources.md).
