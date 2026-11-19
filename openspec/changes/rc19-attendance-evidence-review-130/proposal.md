# Attendance evidence review

Add an Admin/Leader review workflow for immutable check-in and check-out photo evidence.

## Scope
- View evidence for shifts within the caller's existing shift-read scope.
- Record append-only approve, reject, and correction-request decisions with reviewer, server timestamp, reason, event/evidence IDs, and optimistic version checks.
- Let the assigned member append a new photo after a correction request while retaining all earlier evidence.

## Out of scope
- Changing attendance event creation, Actual Staffing, Payroll, RBAC, Drive ACLs, provider routing, or Production data.
- Applying this proposal to Production before independent approval.
