-- RC1.7A: Actual Staffing Dedicated Audit Trail & Overlap Index ROLLBACK (DDL Down)
-- TARGET ENVIRONMENT: LOCAL / STAGING TEST FIXTURES ONLY.
-- DO NOT RUN ON PRODUCTION WITHOUT EXPLICIT AUTHORIZATION.

-- 1. Drop trigger from workforce_actual_segments
drop trigger if exists audit_workforce_actual_segments_change on public.workforce_actual_segments;

-- 2. Drop overlap index
drop index if exists public.workforce_actual_staff_active_overlap;

-- 3. Drop dedicated trigger function
drop function if exists private.capture_workforce_actual_audit();
