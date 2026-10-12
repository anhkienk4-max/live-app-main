## Why
Payroll managers cannot discover periods or approved rates without known IDs.
C06 blocks Gemini integration; browser clients must not query privileged tables.

## What Changes
- Extend existing Admin-only GET Payroll with list_periods and list_rates actions.
- Strict filters, deterministic ordering, exact counts and bounded page/page_size.
- Reject incomplete reads; distinguish staff-specific rates from role defaults.
- Preserve existing period GET/CSV and every RC1.6B mutation/audit rule.

## Boundaries
Read-only backend changes, no UI, migration, new role, cloud write or deployment.
Isolated PostgreSQL regression execution is test-only; no live payroll evidence.
