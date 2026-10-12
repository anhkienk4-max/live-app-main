# RC1.6H owner decision — 2026-10-12

Context: C/F/G prepared Staging reconciliation and isolated UAT. The owner
explicitly chose direct Production release and cancelled continued G work.

Decision: Staging/Preview deployment is no longer a release prerequisite.
Retain disposable PostgreSQL16/17 and Node22/24 validation, migration rehearsal,
backup/recovery, exact candidate identity and release verification.

Consequences: exclude both Staging-only reconciliation SQL files from the
Production Payroll manifest. Preserve their history and regression tests.
Do not close old C02/C03 as passed; replace the critical path with H Production
identity/schema/approval gates. All flags default OFF. UI source remains pending
Antigravity owner approval; do not merge active worktrees.

This decision does not authorize cloud mutations, deployment, merge, env changes,
fixture seeding or reviewer provisioning. Go-live remains NO and UAT not verified.
Independent review, Admin-only salary, HR policies and terminal void constraints
are unchanged. No Finance role or policy was invented.
