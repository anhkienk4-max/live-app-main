# RC19 C3 RBAC route and scope matrix

The authenticated `requirePermission()` path can read the same database decision
as `/api/rbac/capabilities` when `FEATURE_RBAC_DYNAMIC_ENFORCEMENT=true`; an RPC
error, malformed decision, or identity mismatch fails closed. The database
runtime gate and both Admin mutation flags default OFF.

Only `audit.view_team` is currently mutable in the deployable permission
catalog. The other permissions stay locked until their direct database paths
consume the same decision. Existing role, ownership, and scope checks listed
below remain authoritative and are not replaced by the catalog.

| API or operation | Permission | Existing database/business scope | Regression evidence |
| --- | --- | --- | --- |
| `GET/POST/DELETE /api/operational-files` | `shifts.view_assigned`, `storage.upload`, `storage.delete` | Shift/Brand/Platform/day/execution-source scope is resolved from stored records; members must be assigned to the shift. | `rc19-c3-mutation-authorization.test.ts`, `rc19-storage-security-patch.test.ts` |
| `GET/POST /api/storage-resources` | `storage.edit_own`, `storage.resource_manage` | Registry RPCs enforce resource ownership, scope grants, and Admin-only grant management. | `rc19-sto02-api-errors.test.ts`, `rc19-sto02-resource-registry-postgres17.test.ts` |
| `POST/GET /api/workforce/self-attendance-photo` and `/correction` | `attendance.record_own` | Session RPCs bind event, actor, approved registration, and shift; photo revisions are immutable. | `rc19-self-attendance-contract.test.ts`, `rc19-g2-inapp-camera.test.ts` |
| `POST /api/workforce/attendance-evidence-review` | `reports.review` | Reviewer identity is derived from session and `can_read_shift`; payload cannot choose reviewer or another staff member. | `rc19-attendance-evidence-review-api.test.ts` |
| `/api/workforce/actual` | `shifts.assign_staff` | Parent shift and segment IDs are reloaded server-side; actor and assignment scope are validated before writes. | `rc19-c3-mutation-authorization.test.ts`, `rc19-owner23-segmented-staffing.test.ts` |
| Swap request service RPCs | `swaps.request`, `swaps.approve` | RPCs validate requester-owned source registration, counterpart eligibility, transition, and expected version. | `rc19-swap-conflict-preflight.test.ts`, `shift-swap-p0.test.ts` |
| `POST/GET /api/report-artifacts`, `/api/report-images` | `reports.submit`; review paths use `reports.review` | Report writes/readbacks bind to stored shift, submitter, Brand, and image authorization RPCs. | `rc19-report-scopes-101.test.ts`, `rc19-attendance-evidence-review-api.test.ts`, `report-storage-security` suite |
| `GET /api/workforce/overview` | Admin/Leader role guard | Server-side workforce queries retain their existing staff/period scope; there is no separate mutable `workforce.view` permission. | `workforce-scope-pagination.test.ts`, `rc19-self-attendance-contract.test.ts` |
| `GET /api/workforce/my-payslip` | `payroll.view_own` | Business user is taken from the authenticated identity; only own approved, locked, non-voided lines are returned. | `rc19-my-payslip.test.ts` |
| `/api/workforce/payroll` | `payroll.manage` | Admin-only server guard; mutation RPCs are not executable by ordinary authenticated users. | `rc19-c3-mutation-authorization.test.ts`, `rc19-my-payslip.test.ts` |
| `POST /api/operations/calendar-export` | `shifts.export` | Export is built from the authenticated, scoped shift query and rechecks the actor before streaming. | `schedule-export.test.ts`, `rc19-c3-mutation-authorization.test.ts` |
| `/api/audit/team-capability`, audit RLS | `audit.view_team` | Authenticated DB decision gates rows and retains the existing allowed-module filter. | `rbac-enforcement/pg17_assertions.sql`, `rc19-rbac01b-audit-slice.test.ts` |
| `GET/POST /api/role-defaults`, `GET/POST /api/rbac/account-overrides` | `permissions.manage` | Admin identity is resolved from session; version, reviewer separation, target and immutable-history checks are enforced by authenticated SQL RPCs. | `rc19-rbac01-security.test.ts`, `rbac02-account-overrides.test.ts`, `rbac-enforcement/pg17_assertions.sql` |

The API checks do not attest a deployed runtime or authenticated browser UAT.
Do not enable the dynamic or Admin mutation flags until direct-RPC coverage for
the still-locked domains is added and verified on the integrated release SHA.
No dedicated `reports.export` API route exists in this checkout; report-export
permission cannot yet be activated or claimed as enforced.
