# RC1.6L Production approval package — NOT APPROVED

Baseline: `4f03c0b881bcc77547e72a2d5c655b07690746d6`, remote main verified via GitHub. Isolated branch: `fix/rc16l-calendar-ux-worktime-export`.

Implementation covers bounded Calendar windows/pages, shared permission/identity reference cache, abort/latest-response protection, lazy reports and tabs, URL state, compact Day/overlap Week, actual date/time staff picker and append-only amendment workflow, and server-authorized configurable XLSX/CSV exports. Standard scheduled shifts are never edited by actual evidence. Payroll remains disabled; the Vercel Git deployment rule disables this branch.

Migration: see `migration-manifest.json`. It is forward-only and has not been applied to any Supabase environment. New active-evidence view is required before enabling actual staffing on an approved staging environment. Existing reviewed segment rows remain immutable. API, performance and payroll readers use active evidence; payroll-referenced segments cannot be amended.

| Gate | Local evidence | Release disposition |
|---|---|---|
| Relevant Node regressions | `evidence/node-focused.txt` | PASS; fixtures/contracts, not authenticated UAT |
| TypeScript | `evidence/typecheck.txt` | PASS on checked source |
| Full lint | `evidence/full-lint.txt` | PASS with existing warnings |
| Amendment database rehearsal | `evidence/actual-pglite.txt`; [CI 38625086482](https://github.com/anhkienk4-max/live-app-main/actions/runs/38625086482) | PG16/17 PASS on `711c1e2`, including concurrent CAS/idempotency; final SHA must rerun |
| Full regression runner | `evidence/full-regression.txt` | BLOCKED by process spawn EPERM locally |
| Full Node fallback/baseline comparison | `evidence/full-node-comparison.json` | 1590 PASS / 41 FAIL / 5 SKIP using no isolation; baseline has the same 41 failures; no candidate-only failure remains |
| Build | `evidence/build.txt`, `evidence/build-environment.txt` | BLOCKED; spawn EPERM and no local Supabase runtime configuration |
| Browser screenshots/waterfall | `evidence/playwright.txt`; Playwright CI artifacts | Local BLOCKED by spawn EPERM; authenticated UAT NOT_VERIFIED |
| Canonical memory validation | `evidence/memory-validation.txt` | BLOCKED by git spawn EPERM and baseline projection inconsistencies; canonical records not rewritten |
| CI | [Draft PR #31](https://github.com/anhkienk4-max/live-app-main/pull/31); `CI_EVIDENCE.md` | Initial SHA passed isolated Node/typecheck/lint/PG16/17 and two build workflows; Calendar browser fixture needed correction; final SHA must rerun |

Additional consumer regressions: 73 PASS / 1 infrastructure failure (process guard spawn EPERM), retained in `evidence/node-consumers.txt`. The full Node fallback is diagnostic evidence, not a replacement for the standard isolated runner.
Final compact-card/staffing and export consumers: 61/61 PASS (`evidence/node-final-consumers.txt`); final API/security checks: 34/34 PASS (`evidence/node-final-security.txt`).

Follow-up verification: 28 Calendar/field/cache/time regressions PASS; local Playwright dense overlap, overnight continuation and tab Back scroll restoration PASS after correcting the import-warning assertion and search-field parity. Browser process creation requires running outside the Windows sandbox. Canonical project memory is synchronized in a separate metadata-only commit after the source commit so the validator can verify its ancestor snapshot without a self-referencing SHA.

Operator sequence: inspect final diff and migration hashes; rehearse PG16/17 and restore/backup against an isolated baseline; run staging UAT from `UAT.md`; retain screenshots and performance traces; approve deployment and migration separately. Confirm served SHA and authenticated runtime after the approved release.

No merge, Production migration/data write, feature flag enablement or Vercel Production deployment is authorized by this package. Do not promote while any required gate is BLOCKED or NOT_VERIFIED.
