BEGIN;
ALTER TABLE public.workforce_actual_segments
  ADD COLUMN assignment_id text REFERENCES public.shift_registrations(id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.workforce_actual_segments.assignment_id IS
  'Verified staffing assignment; NULL preserves historical actual-work records without a proven mapping.';
CREATE OR REPLACE FUNCTION private.rc19_actual_assignment_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_assignment public.shift_registrations%ROWTYPE; v_segment public.shift_staffing_segments%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFORCE_ASSIGNMENT_IMMUTABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shift_staffing_segments s WHERE s.shift_id=NEW.shift_id) THEN
    IF NEW.assignment_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFORCE_ASSIGNMENT_REQUIRED';
    END IF;
    SELECT * INTO v_assignment FROM public.shift_registrations WHERE id=NEW.assignment_id FOR SHARE;
    IF NOT FOUND OR v_assignment.shift_id<>NEW.shift_id OR v_assignment.user_id<>NEW.staff_id
      OR v_assignment.operational_role<>NEW.operational_role OR v_assignment.status NOT IN ('approved','manually_assigned')
      OR v_assignment.staffing_segment_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFORCE_ASSIGNMENT_INVALID';
    END IF;
    SELECT * INTO v_segment FROM public.shift_staffing_segments WHERE id=v_assignment.staffing_segment_id AND shift_id=NEW.shift_id FOR SHARE;
    IF NOT FOUND OR (NEW.event_kind='worked' AND (NEW.actual_start_at<v_segment.start_at OR NEW.actual_end_at>v_segment.end_at)) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFORCE_ASSIGNMENT_INTERVAL_INVALID';
    END IF;
  ELSIF NEW.assignment_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='WORKFORCE_ASSIGNMENT_INVALID';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.rc19_actual_assignment_integrity() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER rc19_actual_assignment_integrity BEFORE INSERT OR UPDATE ON public.workforce_actual_segments
  FOR EACH ROW EXECUTE FUNCTION private.rc19_actual_assignment_integrity();
create or replace function private.rc19_c515_required_payroll_evidence(p_segment_id text)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare
  v_segment public.workforce_actual_segments%rowtype;
  v_shift public.shifts%rowtype;
  v_report public.reports%rowtype;
  v_missing text[] := '{}';
  v_kind text;
  v_event public.self_attendance_events%rowtype;
  v_photo_request uuid;
  v_photo_revision integer;
  v_review public.self_attendance_photo_review_events%rowtype;
begin
  select * into v_segment from public.workforce_actual_segments where id=p_segment_id;
  if not found or v_segment.event_kind<>'worked' then return array['approved_worked_segment']; end if;
  select * into v_shift from public.shifts where id=v_segment.shift_id and deleted_at is null;
  if not found then return array['active_shift']; end if;

  select * into v_report from public.reports
    where shift_id=v_segment.shift_id and deleted_at is null and archived_at is null;
  if not found or v_report.status<>'confirmed' or not v_report.metrics_confirmed then
    v_missing:=array_append(v_missing,'final_report');
  end if;
  if not found or not exists (
    select 1 from public.live_report_images image
    where image.report_id=v_report.id and image.category='key_visual'
      and image.provider in ('google_drive','onedrive')
      and nullif(btrim(image.external_file_id),'') is not null
      and nullif(btrim(image.external_parent_id),'') is not null
      and image.checksum_sha256 ~ '^[a-f0-9]{64}$'
  ) then
    v_missing:=array_append(v_missing,'visibility_kv');
  end if;

  if v_segment.operational_role in ('host','support') then
    IF EXISTS (SELECT 1 FROM public.shift_staffing_segments s WHERE s.shift_id=v_segment.shift_id) THEN
      IF v_segment.assignment_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.shift_registrations r
        JOIN public.shift_staffing_segments s ON s.id=r.staffing_segment_id AND s.shift_id=r.shift_id
        WHERE r.id=v_segment.assignment_id AND r.shift_id=v_segment.shift_id
          AND r.user_id=v_segment.staff_id AND r.operational_role=v_segment.operational_role
          AND r.status IN ('approved','manually_assigned')
          AND v_segment.actual_start_at>=s.start_at AND v_segment.actual_end_at<=s.end_at
      ) THEN
        RETURN array_append(v_missing,'assignment_evidence_mapping_required');
      END IF;
    ELSIF v_segment.assignment_id IS NOT NULL THEN
      RETURN array_append(v_missing,'assignment_evidence_mapping_required');
    END IF;
    foreach v_kind in array array['check_in','check_out'] loop
      select * into v_event from public.self_attendance_events
       where shift_id=v_segment.shift_id and staff_id=v_segment.staff_id
         and operational_role=v_segment.operational_role and event_kind=v_kind
         and assignment_id is not distinct from v_segment.assignment_id;
      if not found then
        v_missing:=array_append(v_missing,v_kind||'_photo_review');
        continue;
      end if;
      select request_id into v_photo_request from public.self_attendance_photo_evidence
       where request_id=v_event.request_id and shift_id=v_segment.shift_id
         and staff_id=v_segment.staff_id and operational_role=v_segment.operational_role
         and assignment_id is not distinct from v_segment.assignment_id;
      if not found then
        v_missing:=array_append(v_missing,v_kind||'_photo_receipt');
        continue;
      end if;
      select revision,request_id into v_photo_revision,v_photo_request
        from public.self_attendance_photo_evidence_revisions
       where attendance_event_id=v_event.id order by revision desc limit 1;
      if not found then
        v_photo_revision:=1;
        v_photo_request:=v_event.request_id;
      end if;
      select * into v_review from public.self_attendance_photo_review_events
       where attendance_event_id=v_event.id order by version desc limit 1;
      if not found or v_review.decision<>'approved'
        or v_review.evidence_request_id<>v_photo_request
        or v_review.evidence_revision<>v_photo_revision then
        v_missing:=array_append(v_missing,v_kind||'_photo_review');
      end if;
    end loop;
  end if;
  return v_missing;
end;
$$;


COMMIT;
