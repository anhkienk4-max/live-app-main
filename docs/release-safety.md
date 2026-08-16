# Release Safety Foundation

Phase 2 playbook for this repo. Goal: safe separation of LOCAL / STAGING / PRODUCTION and a
repeatable release process before larger phases (S2B, S3, S4, S5, Reports/Analytics).

## Environment topology

- **LOCAL** → `supabase start` (local dev DB) or mock mode (`NEXT_PUBLIC_USE_MOCK_DATA=true`, dev only).
- **STAGING** → separate cloud Supabase project + Vercel preview from branch `staging` (same Vercel project).
- **PRODUCTION** → existing Supabase `egdjnpmoasarrttvhgds` + Vercel `livestream-ops-demo` main.

**Vercel model: Option A** — one Vercel project; `main` = Production env, branch `staging` = Preview
env with staging Supabase URL/anon. Trade-off: preview env must be configured correctly, else
preview points at production DB (guarded below).

## Environment matrix

| Variable | Local | Staging | Production | Scope | Req | Notes |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | local URL | staging URL | prod URL | Public | Yes | **DANGER** wrong URL → wrong DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local anon | staging anon | prod anon | Public | Yes | **DANGER** staging must not reuse prod anon |
| `NEXT_PUBLIC_USE_MOCK_DATA` | true | false | false | Public | No | mock only when NODE_ENV=development |
| `NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER` | true | false | false | Public | No | **DANGER** must stay false in production |
| `OPENAI_API_KEY` / `EMERGENT_LLM_KEY` | dev | staging | prod | Server | No | AI |
| `DEFAULT_AI_MODEL` / `ALLOWED_AI_MODELS` | – | – | – | Server | No | AI config |
| `VISION_OCR_*` | mock | staging | prod | Server | No | OCR provider/limits |
| `VERCEL` / `VERCEL_ENV` | – | set | set | Server | No | dev detection |
| `DATABASE_URL` | local db | – | – | Server | No | lib/db workspace only, not app runtime |

## Migration strategy — EXPAND → DEPLOY → CONTRACT

1. Auth migration (additive) → commit
2. Apply + test on **staging** first
3. Automated contract/runtime tests
4. Staging acceptance
5. Apply committed migration to production (never uncommitted artifact)
6. Push runtime → Vercel
7. Production acceptance
8. Destructive cleanup only in a later migration (contract phase)

Rules:
- Additive: safe anytime.
- RPC replacement: `create or replace` + re-grant; deploy before runtime that calls it.
- Column rename: add new column → deploy → backfill → switch runtime → drop old later.
- Column/table removal: never in the same release as runtime; separate contract phase.
- Data backfill: separate idempotent migration, staging first.
- RLS changes: fail-closed; verify with tests.
- Rollback: additive migrations don't need rollback; destructive ones require a plan.

## P2B staging bootstrap order (blocker note)

`20260811112834_p1b_production_bootstrap.sql` requires exactly these Auth users to exist with
matching `app_metadata.business_user_id` + `system_permission` BEFORE the migration runs:

| email | business_user_id | system_permission |
|---|---|---|
| admin@livestream.com | 1 | admin |
| leader@livestream.com | 2 | leader |
| host1@livestream.com | 3 | member |
| host2@livestream.com | 4 | member |
| support1@livestream.com | 5 | member |
| technical1@livestream.com | 6 | member |

Correct order for staging:
1. Create staging Supabase project
2. **Create the 6 staging-only Auth users** (via Supabase dashboard or a one-time admin
   script) — `scripts/provision-supabase-user-metadata.ts` only UPDATES `app_metadata`
   of existing Auth users; it does NOT create them. Auth-user creation is a separate
   provisioning step that must run before that script.
3. Run `scripts/provision-supabase-user-metadata.ts` (set `SUPABASE_URL` + `SUPABASE_SECRET_KEY`
   to staging) so `app_metadata.business_user_id` + `system_permission` match the table below.
4. Apply the full committed migration chain (`supabase db push --linked`) — the bootstrap
   migration creates the canonical `business_users` rows from those Auth users.
5. Verify parity (`supabase migration list` matches production) and that
   `business_users` maps 1:1 to the Auth users (id + auth_user_id).
6. Seed synthetic operational data with `scripts/seed-staging.ts` — it references the
   canonical business_user ids (1-6) and does NOT create/overwrite `business_users`.

Do NOT rewrite the historical bootstrap migration.

## Release gates (every production phase)

A. Scope review → B. Migration review → C. Unit/integration tests → D. TypeScript →
E. production build → F. **clean committed-snapshot validation** (worktree HEAD + staged) →
G. staging migration → H. staging smoke → I. staging UAT → J. production migration/deploy order →
K. production acceptance → L. post-release verification.

**Never rely on a dirty working-tree build as release proof** (this already caused a Vercel failure).

## Production protection

- Local app → prod DB: guard warns when non-production env points at the production URL.
- Preview → prod DB: preview env must override Supabase URL/anon to staging; verify in CI/script.
- Test scripts: use fake repository hooks (already in place); seed scripts refuse production target.
- Migration target: `scripts/check-supabase-target.ts` prints linked ref and blocks production unless authorized.
- No service-role key in browser code.
- Destructive migrations never auto-run; feature flags gate unfinished features (production OFF default).
