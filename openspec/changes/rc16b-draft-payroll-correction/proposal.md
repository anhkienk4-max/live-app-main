## Why
Draft payroll has no audited correction/void API. Direct line updates have no
revision or audit, and the existing line trigger omits DELETE protection.

## What Changes
- Add Admin-only correct_line and void_line actions to the existing Payroll API.
- Use a transactional PostgreSQL RPC with expected line version, actor-scoped
  request UUID, immutable snapshots, and independent VND validation.
- Preserve voided evidence and global segment uniqueness; omit voided lines
  from payment CSV and reject review of periods containing only voided lines.
- Block payroll reviewers who corrected or voided lines in that period.

## Boundaries
Additive migration only, isolated PostgreSQL 16 tests. No Gemini UI, Production
DDL/data/deployment, new Finance role, reissue, unvoid, or payroll policy changes.
