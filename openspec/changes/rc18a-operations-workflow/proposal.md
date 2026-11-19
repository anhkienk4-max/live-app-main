## Why

Shift lifecycle and list semantics already exist, but independent screens can
stay stale after another operator changes a shift. Shift history is not scoped
to a recent default, and Workforce does not apply the approved 10-minute
punctuality grace consistently. Actual staffing is supervisor-entered only;
there is no safe self-attendance or immutable correction workflow.

## What Changes

- Share authenticated shift-change invalidation across operational screens with
  reconnect and bounded polling fallback.
- Default Shifts to the latest 30 business-local dates, newest first, and expose
  Upcoming/All presets while retaining bounded server-side pagination.
- Apply the fixed 10-minute Workforce lateness grace independently from payroll
  payable minutes and overtime.
- Define the isolated backend contract for self check-in/out and reviewed actual
  time corrections before enabling user-facing writes.

## Boundaries

No Production database, flags, credentials or data are changed. No automatic
completion semantics are changed. No GPS coordinates are retained. Geofence
locations, privacy/consent wording, manual exception authority, PIN expiry and
attempt limits must be configured/approved before attendance endpoints can be
enabled. Existing approved actual segments remain immutable.
