# Project Memory V1 Projection

<!-- GENERATED FILE. Do not edit. Source records are the JSON files in this directory. -->

Generated at: 2026-09-11T15:17:37+07:00

## Repository

- Branch: `integration/ui-golden-screens`
- HEAD: `bc1c0dbd13d2ef64374b2210409f5460698e278a`
- origin/main: `7be47803690550d1ba891b6d7e1e4585f8f307e7`
- Worktree: `C:/Users/KienNguyen/Downloads/KIEN ADA code/OPS LIVESTREAM PLATFORM/live-app-ui-integration`
- Base: `origin/main` at `73b1999ea07cbc227d1bd4052088cc6c6f4cc8e5`

## Hardening

- Main: `73b1999ea07cbc227d1bd4052088cc6c6f4cc8e5`
- G1 technical baseline: NOT_YET_CLOSED
- Production UAT: PAUSED
- Go-live: NO

## Inventory

- Routes: 31
- Source files in tracked inventory roots: 468
- Tests: 112
- Migrations: 48

## Modules

| ID | Module | Maturity |
| --- | --- | --- |
| F1 | Calendar | IMPLEMENTED |
| F2 | Staffing | IMPLEMENTED |
| F3 | Swap | IMPLEMENTED |
| F4 | Reports | IMPLEMENTED |
| F5 | Live Monitoring | IMPLEMENTED |
| F6 | Import | IMPLEMENTED |
| F7 | Staff/Auth | IMPLEMENTED |
| F8 | Notifications | IMPLEMENTED |
| F9 | Brands/Platforms/Campaigns | IMPLEMENTED |
| F10 | Analytics | IMPLEMENTED |
| F11 | Audit | IMPLEMENTED |
| SETTINGS_PROFILE | Settings/Profile | IMPLEMENTED |
| EXTERNAL_PROVIDERS | External Providers | IMPLEMENTED |

## Defects

| ID | Status | Priority | Defect |
| --- | --- | --- | --- |
| RW-001 | FIXED | - | Calendar operational-role row filtering |
| RW-002 | OPEN | UNSPECIFIED | Global categorical filters are single-select |
| RW-003 | OPEN | P1 | Imported Excel staffing display inconsistent across Shift surfaces |
| RW-004 | OPEN | P1 | Admin self operational_roles false-success |

## Business Rules

| ID | Expression |
| --- | --- |
| BR-001 | preferred_roles != operational_roles |
| BR-002 | server_mutation_success requires authoritative_persistence |
| BR-003 | same_filter_dimension.multi_select = OR |
| BR-004 | different_filter_dimensions = AND |
| BR-005 | confirmed_assignment > imported_staffing_label > unassigned |
| BR-006 | frontend_hiding != authorization |
| BR-007 | backend_or_rpc_permission = authoritative |

Update with `npm run memory:sync`; validate with `npm run memory:validate`.
