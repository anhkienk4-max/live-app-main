# RC19 ATT-01 feature-off release gate

ATT-01 #94 = DEFERRED / FEATURE OFF / NOT INCLUDED

## Source candidate

- Audited RC19 reference: `1b96f38a17768e96b92f23056efba4b61cc76f84`.
- Core integration parent: `d3f09b1f7cfd3224c2464e430d67f9107ce048fa` (PR #134 head, stacked on RC19 Wave 1 PR #125).
- The feature-off patch is a single child commit of this Core integration parent.
- Production alias: `ops5729.top`.
- Observed active Production deployment: `dpl_EDJnc6158sDV6gyHq5jfAMZE9rMZ` (READY; Vercel source `cli`).
- Production source SHA: NOT VERIFIED; deployment metadata has no Git SHA.
- Effective `FEATURE_ATTENDANCE_IMPORT`: NOT VERIFIED. A missing/unavailable variable is not accepted as proof of OFF.
- Rollback reference: `dpl_EDJnc6158sDV6gyHq5jfAMZE9rMZ` is only the observed alias target; rollback eligibility and access are NOT VERIFIED.

## Source contract

- `FEATURE_ATTENDANCE_IMPORT` defaults OFF.
- GET and POST return 404 before authentication, request parsing, or database access while OFF.
- Admin/Leader visibility is controlled by an authenticated server capability; Member does not receive it.
- Calendar, Staffing, self-attendance, Actual Staffing, and Payroll gates remain independent.

## Verification and release status

- Synthetic feature-off and role-capability regression is included in the final test manifest.
- Existing ATT-01 business-flow/auth integration remains listed for explicit flag-ON test-only verification.
- Exact candidate CI/runtime tests: NOT RUN; candidate commit is unreferenced.
- Production flag/UI state: NOT VERIFIED.
- Core authenticated UAT: NOT RUN.
- Backup/restore and rollback rehearsal: NOT VERIFIED.
- Release decision: HOLD.
