# Supabase shared business data P1A: schema and RLS design

Status: design baseline. The derived P1B package has passed executable replay and RLS validation on a disposable local Supabase stack. No P1B SQL has been applied to production.

## 1. Current architecture audit

Production authentication is Supabase-backed, but business data is still held in module-level arrays in `lib/services/dataService.ts`, initialized from `lib/services/mockData.ts`. Components call object-shaped services such as `brandService.getAll()` and `shiftService.update()`. In production, `app/(dashboard)/layout.tsx` currently maps a verified Supabase Auth user to one of the six `mockUsers` by `app_metadata.business_user_id`.

This means business mutations are process-local and do not survive a refresh into another serverless instance, a redeploy, or access from another browser/account. `AuthIdentityProvider` only binds the selected mock business user into the in-memory service; it does not load shared business data.

The tracked `supabase/schema.sql` is a legacy draft and must not be applied as the P1 schema. It uses UUID domain IDs, couples `public.users.id` to `auth.users.id`, omits current fields/statuses/technical assignments/registrations, has overly broad policies, and contains a public `SECURITY DEFINER` signup trigger without the required hardened search path and grants. Before any future remote migration, determine whether any part of that file was already applied remotely.

## 2. Audited TypeScript models

The design preserves these current models rather than replacing them:

- `User`, including `LifecycleMetadata`
- `Brand`, including `LifecycleMetadata`
- `Platform`, including `LifecycleMetadata`
- `Campaign`, including `LifecycleMetadata`
- `Shift`, including `LifecycleMetadata`
- `ShiftRegistration`

Current enum-like values are retained as text plus check constraints so future changes do not require PostgreSQL enum migrations.

### Shared lifecycle columns

| TypeScript field | PostgreSQL column/type | Null/default | Relationship |
|---|---|---|---|
| `deleted_at?` | `deleted_at timestamptz` | null | soft-delete marker |
| `deleted_by?` | `deleted_by text` | null | FK `business_users(id)`, `ON DELETE SET NULL` |
| `archived_at?` | `archived_at timestamptz` | null | archive marker |
| `archived_by?` | `archived_by text` | null | FK `business_users(id)`, `ON DELETE SET NULL` |
| `deletion_reason?` | `deletion_reason text` | null | no FK |

## 3. ID strategy

Use **text domain IDs initially** for all six public tables.

- Existing IDs (`1` through `6`, `b1`, `p1`, `c1`, `s1`, and legacy registration IDs) remain valid.
- `business_users.id` remains the application/domain identifier.
- `business_users.auth_user_id uuid` links to `auth.users(id)` and is unique when present.
- `auth_user_id` is nullable because a domain staff record may need to exist before or without login access. The six existing login users must be mapped and non-null after seed verification.
- Deleting an Auth identity uses `ON DELETE SET NULL`, preserving business history and disabling login instead of cascading through shifts.
- New IDs may later use UUID text values generated in the application/database, without changing PK/FK types.

Changing all domain IDs to UUIDs now would create broad application churn without improving the P1 migration.

## 4. Proposed schema mapping

### 4.1 `public.business_users`

| Current field | Column/type | Null/default | Constraint/index |
|---|---|---|---|
| `id` | `id text` | not null | PK |
| Auth identity | `auth_user_id uuid` | null | FK `auth.users(id) ON DELETE SET NULL`; unique partial index when non-null |
| `email` | `email text` | not null | unique index on `lower(email)` |
| `full_name` | `full_name text` | not null | |
| `avatar_url?` | `avatar_url text` | null | |
| `avatar_storage_path?` | `avatar_storage_path text` | null | future Storage path only |
| `phone?` | `phone text` | null | |
| `role` | `role text` | not null, default `staff` | check `admin/leader/staff`; legacy compatibility only |
| `system_permission?` | `system_permission text` | not null, default `member` | check `admin/leader/member`; authorization column |
| `operational_roles?` | `operational_roles text[]` | not null, default `{}` | check array is contained by `host/support/technical`; GIN index |
| `department?` | `department text` | null | |
| `status` | `status text` | not null, default `active` | check `active/inactive` |
| `account_status?` | `account_status text` | not null, default `pending_approval` | check current `AccountStatus` values |
| `email_verified?` | `email_verified boolean` | not null, default false | display/workflow metadata, not Auth proof |
| `auth_provider?` | `auth_provider text` | null | check `email/google` |
| `join_date` | `join_date date` | not null, default current date | |
| `created_at` | `created_at timestamptz` | not null, server timestamp | |
| `updated_at` | `updated_at timestamptz` | not null, server timestamp | |
| lifecycle fields | columns in section 2 | null | actor FKs |

Passwords, access tokens, refresh tokens, password confirmations, and provider credentials never belong in this table.

### 4.2 `public.brands`

| Current field | Column/type | Null/default | Constraint/FK |
|---|---|---|---|
| `id` | `id text` | not null | PK |
| `name` | `name text` | not null | no uniqueness until product confirms it |
| `logo_url?` | `logo_url text` | null | |
| `color?` | `color text` | null | |
| `description?` | `description text` | null | |
| `category?` | `category text` | null | |
| `status?` | `status text` | not null, default `active` | check `active/inactive/draft` |
| `contact_person?` | `contact_person text` | null | |
| `contact_email?` | `contact_email text` | null | |
| `contact_phone?` | `contact_phone text` | null | |
| `brand_guideline?` | `brand_guideline text` | null | |
| `tone_of_voice?` | `tone_of_voice text` | null | |
| `key_products?` | `key_products text[]` | not null, default `{}` | |
| `mandatory_claims?` | `mandatory_claims text[]` | not null, default `{}` | |
| `restricted_claims?` | `restricted_claims text[]` | not null, default `{}` | |
| `dos?` | `dos text[]` | not null, default `{}` | |
| `donts?` | `donts text[]` | not null, default `{}` | |
| `asset_links?` | `asset_links text[]` | not null, default `{}` | |
| `notes?` | `notes text` | null | |
| `updated_by?` | `updated_by text` | null | FK `business_users(id) ON DELETE SET NULL` |
| `created_at`, `updated_at` | `timestamptz` | server timestamps | |
| lifecycle fields | section 2 | null | |

### 4.3 `public.platforms`

| Current field | Column/type | Null/default | Constraint/FK |
|---|---|---|---|
| `id` | `id text` | not null | PK |
| `name` | `name text` | not null | no uniqueness until product confirms it |
| `icon?`, `logo_url?` | `icon text`, `logo_url text` | null | |
| `platform_type?`, `platform_url?` | text columns | null | URLs remain text, validated by application |
| `status?` | `status text` | not null, default `active` | check `active/inactive/draft` |
| `account_information?` | `account_information text` | null | must never contain credentials |
| `policy_notes?` | `policy_notes text` | null | |
| `livestream_rules?` | `livestream_rules text[]` | not null, default `{}` | |
| `content_restrictions?` | `content_restrictions text[]` | not null, default `{}` | |
| `technical_requirements?` | `technical_requirements text[]` | not null, default `{}` | |
| `report_requirements?` | `report_requirements text[]` | not null, default `{}` | |
| `external_links?` | `external_links text[]` | not null, default `{}` | |
| `updated_by?` | `updated_by text` | null | FK `business_users(id) ON DELETE SET NULL` |
| `created_at`, `updated_at` | `timestamptz` | server timestamps | |
| lifecycle fields | section 2 | null | |

### 4.4 `public.campaigns`

| Current field | Column/type | Null/default | Constraint/FK/index |
|---|---|---|---|
| `id` | `id text` | not null | PK |
| `name` | `name text` | not null | |
| `brand_id` | `brand_id text` | not null | FK `brands(id) ON DELETE RESTRICT`; index |
| `start_date`, `end_date` | `date` | not null | check `end_date >= start_date`; date-range index |
| `type?`, `notes?` | text columns | null | |
| `campaign_url?` | `campaign_url text` | null | compatibility URL |
| `website_url?` | `website_url text` | null | |
| `website_title?` | `website_title text` | null | |
| `website_preview_image?` | `website_preview_image text` | null | future storage reference |
| `website_embed_enabled?` | `website_embed_enabled boolean` | not null, default false | |
| `platform_source?` | `platform_source text` | null | current free-text field |
| `platform_ids?` | `platform_ids text[]` | not null, default `{}` | GIN index; adapter validates IDs exist |
| `status?` | `status text` | not null, default `draft` | check `draft/active/completed/cancelled`; index |
| `owner_id?` | `owner_id text` | null | FK `business_users(id) ON DELETE SET NULL`; index |
| `created_at`, `updated_at` | `timestamptz` | server timestamps | |
| lifecycle fields | section 2 | null | |

`platform_ids` remains an array in P1A because that relationship already exists as an array in TypeScript and the initial persistence scope is six tables. A `campaign_platforms` junction may replace it later, but is not introduced in P1A.

### 4.5 `public.shifts`

| Current field | Column/type | Null/default | Constraint/FK/index |
|---|---|---|---|
| `id` | `id text` | not null | PK |
| `date` | `date date` | not null | query index with start time |
| `start_time`, `end_time` | `time without time zone` | not null | must not be equal |
| `start_at?` | `start_at timestamptz` | server-derived from date/start in `Asia/Ho_Chi_Minh` | indexed for conflict/range queries |
| `end_at?` | `end_at timestamptz` | server-derived, adding a day when overnight | check `end_at > start_at` |
| `end_date?` | `end_date date` | server-derived | |
| `crosses_midnight?` | `crosses_midnight boolean` | server-derived from `end_time < start_time` | |
| `duration_minutes?` | `duration_minutes integer` | server-derived | check `1..1440` |
| `brand_id` | `brand_id text` | not null | FK `brands(id) ON DELETE RESTRICT` |
| `platform_id` | `platform_id text` | not null | FK `platforms(id) ON DELETE RESTRICT` |
| `campaign_id?` | `campaign_id text` | null | FK `campaigns(id) ON DELETE RESTRICT` |
| `title?`, `studio?` | text columns | null | |
| `host_id?` | `host_id text` | null | FK `business_users(id) ON DELETE SET NULL`; compatibility assignment |
| `support_id?` | `support_id text` | null | same |
| `technical_id?` | `technical_id text` | null | same |
| `required_host_count?` | `required_host_count smallint` | not null, default 1 | check `1..100` |
| `required_support_count?` | `required_support_count smallint` | not null, default 1 | check `1..100` |
| `required_technical_count?` | `required_technical_count smallint` | not null, default 1 | check `1..100` |
| `registration_locked?` | `registration_locked boolean` | not null, default false | open-shift partial index |
| `registration_cutoff_at?` | `registration_cutoff_at timestamptz` | null | explicit absolute cutoff |
| `allow_multi_role?` | `allow_multi_role boolean` | not null, default false | |
| `import_batch_id?` | `import_batch_id text` | null | no FK until import batches migrate |
| `status` | `status text` | not null, default `scheduled` | check all six `ShiftStatus` values; index |
| `live_link?`, `product_notes?` | text columns | null | |
| `updated_by?` | `updated_by text` | null | FK `business_users(id) ON DELETE SET NULL` |
| `created_at`, `updated_at` | `timestamptz` | server timestamps | |
| lifecycle fields | section 2 | null | |

`date/start_time/end_time` remain the canonical wall-clock values. A server trigger computes `start_at/end_at` as `timestamptz` with an explicit `Asia/Ho_Chi_Minh` conversion, never the database session timezone; it also derives `end_date/crosses_midnight/duration_minutes`. A future multi-timezone product requires a new explicit timezone field and migration.

Recommended shift indexes, all partial on `deleted_at is null` where applicable:

- `(date, start_time)` for calendar/day-range queries
- `(status, date)` for status/calendar filters
- `(brand_id, date)`, `(platform_id, date)`, `(campaign_id, date)` for current filters
- `(start_at, end_at)` for conflict candidates
- `host_id`, `support_id`, and `technical_id` when non-null for legacy workload lookup
- `(start_at) where status = 'scheduled' and registration_locked = false` for open shifts

### 4.6 `public.shift_registrations`

| Current field | Column/type | Null/default | Constraint/FK/index |
|---|---|---|---|
| `id` | `id text` | not null | PK |
| `shift_id` | `shift_id text` | not null | FK `shifts(id) ON DELETE RESTRICT`; index |
| `user_id` | `user_id text` | not null | FK `business_users(id) ON DELETE RESTRICT`; index |
| `operational_role` | `operational_role text` | not null | check `host/support/technical` |
| `status` | `status text` | not null | check all current `RegistrationStatus` values |
| `source` | `source text` | not null | check `self_registration/manual_assignment/legacy_assignment` |
| `requested_at` | `requested_at timestamptz` | not null, server timestamp | |
| `reviewed_by?` | `reviewed_by text` | null | FK `business_users(id) ON DELETE SET NULL` |
| `reviewed_at?` | `reviewed_at timestamptz` | null | |
| `review_notes?` | `review_notes text` | null | |
| `cancelled_at?` | `cancelled_at timestamptz` | null | |
| `created_at`, `updated_at` | `timestamptz` | server timestamps | |

Recommended indexes:

- `(shift_id, operational_role, status)` for capacity and detail views
- `(user_id, status)` for “My shifts” and conflict candidates
- `(shift_id, requested_at desc)` for registration history
- partial unique `(shift_id, user_id, operational_role)` where status is `pending`, `approved`, or `manually_assigned`

Do not add an unconditional unique constraint: rejected/cancelled/removed registrations are history and a user may later re-register. The conditional “only one active role when `allow_multi_role=false`”, schedule overlap, capacity, cutoff, auto-lock, and approval transition rules cross rows/tables and belong in a transactional S2 database function, not loose INSERT/UPDATE policies.

## 5. Referential integrity

- Master/domain records use soft archive/delete; referenced brands/platforms/campaigns and staffed users are protected by restrictive FKs.
- Actor/audit-like references use `ON DELETE SET NULL` so domain rows survive an exceptional hard user deletion.
- Shift registrations and shifts are not cascaded away; operational history must be explicitly archived/migrated.
- `import_batch_id` remains unvalidated text until the import-batch table enters scope.
- Direct `host_id/support_id/technical_id` columns are compatibility projections. Registration rows are the multi-person staffing source. P1C mutations must update both inside one transaction until all readers stop depending on the direct columns.
- Create indexes for every FK column, including nullable actor fields; PostgreSQL does not create FK indexes automatically.

## 6. Timestamp strategy

- `created_at`, `updated_at`, lifecycle markers, registration workflow timestamps, and cutoffs are `timestamptz`.
- A private trigger function overrides `created_at` on insert and `updated_at` on every insert/update, preventing client clocks from becoming authoritative.
- Shift timing fields are computed by a hardened server trigger from `date/start_time/end_time`; clients must omit them from mutations.
- No client may directly set review timestamps in S2; the transactional function supplies them.

## 7. Authorization helpers

The database relation, keyed by `auth.uid()`, is the authoritative source for business authorization. Existing `app_metadata.business_user_id` and `app_metadata.system_permission` remain useful bootstrap/UI claims and must match the seeded row, but policies do not rely on potentially stale JWT authorization claims.

Proposed functions in a non-exposed `private` schema:

- `private.current_business_user_id() returns text`
- `private.current_system_permission() returns text`
- `private.is_active_business_user() returns boolean`
- `private.is_admin() returns boolean`
- `private.is_leader_or_admin() returns boolean`

If `SECURITY DEFINER` is required to read `business_users` without recursive RLS, each function must:

- derive identity only from `auth.uid()`;
- query the unique `business_users.auth_user_id` mapping;
- require active, non-archived, non-deleted business/account state;
- use `set search_path = ''` and fully qualified relations;
- live outside exposed schemas;
- revoke EXECUTE from `PUBLIC` and `anon`, granting only the minimum to `authenticated`;
- return only the small ID/permission value required by policies.

No policy uses `raw_user_meta_data`, `user_metadata`, request-body role, arbitrary headers, or a client-submitted actor ID.

## 8. Data API grants and RLS matrix

RLS is enabled on all six public tables. Revoke all table privileges from `anon`. Grant only the required table operations to `authenticated`; grants make an operation possible, while RLS decides which rows are allowed.

### Read matrix

| Table | Member | Leader | Admin |
|---|---|---|---|
| `business_users` | shared non-deleted directory rows | same | all rows including archived/deleted management views |
| `brands` | non-archived/non-deleted | same | all rows |
| `platforms` | non-archived/non-deleted | same | all rows |
| `campaigns` | non-archived/non-deleted | same | all rows |
| `shifts` | non-deleted shared operational rows | same | all rows |
| `shift_registrations` | shared operational registration rows needed by existing staffing views | same | all rows |

Every SELECT predicate also requires `private.is_active_business_user()`. This matches the current application, whose dashboard/analytics/calendar load shared registrations and staff assignments. `business_users` contains email/phone and is therefore the main privacy caveat; if the organization does not accept directory-wide PII visibility, add a security-invoker safe-directory view or split private contact data before runtime migration.

### Write matrix

| Table/operation | Member | Leader | Admin | Safe enforcement |
|---|---|---|---|---|
| own profile fields | planned own-profile update only | same | any profile | dedicated whitelist RPC; never direct permission/status update |
| business user create/status/permission/archive | deny | deny | allowed | admin-only function/policy; permission derived from DB |
| brand CRUD/archive | deny | deny | allowed | admin predicate; hard delete constrained by FKs |
| platform CRUD/archive | deny | deny | allowed | admin predicate |
| campaign create/archive/delete | deny | deny | allowed | admin predicate |
| campaign operational edit | deny | allowed | allowed | whitelist RPC for leader-editable fields; no broad leader UPDATE policy |
| shift create/import/edit/lock | deny | allowed per current permissions | allowed | transactional RPC/validated server mutation; no broad raw UPDATE |
| shift hard/soft delete/restore | deny | deny | allowed | admin-only transactional mutation |
| registration self-insert/cancel | **deny in P1A** | own actions only later | management later | S2 RPC derives user from `auth.uid()` and enforces cutoff/capacity/conflicts |
| registration approve/reject/manual assign/remove | deny | allowed later | allowed later | S2 RPC, atomic with assignment/auto-lock updates |

P1A should fail closed for writes that need future functions. A broad member INSERT policy on `shift_registrations` is explicitly rejected.

## 9. Service-role boundary

Normal reads and writes use the authenticated user's cookie-backed Supabase session plus RLS. The browser receives only the publishable/legacy anon key; `service_role` or secret keys never use `NEXT_PUBLIC_*` and are never bundled into client code.

P1 runtime CRUD does not require service role. The only anticipated privileged use is an explicitly invoked, local/server-only one-time baseline migration after dry-run verification. Even that tool should prefer the Auth Admin API only for resolving/verifying Auth users and use a direct trusted database transaction for the reviewed baseline. It must never become a browser repository or a permissive runtime fallback.

## 10. Seed and migration plan

1. Inventory the remote schema/migration history read-only. Determine whether legacy `supabase/schema.sql` objects already exist.
2. Create schema/RLS migration files locally; apply only to a local Supabase stack in a later checkpoint.
3. Upsert `business_users` IDs `1..6` using stable email matching. Resolve each email to exactly one `auth.users.id`; fail on missing/duplicate matches.
4. Verify `app_metadata.business_user_id` and `app_metadata.system_permission` exactly match the seeded row. Do not change passwords or `user_metadata`.
5. Upsert brands, platforms, and campaigns by preserved ID. Validate all referenced IDs before commit.
6. Upsert shifts by preserved ID, omitting generated datetime columns and verifying computed values.
7. Create legacy assignment registrations deterministically (for example `legacy-{shift_id}-{role}`) from direct assignment fields, then migrate any additional registration history.
8. Verify row counts, orphan checks, enum/check values, generated overnight fields, active-auth mapping, and RLS personas.
9. Re-running the seed uses `INSERT ... ON CONFLICT (id) DO UPDATE` only for explicitly mutable baseline columns. It must not duplicate rows or overwrite newer production data without an explicit migration mode.

Production baseline migration should be a reviewed one-time script/transaction, not normal `seed.sql`; `seed.sql` is reserved for local/test reproducibility.

## 11. Data-access transition

Keep current component-facing method shapes. Introduce the smallest persistence boundary beneath them:

```text
existing service contract
  |-- mock implementation (development and tests only)
  `-- Supabase implementation (production, fail closed)
```

Do not let production silently fall back to module arrays after Supabase is enabled. A database error must produce a visible error/loading failure, not fake stale data.

Recommended migration pattern:

- Extract typed interfaces for the six services only when their first Supabase implementation is added.
- Keep `brandService.getAll()`, `shiftService.update()`, and similar call sites stable.
- Use `lib/supabase/server.ts` in Server Components/Route Handlers/Server Actions and `lib/supabase/client.ts` only for authenticated browser reads or explicitly RLS-safe operations.
- Do not create new Supabase client factories.
- Replace `mapAuthIdentityToBusinessUser(identity, mockUsers)` with a server-side `business_users` lookup by `auth_user_id = auth.users.id` during P1B.
- Refetch after mutation/navigation for initial cross-account consistency. Realtime is deferred.
- Complex shift/registration mutations should call authenticated database functions or server-controlled transactional endpoints, never a sequence of independent browser writes.

## 12. Shared-data behavior and Realtime decision

After each module cutover, a successful write is committed to Supabase before the UI reports success. Subsequent fetches by another authenticated account, browser, device, serverless instance, or post-deployment process read the same rows. Refresh/refetch after mutations is sufficient for P1 correctness.

Supabase Realtime is explicitly deferred. It adds subscription lifecycle and authorization work but is not needed to make Supabase the durable source of truth.

## 13. Rollout order

1. **P1A:** reviewed schema, hardened helper design, RLS/grants, local-only migrations and policy tests.
2. **P1B:** migrate/map `business_users`, brands, platforms, campaigns; replace production identity lookup and master-data services.
3. **P1C:** migrate shifts and registrations; add atomic shift mutation and S2 registration functions; switch Calendar/Shift services.
4. **P1D:** reports, dashboard updates, images/storage metadata.
5. **P1E:** swaps, imports, audit/settings/notifications, remaining modules.
6. Realtime is optional after correctness and refetch behavior are proven.

Shift S2 must wait until P1C storage plus transactional functions and concurrency tests exist.

## 14. Rollback

- Add a server-resolved persistence mode with explicit `mock` and `supabase` implementations.
- Production mode is Supabase-only after cutover; no automatic mock fallback.
- Development/tests may explicitly select mock.
- Before cutover, export/verify the Supabase baseline and retain the prior deployment.
- Roll back application reads/writes by deploying the previous version while preserving database rows; do not use a destructive down migration.
- Roll forward schema corrections through new migrations. Deployed production migrations are never rewritten.
- If a module cutover fails, disable only that module's Supabase feature flag server-side and show maintenance/error state; never present mock data as production truth.

## 15. Proposed migration file structure

No files are generated in P1A. When implementation is authorized, create names with `supabase migration new` rather than inventing timestamps:

```text
supabase/migrations/<generated>_p1a_private_auth_helpers.sql
supabase/migrations/<generated>_p1a_business_tables.sql
supabase/migrations/<generated>_p1a_constraints_indexes_triggers.sql
supabase/migrations/<generated>_p1a_rls_grants.sql
supabase/tests/p1a_rls.sql
scripts/migrate-p1-baseline.ts
```

The baseline script remains local/server-only, reads credentials from environment, supports dry-run/apply modes, prints no secrets, and runs only after local/staging policy verification.

## 16. Blockers before implementation

1. Unknown remote schema and migration history: confirm whether legacy `supabase/schema.sql` was ever applied.
2. Decide whether all business staff require Auth accounts; this design permits non-login business users.
3. Confirm directory-wide visibility of business email/phone or split private contact fields.
4. Confirm the single business timezone remains `Asia/Ho_Chi_Minh` before generated datetime columns are finalized.
5. Define leader-editable campaign and shift field whitelists in database functions.
6. Define the transactional S2 registration/approval/cancel/assignment contract and concurrency tests.
7. Decide the eventual authority for direct shift assignment columns versus registration rows; P1C temporarily maintains both.
8. Verify the six Auth users and their app metadata using the existing dry-run provisioning tooling before any seed apply.
