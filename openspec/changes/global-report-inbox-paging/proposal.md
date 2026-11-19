# Server-paged Reports Inbox

## Why

The Reports Inbox fetches only the newest 30 reportable shifts and applies its filters and pagination in the browser. Eligible older work is therefore unreachable.

## Scope

Add a bounded, authenticated, caller-RLS `report_queue` page query that filters eligible obligations before counting and paging. Preserve current report lifecycle rules and keep the UI's page size bounded. Do not change report submission, review, or confirmation behavior.

## Acceptance

- Historical eligible shifts remain reachable on later pages.
- Only active, reportable, non-deleted, non-archived shifts with a non-final report state appear.
- Admin/Leader retain their existing scope; Members see directly assigned or approved/manually assigned shifts, and their own submitted report only when existing shift RLS still exposes the shift.
- Open-registration and pending-only shifts do not enter a Member queue.
- Search, date, master-data, staffing-role and report-state filters apply before pagination.
- The query is read-only, SECURITY INVOKER, and grants execution only to authenticated users.
- Synthetic PostgreSQL 16/17 tests exercise page boundaries and authorization.
