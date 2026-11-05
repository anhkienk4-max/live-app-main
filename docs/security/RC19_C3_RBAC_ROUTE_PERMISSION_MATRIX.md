# RC19 C3 RBAC route and scope matrix

The authenticated `requirePermission()` path reads the database decision also
used by `/api/rbac/capabilities` when `FEATURE_RBAC_DYNAMIC_ENFORCEMENT=true`; an
RPC error, malformed decision, or identity mismatch fails closed. The database
runtime gate and both Admin mutation flags default OFF.

Migration `20261104110000_rc19_c3_scoped_action_catalog.sql` enables role policy
changes only for actions with matching server/RPC guards and existing business
scope checks: `shifts.view_assigned`, `shifts.assign_staff`, `shifts.import`,
`shifts.export`, `reports.submit`, `reports.review`, `swaps.request`,
`swaps.approve`, `attendance.record_own`, `storage.upload`, `storage.edit_own`,
and `storage.delete`. Account Allow is narrower: `audit.view_team`,
`reports.submit`, `reports.review`, `swaps.request`, `swaps.approve`,
`attendance.record_own`, and `storage.upload`. The Allow decision does not
replace the existing shift, submitter, participant, or self-identity checks.
Finance, Payroll administration, Admin bootstrap, report export, and destructive
management permissions remain locked.

Migration `20261104113000_rc19_c3_staffing_permission_guard.sql` binds manual
staffing assignment and removal rows to the authenticated `shifts.assign_staff`
database decision whenever the RBAC runtime gate is enabled. Registration approval
remains a locked Leader/Admin action enforced by its existing authoritative RPCs.

| API or operation | Permission | Existing database/business scope | Regression evidence |
| --- | --- | --- | --- |
| `GET/POST/DELETE /api/operational-files` | `shifts.view_assigned`, `storage.upload`, `storage.delete` | Shift/Brand/Platform/day/execution-source scope is resolved from stored records; members must be assigned to the shift. | `rc19-c3-mutation-authorization.test.ts`, `rc19-storage-security-patch.test.ts` |
| `GET/POST /api/storage-resources` | `storage.edit_own`, `storage.resource_manage` | Registry RPCs enforce resource ownership, scope grants, and Admin-only grant management. | `rc19-sto02-api-errors.test.ts`, `rc19-sto02-resource-registry-postgres17.test.ts` |
| `POST/GET /api/workforce/self-attendance-photo` and `/correction` | `attendance.record_own` | Session RPCs bind event, actor, approved registration, and shift; photo revisions are immutable. | `rc19-self-attendance-contract.test.ts`, `rc19-g2-inapp-camera.test.ts` |
| `POST /api/workforce/attendance-evidence-review` | `reports.review` | Reviewer identity is derived from session and `can_read_shift`; payload cannot choose reviewer or another staff member. | `rc19-attendance-evidence-review-api.test.ts` |
| `/api/workforce/actual` | `shifts.assign_staff` | Parent shift and segment IDs are reloaded server-side; actor and assignment scope are validated before writes. | `rc19-c3-mutation-authorization.test.ts`, `rc19-owner23-segmented-staffing.test.ts` |
| `GET /api/workforce/overview` | Admin role | Admin retains the approved global view. Leaders fail closed before any privileged query because no deployable Leader-to-Brand/team authority relation exists; `staff_id` cannot widen access. | `rc19-workforce-authority.test.ts`, `workforce-scope-pagination.test.ts` |
| Staffing assignment and removal RPCs | `shifts.assign_staff` | `shift_registrations` insert/status boundary rechecks the authenticated database permission; existing RPCs retain Leader/Admin role and shift eligibility checks. | `rbac-enforcement/pg17_assertions.sql`, `rc19-wave2-combined-postgres.integration.mjs` |
| Registration review RPCs | locked `shifts.approve_registration` | Single and bulk approval/rejection RPCs derive the actor from Supabase identity and require verified Leader/Admin; Member and forged-role denial remains covered. | `rc19-wave2-combined-postgres.integration.mjs`, `rc19-reg02-postgres.integration.mjs` |
| Swap request service RPCs | `swaps.request`, `swaps.approve` | RPCs validate requester-owned source registration, counterpart eligibility, transition, and expected version; an authenticated DB trigger checks the matching permission when the DB runtime gate is on. | `rc19-swap-conflict-preflight.test.ts`, `shift-swap-p0.test.ts`, `rbac-enforcement/pg17_assertions.sql` |
| `/api/report-artifacts` source upload and artifact metadata list | `reports.submit` | Member report access is tied to the submitting business user; stored Shift determines Drive placement. Leader Brand scope is not available for this path and remains a separate blocker. | `rc19-report-scopes-101.test.ts`, `report-storage-security` suite |
| `/api/report-images` | `reports.submit`; review paths use `reports.review` | Image rows remain bound to their stored report and the existing report/image access checks. | `rc19-attendance-evidence-review-api.test.ts`, `report-storage-security` suite |
| `POST /api/reports/export` | `reports.export` | Authenticated session client reloads every requested report under RLS, reloads shift/reference data, and rejects missing/forged IDs. Admin is global; Leaders are denied until authoritative Brand scope exists; Members lack the permission. | `rc19-reports-export-authority.test.ts`, `rc14-data-report-export-fidelity.test.ts`, `report-history-access.test.ts` |
| `GET /api/report-artifacts?file_id=...` for `data_report` | `reports.export` | Generated report file reads require Admin and the stored report/shift context; source-file downloads remain limited to Admin or the submitting Member. Leader artifact reads fail closed without Brand authority. | `report-artifact-export-authority.test.ts`, `rc19-reports-export-authority.test.ts` |
| `POST /api/report-artifacts` `generate_data_report` | `reports.export` | Rechecks permission and Admin role before reading the report and generating versioned report bytes; Leader generation remains blocked pending Brand scope. | `report-artifact-export-authority.test.ts` |
| `GET /api/workforce/my-payslip` | `payroll.view_own` | Business user is taken from the authenticated identity; only own approved, locked, non-voided lines are returned. | `rc19-my-payslip.test.ts` |
| `/api/workforce/payroll` | `payroll.manage` | Admin-only server guard; mutation RPCs are not executable by ordinary authenticated users. | `rc19-c3-mutation-authorization.test.ts`, `rc19-my-payslip.test.ts` |
| `POST /api/operations/calendar-export` | `shifts.export` | Export is built from the authenticated, scoped shift query and rechecks the actor before streaming. | `schedule-export.test.ts`, `rc19-c3-mutation-authorization.test.ts` |
| `/api/audit/team-capability`, audit RLS | `audit.view_team` | Authenticated DB decision gates rows and retains the existing allowed-module filter. | `rbac-enforcement/pg17_assertions.sql`, `rc19-rbac01b-audit-slice.test.ts` |
| `GET/POST /api/role-defaults`, `GET/POST /api/rbac/account-overrides` | `permissions.manage` | Admin identity is resolved from session; version, reviewer separation, target and immutable-history checks are enforced by authenticated SQL RPCs. | `rc19-rbac01-security.test.ts`, `rbac02-account-overrides.test.ts`, `rbac-enforcement/pg17_assertions.sql` |

The API checks do not attest a deployed runtime or authenticated browser UAT.
`reports.export` remains locked in the permission catalog because Leader
Brand/team scope is not backed by an authoritative deployable relation. Admin
exports are server-generated from authenticated, RLS-filtered reads; Leader
exports remain denied. Workforce Admin has a global view; Workforce Leader is
denied before privileged reads for the same missing authority relation.
