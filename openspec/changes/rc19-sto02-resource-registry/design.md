## Decisions

- Keep one canonical resource row per provider object and attach it to zero or more Brands, Campaigns, SKUs, platforms, periods, shifts, or staff through separate metadata scope rows. Scope links are descriptive and never grant read access.
- Use `admin_only`, `owner_only`, or explicit `granted_users` visibility. RLS checks the active business-user identity; Admins manage all registry rows. Attendance evidence is constrained to its owner and cannot be linked to a Brand or Client Group.
- Persist provider IDs and normalized HTTPS URLs without credentials or query strings. Never fetch a submitted URL: provider checks use the existing fixed-host provider adapter and canonical ID only.
- Keep provider metadata verification distinct from user access. A resource readable to the server integration may still be unavailable to a user.
- Never create folders or files during registry CRUD. Registry roots do not feed the placement resolver.
- Store no binary content in Supabase. Store audit metadata and state transitions only.
- Keep the schema SQL under `supabase/proposals/rc19-sto02-resource-registry/`, outside Supabase migration discovery. It is review-only and requires Owner approval and a separate release manifest before application.
- Create plus initial scope attachment uses one `SECURITY INVOKER` RPC transaction. Grant plus visibility promotion uses a second invoker RPC transaction; constraint or database errors roll back the whole operation.
- Grant rows are Admin-readable only. Resource visibility checks use a private current-user helper so scope association and direct grant-table reads cannot expose Admin-only or owner-only metadata.

## Verification

Require migration contract and PostgreSQL 17 tests for RLS, grants, uniqueness, attendance privacy, and route non-interference; API/UI tests for Admin-only writes, scoped reads, duplicates, malformed URLs, missing provider objects, and no provider writes; then run the repository source gates. Production migration, provider ACL changes, integration and authenticated UAT remain separate gates.
