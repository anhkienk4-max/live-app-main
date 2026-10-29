# Design

The signed server session is resolved to a persisted `business_users` row. The Admin API accepts a target business-user ID and a supported permission decision, but never accepts an actor ID or role. SQL independently resolves the actor from `auth.uid()`, requires an active Admin, forbids self-edits, and restricts targets to active Leaders.

Overrides are append-only rows with monotonically increasing per-account/permission versions, expected-version compare-and-set, reason, expiry, and server timestamp. A reset appends a reset decision; it does not delete history. Only the latest row is considered, so an expired decision falls back to the role baseline and cannot revive an older decision.

The effective authorization remains a single PostgreSQL helper used by existing audit RLS and RPC checks. Hard role boundaries and role-default DENY take precedence; account DENY takes precedence over baseline ALLOW. Account ALLOW is accepted only where the supported role baseline grants the permission. Existing Admin access and Member denial remain unchanged.

Activation requires both `FEATURE_RBAC02_ACCOUNT_OVERRIDES=true` in the server environment and an explicit database gate row. Both defaults are false. The SQL is a disposable/review-only proposal and is not installed in migrations.
