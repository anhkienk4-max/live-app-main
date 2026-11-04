## Decisions

- Reference existing brands, campaigns, and platforms by foreign key. Product-to-Brand is many-to-many; Campaign remains attached to its existing single canonical Brand. Campaign SKU association requires the SKU's Product to be linked to that Brand.
- Keep SKU variants and external Platform SKU IDs separate from product facts. Campaign schemes are time-bounded campaign records, not permanent Product metadata.
- Require an explicit, active per-account Brand grant for Leader and Member catalog reads. Admins can manage all catalog data. No default grants or role expansion are created.
- Enforce write authorization in authenticated API guards and Postgres RLS/RPCs. Critical actor fields derive from the active business-user session; client-supplied reviewer/grantor/creator identities are rejected.
- Knowledge versions are append-only. Non-Admin visibility requires an independent Admin approval, source provenance, an effective date, and active Brand scope.
- Resource links reference storage_resources.id. A Brand/Campaign/SKU association never grants registry visibility or provider access. attendance_evidence is rejected.
- Keep the proposal under supabase/proposals/rc19-brand01; it is not a deployable migration. Apply no SQL in Production.
- Admin resource attachment is metadata-only. Binary files remain in Drive or OneDrive; no provider folder/file creation or ACL mutation occurs.

## Verification

Use the disposable PostgreSQL 17 fixture to apply the STO-02 proposal then this proposal and exercise negative role/scope, approval, resource privacy, duplicate, rollback, and optimistic version cases. Use API tests for unauthenticated/non-Admin fail-closed behavior; Playwright mock tests for Admin CRUD and scoped Leader/Member UI; then TypeScript, ESLint, full regression, Memory, and guarded build. CI and provider/Production/UAT are separate gates.
