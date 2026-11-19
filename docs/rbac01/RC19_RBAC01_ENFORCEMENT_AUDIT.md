# RC19 RBAC-01 #103 | AUTHORIZATION ENFORCEMENT AUDIT & REVIEW-ONLY PROPOSAL

**Source baseline:** \`feat/ops-full-app-upgrade-rc19\` at \`1b96f38a17768e96b92f23056efba4b61cc76f84\`.
**Status:** SECURE REVIEW-ONLY FOUNDATION. **NOT a fully enforceable role-default implementation**. Keep \`FEATURE_RBAC01_ROLE_DEFAULTS=false\` and \`NEXT_PUBLIC_FEATURE_RBAC01_ROLE_DEFAULTS=false\` on Production. No schema changes have been applied.
**Scope:** Role defaults ONLY. Staff-specific permission exceptions RBAC-02 #104 are excluded.

## Direct source / Production schema audit, read only

- \`lib/permissions.ts\`: static canonical \`permissionMatrix\`. Unknown permissions are not grants. Member, Leader and Admin memberships are fixed. Client UI uses \`hasPermission\` and \`getSharedNavigation\` (shared navigation is intentional UX, not authorization).
- \`lib/server/authGuards.ts\`: \`requirePermission\` consults STATIC matrix; \`requireRole\` does not consult it. \`resolveServerUser\` uses authenticated Supabase \`auth.getUser()\`, persisted business-user mapping with status/account/identity checks. Do not use browser role for a real authorization decision.
- \`lib/server/operationsCollectionHandler.ts\`: requires signed user, then **direct role checks** for staff, reviews, imports, archives and account requests; data comes through authenticated user client/RPC. Merely changing \`hasPermission\` would NOT affect these gates.
- \`lib/server/reportImageRouteHandler.ts\`: \`reports.submit\` checked on server for image writes; separate per-report ownership/RLS required. REPORTS Security #84 is an independent hard boundary.
- \`lib/server/operationalFileRouteHandler.ts\`: leader/admin role checks with privileged server storage client. Cannot turn role-default denial on safely without updating all related API paths AND storage authorization.
- \`lib/server/workforcePayrollHandler.ts\`: **Admin-only** \`requireRole\` before privileged salary/payroll data. PAY-02 and Finance are OUT OF SCOPE and never eligible for override.
- \`app/(dashboard)/settings/page.tsx\`: only displays 3 role counts, no persisted editable defaults. Admin-only new panel previews proposed DENY, refuses to claim it is effective.
- \`components/features/staff/StaffFormDialog.tsx\`: per-person \`system_permission\` changes are Staff/RBAC-02 territory. No changes.
- \`public.business_users\` current Production catalog: \`id\` text, \`auth_user_id\` uuid, \`system_permission\` text, active/deleted/archived status. Production RLS uses \`private.current_system_permission\`, \`private.is_admin\`, and \`private.is_leader_or_admin\`, **not a role-default table**.
- Production read-only query found **no existing** \`public/private\` role-default or RBAC permissions table; Production migration ledger has **no RBAC-01 migration**. Do NOT silently invent a deployed permission layer.
- \`public.reports\`, \`audit_logs\`, \`business_users\` RLS policy examples are role-based and must continue to enforce #84, audit and identity constraints.

## Permission-to-enforcement inventory

Key: UI = client matrix, API = server requirePermission or requireRole / direct role / service-admin, DB = RLS/RPC scoped by signed actor. "GAP" means NOT safe to activate live role override, even for a DENY, without a reviewed DB + API integration. The catalog does NOT grant anything.

| Permission set | Existing UI check | API enforcement | DB / RPC enforcement | Override readiness |
|---|---|---|---|---|
| shifts.view_assigned, shifts.view_open | Matrix / Calendar | Collection signed-user RPC | Shift-scoped RLS/RPC | BLOCKED: DB hard-coded roles |
| shifts.register, shifts.cancel_registration | Matrix | Registration-related API/RPC paths | Registration RLS/RPC | BLOCKED |
| shifts.approve_registration, shifts.assign_staff, shifts.lock | Matrix | Admin/Leader role paths | Approval and shift RPC | BLOCKED |
| shifts.edit, shifts.delete | Matrix | Shift mutations; some privileged functions | DB shift lifecycle / deletion guards | BLOCKED |
| shifts.import, shifts.export | Matrix | Import / export collection paths | Signed actor, import RPC | BLOCKED |
| reports.submit | Matrix, form | report-image route \`requirePermission\`, other paths | Reports #84 scoped RLS and write contracts | BLOCKED, do not touch #84 |
| reports.review, reports.export | Matrix, review/export buttons | Mixed route and direct client operations | Reports/revision RPC and RLS | BLOCKED, do not touch #84 |
| swaps.request, swaps.approve, swaps.export | Matrix | Swap handlers and signed-user data | Swap RLS and RPC | BLOCKED |
| profile.edit_own | Matrix | Identity-bound profile services | Own-row RLS / RPC | BLOCKED |
| staff.manage | Matrix / Staff page | Staff mutation RPC/paths | \`business_users_admin_all\` and admin RPC | LOCKED, last Admin safeguard |
| brands.manage, platforms.manage, campaigns.manage | Matrix / reference UI | Direct signed client and mutations | Catalog RLS/RPC | BLOCKED |
| campaigns.edit_operational | Matrix | Operational campaign path | RLS/RPC | BLOCKED |
| settings.member, settings.leader | Matrix | Settings service and role paths | Operational settings RLS/RPC | BLOCKED |
| settings.admin, permissions.manage | Matrix | Settings/admin role and RBAC01 admin API | DB admin identity, separate SQL proposal | BOOTSTRAP-LOCKED |
| audit.view, audit.view_team | Matrix | Audit views and signed-user route | \`audit_logs_read\` currently direct role policy | BLOCKED |
| audit.restore, audit.review | Matrix | Audit mutation routes/RPC | Admin-side RPC/RLS | LOCKED pending review |
| data.force_delete | Matrix | Destructive service paths | DB safety/audit guards | BOOTSTRAP-LOCKED |
| payroll / finance / salary / provider credentials / private storage | Never part of RC19 permissionMatrix | Privileged server-only or specialized capability checks | Hard SQL functions, grants, RLS, service-role use | **NOT ELIGIBLE**, do not imply grant |

## Review-only implementation

1. \`lib/rbac/roleDefaults.ts\`: explicit catalog for every legacy permission; module/action inventory, preview effective-vs-proposed; no new privilege ever granted. Admin-critical permissions cannot be proposed DENY. All live effective permissions remain legacy by design.
2. \`app/api/role-defaults\` is server-side, authenticated Admin guard **before** any DB read/write. Independent schema validates action, role, permission, and refuses forged \`userId\`, \`approvedBy\`, \`effective\`, \`service_role\`, and grants. Controlled solely by server flag \`FEATURE_RBAC01_ROLE_DEFAULTS\`, default OFF.
3. \`RoleDefaultsPanel\` in Admin Settings provides module/action preview, a proposal draft, history and cancel for proposed versions. Explicit label "not effective". It does not provide false "activated" switches or edit someone else's User permissions.
4. \`docs/rbac01/RC19_RBAC01_REVIEW_ONLY.sql\` (not in deployable migrations): private RLS-forced version store and append-only audit, authenticated admin-only SECURITY DEFINER RPCs with revoked PUBLIC/anon EXECUTE, stable version allocation under transaction advisory lock. Propose returns \`effective:false\`; rollback can cancel a proposal. **Approve RPC is intentionally always DENY** (\`RBAC01_ENFORCEMENT_NOT_ATTESTED\`), until an audited production SQL integration can enforce *every* affected RLS, RPC and privileged server action. No active version is ever created by this SQL.
5. Authenticated database checks reference \`auth.uid()\`, persisted \`business_users\` role and status, NOT user-editable metadata, POST role fields or UI flags.
6. No override is applied to \`permissionMatrix\` or any runtime authorization; missing/disabled/unapproved role configuration retains EXACT RC19 behavior. Source changes do not modify Reports #84 or PAY-02.

## Explicit outstanding P0 BLOCKERS

- **Functional activation BLOCKED**: integration into ALL privileged API handlers, direct Supabase CRUD, RLS and SECURITY DEFINER RPCs is not proven. Cannot flip feature flag ON as substitute. Some guarded routes use \`requireRole\` rather than permission and cannot automatically revoke via \`requirePermission\`.
- **Admin dual-review + effective version activation BLOCKED**: independent approver/version/DB-attribution contract exists but effective approval must remain disabled until server AND DB enforcement attestation. Rollback of ACTIVE versions also BLOCKED until atomic immutable version switch + RLS gates are designed and PostgreSQL-tested.
- **Revocation/session/cache freshness BLOCKED**: existing client caches and JWT roles are not dynamic role-default authority; effective deny requires DB request-time check on every protected code path, including service-admin boundary. Tests of shadow revocation prove no premature activation, not actual live revocation.
- **Brand cross-scope, Finance, Payroll, provider, private Storage, last Admin**: must remain hard-locked; cannot grant \`service_role\`, and must not weaken current DB scopes. Role defaults cannot replace row-level / brand assignment checks.
- **Production**: no reviewed/applied migration, no Production deployed SHA/rollback mapping, no signed-session Member/Leader/Admin UAT, no owner release approval. No Preview/Staging release gate.

## Rollout dependency

Owner reviews audit matrix and proposed private schema. Split future P0 enforcement by module only after a DB/API inventory with **PostgreSQL 17 + forged authenticated request + direct DB/RPC** tests. Do not approve or activate any role-default override until all risk surfaces pass. RBAC-02 individual permissions must remain a separate PR/issue. Keep this Draft PR unmerged and feature OFF.

CI source gate checks TypeScript, ESLint, focused proof, full regression, PostgreSQL 17 draft RPC security proof and guarded build. **Do not interpret any of these as Production UAT or activation PASS.**
