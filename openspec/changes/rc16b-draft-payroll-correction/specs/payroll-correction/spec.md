## ADDED Requirements
### Requirement: Atomic Draft correction
An active Admin SHALL correct only payable/OT minutes and an approved adjustment
with its reason, in a Draft period. A separate correction reason, expected line
version and request UUID SHALL be required. Server and PostgreSQL SHALL compute
integer VND independently using immutable evidence and rate snapshots.

#### Scenario: Valid correction
- **WHEN** the expected version matches an active Draft line
- **THEN** the line version SHALL increment once and an append-only audit SHALL
  contain actor, timestamp, period, line, action, reason, revision and before/after.

#### Scenario: Concurrent correction or review
- **WHEN** another correction or period transition wins the lock first
- **THEN** a stale version or non-Draft correction SHALL fail with HTTP 409 and
  no line/audit partial write.

### Requirement: Idempotent retries
The same actor and request UUID with the same payload SHALL replay the original
snapshot and audit without another mutation, even after review or void. UUID
reuse with a different payload SHALL fail with HTTP 409. Different requests
targeting the same version SHALL allow exactly one successful mutation.

### Requirement: Evidence-preserving void
Void SHALL be one-way and Draft-only, preserving all monetary/evidence fields
and the global unique segment constraint. A voided line SHALL be excluded from
payment CSV and payable totals. A period with no active lines SHALL not enter
Review. Reissue/unvoid is outside this release.

### Requirement: Salary isolation and independent review
Leader, Member and anonymous callers SHALL never access salary or correction
history. RPC access SHALL be service-role-only and SHALL validate the supplied
business actor as an active Admin. Direct unaudited updates and deletion SHALL
be rejected. Audit SHALL remain append-only. The period creator and any line
correction/void author SHALL not review that period; confirmation SHALL remain
independent of review. No salary permission SHALL be granted to Leader.
