# Reports read scope

## Audit

The active `reports_active_select` policy from `20260903110000_f10_report_active_business_user_rls.sql` checks that the canonical business user is active and the report is not archived or deleted. It does not check the report's shift or brand. The broader `private.can_read_shift(text)` is not suitable as a report predicate: its established shift-discovery contract admits open registration and pending registrations.

The `get_report_revisions(text)` RPC is `SECURITY DEFINER` and reads revisions directly. It must enforce the same report boundary itself because the function owner bypasses table RLS. Child-table policies are permissive policies under PostgreSQL's OR semantics, so the migration also guards against unexpected report-family SELECT policies. The existing private `report-images` bucket policy resolves each object to a parent report; once the report RLS boundary is narrowed, the storage-object lookup is narrowed through that parent query as well. The PostgreSQL fixture asserts this behavior without changing Storage policies.

## Permission matrix

| Active system role / relationship | Active report | Archived or deleted report | Unbound live image |
| --- | --- | --- | --- |
| Admin | Allow | Allow | Allow |
| Leader | Allow | Deny | Allow |
| Member assigned Host, Support, or Technical | Allow for that shift | Deny | Deny |
| Member with approved or manually assigned registration | Allow for that shift | Deny | Deny |
| Member who submitted the report | Allow for that shift while the shift is active | Deny | Deny |
| Member with only open-registration visibility or pending registration | Deny | Deny | Deny |
| Unrelated, inactive, unmapped, or unauthenticated user | Deny | Deny | Deny |

Admin and Leader active-report scope follows the established system-permission contract. Admin-only archived/deleted access follows the existing archived-report policy. Operational roles do not independently grant broader report access.

## Change and verification

The new forward-only migration adds `private.can_read_report(text,text)`, narrows active report reads for Members, scopes unbound live images, and enforces the boundary inside the revisions RPC. It leaves `can_read_shift`, shift discovery, list/search RPC definitions, table data, and write policies unchanged. The helper is `SECURITY DEFINER` with an empty `search_path`; execute is revoked from `PUBLIC`, `anon`, and `service_role`, then granted to `authenticated`.

The PostgreSQL 17 workflow in `p0-migration2-standalone-proof.yml` applies the exact migration to synthetic rows using the authenticated database role. It tests unrelated/open/pending/inactive denials, direct staffing and approved/manual registration and submitter access, Admin/Leader scope, archive boundaries, images, revisions, RPC search behavior, helper/function metadata, unchanged shift-discovery and report-list functions, and atomic rollback under injected DDL failure. It does not use Production credentials or data.

## Rollback and incident handling

Do not roll back to the previous broad SELECT policy. If post-commit assertions fail, stop the rollout and prepare a reviewed forward correction that preserves fail-closed Member reads. Reconcile migration history only after the exact SQL commit and catalog postconditions are verified.
