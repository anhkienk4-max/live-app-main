# RC19 W4 Agency Membership Authorization Decision

**Status:** Owner approved the canonical Agency membership model and HR-authoritative backfill preparation on 2026-11-26. Production migration and real HR backfill remain unauthorized.

**Evidence checkpoint:** D1 `6923a0bda50ae1cccb64726e1fb1134e60085e8d`; D2 `5eb3992c23767af539b946af9105af93bc70d126`; D3 `7bd0668c8aba543fa62f0329a13431a3d67af91e`.

## Existing schema evidence

The isolated D1-derived PG17 candidate `rc19_d123_candidate_20261126_c1` was inspected read-only before applying D2/D3 changes. Its only `agency`-named column in `public`/`private` was `public.shifts.agency_code` (`text`). The source migration constrains this field to `ada`, `snap`, or `live_ai` and pairs it with `execution_source`; these values describe shift/import source classification. The inspected schema has no `business_user_agency_memberships` relation and no Agency foreign key from `business_users` or `shift_registrations`.

This is insufficient evidence that `agency_code` identifies a staffing agency or a person's employer. Existing Brand grants remain a separate authorization dimension. Brand membership must not be treated as Agency membership.

## Current implementation boundary

The additive disposable-candidate implementation is in migration `20261126130000_rc19_w4_canonical_agency_membership.sql`. It creates a private Agency directory, HR-provenance membership history, immutable membership events, and `shifts.authoritative_agency_id`; it inserts no Agency or membership data. `agency_code` remains an import/source classification and is never copied into the canonical Agency FK.

The repository contains no HR directory export, canonical HR Agency key, or approved immutable HR-to-`business_users.id` mapping. Therefore a real mapping dry run and membership seed are blocked on the authoritative HR input. No row may be manufactured from names, email similarity, Brand grant, shift, Attendance, or Payroll history.

The current tenant boundary is the Supabase project/database. There is no canonical in-database tenant identity or tenant membership model in the current schema. The additive Agency tables do not claim row-level multi-tenant isolation inside a shared Supabase project. If multiple business tenants must share one project, an Owner-approved stable tenant key and source mapping are still required before enforcement.

## Proposed canonical model

- `agencies`: immutable UUID primary key, unique HR-authoritative external key, canonical display name, active/inactive state, timestamps, and audited state changes. Do not reuse `shifts.agency_code` as the external key without an explicit HR mapping decision.
- `business_user_agency_memberships`: UUID primary key, `business_user_id`, `agency_id`, effective start/end timestamps, status (`active`/`revoked`), HR source reference, source version, created/changed actor, timestamps, and optimistic version. Keep membership history; revocation closes the active interval rather than deleting it.
- Multiple concurrent Agency memberships are supported. Each protected operation must match the target shift's exact Agency; overlapping intervals for the same user/Agency are forbidden by a transaction-serialized database trigger.
- All timestamps use `timestamptz`; authorization is evaluated at transaction time. An expired, future-dated, inactive, or revoked membership is not effective.

## Authorization contract proposed for approval

- **Leader:** require both the existing permission and Brand scope, plus an active membership in the shift's HR-canonical Agency. All three scopes must match the target shift and segment.
- **Member:** require own active business identity and the authorized registration/assignment, with an active membership matching the shift Agency. Do not infer membership from attendance or a historical registration.
- **Admin:** retain existing effective Admin permission. Whether Admin is globally cross-Agency or must hold explicit Agency membership is an Owner policy decision; preserve current behavior until decided.
- **Replacement candidate:** require active business-user status, role/qualification, Brand/Agency eligibility, segment capacity, overlap checks, and effective membership at the requested replacement time.
- **Mutations and idempotency replay:** re-evaluate actor permission, Brand, Agency membership, candidate eligibility, and target scope inside the same transaction before applying or replaying a receipt. Revocation must deny subsequent requests and replays.
- Missing or ambiguous Agency mapping is deny-by-default with a stable actionable error. Do not use `service_role` as a substitute for user authorization.

## HR-authoritative backfill and unmapped users

1. Obtain an HR export with stable user and Agency identifiers, effective dates, current status, and a version/as-of timestamp.
2. Reconcile identities to `business_users` using an approved immutable identity key; names, email similarity, Brand grants, shift history, and import labels are not sufficient proof.
3. Produce a dry-run mapping report with counts for exact matches, duplicates, inactive identities, unmapped users, and conflicting intervals. Owner/HR approves the report before writes.
4. Insert only approved memberships with source references and preserve the source snapshot hash. Unknown, duplicate, or conflicting users remain unmapped and denied until resolved.
5. Never auto-enroll a user because a Brand grant exists or an imported shift names that user.

## Tenant boundary and compatibility impact

The Agency check is an additional boundary; it does not replace Brand scope, RLS, assignment ownership, or existing role/capability checks. Agency identity and effective membership must be carried through schedule import, segment staffing, registration, Assign/Unassign, C4 replacement, PASS/Swap, attendance/photo evidence, actual-work review, Payroll evidence, media authorization, D1 incidents, D2 notes, and D3 Workforce/report reads. Historical records retain their original IDs and evidence; a missing historical membership must not rewrite or reclassify them.

Current `agency_code` import behavior must remain source classification until the HR mapping is approved. A+B import/reimport must not manufacture membership. Delta C media scopes must use the same canonical Agency identifier after approval. D1/D2/D3 should return a scoped denial when the Agency required for an operation is unresolved; D3's current note explicitly states Agency aggregation is unverified without this relation.

## Migration, rollout, and rollback proposal

1. **Additive phase:** create the Agency directory and membership history tables, constraints, indexes, audit path, and RLS. No existing grants or rows are changed.
2. **Shadow verification:** load only an Owner/HR-approved mapping into a disposable database; compare authorization decisions against the source export and test multi-membership, expiry, revocation, Brand AND Agency, and unmapped-user denial.
3. **Enforcement:** only after parity and Owner approval, add Agency checks to versioned write/read boundaries. Reauthorize inside transactions and on receipt replay. Do not switch by a global flag that bypasses deny behavior.
4. **Rollback:** stop new Agency-sensitive mutations or revert to the last approved versioned handler only if doing so does not broaden access. Keep the additive tables and audit history; never delete memberships or rewrite old records as rollback.

## Remaining input and release gates

- [ ] HR provides the authoritative source name, stable user/Agency keys, effective dates, source version, current status, and source snapshot checksum.
- [ ] HR approves exact mapping from immutable HR user keys to `business_users.id`; unresolved or duplicate users remain unmapped.
- [ ] Owner confirms whether the existing Admin global-scope behavior remains unchanged (current candidate preserves it).
- [ ] Owner supplies the canonical tenant identity only if multiple tenants share one Supabase project.
- [ ] Disposable canonical PG/RLS acceptance and application-wide scope integration complete before any enforcement release.

The schema is local candidate code only. It has not been run on Production, Staging, or a canonical authenticated runtime. No real HR backfill, migration cutover, or Production authorization change has occurred.
