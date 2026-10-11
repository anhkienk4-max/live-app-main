# SHIFT RPC SEMANTIC COMPATIBILITY & CONTRACT AUDIT

**Project:** OPS Livestream Platform — APP OPS  
**Target Operations:** `public.create_shift(jsonb)` and `public.update_shift(...)` Overloads  
**Reference Baselines:**
- PROD Pre-RC15 Snapshot (`docs/storage/rc15-release-baseline/PROD_RPC_BASELINE_BEFORE_RC15.sql`)
- PROD Current RC15 Migration (`supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql`)
- Legacy RC13A Migration (`supabase/migrations/20260924000000_rc13a_execution_source_storage_routes.sql`)
**Date:** 2026-10-11  

---

## 1. Executive Summary: Core Shift RPC Architectural Contract

The shift lifecycle is governed by strict PostgreSQL PL/pgSQL RPCs operating under `SECURITY DEFINER` with empty search paths (`SET search_path TO ''`). These functions enforce business actor identity, role permissions, field allowlists, optimistic concurrency control (`FOR UPDATE` with version assertion), state transition validation, and staffing consistency.

This audit proves:
1. **Production RC15 is the Most Advanced and Secure Definition:**
   - Both `create_shift` and `update_shift` (4-param) safely accept `execution_source in ('internal', 'agency')`.
   - The insecure 3-parameter `update_shift` overload has been **explicitly revoked** from authenticated callers.
   - Full optimistic concurrency locking (`p_expected_version`) is preserved.
2. **Replaying Legacy RC13A Would Severely Degrade Production:**
   - Old RC13A lacked pre-execution MD5 verification guards.
   - Old RC13A failed to revoke execute privileges on the 3-param `update_shift` overload, re-opening a concurrency bypass vulnerability.
   - Old RC13A would overwrite Production definitions and conflict with existing database constraints.

---

## 2. Exhaustive Comparison: `public.create_shift(p_data jsonb)`

### Function Metadata & Checksums

| Environment / Version | Function Argument Signature | Functiondef MD5 Checksum | Status |
| :--- | :--- | :--- | :--- |
| **PROD Baseline (Pre-RC15)** | `p_data jsonb` | `2133950d90a0610b76d4b6623abf4621` | Baseline |
| **PROD Current (RC15)** | `p_data jsonb` | `6f98725832a893ee517176466f21c0ad` | **ACTIVE ON PROD** |
| **Legacy RC13A** | `p_data jsonb` | Unverified / Dynamic | **DEPRECATED (DO NOT RUN)** |

### Allowlist Key Comparison: `create_shift`

```
Pre-RC15 Allowed Keys (24 keys):
[date, start_time, end_time, timezone, brand_id, platform_id, campaign_id, title, studio,
 host_id, support_id, technical_id, host_names, assistant_names, technical_names,
 required_host_count, required_support_count, required_technical_count,
 registration_cutoff_at, allow_multi_role, import_batch_id, status, live_link, product_notes]

RC15 Allowed Keys (25 keys):
Pre-RC15 Keys + [execution_source]
```

### Semantic Logic Comparison Table

| Logic Element | PROD Baseline (Pre-RC15) | Current PROD (RC15 Applied) | Legacy RC13A (Deprecated) |
| :--- | :--- | :--- | :--- |
| **MD5 Pre-Check** | N/A | Validates baseline MD5 before patching; aborts on drift. | None. Unconditional overwrite. |
| **Actor Verification** | `actor_id := private.require_shift_actor(true);` | `actor_id := private.require_shift_actor(true);` | `actor_id := private.require_shift_actor(true);` |
| **Allowed Keys Check** | 24 keys allowlist; throws `SHIFT_FIELD_NOT_ALLOWED` (`22023`) | 25 keys allowlist (includes `execution_source`) | 25 keys allowlist (includes `execution_source`) |
| **Source Validation** | None (rejected by allowlist) | Throws `SHIFT_EXECUTION_SOURCE_INVALID` if not `internal` or `agency` | Throws `SHIFT_EXECUTION_SOURCE_INVALID` if not `internal` or `agency` |
| **Initial Staffing** | Loops over `host`, `support`, `technical` calling `insert_manual_shift_assignment` | Preserved exactly. | Preserved exactly. |
| **Lock Release** | Sets `registration_locked = false;` | Sets `registration_locked = false;` | Sets `registration_locked = false;` |
| **Execution Source Persistence** | Not persisted. | `p_data->>'execution_source'` stored in `shifts.execution_source`. | `p_data->>'execution_source'` stored in `shifts.execution_source`. |
| **Permissions** | Granted to `authenticated`. | Granted to `authenticated`. | Granted to `authenticated`. |

---

## 3. Exhaustive Comparison: `public.update_shift` (3-Parameter Overload)

### Signature: `update_shift(p_shift_id text, p_patch jsonb, p_confirm_impact boolean)`

```sql
-- PROD Pre-RC15 MD5: 6737e74fb449e7745b3847b3f95ec0a0
-- PROD Current RC15 MD5: 49f481c5f3e792e34d6be20da9a6ee01
```

### Critical Security Differentiation

- **The Problem with 3-Param Overload:** This legacy overload takes no version parameter. Therefore, it **cannot** call `private.assert_expected_version('Shift', p_expected_version, existing_shift.version)`. If exposed to frontend clients, concurrent updates would result in silent lost updates (last-write-wins race conditions).
- **The RC15 Hardening Fix:**
  In migration `20261011092015_rc15_shift_rpc_compatibility.sql`:
  ```sql
  -- RC15 explicitly revokes execute rights from all non-superusers:
  REVOKE ALL ON FUNCTION public.update_shift(text, jsonb, boolean)
    FROM public, anon, authenticated;
  ```
- **The Downgrade Hazard from RC13A:**
  Legacy RC13A did **not** revoke the 3-param overload. Replaying RC13A or failing to maintain RC15's revocation would leave this concurrency loophole open.

---

## 4. Exhaustive Comparison: `public.update_shift` (4-Parameter Overload)

### Signature: `update_shift(p_shift_id text, p_patch jsonb, p_confirm_impact boolean, p_expected_version integer)`

```sql
-- PROD Pre-RC15 MD5: c7b743aa97b19c678ff6f84d6c9b8a2c
-- PROD Current RC15 MD5: ff799ce7aa150e7f7ca72895fbc9a71a
```

### Detailed Functional Contract Breakdown

#### 1. Payload & Key Guards
- Rejects non-object payloads with `SHIFT_PAYLOAD_INVALID` (`22023`).
- Forbids direct direct mutation of `host_id`, `support_id`, `technical_id` (`STAFFING_FIELDS_USE_STAFFING_RPC`). Staffing must use dedicated staffing RPCs.
- Validates all keys against strict allowlist (17 keys):
  `['date', 'start_time', 'end_time', 'brand_id', 'platform_id', 'campaign_id', 'title', 'studio', 'required_host_count', 'required_support_count', 'required_technical_count', 'status', 'live_link', 'product_notes', 'registration_cutoff_at', 'allow_multi_role', 'execution_source']`.
- Role-based key lockdown: If `actor_permission = 'leader'`, attempting to mutate `registration_cutoff_at` or `allow_multi_role` throws `OPERATION_NOT_ALLOWED` (`42501`).
- Source validation: If `execution_source` is supplied, it must be `internal` or `agency`, else throws `SHIFT_EXECUTION_SOURCE_INVALID` (`22023`).

#### 2. Row Locking & Optimistic Concurrency
- Row retrieval:
  ```sql
  select * into existing_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  ```
  Acquires an exclusive row-level lock (`FOR UPDATE`), blocking concurrent writes until transaction completion.
- Version check:
  ```sql
  perform private.assert_expected_version('Shift', p_expected_version, existing_shift.version);
  ```
  If `p_expected_version` does not match `existing_shift.version`, the RPC raises a conflict exception (`CONCURRENCY_CONFLICT` / `P0001`), completely eliminating lost updates.

#### 3. Status Transition State Machine
Enforces legal status transitions:
- `scheduled` -> `scheduled`, `preparing`, `cancelled`
- `preparing` -> `scheduled`, `preparing`, `live`, `paused`, `cancelled`
- `live` -> `live`, `paused`, `completed`
- `paused` -> `live`, `paused`, `completed`
- `completed (auto)` -> `scheduled`, `preparing`, `live`, `paused`, `completed`
- `completed (manual)` -> `completed`
- `cancelled` -> `cancelled`
Any unauthorized transition throws `SHIFT_STATUS_TRANSITION_NOT_ALLOWED` (`42501`).

#### 4. Live & Completed Shift Impact Protections
- If `existing_shift.status = 'live'` and patch touches `date`, `start_time`, or `platform_id`: throws `LIVE_SHIFT_FIELD_LOCKED` (`P0001`).
- If `existing_shift.status = 'completed'` and patch touches `date`, `start_time`, `end_time`, `platform_id`, or `campaign_id` without `p_confirm_impact = true`: throws `COMPLETED_SHIFT_IMPACT_CONFIRMATION_REQUIRED` (`P0001`).

#### 5. Post-Mutation Invariant Check
- Executes `perform private.assert_shift_staffing_consistent(updated_shift);` ensuring required counts and assignments do not violate invariants before committing.

---

## 5. Verification Matrix: Before vs. After RC15

| Requirement / Guarantee | Pre-RC15 Baseline | Current RC15 on Production | Legacy RC13A Replay Hazard |
| :--- | :---: | :---: | :---: |
| **`execution_source` in `create_shift`** | ❌ Rejects with `22023` | ✅ Accepts & validates | ✅ Accepts (but lacks MD5 guard) |
| **`execution_source` in `update_shift` (4-param)** | ❌ Rejects with `22023` | ✅ Accepts & validates | ✅ Accepts (but lacks MD5 guard) |
| **3-Param `update_shift` Revoked** | ❌ Not revoked | ✅ **REVOKED from authenticated** | ❌ Fails to revoke (vulnerability) |
| **Optimistic Locking (`expected_version`)** | ✅ Preserved | ✅ **Preserved** | ⚠️ At risk if 3-param used |
| **`FOR UPDATE` Row Locking** | ✅ Preserved | ✅ **Preserved** | ✅ Preserved |
| **Staffing Direct Edit Lock** | ✅ Preserved | ✅ **Preserved** | ✅ Preserved |
| **Leader Field Restrictions** | ✅ Preserved | ✅ **Preserved** | ✅ Preserved |
| **Drift Detection on Apply** | ❌ None | ✅ **MD5 Pre-check aborts on drift** | ❌ None |

---

## 6. Conclusion & Recommendation

The RPCs currently installed on Production (`6f98725832a893ee517176466f21c0ad` and `ff799ce7aa150e7f7ca72895fbc9a71a`) represent the **gold standard of security and semantic compatibility**.

**Operational Recommendation:**
1. **DO NOT MODIFY** the shift RPCs on Production.
2. Ensure the converged client code (`lib/services/supabaseShiftService.ts`) calls only `public.update_shift(p_shift_id, p_patch, p_confirm_impact, p_expected_version)`.
3. In tests, verify that passing `execution_source: 'internal'` succeeds and passing `execution_source: 'invalid'` fails with `22023: SHIFT_EXECUTION_SOURCE_INVALID`.
