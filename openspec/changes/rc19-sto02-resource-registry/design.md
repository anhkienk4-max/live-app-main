## Decisions

- Keep one canonical resource row per provider object and attach it to zero or more Brands, Campaigns, SKUs, platforms, periods, shifts, or staff through separate metadata scope rows. Scope links are descriptive and never grant read access.
- Use `admin_only`, `owner_only`, or explicit `granted_users` visibility. RLS checks the active business-user identity; Admins manage all registry rows. Attendance evidence is constrained to its owner and cannot be linked to a Brand or Client Group.
- Persist provider IDs and normalized HTTPS URLs without credentials or query strings. Never fetch a submitted URL: provider checks use the existing fixed-host provider adapter and canonical ID only.
- Keep provider metadata verification distinct from user access. A resource readable to the server integration may still be unavailable to a user.
- Never create folders or files during registry CRUD. Registry roots do not feed the placement resolver.
- Store no binary content in Supabase. Store audit metadata and state transitions only.

## Verification

Require migration contract and PostgreSQL 17 tests for RLS, grants, uniqueness, attendance privacy, and route non-interference; API/UI tests for Admin-only writes, scoped reads, duplicates, malformed URLs, missing provider objects, and no provider writes; then run the repository source gates. Production migration, provider ACL changes, integration and authenticated UAT remain separate gates.
