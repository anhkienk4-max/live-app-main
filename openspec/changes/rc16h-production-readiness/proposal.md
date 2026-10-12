# RC1.6H: Production-only release readiness

Owner decision: Staging/Preview is no longer a prerequisite. This change prepares
the Production candidate; it does not authorize cloud SQL, deployment, merge,
configuration changes, reviewer provisioning or live fixtures.

Reuse the existing `actual_staffing` and `payroll` flags to disable their backend
surfaces independently, after authorization and before privileged database
access. Add authenticated, role-filtered capabilities for the independent UI.
Keep all existing payroll calculations, review independence and audit semantics.

Pin only missing RC16/RC16B migrations in a Production manifest. Rehearse that
manifest on PostgreSQL 16/17 using a sanitized live catalog and synthetic records,
checking legacy data, security and operational RPC preservation. Exclude both
Staging RC16G reconciliations. Do not rewrite historical migrations.

Release remains NO-GO pending final Antigravity source/integration, independent
reviewer, approved HR policies, void acceptance, backup/recovery and authorized
Production apply/verification.
