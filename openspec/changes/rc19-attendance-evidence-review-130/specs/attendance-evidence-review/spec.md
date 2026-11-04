# Attendance evidence review

## Requirements
- Admin and Leader may review evidence only for shifts visible to their existing authorization scope.
- Decisions are approve, reject with reason, or request correction with reason; each decision is immutable and records reviewer, server timestamp, event ID, evidence ID, and sequence.
- A member may append new evidence only after a correction request for their own event. Existing evidence remains readable in its history and is never overwritten.
- Database authorization derives reviewer identity from the authenticated session, rejects self-review, and serializes concurrent decisions with an expected version.
- Approval does not change attendance event verification, Actual Staffing, work time, or Payroll.
- Provider binaries remain in Google Drive; Postgres stores metadata only.
