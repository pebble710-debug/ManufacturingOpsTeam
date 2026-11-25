---
name: api-contract
description: Conventions for the ManufacturingOpsTeam HTTP API — resource naming, status transitions, validation errors, auth and pagination — and how to keep docs/api/contract.md in sync. Use when designing, implementing or consuming any endpoint.
user-invocable: false
---

# API contract conventions

The Back-End Developer owns `docs/api/contract.md`; front-end and dashboard developers build
against it. Change the contract first, then the code, in the same PR.

## Conventions
- JSON over HTTPS under `/api/v1/...`; resources plural: `/shipments`, `/shipments/{id}/lines`,
  `/packaging-errors`, `/rework-events`, `/corrective-actions`, `/receipts`,
  `/inventory-transactions`, `/inventory/on-hand`, `/cycle-counts`, `/kpis`, `/reports/{id}`,
  `/lookups/{type}`, `/auth/login`, `/auth/logout`, `/me`.
- **Status changes are actions, not field edits:** `POST /shipments/{id}/actions/{verify|ship|hold|release|cancel|start-packing|reopen}`
  with required fields validated per `docs/01` §1.5 and `docs/02` §2.4.
- Inventory transactions are **append-only**: no PUT/DELETE; corrections are new ADJUST entries.
- List endpoints: `?page=&page_size=` (max 100), `?sort=`, filters by field; response
  `{ "data": [...], "page": n, "total": n }`.
- Errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": {"qty": "must be > 0"} } }`
  with 400/401/403/404/409/422; never return stack traces.
- Auth: every endpoint except `/auth/login` requires a session; role checked server-side per
  `docs/07` §7.2 role table; 403 on violation and an audit-log entry.
- Timestamps ISO 8601 UTC; dates `YYYY-MM-DD`.
- CSV export: `GET /reports/{id}?format=csv`.

## Contract entry template
```
### POST /api/v1/shipments/{id}/actions/ship
Roles: Shipping, Supervisor
Request: { ship_date, carrier_id, tracking_number?, packages_count, total_weight_lb, late_reason_id? }
Rules: status must be Verified; tracking_number required unless carrier mode = Pickup; late_reason_id required if ship_date > promise_date
Effects: status→Shipped; SHIP inventory transactions per line; status history + audit log
Responses: 200 shipment | 409 wrong status | 422 validation
```
