## 1. Source and registry

- [x] 1.1 Fetch and record exact Gemini 01.2 source SHA; merge cleanly on a separate integration branch.
- [x] 1.2 Reconcile 148 static IDs, paths, parent IDs, URLs and route counts against PR #170.
- [x] 1.3 Keep 55 added HR/Attendance/Payroll folders pending and inactive.
- [x] 1.4 Validate 13-domain coverage and report unimplemented dynamic routes as partial.

## 2. Runtime and security

- [x] 2.1 Preserve fail-closed category and ancestor ACL classification.
- [x] 2.2 Verify original Excel file readback before Confirm Import and batch-linked shift writes.
- [x] 2.3 Guard receipt/batch identity and concurrent confirmation in the migration contract.
- [x] 2.4 Verify Member/Leader scope denial, private backend reads and no provider redirect.
- [ ] 2.5 Verify effective Production Drive ACLs with the Production app identity.

## 3. Verification and release

- [x] 3.1 Run sequential migration, focused Import, runtime security and regression tests (local PGlite/handler and regression evidence; PostgreSQL-server-dependent tests remain skipped where localhost:5432 is unavailable).
- [ ] 3.2 Run full ESLint, TypeScript and production build.
- [ ] 3.3 Validate project memory on the exact integration branch.
- [x] 3.4 Keep Production NO-GO and do not apply remote migrations or deploy.
