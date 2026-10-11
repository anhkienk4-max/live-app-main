## ADDED Requirements

### Requirement: Admin-only discovery
GET /api/workforce/payroll SHALL accept action=list_periods or action=list_rates,
authenticate/authorize before any privileged read, and use Cache-Control no-store.
Anonymous SHALL receive 401 and Leader/Member 403; existing GET period/CSV remains.

### Requirement: Bounded complete pagination
Each action SHALL accept page 1..1000000 (default 1), page_size 1..100 (default 50),
return exact filtered total_count/total_pages/has_next/has_previous and array rows.
Unknown/duplicate query keys, malformed integers/dates/enums SHALL fail 400.
Rows SHALL sort deterministically with id ASC as unique final tie-breaker.
Missing count or truncated result SHALL fail 503, never masquerade as complete.
Out-of-range pages SHALL return empty arrays only after count verification.
Each request is a fresh database read, not a snapshot shared across page requests.

### Requirement: Period filters
Optional date_from/date_to SHALL select inclusive overlap with period boundaries;
status SHALL accept draft/reviewed/confirmed/payroll_ready/locked. Inverted ranges
SHALL fail 400. Ordering SHALL be period_start DESC, period_end DESC, revision DESC,
id ASC. The result SHALL contain period approval/lock identities without line data.

### Requirement: Approved rate filters
Optional staff_id SHALL select that staff exactly, role SHALL select operational
role, effective_date SHALL select effective_from <= date and null or >= date end.
scope SHALL distinguish staff_specific from role_default (staff_id null).
staff_id plus role_default SHALL fail 400. staff_id does not implicitly add defaults.
Only approved_by/approved_at nonnull rows SHALL be returned, including VND/hour,
OT basis points, approval identity/note and validity dates; no mutation is exposed.
Ordering SHALL be effective_from DESC, id ASC; rate selection rules stay unchanged.
