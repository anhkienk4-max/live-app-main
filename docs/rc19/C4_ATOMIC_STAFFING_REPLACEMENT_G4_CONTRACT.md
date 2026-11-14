# RC19 C4 Atomic Staffing Replacement Contract

Status: backend implementation and isolated PostgreSQL 17.11 verification complete; frontend integration remains a separate G4 acceptance step.

## Operation

- Supabase RPC: `public.replace_shift_assignment`
- Application facade: `shiftRegistrationService.replaceAssignment(input)`
- Repository: `getSupabaseShiftRegistrationRepository().replaceAssignment(input)`
- Runtime: persisted Supabase mode only. The facade rejects mock mode with `ATOMIC_REPLACEMENT_REQUIRES_PERSISTED_RUNTIME`.
- The UI gates the submit action on `verifyReplacementCapability(shiftId, role)`, which invokes the same authenticated RPC with valid-shaped random IDs and an intentionally missing segment. The database rejects with `STAFFING_SEGMENT_SHIFT_MISMATCH` before any write; a missing RPC, denied actor, or out-of-scope Leader stays unavailable.

## Request

The RPC accepts these fields. The application service uses camelCase and maps each field to the listed PostgreSQL argument:

| Application field | RPC argument | Meaning |
| --- | --- | --- |
| `shiftId` | `p_shift_id` | Parent shift identity |
| `staffingSegmentId` | `p_staffing_segment_id` | Authoritative child staffing segment |
| `registrationId` | `p_registration_id` | Active assignment being replaced |
| `replacementUserId` | `p_replacement_user_id` | Staff identity to assign |
| `role` | `p_role` | `host`, `support`, or `technical` |
| `expectedShiftVersion` | `p_expected_shift_version` | Optimistic concurrency guard for the shift |
| `expectedRegistrationVersion` | `p_expected_registration_version` | Optimistic concurrency guard for the old assignment |
| `effectiveAt` | `p_effective_at` | Requested effective timestamp |
| `reason` | `p_reason` | Required nonblank audit reason, at most 1,000 characters |
| `emergency` | `p_is_emergency` | Emergency mode; permitted only for Admin |
| `idempotencyKey` | `p_idempotency_key` | UUID scoped to the authenticated actor |

The caller must take the shift, segment, registration, and version values from the current authoritative roster. Caller-supplied identity or role is request data, never authorization evidence. The RPC derives actor and effective system permission from the authenticated session, then checks active business identity, `shifts.assign_staff`, and Leader Brand scope from database authority.

## Authorization and scope

- Admin may perform standard or emergency replacement if the effective capability is present.
- Leader may perform standard replacement only when the current active Brand scope includes `shifts.manage` and the effective capability is present.
- Leader emergency replacement is denied. Member, anonymous, inactive, and service-role callers are denied.
- The segment must belong to the requested parent shift, and the old active registration must belong to that same shift and segment and match the requested role.
- Capacity, qualification, cross-shift time conflict, shift state, and expected versions are checked inside the transaction.
- The receipt table has RLS enabled and no direct Data API grants. It is not a client read endpoint.

## Time semantics

- Standard replacement accepts a submitted timestamp only within 30 seconds of database statement time, then records database statement time as the effective time.
- Emergency replacement records the submitted effective time only when it is not in the future and lies inside the selected segment's `[start_at, end_at)` interval.
- Emergency replacement must not be used to edit attendance, approved actuals, or Payroll. Those remain separate workflows.

## Transaction and retry behavior

The RPC locks the shift, segment, and old registration, checks the idempotency key under an advisory transaction lock, snapshots the old assignment, marks it `removed`, inserts the replacement as `manually_assigned`, increments/reads the shift version, writes a durable private receipt, writes the audit event, and returns the authoritative segment roster in one database transaction. Any raised error rolls back every write in that transaction.

- Same actor + same key + identical normalized payload: returns the original replacement receipt/result with `replayed: true`; does not create another assignment.
- Same actor + same key + different payload: rejected as `IDEMPOTENCY_KEY_REUSED` (`23505`).
- A concurrent request using a distinct key but stale expected versions: one may commit; the other is rejected by the version lock/check (`40001`). The caller must refresh the roster and submit a new reviewed request with a new idempotency key.
- Network timeout with unknown outcome: retry with the same actor, key, and exact request; do not generate a new key until the prior outcome is resolved.

## Response

`ReplaceShiftAssignmentResult` is the typed service contract:

```ts
{
  replacement_id: string
  shift_id: string
  staffing_segment_id: string
  old_registration_id: string
  registration: {
    id: string
    shift_id: string
    user_id: string
    operational_role: 'host' | 'support' | 'technical'
    status: string
    source: string
    staffing_segment_id: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    review_notes: string | null
    version: number
  }
  effective_at: string
  shift_version: number
  roster: Array<{
    registration_id: string
    user_id: string
    role: 'host' | 'support' | 'technical'
    status: string
    version: number
  }>
  replayed: boolean
}
```

Use the returned registration and roster to refresh the affected segment. Do not optimistically synthesize a success receipt or treat a browser-side update as proof of persistence.

## Stable denial/error messages

| SQLSTATE | Message | Client handling |
| --- | --- | --- |
| `42501` | `ACTOR_NOT_AUTHORIZED`, `STAFFING_PERMISSION_REQUIRED`, `EMERGENCY_REPLACEMENT_ADMIN_ONLY`, `LEADER_BRAND_SCOPE_REQUIRED` | Show access denial; do not retry without an authority change |
| `22023` | `REPLACEMENT_REQUEST_INVALID`, `EMERGENCY_EFFECTIVE_TIME_OUTSIDE_SEGMENT`, `REPLACEMENT_EFFECTIVE_TIME_INVALID`, `ASSIGNMENT_SEGMENT_MISMATCH`, `ASSIGNMENT_ROLE_MISMATCH`, `REPLACEMENT_TARGET_IS_CURRENT_STAFF` | Require corrected request/current selection |
| `40001` | `SHIFT_VERSION_CONFLICT`, `REGISTRATION_VERSION_CONFLICT` | Refetch shift and segment; require operator review before retry |
| `23505` | `IDEMPOTENCY_KEY_REUSED` | Treat as client key/payload misuse; do not retry under a new key automatically |
| `P0001` | `C4_REPLACEMENT_BASELINE_PRECONDITION_FAILED`, `SHIFT_NOT_FOUND`, `STAFFING_SEGMENT_SHIFT_MISMATCH`, `SHIFT_NOT_REPLACEABLE`, `EMERGENCY_REPLACEMENT_REQUIRED`, `ASSIGNMENT_NOT_FOUND`, `ASSIGNMENT_NOT_ACTIVE`, `STAFFING_SEGMENT_CAPACITY_EXCEEDED` | Preserve current UI state and surface a specific recoverable or configuration error |

PostgREST may map SQLSTATEs to HTTP status codes. UI logic should prefer the stable RPC message/code and must not infer success from HTTP status alone.

## G4 enablement boundary

This handoff does not enable a UI control or release feature flag. G4 may wire the operation only in an integrated candidate after the migration is included and applied to the approved non-Production test database, runtime identity and Brand-scope behavior are verified, the latest roster versions are supplied, the UI confirms segment and role explicitly, and the authenticated G4 tests cover permission denial, stale versions, retry/idempotency, and server readback. Production enablement remains subject to the separate release approval and migration gates.

## Verified scope and limits

Verified in the C4 isolated PostgreSQL 17.11 Supabase Auth/PostgREST clone: Admin emergency and scoped Leader standard success; role, Brand, qualification, conflict, capacity, stale-version, idempotency, concurrency, rollback, receipt/audit, and history-preservation cases; direct table and RPC denial boundaries; and the service repository response shape. The isolated run did not modify Production or Staging.

Frontend rendering, authenticated G4 browser acceptance, full canonical regression, and Production rollout are not established by this backend contract.
