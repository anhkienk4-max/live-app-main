# RC19 W4 PASS/Swap receipt contract

Status: source implementation checkpoint. Canonical PG17/Auth acceptance is pending in Codex 02's hosted harness.

## Mutation entrypoint

Authenticated clients call `public.shift_swap_operation_v1(p_action, p_request_id, p_payload, p_idempotency_key)`. The function returns the authoritative `public.swap_requests` row. It accepts `create`, `approve`, `accept`, `respond_reject`, `reject`, and `cancel`. Every mutation requires a UUID key. Approve, accept, reject, counterpart rejection, and cancel also require the request's positive `expected_version`.

`create` binds the source registration, mode, reason, target shift, replacement staff, counterpart registration, and notes. The source and counterpart registration IDs are the canonical assignment/segment identities; clients must preserve those IDs on retry. Other actions bind the immutable request ID and their action-specific payload. JSONB comparison makes object key order irrelevant while preserving value and null distinctions.

## Receipt and replay rules

- The private receipt primary key is `(actor_id, idempotency_key)`. It stores action, original request ID, canonical JSONB payload, and the committed request row in the same database transaction as the mutation.
- An advisory transaction lock serializes concurrent uses of the same actor/key. One transaction performs the mutation; identical concurrent calls return the same stored row.
- Reuse with a different action, request ID, or payload raises `SWAP_IDEMPOTENCY_KEY_REUSED`.
- Replay rechecks active canonical business-user state and the original action's current ownership, role, Brand scope, and Agency membership. A different actor has a different receipt namespace and must independently pass mutation authorization.
- A transport exception preserves the client UUID in `sessionStorage`; a later retry sends the same key and payload. There is no fallback to legacy mutation RPCs.
- The receipt table has RLS enabled and no client table grants. Authenticated clients can execute only the public wrapper. Direct authenticated grants on the legacy mutation RPC overloads are revoked.

## Authorization and errors

The wrapper resolves `private.require_shift_actor(...)` and the canonical active business identity. Existing mutation RPCs continue to enforce actor, version and transition rules. Replay additionally checks the live request still has the same requester, source registration/shift, target shift and counterpart registration/user as the committed row. Member and counterpart replay rechecks the source Agency; exchange replay checks both participating Agencies. Leader review replay requires current `shifts.manage` Brand scope and Agency membership; Admin review remains Admin-scoped.

Relevant error identifiers include `SWAP_OPERATION_REQUEST_INVALID`, `SWAP_OPERATION_PAYLOAD_INVALID`, `EXPECTED_VERSION_REQUIRED`, `SWAP_ACTOR_NOT_AUTHORIZED`, `SWAP_RECEIPT_REPLAY_ACTOR_INACTIVE`, `SWAP_RECEIPT_REPLAY_NOT_AUTHORIZED`, `SWAP_RECEIPT_REPLAY_SCOPE_UNRESOLVED`, and `SWAP_IDEMPOTENCY_KEY_REUSED`. Existing version conflict and transition errors remain authoritative.

The migration does not change approved Daily 2h, Campaign 24h, or parent live-start rules. It composes with the segment-aware PASS/Swap RPCs and retains their exact registration-based checks.

## Source verification and remaining acceptance

`tests/rc19-w4-swap-receipt-pglite.test.mjs` covers concurrent same-key create, one durable mutation/log, changed-payload rejection, revoked actor replay denial, removed Agency membership denial, cross-user denial, and stored-result equality. It is a focused PostgreSQL-engine fixture, not canonical full-schema replay, real GoTrue authentication, or authenticated PG17 acceptance.

Do not mark Issue #93 complete until Codex 02 verifies authenticated Admin/Leader/Member flows against a fresh marked disposable PG17 runtime, including both same-parent and cross-Agency denial, response loss followed by same-key retry, persisted row readback, direct legacy RPC denial, and exact source/counterpart registration and segment identity.
