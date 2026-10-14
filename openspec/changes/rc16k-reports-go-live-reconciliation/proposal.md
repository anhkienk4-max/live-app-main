# Reports Production baseline reconciliation

Scope authorized by the RC1.6K + UX-W2 Mốc A execution request: reconcile current main into PR #30, prepare a forward-only SQL delta, correct Reports target context and add runtime security/race regressions. This does not authorize a Production release, migration execution, secret change or feature activation.

## Contracts

- `my_shifts` without `reportCandidates` keeps active registration semantics. Role/status filters continue to apply to the same registration row.
- The Reports picker opts into `reportCandidates=true`, adding direct Host/Support/Technical assignment and the actor's own active report. Extras do not bypass role or registration-status filters.
- A Member who submitted an active report can read that report's active shift. Other unrelated shifts and deleted/archived shifts remain inaccessible. Existing Admin/Leader permissions, table policies and function grants stay intact.
- Picker, deep-link and report-list modal entry paths load exact target registrations and shift/report context. Account, selection, filter/page changes and picker/modal closure invalidate pending targets.
- Reports summaries cover the entire RLS-visible filtered set, preserve nullable metrics and search shift titles.

## Release gates

Forward rehearsal must replay captured Production function definitions, preserve ACL/owners/search_path/RLS, exercise rollback and repeat application, and execute runtime role/pagination/aggregate assertions on isolated PostgreSQL. Mounted browser tests use local fixtures and do not qualify as authenticated UAT.

Exact-final-head CI, approved authenticated Admin/Leader/Member UAT, physical Drive/OneDrive UAT and an approved targeted migration/restore procedure remain necessary before GO. Payroll and Workforce remain OFF.
