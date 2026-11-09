# Design

`shift_staffing_segments` stores planned time windows and per-role capacity. `shift_registrations.staffing_segment_id` is nullable for backward compatibility. Legacy registration RPCs continue to handle unsegmented shifts; the new registration RPC delegates actor, role eligibility, and parent-shift conflict checks to existing private helpers and stores the selected segment. A row trigger serializes capacity checks by locking the segment row.

Schedule import passes the parsed segment array into a wrapper RPC which calls the existing `create_shift` and persists segments in the same transaction. Segment replacement is idempotent by `(shift_id, segment_index)` and refuses to rewrite definitions already referenced by registrations.

Attendance check-in/out remains an immutable event journal. Authorized reviewers create draft `workforce_actual_segments` using verified event timestamps; separate reviewer approval and payroll draft calculation remain required. No attendance event is automatically treated as approved minutes.
