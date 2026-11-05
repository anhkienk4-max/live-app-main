# RBAC-02 Account Permission Overrides

## Why

Administrators need an auditable, time-bounded way to deny or restore a supported permission for one account without changing role defaults or creating a parallel authorization catalog.

## Scope

- Support the explicit scoped action catalog: `audit.view_team`, `reports.submit`, `reports.review`, `swaps.request`, `swaps.approve`, `attendance.record_own`, and `storage.upload`.
- Apply overrides only to active non-Admin accounts and the roles listed per permission. Admin access and hard Finance/Admin/bootstrap boundaries remain immutable.
- Preserve role defaults as the fallback. An account Deny wins; an account Allow may restore a role-denied permission only when both the DB catalog and matching authenticated handler/RPC allow it. Existing shift, report, swap, and self-identity checks remain authoritative.
- Keep server and database activation gates disabled by default. Migrations are deployable additive changes but must not be applied to Production by this change.

## Out of scope

Report export, Workforce team overview without verified Leader scope, Finance, Payroll administration, Admin/bootstrap access, provider access, public Drive ACL changes, Production migration, and feature activation.
