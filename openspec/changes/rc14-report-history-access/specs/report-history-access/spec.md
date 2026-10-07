## ADDED Requirements
### Requirement: Exact historical report target
Known-shift report links SHALL carry shiftId. Reports SHALL resolve that shift and its report through existing authenticated exact lookups, without requiring queue membership or expanding the recent-30 queue. Editable reports SHALL open their exact form; noneditable reports SHALL open detail; eligible assigned staff or reviewers MAY create a missing report for a reportable shift. Unavailable, deleted, archived, mismatched or unauthorized targets SHALL fail safely.

#### Scenario: Historical draft outside recent queue
- **WHEN** a Calendar action targets the September 14 shift outside the September 28–30 queue
- **THEN** the exact draft and September 14 shift SHALL open; no recent shift SHALL be substituted.

### Requirement: Explicit modal target and URL lifecycle
An explicit report/shift target SHALL never fall back to another shift or allow selection of another shift. Missing targets SHALL show a safe error and prevent persistence. Closing or successfully saving the target modal SHALL remove only shiftId through client navigation. Unrelated renders SHALL not repeat lookups or reopen a consumed target.
