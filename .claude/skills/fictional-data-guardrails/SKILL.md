---
name: fictional-data-guardrails
description: Rules for keeping all data, names and integrations fictional and non-confidential in the ManufacturingOpsTeam prototype. Use whenever creating seed data, fixtures, screenshots, examples, docs, or any code that could connect to an external system.
user-invocable: false
---

# Fictional data guardrails

## Always
- Use the fictional cast from `docs/project-scope.md` §3.6:
  - Company: **Cobalt Ridge Components, Inc.** (Riverton plant)
  - Customers: Aldervale Aerostructures, Brightwater Marine Systems, Pinecrest Robotics,
    Summit Valley Pumps, Ironleaf Agricultural Equipment, Northgate Rail Services
  - Suppliers: Graystone Metals Supply, Kestrel Fasteners, Meridian Polymer Co., Bluefield Packaging
  - Carriers: SwiftLane Parcel, Harbor Freight Lines LTL, TransAxis Truckload, Customer Pickup
- Part numbers `CRC-####-<rev>` (e.g., `CRC-2041-B`), shipments `SH-####`, errors `PE-####`,
  receipts `RC-####`, lots `L<yy><ww>-<nnn>` (e.g., `L2611-004`).
- Tracking numbers: random strings with a fictional prefix (`SLP`, `HFL`, `TAX`) + digits; they
  must not match any real carrier's format.
- Demo users: obviously fake (`demo.shipper`, "Demo Shipper"). Demo passwords are documented as
  demo-only and must never be reused for anything real.
- Show a "DEMO – FICTIONAL DATA" banner on every page.
- Generate seed data deterministically (fixed random seed) so demos and tests are repeatable.

## Never
- Use real customer, supplier, employee or employer names, addresses, part numbers, drawings,
  specifications, prices or contract terms.
- Connect to a real ERP, MES, WMS, EDI network, carrier API or aerospace/defense system, even in
  "read-only" mode. Integrations are v2 and must be mocked.
- Put real personal data (emails, phone numbers) in seed data — use `example.com` / `555-01xx`.
- Claim AS9100, ISO 9001, ITAR, CMMC or any other compliance.

## If you are unsure whether a name is real
Pick a more obviously invented name, and note the check in your hand-off.
