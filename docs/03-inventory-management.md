# 3. Inventory Management: Receiving, Transactions, Accuracy, Cycle Counts

**Research date:** 2026-11-25 · Tags: **[R]** researched · **[A]** assumption · **[P]** proposed

## 3.1 Receiving

- **[R]** Receiving is where supplier goods are checked in and put away. *Dock-to-stock cycle
  time* measures time from arrival at the dock to being put away and recorded in inventory.
  Formula: sum of dock-to-stock hours for all receipts ÷ number of receipts.
  ([ISM – Dock-to-stock](https://www.ismworld.org/supply-management-news-and-reports/news-publications/inside-supply-management-magazine/blog/2023/2022-01/the-monthly-metric-dock-to-stock-cycle-time/);
  [NetSuite – Fulfillment KPIs](https://www.netsuite.com/portal/resource/articles/erp/order-fulfillment-kpis-metrics.shtml))
- **[R]** Published "best-in-class" dock-to-stock benchmarks vary (under 2 h, under 3 h, or 2–8 h
  depending on source); WERC's DC Measures report is the authoritative benchmark but was not
  read directly. ([Yale – Top 12 DC metrics](https://s3.amazonaws.com/scg-lm/pdfs/yale_wp_Top_12_distribution_center_metrics_021021.pdf);
  [Multichannel Merchant](https://multichannelmerchant.com/blog/assessing-your-dock-to-stock-efficiency))
- **[R]** Measurement only works with unambiguous start/end points and reliable timestamps.
  ([Racklify – Dock-to-stock](https://racklify.com/encyclopedia/measuring-dock-to-stock-time-tools-metrics-and-common-mistakes/))
- **[R]** Receiving inspection is a common place where nonconforming material is detected; such
  material is segregated (hold area, tags, system lockout) until a Material Review Board (MRB)
  decides its disposition. ([Tulip – MRB](https://tulip.co/blog/material-review-board/);
  [Open Exam Prep – Material control & MRB](https://open-exam-prep.com/study-guides/cqe/product-and-process-control/material-control-and-disposition))
- **[P]** v1 receiving record: receipt no., supplier (fictional), PO no., part, qty received, lot
  no., received date/time, location, inspection status (Accepted / On Hold / Rejected), received
  by. Accepted receipts create an inventory **RECEIPT** transaction; On Hold receipts go to a
  **HOLD** location that cannot be shipped from.

## 3.2 Inventory transactions

- **[R]** ERP systems model inventory changes as typed transactions: receipt, issue, transfer
  (a transfer creates an issue at the source and a receipt at the destination), and adjustment
  (increase/decrease), plus scrap and physical-count adjustments.
  ([Oracle – Transaction types](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25d/faims/transaction-types.html);
  [Microsoft – Inventory journals](https://learn.microsoft.com/dynamics365/supply-chain/inventory/inventory-journals);
  [Sage Intacct – Inventory transactions](https://www.intacct.com/ia/docs/en_US/help_action/Inventory_Control/Using_Inventory_Control/Transactions/inventory-txns.htm))
- **[P]** v1 uses an **append-only transaction ledger**. On-hand quantity is *derived* by summing
  transactions per part/location/lot — never edited directly. Corrections are new ADJUST
  transactions with a mandatory reason. This is the simplest way to get an audit trail.

| Type (v1) | Effect | Created by |
|-----------|--------|-----------|
| RECEIPT | + qty at location | Receiving form |
| ISSUE_TO_PRODUCTION | − qty | Inventory form (optional in v1) |
| PRODUCTION_COMPLETE | + finished goods | Inventory form |
| SHIP | − qty | Automatically when shipment → Shipped |
| TRANSFER | − from A, + to B | Inventory form |
| ADJUST | ± qty, reason required | Cycle count or manual (Supervisor role) |
| SCRAP | − qty, reason required | Inventory form |

## 3.3 Stock accuracy

- **[R]** Inventory record accuracy is commonly computed by comparing physical count to the
  system record; world-class operations are cited at 98–99 %.
  ([Unleashed – Cycle count](https://unleashedsoftware.com/blog/inventory-cycle-count);
  [Tractian – Cycle count](https://tractian.com/en/glossary/cycle-count))
- **[A]** Two common ways to report accuracy exist and they give different numbers:
  1. **Hit-rate (count-based):** % of counted records whose system qty matches physical qty
     within tolerance. Stricter, standard in operations.
  2. **Quantity-based:** 1 − |Σ variance| / Σ system qty. Can hide offsetting errors.
- **[P]** v1 reports the **hit-rate** method as "Inventory Accuracy %", with tolerance configurable
  per ABC class (default 0 % for A, ±2 % for B, ±5 % for C), and shows absolute variance units as
  a secondary number.

## 3.4 Cycle counting

- **[R]** Cycle counting counts a subset of inventory on a schedule instead of a full shutdown
  physical inventory. ABC classification sets frequency: e.g., A items (top 10–20 % by
  value/criticality) weekly or monthly, B quarterly, C annually.
  ([Tractian](https://tractian.com/en/glossary/cycle-count); [Wikipedia – Cycle count](https://en.wikipedia.org/wiki/Cycle_count))
- **[R]** Good practice: avoid counting during active receiving/shipping rushes, track
  discrepancies across counts to spot patterns, and add opportunity-based counts at
  receiving/putaway/returns. Rigid ABC alone can let C-item errors accumulate.
  ([Shopify – Cycle count](https://www.shopify.com/blog/cycle-count))
- **[P]** v1 cycle-count workflow:
  1. Supervisor generates a count list (by ABC class or location).
  2. Counter enters physical qty **without seeing the system qty** (blind count, reduces bias) **[A]**.
  3. System computes variance; out-of-tolerance lines require a recount.
  4. Supervisor approves → ADJUST transaction posted with reason code.
  5. Results feed the Inventory Accuracy KPI.

## 3.5 Traceability

- **[R]** Aerospace quality standards (AS9100, built on ISO 9001) include identification and
  traceability requirements; public summaries describe tracking components from raw material
  receipt through final delivery and requiring suppliers to maintain traceability documentation.
  The clause text itself (AS9100D §8.5.2) is paywalled and was **not** reviewed.
  ([Advisera – AS9100 traceability](https://advisera.com/9100academy/blog/tag/traceability/);
  [In Compliance – AS9100 traceability](https://incompliancemag.com/how-to-fulfill-as-9100-traceability-requirements-as-a-defense-subcontractor/))
- **[A]** For an educational prototype, **lot-level traceability** is enough: every receipt,
  transaction and shipment line carries a lot number, so you can answer "which customers received
  lot X?" and "which supplier receipt did shipped lot X come from?"
- **[P]** v1: lot number required on receipt, inventory transactions and shipment lines; a simple
  *Lot Trace* report (forward and backward). Serial-number tracking is v2.
- **[A]** This prototype does **not** claim AS9100/ISO compliance.

## Sources

See inline links; full list in [sources.md](sources.md).
