# Staffing candidate search

## Requirements

### Requirement: Authenticated staffing candidate search is action- and shift-scoped

The application SHALL return candidates only after deriving an active business identity from the authenticated session and checking effective `shifts.assign_staff` permission. Admin SHALL search candidates for any active shift. Leader SHALL search candidates only for an active shift whose persisted Brand has a current `shifts.manage` grant. Member, unauthenticated, downgraded, revoked, expired, foreign-Brand, and account-denied requests SHALL return no candidate data.

#### Scenario: Leader searches an authorized Brand shift

- GIVEN an active Leader with `shifts.assign_staff` and current `shifts.manage` scope for the shift Brand
- WHEN the Leader searches by supported operational role and bounded pagination
- THEN the response contains only active role-eligible candidates and the existing `{ total, items }` shape

#### Scenario: Leader requests another Brand or has no current scope

- GIVEN an active Leader without current `shifts.manage` scope for the persisted shift Brand
- WHEN the Leader calls the RPC directly with that shift ID
- THEN the RPC returns the same not-found denial used for a missing shift and emits no candidate rows

#### Scenario: Member or denied account calls the RPC

- GIVEN an authenticated Member or an account with an effective deny for `shifts.assign_staff`
- WHEN the caller invokes the RPC directly
- THEN the request is rejected before candidate enumeration

### Requirement: Staffing candidate search does not expose the staff directory

The RPC SHALL be executable only by `authenticated`, SHALL use a fixed empty `search_path` and a controlled owner, and SHALL grant no `business_users` SELECT privilege. Candidate results SHALL remain bounded and include only the fields required by the existing staffing UI.
