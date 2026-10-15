## ADDED Requirements

### Requirement: Bounded identity-safe Calendar
Calendar SHALL read only its viewed date range or server page, cache reference data by identity and permission, debounce search and reject aborted or stale responses. Inactive tabs SHALL make no operational reads. URL navigation SHALL restore view, date, filters and page. Refresh SHALL retain the toolbar and show regional loading state.

#### Scenario: Account change during an in-flight read
WHEN identity changes THEN old data and dialogs are removed and old responses cannot populate the new workspace.

### Requirement: Dense and overnight schedules
Week SHALL show overlap counts with accessible paged details. Day SHALL localize dates and show overnight continuation without clipping important actions.

### Requirement: Actual evidence amendments
The system SHALL preserve original evidence and planned shifts. Amendments SHALL use version checks, independent review, append-only audit and idempotency. Payroll-referenced evidence SHALL be protected.

### Requirement: Authorized complete exports
One shift, selected shifts and all filtered shifts SHALL support all authorized fields or chosen fields. The server SHALL deny unauthorized columns before data reads and reject incomplete/changed collections. XLSX/CSV SHALL preserve Vietnamese and date/time text and neutralize spreadsheet formulas.
