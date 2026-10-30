# RBAC-02 Account Permission Overrides

## Why

Administrators need an auditable, time-bounded way to deny or restore a supported permission for one account without changing role defaults or creating a parallel authorization catalog.

## Scope

- Support only `audit.view_team`, the permission already enforced by RBAC-01B.
- Apply overrides to active Leader accounts only; Admin access and Member denial remain hard boundaries.
- Preserve role-default decisions as the baseline. An account DENY wins over a baseline grant. An account ALLOW cannot override a role-level DENY or grant a permission absent from the role baseline.
- Keep the feature disabled by default and keep SQL review-only outside `supabase/migrations`.

## Out of scope

No other permission catalog entries, Finance, Payroll, provider access, Storage ACLs, Production migration, or feature activation.
