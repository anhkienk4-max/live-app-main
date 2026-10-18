# ADA OPS one-shot release candidate: technical manifest

Status: **NO-GO**. This is a source integration manifest, not authorization to write Production. The final Git SHA must be filled from the committed release branch and then verified against the deployed SHA. PR #30 stays Draft; no main merge or Production deploy has occurred.

## Baselines and scope

- Source: `origin/main` `4fe77e58837910db08002b50de56c89fcf46aab2` (RC1.7A) merged with integration `084b69391bb944c34d381884e10a80a10dca5798` on `release/one-shot-20261019`. The independent OCR worktree was copied without changing it.
- Production: Supabase `egdjnpmoasarrttvhgds`, PostgreSQL 17.6. Read-only catalog showed 68 ledger versions, including RC1.7A `20261017000000`. `private.can_read_report` and M2 are absent; `reports_active_select` still permits the P0 read exposure. Recheck immediately before any approved write.
- Authentication/RBAC, Calendar/Shift Management, Reports/Dashboard/OCR, Storage routes, Payroll, Workforce/Actual Staffing, and import/export are within the source audit. Payroll, Workforce performance, and other optional capabilities remain OFF by default; enabling each requires its own business UAT decision within the one-shot window. No future-roadmap item is implicitly included.
- Prior W10 executor, W11 timeout, W12 standalone M2, W13 catalog, and W14 synthetic ledger proofs remain historical evidence for their exact SHAs. They do not prove the new combined release or OCR migration.

## Migration reconciliation

| Version | Source file SHA-256 | Production ledger | Release handling |
| --- | --- | --- | --- |
| `20260919074349` RC12 report file provider | `A5334A603EC1C58528AEDC060DBCC1B4CB0402BC9C8E0ED8B2771C32DF88C017` | Absent | Catalog objects exist; compare exact definitions, ACL, and dependencies. Do not replay or mark applied without proof. |
| `20260924000000` RC13A execution/storage routes | `4E7812429655D776B7D98A3BE7296284DE26907A8B3A00DEA1C0121AA3A11857` | Absent | Catalog objects exist; same reconciliation requirement. |
| `20261012171503` RC16K bounded lists | `5A8FB9165B4132B9508EE49D74CE7027933DBF2B6AC3F4BDBBBC34940071541E` | Source filename version absent | Production has remote-only `20261014173408` named `20261012171503_rc16k_bounded_shift_lists`; compare actual SQL, owner, grants and behavior. Never replay solely because the local version is absent from the ledger. |
| `20261014190429` Reports forward reconciliation (M1) | `40572A4684F7315C26E25DEF3DB1C971EEF1F4BF49DE8851DF5DBE393E040CBC` | Absent | Candidate apply after exact baseline drift check. Includes Reports RPC summary/search and shift discoverability; atomic external transaction. |
| `20261015154159` Member Report read RLS (M2) | `698DB467BB1BCD1B549DCE94CB51704BB4771C814CF8AB6E23D3439564622BA7` | Absent | Candidate apply after M1 in one-shot release. Preserves the original internally defined transaction. This closes the P0 report read path only after postconditions pass. |
| `20261017000000` RC1.7A | Existing main migration | Applied | Preserve its audit objects and behavior; never replay. |
| `20261019000000` Live dashboard snapshot binding | `F6916FA4BA202B3531D9209CE613F52F9EB064F06DE156DC05D7E5E2B2E6FDD3` | Absent | Candidate only after M2; needs PostgreSQL 17.6 isolated rehearsal and authenticated UAT before approval. Atomic external transaction. |

`20261014233900_rc16k_reports_summary.sql` was removed from this branch because its Reports RPC definition duplicates M1; it is not in the release package and is absent from Production ledger. No migration is marked applied without SQL execution and verified postconditions. `supabase db push` is prohibited while the historical drift remains; record each executed version only after its SQL commits and assertions pass, using the already rehearsed CLI ledger workflow. Recheck the history comparison before every step and stop on unexpected versions.

## Required integrated validation

1. Run source checks and PostgreSQL 17.6 rehearsal against a **Production-equivalent** schema, preserving owner/ACL/RLS. Verify M1, M2, RC1.7A compatibility and live snapshot migration in sequence. The current PGlite test is synthetic PostgreSQL 17.5 evidence, not equivalent restore proof.
2. Run focused hosted browser E2E for OCR upload/review, direct shift binding, snapshot persistence/reload, snapshot selection into Reports, report confirmation, cross-shift denial, responsive desktop/mobile, and stale identity changes. Current real TikTok fixture is 12/18 correct (3 confirmed, 13 review, 2 missing); the 18/18 target is open.
3. Run one integrated final CI matrix on the final Git SHA. Previously green CI on `084b693` and W10–W14 is not final-SHA proof.
4. Run isolated authenticated Admin/Leader/Member UAT for Reports create/draft/review/confirm, RLS negative reads, revisions/images/RPC, Calendar registration/swap, Storage Google Drive/OneDrive physical I/O, Payroll and Workforce if enabled, search/filter/pagination/export over 100 records, 390/768/1440/1920px, and concurrent users. Record screenshots/traces without credentials or customer data.
5. Reconfirm Preview database project reference before any write UAT. The existing staging project contains operational data and is not a test-write target.

## Controlled Production window after separate Owner approval

1. Freeze and verify final Git SHA, migration hashes, Production project/database/TLS identity, current ledger/catalog, deployment target and feature flags. Confirm current encrypted backup and explicit recovery exception: V2 decrypt/TOC passed, actual restore did **not** pass, Storage objects 0/2, independent PFX recovery and full DR unverified.
2. Execute only the approved manifest SQL in order, using the W10 executor contract (`ON_ERROR_STOP`, separate transactions) and W11 effective session settings (`lock_timeout=5s`, `statement_timeout=30s`). Do not use blind `db push`; never skip an error or mark an unexecuted version applied.
3. After each commit, verify catalog/RLS/ACL/function owner/search_path and data invariants; then record that version in the migration ledger with the rehearsed, target-locked workflow. If M1 commits and M2 fails, stop application deployment, keep the current RLS state visible in incident communication, and use a reviewed forward correction. Never restore the weak SELECT policy after M2 commits.
4. Deploy exactly the frozen app SHA after database postconditions. Keep Payroll/Workforce flags OFF unless their authenticated UAT and owner decision are both recorded. Run read-only authenticated allow/deny smoke tests on Reports, images, revisions, list/search/deep links, and verify legitimate direct assignments, approved/manual registration and submitter. Then run separately approved write smoke tests. Monitor error rates, authorization failures, DB locks, provider I/O and business metrics.

**STOP** for catalog/ledger drift, hash mismatch, wrong target, ineffective timeout, transaction/ledger failure, RLS exposure, regression in legitimate access, missing UAT operator/session, provider route mismatch, or degraded recovery evidence beyond the accepted exception. No independent M2 hotfix, main merge, or Production write is authorized by this manifest.
