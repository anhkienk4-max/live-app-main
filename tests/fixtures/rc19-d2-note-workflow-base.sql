-- Minimal compile harness only. These helper stubs are NOT an authorization acceptance environment.
BEGIN;
CREATE SCHEMA private;
CREATE TABLE public.business_users (
  id text PRIMARY KEY, status text NOT NULL, account_status text NOT NULL,
  archived_at timestamptz, deleted_at timestamptz, full_name text, role text
);
CREATE TABLE public.shifts (
  id text PRIMARY KEY, date date NOT NULL, brand_id text, host_id text,
  support_id text, technical_id text, deleted_at timestamptz, archived_at timestamptz
);
CREATE TABLE public.shift_staffing_segments (
  id text PRIMARY KEY, shift_id text NOT NULL REFERENCES public.shifts(id)
);
CREATE TABLE public.shift_registrations (
  id text PRIMARY KEY, shift_id text NOT NULL REFERENCES public.shifts(id),
  user_id text NOT NULL REFERENCES public.business_users(id), operational_role text,
  staffing_segment_id text REFERENCES public.shift_staffing_segments(id)
);
CREATE TABLE public.rc19_shift_assignment_replacements (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE private.rc19_staff_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shift_id text NOT NULL REFERENCES public.shifts(id),
  staffing_segment_id text REFERENCES public.shift_staffing_segments(id),
  original_registration_id text NOT NULL REFERENCES public.shift_registrations(id),
  original_staff_id text NOT NULL REFERENCES public.business_users(id),
  replacement_registration_id text REFERENCES public.shift_registrations(id),
  replacement_staff_id text REFERENCES public.business_users(id),
  replacement_receipt_id uuid REFERENCES public.rc19_shift_assignment_replacements(id),
  operational_role text NOT NULL, business_date date NOT NULL, incident_type text NOT NULL,
  review_state text NOT NULL DEFAULT 'pending', effective_at timestamptz, reason text NOT NULL,
  evidence_reference_id text, verified_late_minutes integer,
  created_by text NOT NULL REFERENCES public.business_users(id), version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.shift_operational_notes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  shift_id text NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  business_date date NOT NULL, date date NOT NULL, category text NOT NULL,
  note text NOT NULL, author_id text NOT NULL REFERENCES public.business_users(id),
  author_name text, author_role text, actual_event_time timestamptz NOT NULL DEFAULT now(),
  event_time timestamptz NOT NULL DEFAULT now(), affected_role text,
  affected_user_id text REFERENCES public.business_users(id), version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE FUNCTION private.require_shift_actor(boolean) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT current_setting('d2.test_actor', true) $$;
CREATE FUNCTION private.current_business_user_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT current_setting('d2.test_actor', true) $$;
CREATE FUNCTION private.current_system_permission() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT current_setting('d2.test_permission', true) $$;
CREATE FUNCTION private.current_business_user_is_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.business_users u WHERE u.id=private.current_business_user_id()
    AND u.status='active' AND u.account_status='active' AND u.archived_at IS NULL AND u.deleted_at IS NULL
) $$;
CREATE FUNCTION private.can_write_shift_operational_notes(text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT private.current_business_user_is_active() AND EXISTS (
  SELECT 1 FROM public.shifts s WHERE s.id=$1 AND s.deleted_at IS NULL AND s.archived_at IS NULL
) $$;
CREATE FUNCTION private.can_read_shift_operational_notes(text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT private.can_write_shift_operational_notes($1) $$;
COMMIT;
