# RC19 Vercel CLI source-upload hygiene — Draft gate

## Why
On 2026-10-29 `ops5729.top` was still aliased to `dpl_5eqzn3dHR9pKnnna8MvBY2F7AnMX`. Its *depth-limited* Vercel source inventory exposed 84 file entries inside `.worktrees/rc19-pass-swap-93/`, one truncated SHA-1 and 612 missing-depth placeholders. This does not prove the runtime is compromised, but it prevents complete upload provenance.

## Patch boundaries
- `.vercelignore` protects future Vercel CLI source uploads against nested Git worktrees, local .env variants, screenshots/test reports, cached output and temporary files.
- `.gitignore` ensures nested worktrees are not accidentally staged or committed.
- No changes to application runtime, Supabase, production settings, flags or live alias.

## Verification before merging
1. Confirm `.vercelignore` is in the *actual Vercel project root* and CLI deploy uses that directory (not an outer folder or local worktree).
2. Execute `node scripts/assert-vercel-upload-hygiene.mjs` from repo root and confirm it passes.
3. Confirm `git check-ignore -v --no-index .worktrees/rc19-pass-swap-93/package.json` prints the `.gitignore` rule.
4. Prepare an isolated *Preview-only* CLI upload and re-query deployment source files. Zero `.worktrees/` and `.env*` paths must appear in the visible inventory. Obtain full source-upload manifest from CLI as independent evidence: Vercel's depth-limited source listing alone cannot certify completeness.
5. Re-run Next.js, role, RLS and functional Staging UAT gates as appropriate before using this config in a Production-target build.

**Decision: DRAFT. This patch is not yet validated against an isolated CLI Preview and does NOT authorize Production alias assignment.**

Official Vercel docs: https://vercel.com/docs/deployments/vercel-ignore
