# Design

The signed server session is resolved to a persisted `business_users` row. The Admin API accepts a target business-user ID and a supported permission decision, but never accepts an actor ID or role. SQL independently resolves the actor from `auth.uid()`, requires an active Admin, forbids self-edits, and restricts targets to active Leaders.

Overrides are append-only rows with monotonically increasing per-account/permission versions, expected-version compare-and-set, reason, expiry, and server timestamp. A reset appends a reset decision; it does not delete history. Only the latest row is considered, so an expired decision falls back to the role baseline and cannot revive an older decision.

The effective authorization remains a single PostgreSQL helper used by the capability API, server `requirePermission()`, audit RLS, and the swap mutation trigger. Hard role boundaries cannot be overridden. Account DENY takes precedence; Account ALLOW can restore a permission after role DENY only for roles explicitly listed in the permission catalog. Report, swap, attendance, and Storage business-scope checks remain required after permission is allowed.

Activation requires the matching server flag and explicit database runtime gate. Both default to false. Versioned SQL is installed as additive migrations and tested only on disposable PostgreSQL 17; no Production migration or feature activation is included.
