-- RC1.7A: Actual Staffing Audit Trail & Overlap Index (STAGED ONLY)
-- PREREQUISITES: public.workforce_actual_segments, private.capture_audit_row_change()
-- STRICT NOTICE: DO NOT AUTO-APPLY TO PRODUCTION WITHOUT EXPLICIT PERMISSION.
-- TARGET ENVIRONMENT: LOCAL / STAGING ONLY.

-- 1. Attach persistent audit log capture trigger to workforce_actual_segments
-- Any insert, update (decision/review), or deletion generates an immutable row in public.audit_logs
drop trigger if exists audit_workforce_actual_segments_change on public.workforce_actual_segments;
create trigger audit_workforce_actual_segments_change
  after insert or update or delete on public.workforce_actual_segments
  for each row execute function private.capture_audit_row_change();

-- 2. Fast concurrency index for cross-shift staff overlap detection
-- Accelerates [actual_start_at, actual_end_at) interval queries for Assistant & Host split shifts
create index if not exists workforce_actual_staff_active_overlap
  on public.workforce_actual_segments (staff_id, actual_start_at, actual_end_at)
  where event_kind = 'worked' and review_status = 'approved';

comment on trigger audit_workforce_actual_segments_change on public.workforce_actual_segments is
  'RC1.7A: Audits all Actual Staffing segment lifecycle events (draft submission, review approval/rejection) into public.audit_logs';
