# 1. Outgoing Shipment Tracking

**Research date:** 2026-11-25 · Tags: **[R]** researched · **[A]** assumption · **[P]** proposed

## 1.1 What outbound shipment tracking covers

- **[R]** Outbound tracking connects a customer order to a physical shipment: what was shipped
  (parts, quantities), when it was promised and actually shipped, who carried it (carrier) and
  how to follow it (tracking number). Advance Ship Notices (ASNs) are the standard electronic
  form of this information in supply chains, usually exchanged as EDI 856 ("Ship
  Notice/Manifest"), and they describe pending deliveries matched to a packing list.
  ([Wikipedia – Advance ship notice](https://en.wikipedia.org/wiki/Advance_ship_notice);
  [SPS Commerce – ASN](https://www.spscommerce.com/blog/advanced-shipping-notice-asn-spsa/))
- **[R]** ASNs commonly carry identifiers such as SSCC (pallet / logistics unit), GTIN (product)
  and GLN (location), and a carrier tracking number the buyer uses to follow the shipment against
  the estimated delivery date. ([EasyPost – ASN](https://www.easypost.com/blog/2025-03-26-advanced-shipping-notice/))
- **[R]** ERP systems maintain ASN statuses (e.g., Confirmed, Replaced, Canceled) — a revised
  notice replaces the earlier one rather than overwriting it.
  ([Infor – Advance Ship Notice](https://docs.infor.com/se/2026.10/en-us/se/sesuhelp/asnviewasn.html))
- **[P]** v1 will **not** implement EDI. It will capture ASN-like data manually in a shipment
  form. EDI/carrier API integration is a v2 candidate.

## 1.2 Key dates

Getting dates right matters because every timeliness KPI depends on them.

| Date | Meaning | Tag |
|------|---------|-----|
| Order date | When the customer order/release was received | [R] start point for order cycle time |
| Requested date | Date the customer asked for | [R] |
| Promise / due date | Date the company committed to | [R] |
| Ready-to-pack date | Material available and released by Production/Quality | [A] |
| Packed date | Packaging + verification complete | [A] |
| Ship date | Carrier picked up / left the dock | [R] |
| Delivered date | Carrier confirms delivery | [R] |

- **[R]** OTD can be measured against the *customer-requested* date or the *internally
  promised* date; the requested date is the more demanding and meaningful one. The choice, plus
  the tolerance window and any exclusions, must be written into the definition in advance.
  ([SourceDay – OTD](https://sourceday.com/blog/on-time-delivery-metrics/);
  [Tractian – On-Time Delivery](https://tractian.com/en/glossary/on-time-delivery))
- **[P]** v1 stores both **requested date** and **promise date**, and computes OTD against the
  promise date by default with a toggle for requested date. See [05-performance-metrics.md](05-performance-metrics.md).
- **[A]** Because v1 has no carrier integration, "delivered date" will often be unknown. v1
  measures **on-time shipment** (ship date ≤ promise date) as the primary timeliness KPI and
  treats delivered-date OTD as optional.

## 1.3 Carriers and tracking numbers

- **[A]** A manufacturer typically uses a mix of parcel carriers, LTL (less-than-truckload)
  freight carriers, dedicated truck, and customer pickup ("will call").
- **[A]** Tracking number formats differ by carrier; v1 should store them as free text with
  light validation (non-empty when status ≥ Shipped, max length, allowed characters) rather than
  carrier-specific regex.
- **[P]** Carriers are a managed lookup table (name, mode, active flag) so users pick from a list
  instead of typing — reduces spelling variants that break reports.
- **[P]** Sample data uses **fictional** carriers only: *SwiftLane Parcel*, *Harbor Freight Lines
  LTL*, *TransAxis Truckload*, and *Customer Pickup*.

## 1.4 Quantities

- **[R]** On-Time-In-Full (OTIF) counts a shipment as successful only if it is on time **and**
  the correct quantity; a short shipment fails even if on time.
  ([SourceDay – OTD](https://sourceday.com/blog/on-time-delivery-metrics/))
- **[R]** Some methods measure per line, others per whole order — choose and document one.
  ([SourceDay – OTD](https://sourceday.com/blog/on-time-delivery-metrics/))
- **[P]** v1 records, per shipment line: quantity ordered, quantity shipped, and number of
  packages. "In full" = shipped qty ≥ ordered qty for every line. v1 measures at the **shipment**
  level (one shipment = one customer order release).

## 1.5 Shipment status lifecycle

- **[A]** Common practice is a linear status flow with a few exception states. The flow below is
  our proposal, informed by the ASN status concepts above and the project context
  (verification before packaging; reopening on errors).

```
Planned → Ready to Pack → Packing → Verified → Shipped → Delivered
                 ↑           │          │
                 └── On Hold ←┴── Rework (reopened) ←┘
Any state before Shipped → Cancelled
```

| Status | Entry condition (proposed) |
|--------|----------------------------|
| Planned | Shipment created from an order/release |
| Ready to Pack | Parts available; Quality release confirmed |
| Packing | Packer has started per packaging instruction |
| Verified | Second check of parts, quantities, labels and paperwork passed |
| Shipped | Ship date + carrier + tracking number recorded |
| Delivered | Delivered date recorded (optional in v1) |
| On Hold | Waiting on material, Quality, paperwork or customer |
| Rework | Verification failed or error found → shipment reopened; links to a packaging-error record |
| Cancelled | Order cancelled before shipment |

- **[P]** Every status change is written to a **status history** table (who, when, from, to,
  note). This gives cycle-time data and an audit trail for free.

## 1.6 Shipping documents

- **[R]** *Bill of lading (BOL)* — contract between the shipper and carrier and the carrier's
  receipt for the goods. ([EXIM – Ten common export documents](https://grow.exim.gov/blog/ten-common-export-documents-you-should-know-about))
- **[R]** *Packing slip / packing list* — lists contents: product names/part numbers, quantities,
  order number, and (for export) weights and dimensions.
  ([Shopify – Shipping documents](https://www.shopify.com/blog/shipping-documents);
  [Trade.gov – Common export documents](https://www.trade.gov/common-export-documents))
- **[R]** Inspection or conformance certificates confirm that shipment quantity and quality match
  the order or standards. ([Trade.gov – Common export documents](https://www.trade.gov/common-export-documents))
- **[A]** In manufacturing, a *Certificate of Conformance (C of C)* is frequently required by
  customers and must reference the correct part number, revision, quantity and lot/serial. We did
  not find an authoritative public definition; treat this as an assumption.
- **[P]** v1 tracks **document checklist flags** per shipment (Packing slip ✔, BOL ✔, C of C ✔,
  Labels ✔) rather than generating documents. Document generation is v2.

## 1.7 Recommendations for v1

1. **[P]** One shipment form with header (customer, PO, dates, carrier) + lines (part, qty).
2. **[P]** Status changes via explicit buttons (e.g., "Mark Verified") rather than a free dropdown,
   so required fields are enforced at each step.
3. **[P]** Shipment list with filters (status, customer, date range, late only) and a "due in next
   3 days / overdue" view for daily planning.
4. **[P]** Late shipments require a **late reason code** (material shortage, quality hold,
   paperwork, carrier, packaging rework, capacity/peak volume, customer change).

## Sources

See inline links; full list with access dates in [sources.md](sources.md).
