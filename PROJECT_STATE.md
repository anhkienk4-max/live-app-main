# PROJECT_STATE

**Last verified:** Live Git inspection — see below. Update this file after each verified milestone.

---

## Current Baseline

Current branch: `main`
HEAD: `573d806ae4dd9c7a689f44b150d925e5ffe632de`
origin/main: `573d806ae4dd9c7a689f44b150d925e5ffe632de` (confirmed in sync)
Production Supabase: `egdjnpmoasarrttvhgds`
Staging Supabase: `amagnzebmmuqiptmrjmc`

---

## Active Work

All of the following is **uncommitted and unstaged** (dirty WIP only). Nothing staged, nothing committed.

**Import Hotfixes — 8 files total:**

- `lib/utils/excelUtils.ts`
- `lib/utils/scheduleImportPreview.ts`
- `lib/utils/scheduleImportReadiness.ts`
- `lib/utils/scheduleImportDraft.ts`
- `components/features/calendar/ScheduleImportPanel.tsx`
- `tests/schedule-import-mapping.test.ts`
- `tests/schedule-import-readiness.test.ts`
- `tests/schedule-import-draft.test.ts`

**Status:**
- Hotfix 1 — duplicate semantics: implemented, tests passed
- Hotfix 2/2B — master lookup + readiness: implemented, tests passed
- Hotfix 3 — draft/confirm editing: implemented, tests passed
- Cumulative import regression: 30/30 pass
- Manual UAT: still pending
- Nothing staged/committed

---

## Recently Completed / Historical

**DO NOT push or re-run based on resumed-session context alone.**

- `5d5c7d1` — Prevent self-cancel of manual staffing assignments
  - COMPLETED / HISTORICAL
  - Already contained in origin/main ancestry (confirmed via `git merge-base --is-ancestor`)
  - Migration: `supabase/migrations/20260816105052_p1c_cancel_manual_assignment.sql` — HISTORICAL P1C migration, already applied to production
  - DO NOT treat as current work. DO NOT push/re-run based on stale session TODO.
  - Do not re-apply migration based only on resumed-session context.

- `573d806` — Add staging and release safety foundation
  - `.env.example`, `.gitignore`, `lib/flags.ts`, `scripts/check-*.ts`, `scripts/seed-staging.ts`
  - Known baseline — **live Git confirmed this equals origin/main**

- Production Supabase: shift_registrations canonical, `create_shift/update_shift/soft_delete_shift/restore_shift/manual_assign_shift_staff/remove_shift_staffing/cancel_own_shift_registration` all working. No mock→Supabase fallback.

---

## Known Issues / Risks

- Working tree contains 27+ modified + 10 untracked files of unrelated WIP. **NEVER** `git add .` or `git add -A`.
- Resumed session context (e.g., "P1C staffing hotfix was pushed") may be stale. Always verify with live Git.
- Import hotfixes are in the working tree only — no commit, no Vercel deployment, no rollback possible.
- Production save/CRUD for shifts works; staffing write (S2B) hard-blocked by `rejectSupabaseBusinessUserWrite()`.

---

## Deferred

- PERF-P1 (deeper optimizations)
- S3A production notifications (parked)
- S2B Staff Management business_users writes (deferred)

---

## Next Steps

1. Import manual UAT / review combined import hotfixes
2. Selective commit of import hotfixes (surgical staging)
3. Verify test matrix for import hotfixes
4. Close Phase 2 (P2C staging branch + P2G staging UAT)
5. S4A Import Batch / Idempotency / Recovery (planned — see S4A audit output)

---

## Source-of-Truth Rule

**Git/live environment wins over this document if they disagree.**

After a verified milestone, update this file with the verified values.
Do not use a resumed-session summary to infer current state.

## How To Resume

1. Read `AGENTS.md` (contains session recovery protocol)
2. Read this file
3. Run: `git status --short && git rev-parse HEAD && git rev-parse origin/main`
4. Compare live state against any session summary
5. Report `STALE SESSION CONTEXT` if they conflict
6. Continue only after confirming current repository state
