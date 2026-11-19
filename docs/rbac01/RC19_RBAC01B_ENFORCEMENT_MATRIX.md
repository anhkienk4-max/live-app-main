# RBAC-01B #103 · Authorization Enforcement Inventory and Narrow P0 Slice

Parent: Draft PR #122, SHA `dcea175abb95ac9a0ef2cc934648b756a5619d1a`. Branch `feat/rc19-rbac01b-enforcement` is stacked onto that branch, not older RC19. **NO LIVE DYNAMIC PERMISSIONS**. Both `FEATURE_RBAC01_ROLE_DEFAULTS` and `FEATURE_RBAC01B_AUDIT_TEAM_ENFORCEMENT` remain default OFF. `rbac01_approve_role_defaults()` continues to throw `RBAC01_ENFORCEMENT_NOT_ATTESTED`.

## Exact mapping (UI is NOT authoritative)

The following UI/API/DB mapping is a source-audit inventory: family endpoints are not a claim that all paths have been exhaustively secured. Rows marked BLOCKED do not have tested end-to-end override guards. Finance/Payroll/credential providers/private Storage are excluded, even if endpoints use global roles.

| Permission | UI / navigation | API/service and direct CRUD | PostgreSQL RLS/RPC | Effective override gate |
|---|---|---|---|---|
| `shifts.view_assigned` | Calendar/My Shifts | operationsCollectionHandler/get_shift_list_page | Shift RLS/RPC | **BLOCKED** |
| `shifts.view_open` | Calendar | operationsCollectionHandler/get_shift_list_page | Shift RLS/RPC | **BLOCKED** |
| `shifts.register` | Shift registration | registration handlers/RPC | Registration RLS/RPC | **BLOCKED** |
| `shifts.cancel_registration` | Registration | registration handlers/RPC | Registration RLS/RPC | **BLOCKED** |
| `shifts.approve_registration` | Registration review | registration/context handlers | Registration RLS/RPC | **BLOCKED** |
| `shifts.assign_staff` | Calendar staffing | shift staffing handlers | Staffing RLS/RPC | **BLOCKED** |
| `shifts.edit` | Calendar | shift handlers/direct Supabase | Shift RLS | **BLOCKED** |
| `shifts.delete` | Calendar | shift lifecycle handlers | Shift delete/RPC guards | **BOOTSTRAP_LOCK** |
| `shifts.lock` | Calendar | shift lifecycle handlers | Shift lock RPC | **BLOCKED** |
| `shifts.import` | Calendar import | schedule import paths | Import RLS/RPC | **BLOCKED** |
| `shifts.export` | Calendar export | calendarExportHandler | Shift read RLS/RPC | **BLOCKED** |
| `reports.submit` | Reports form | reportImageRouteHandler/direct client | Reports #84 RLS/RPC | **BLOCKED** |
| `reports.review` | Reports review | report review handlers/direct client | Reports #84 RLS/RPC | **BLOCKED** |
| `reports.export` | Reports export | report export/artifacts handlers | Reports #84 RLS/Storage | **BLOCKED** |
| `swaps.request` | Swap form | swap service/direct client | Swap RLS/RPC | **BLOCKED** |
| `swaps.approve` | Swap approvals | swap service/direct client | Swap RLS/RPC | **BLOCKED** |
| `swaps.export` | Swap export | swap list/export | Swap RLS/RPC | **BLOCKED** |
| `profile.edit_own` | Profile | profile service | Own-profile RLS/RPC | **BLOCKED** |
| `staff.manage` | Staff management | staff mutations | business_users_admin_all/admin RPC | **BOOTSTRAP_LOCK** |
| `brands.manage` | Brands | masterDataService/direct client | Catalog RLS/RPC | **BLOCKED** |
| `platforms.manage` | Platforms | masterDataService/direct client | Catalog RLS/RPC | **BLOCKED** |
| `campaigns.manage` | Campaigns | masterDataService/direct client | Catalog RLS/RPC | **BLOCKED** |
| `campaigns.edit_operational` | Campaigns | operational edits | Campaign RLS/RPC | **BLOCKED** |
| `settings.member` | Settings personal | settingsService/direct client | Personal RLS/RPC | **BLOCKED** |
| `settings.leader` | Settings team | settingsService/direct client | Operational settings RPC | **BLOCKED** |
| `settings.admin` | Settings system | admin settings | Admin-only RLS/RPC | **BOOTSTRAP_LOCK** |
| `permissions.manage` | RoleDefaultsPanel | role-default proposal-only API | private RBAC draft store | **APPROVAL_BLOCKED** |
| `audit.view` | AuditHistory | Admin audit full-history client | audit_logs_read admin branch | **IMMUTABLE** |
| `audit.view_team` | AuditHistory (Leader) | /api/audit/team-capability + auditService signed client | audit_logs_read leader restriction; get_audit_actor_page() invoker | **SLICE_ISOLATED_PASS_PENDING_RELEASE** |
| `audit.restore` | AuditHistory restore | audit/recovery handlers | Audit + lifecycle permissions | **BOOTSTRAP_LOCK** |
| `audit.review` | AuditHistory review | update_audit_review() | Audit reviews RLS/RPC | **BOOTSTRAP_LOCK** |
| `data.force_delete` | Audit/archives | delete handlers | Data lifecycle RLS/RPC | **BOOTSTRAP_LOCK** |

## Vertical slice: Leader-only audit.view_team DENY

Source truth (read-only Production metadata at audit time):
- `public.audit_logs` has one `audit_logs_read` RLS SELECT policy. Admin has all; Leader is restricted to `calendar, live, reports, campaigns, swaps, imports`; Member has no read.
- `public.get_audit_actor_page(integer,integer)` is SECURITY INVOKER and checks `private.is_leader_or_admin()`; its actor query is based on RLS-scoped `audit_logs`.
- `public.audit_log_reviews` remains Admin-only, intentionally unchanged.
- `private.current_system_permission()` resolves active persisted `business_users` via auth.uid(), not client role or user_metadata.
- `private.rbac01_role_default_versions` exists in **parent SQL proposal only**, is not deployed to Production. The new SQL file in this PR is **review-only in docs/**, not a migration.

Contract:
1. `inherit`: latest approved Leader version absent or decision `inherit`; **identical to RC19**.
2. `deny`: independently approved Leader version contains `audit.view_team:deny`; only removes Leader's existing team-audit ability. Admin's `audit.view` and the original module scope remain unchanged. Member is never granted.
3. `allow`: **no new grants**; TypeScript proposal validation and Admin API reject; SQL `rbac01_propose_role_defaults` rejects; database resolver never treats `allow` as a widening.
4. Review-only Admin API still rejects approving any version: activation is **BLOCKED** until every intended future dynamic permission has independently reviewed server+DB enforcement and review process. PostgreSQL isolated regression seeds independently approved versions **as test fixture only** to prove the proposed model.
5. Server `requireEffectiveAuditTeamPermission()` checks a fresh trusted signed business actor and invokes `public.rbac01_effective_permission('audit.view_team')` on each request when server flag ON; no request-time cache, no service_role. Member rejected before RPC, Admin retains original right. RPC unavailable/error/null/false => 403, fail closed.
6. `AuditHistory` in signed Supabase mode performs an authenticated `no-store` preflight **before** requesting audit rows when client flag ON; on denial it clears rows/selected entries and renders Access Denied. Default OFF skips preflight for exact RC19 compatibility. UI does not create a new audit data endpoint.
7. The approved-version DB guard runs under the caller's auth.uid(). `audit_logs_read` retains original filter plus extra Leader-only check, including direct Supabase REST; `get_audit_actor_page` gains explicit Leader-revocation guard but remains SECURITY INVOKER. The helper is not a general privilege-granting API. Other RPCs accessing audit_logs with invoker mode remain subject to RLS.
8. Revocation is evaluated at each new server request / SQL statement, not by browser role, client cache, or stale app_metadata. Existing JWT identity remains but current approved DB version is read on every statement.

## Isolated verification boundaries

Disposable actual PostgreSQL 17 service tests default Member/Leader/Admin read row counts, direct `SELECT audit_logs` with authenticated role (REST-equivalent), direct RPC `get_audit_actor_page`, forged `user_metadata`, inactive account, approved deny, approved inherit recovery with unchanged auth identity, and leaked SQL EXECUTE/table grants. Server tests execute real `GET` handler and resolver with forged request headers, positive/denied RPC results, missing DB errors, each-request fresh checks, and feature-OFF fallback. UI preflight ordering is additionally source-tested; this is not a real Production browser authenticated UAT.

## Hard blockers: production activation and other permissions

- Source/PG17 isolated PASS does not mean the patch SQL is applied or parity-verified by a real signed Production session.
- Parent `rbac01_approve_role_defaults` remains permanently rejecting until independent owner review; do NOT seed approved versions outside disposable tests.
- Role-specific overrides for the other catalog entries remain BLOCKED. No universal `requirePermission` change, no cross-module changes. Do not retarget to RC19; parent PR #122 must be reviewed/merged first.
- Signed Member/Leader/Admin Production UAT, deployment identity, DB backup/rollback and owner release approval not completed. Never use Preview/Staging as release gate, merge automatically or alter Production.
