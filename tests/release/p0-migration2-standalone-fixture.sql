\set ON_ERROR_STOP on

-- Minimal PostgreSQL 17 synthetic baseline for the exact pre-Migration-1
-- reports security contract. This fixture contains no Production data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE SCHEMA auth;
CREATE SCHEMA private;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, private, public TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.business_users (
  id text PRIMARY KEY,
  auth_user_id uuid UNIQUE NOT NULL,
  status text NOT NULL,
  account_status text NOT NULL,
  archived_at timestamptz,
  deleted_at timestamptz,
  system_permission text NOT NULL
);
CREATE TABLE public.shifts (
  id text PRIMARY KEY,
  host_id text,
  support_id text,
  technical_id text,
  status text NOT NULL DEFAULT 'scheduled',
  registration_locked boolean NOT NULL DEFAULT false,
  end_at timestamptz NOT NULL DEFAULT now() + interval '1 day',
  deleted_at timestamptz,
  archived_at timestamptz
);
CREATE TABLE public.shift_registrations (
  id text PRIMARY KEY,
  shift_id text NOT NULL REFERENCES public.shifts(id),
  user_id text NOT NULL REFERENCES public.business_users(id),
  status text NOT NULL
);
CREATE TABLE public.reports (
  id text PRIMARY KEY,
  shift_id text NOT NULL REFERENCES public.shifts(id),
  submitted_by text NOT NULL REFERENCES public.business_users(id),
  status text NOT NULL DEFAULT 'draft',
  metrics_confirmed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  archived_at timestamptz
);
CREATE TABLE public.report_revisions (
  report_id text NOT NULL REFERENCES public.reports(id),
  version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  status text NOT NULL,
  reason text,
  event text,
  metrics jsonb,
  ocr_review jsonb,
  final_recap jsonb,
  image_references text[],
  PRIMARY KEY (report_id, version)
);
CREATE TABLE public.report_images (
  id text PRIMARY KEY,
  report_id text NOT NULL REFERENCES public.reports(id),
  deleted_at timestamptz
);
CREATE TABLE public.live_report_images (
  id text PRIMARY KEY,
  report_id text REFERENCES public.reports(id)
);

INSERT INTO public.business_users VALUES
  ('m_unrelated', '00000000-0000-0000-0000-000000000001', 'active', 'active', null, null, 'member'),
  ('m_open',      '00000000-0000-0000-0000-000000000002', 'active', 'active', null, null, 'member'),
  ('m_pending',   '00000000-0000-0000-0000-000000000003', 'active', 'active', null, null, 'member'),
  ('m_host',      '00000000-0000-0000-0000-000000000004', 'active', 'active', null, null, 'member'),
  ('m_support',   '00000000-0000-0000-0000-000000000005', 'active', 'active', null, null, 'member'),
  ('m_technical', '00000000-0000-0000-0000-000000000006', 'active', 'active', null, null, 'member'),
  ('m_approved',  '00000000-0000-0000-0000-000000000007', 'active', 'active', null, null, 'member'),
  ('m_manual',    '00000000-0000-0000-0000-000000000008', 'active', 'active', null, null, 'member'),
  ('m_submitter', '00000000-0000-0000-0000-000000000009', 'active', 'active', null, null, 'member'),
  ('m_inactive',  '00000000-0000-0000-0000-000000000010', 'inactive', 'active', null, null, 'member'),
  ('u_admin',     '00000000-0000-0000-0000-000000000011', 'active', 'active', null, null, 'admin'),
  ('u_leader',    '00000000-0000-0000-0000-000000000012', 'active', 'active', null, null, 'leader');

INSERT INTO public.shifts (id, host_id) VALUES ('s_unrelated', null), ('s_open', null);
INSERT INTO public.shifts (id, registration_locked) VALUES ('s_pending', true);
INSERT INTO public.shifts (id, host_id) VALUES ('s_host', 'm_host');
INSERT INTO public.shifts (id, support_id) VALUES ('s_support', 'm_support');
INSERT INTO public.shifts (id, technical_id) VALUES ('s_technical', 'm_technical');
INSERT INTO public.shifts (id) VALUES ('s_approved'), ('s_manual'), ('s_submitter'), ('s_inactive');
INSERT INTO public.shifts (id, host_id, archived_at) VALUES ('s_archived', 'm_host', now());
INSERT INTO public.shifts (id, host_id, deleted_at) VALUES ('s_deleted', 'm_host', now());

INSERT INTO public.shift_registrations VALUES
  ('reg_pending', 's_pending', 'm_pending', 'pending'),
  ('reg_approved', 's_approved', 'm_approved', 'approved'),
  ('reg_manual', 's_manual', 'm_manual', 'manually_assigned');

INSERT INTO public.reports (id, shift_id, submitted_by, archived_at, deleted_at) VALUES
  ('r_unrelated', 's_unrelated', 'm_host', null, null),
  ('r_open', 's_open', 'm_host', null, null),
  ('r_pending', 's_pending', 'm_host', null, null),
  ('r_host', 's_host', 'm_host', null, null),
  ('r_support', 's_support', 'm_support', null, null),
  ('r_technical', 's_technical', 'm_technical', null, null),
  ('r_approved', 's_approved', 'm_approved', null, null),
  ('r_manual', 's_manual', 'm_manual', null, null),
  ('r_submitter', 's_submitter', 'm_submitter', null, null),
  ('r_inactive', 's_inactive', 'm_inactive', null, null),
  ('r_archived_shift', 's_archived', 'm_host', null, null),
  ('r_deleted_shift', 's_deleted', 'm_host', null, null),
  ('r_archived', 's_host', 'm_host', now(), null),
  ('r_deleted', 's_host', 'm_host', null, now());
INSERT INTO public.report_revisions (report_id, version, created_by, status)
SELECT id, 1, submitted_by, status FROM public.reports;
INSERT INTO public.report_images (id, report_id)
SELECT 'img_' || id, id FROM public.reports;
INSERT INTO public.live_report_images (id, report_id)
SELECT 'live_' || id, id FROM public.reports;
INSERT INTO public.live_report_images VALUES ('live_unbound', null);

CREATE FUNCTION private.current_business_user_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT b.id FROM public.business_users b WHERE b.auth_user_id = (SELECT auth.uid())
  AND b.status = 'active' AND b.account_status = 'active'
  AND b.archived_at IS NULL AND b.deleted_at IS NULL LIMIT 1 $$;
CREATE FUNCTION private.current_business_user_is_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.business_users b WHERE b.auth_user_id = (SELECT auth.uid())
  AND b.status = 'active' AND b.account_status = 'active'
  AND b.archived_at IS NULL AND b.deleted_at IS NULL) $$;
CREATE FUNCTION private.current_system_permission() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT b.system_permission FROM public.business_users b WHERE b.auth_user_id = (SELECT auth.uid())
  AND b.status = 'active' AND b.account_status = 'active'
  AND b.archived_at IS NULL AND b.deleted_at IS NULL LIMIT 1 $$;
CREATE FUNCTION private.require_report_actor(p_leader_required boolean) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$ DECLARE actor text; permission text; BEGIN
  actor := private.current_business_user_id();
  permission := private.current_system_permission();
  IF actor IS NULL OR (p_leader_required AND permission NOT IN ('leader', 'admin')) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;
  RETURN actor;
END $$;

-- Baseline helper intentionally has broader shift-discovery semantics than
-- report access; Migration 2 must narrow reports without replacing it.
CREATE FUNCTION private.can_read_shift(p_shift_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT coalesce((SELECT
  CASE WHEN (SELECT private.current_system_permission()) = 'admin' THEN true
       WHEN s.deleted_at IS NOT NULL OR s.archived_at IS NOT NULL THEN false
       WHEN (SELECT private.current_system_permission()) = 'leader' THEN true
       ELSE ((s.status = 'scheduled' AND NOT s.registration_locked AND s.end_at > statement_timestamp())
         OR (SELECT private.current_business_user_id()) IN (s.host_id, s.support_id, s.technical_id)
         OR EXISTS (SELECT 1 FROM public.shift_registrations r WHERE r.shift_id = s.id
           AND r.user_id = (SELECT private.current_business_user_id())
           AND r.status IN ('pending', 'approved', 'manually_assigned')))
  END FROM public.shifts s WHERE s.id = p_shift_id
    AND (SELECT private.current_business_user_is_active())), false) $$;

CREATE FUNCTION public.get_report_revisions(p_report_id text)
RETURNS TABLE (version integer, created_at timestamptz, created_by text, status text,
  reason text, event text, metrics jsonb, ocr_review jsonb, final_recap jsonb, image_references text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE actor_id text; target_report public.reports; BEGIN
  actor_id := private.require_report_actor(false);
  SELECT * INTO target_report FROM public.reports WHERE id = p_report_id;
  IF target_report.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REPORT_NOT_FOUND'; END IF;
  IF (target_report.deleted_at IS NOT NULL OR target_report.archived_at IS NOT NULL)
     AND private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;
  RETURN QUERY SELECT r.version, r.created_at, r.created_by, r.status, r.reason, r.event,
    r.metrics, r.ocr_review, r.final_recap, r.image_references
    FROM public.report_revisions r WHERE r.report_id = p_report_id ORDER BY r.version;
END $$;

-- Synthetic pre-existing bounded list RPC. Migration 2 must leave its body intact.
CREATE FUNCTION public.get_report_list_page(p_page integer, p_page_size integer, p_filters jsonb, p_summary boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT jsonb_build_object('rows', coalesce(jsonb_agg(jsonb_build_object('id', q.id) ORDER BY q.id), '[]'::jsonb),
  'total', count(*)) FROM (SELECT r.id FROM public.reports r
    WHERE r.deleted_at IS NULL AND r.archived_at IS NULL
      AND (coalesce(p_filters->>'search', '') = '' OR r.id ILIKE '%' || (p_filters->>'search') || '%')
    ORDER BY r.id LIMIT p_page_size OFFSET ((p_page - 1) * p_page_size)) q $$;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_report_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_active_select ON public.reports FOR SELECT TO authenticated
  USING ((SELECT private.current_business_user_is_active()) AND deleted_at IS NULL AND archived_at IS NULL);
CREATE POLICY reports_archived_select ON public.reports FOR SELECT TO authenticated
  USING ((SELECT private.current_business_user_is_active()) AND (deleted_at IS NOT NULL OR archived_at IS NOT NULL)
    AND (SELECT private.current_system_permission()) = 'admin');
CREATE POLICY report_revisions_read ON public.report_revisions FOR SELECT TO authenticated
  USING ((SELECT private.current_business_user_is_active()) AND EXISTS (
    SELECT 1 FROM public.reports report WHERE report.id = report_revisions.report_id
      AND ((report.deleted_at IS NULL AND report.archived_at IS NULL)
        OR (SELECT private.current_system_permission()) = 'admin')));
CREATE POLICY report_images_read ON public.report_images FOR SELECT TO authenticated
  USING ((SELECT private.current_business_user_is_active()) AND EXISTS (
    SELECT 1 FROM public.reports report WHERE report.id = report_images.report_id
      AND ((report.deleted_at IS NULL AND report.archived_at IS NULL)
        OR (SELECT private.current_system_permission()) = 'admin')
      AND report_images.deleted_at IS NULL));
CREATE POLICY live_report_images_read ON public.live_report_images FOR SELECT TO authenticated
  USING ((SELECT private.current_business_user_is_active()) AND (
    report_id IS NULL OR EXISTS (SELECT 1 FROM public.reports report WHERE report.id = live_report_images.report_id
      AND ((report.deleted_at IS NULL AND report.archived_at IS NULL)
        OR (SELECT private.current_system_permission()) = 'admin'))));

GRANT SELECT ON public.reports, public.report_revisions, public.report_images, public.live_report_images TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_business_user_id(), private.current_business_user_is_active(),
  private.current_system_permission(), private.require_report_actor(boolean), private.can_read_shift(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_revisions(text), public.get_report_list_page(integer, integer, jsonb, boolean)
  TO authenticated;

-- State expected before standalone Migration 2: report reads are too broad,
-- revisions/images are indirectly protected by reports RLS, and shift discovery
-- explicitly admits both open-registration and pending-application cases.
