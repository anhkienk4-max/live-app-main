# RC19 C5.2 staffing runtime compatibility

## Summary

Restore the missing staffing-candidate RPC as a forward-only migration that keeps the existing response contract and enforces the authenticated assignment permission plus the target shift's current Brand scope.

## Motivation

The current application calls `public.search_staffing_candidates`, but the observed Production database does not contain it. Replaying the historical 1B3 migration would create an unscoped `SECURITY DEFINER` read and would falsify migration history. A new migration can restore the contract after the RBAC and Leader Brand Scope dependencies are installed.

## Scope

- Add a new versioned migration after the existing 19 forward migrations.
- Preserve Admin global staffing management and require `shifts.manage` for a Leader's target Brand plus effective `shifts.assign_staff` authority.
- Preserve active candidate filters, availability status, pagination, and the `{ total, items }` response.
- Keep dashboard screenshot reads on the authenticated application endpoint and order private-bucket activation after a compatible application release.

## Non-goals

- Replaying or recording historical migration 1B3 as applied.
- Changing Production, Vercel, Storage ACLs, or feature flags.
- Changing the Shift Identity or Open Shifts contracts when focused tests already cover them.
