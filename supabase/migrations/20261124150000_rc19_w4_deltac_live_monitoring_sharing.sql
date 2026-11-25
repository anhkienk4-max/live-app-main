-- RC19 W4 Delta C: Live Monitoring persistent link editing (Support scope)
-- & authorized multi-account tab-sharing session coordination (#189).
-- Additive migration; preserves #51 OBS/MediaMTX tables & grants intact.

DO $$
BEGIN
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.business_users') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.rc19_leader_brand_scopes') IS NULL
    OR to_regclass('public.media_viewer_grants') IS NULL
    OR to_regprocedure('private.current_business_user_id()') IS NULL
    OR to_regprocedure('private.current_business_user_is_active()') IS NULL
    OR to_regprocedure('private.current_system_permission()') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.assert_expected_version(text,integer,integer)') IS NULL
    OR to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') IS NULL THEN
    RAISE EXCEPTION 'DELTAC_LIVE_DEPENDENCIES_MISSING: required shift/ACL dependencies not present';
  END IF;

  IF to_regclass('public.media_publish_sessions') IS NOT NULL
    OR to_regprocedure('public.update_shift_live_link(text,text,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'DELTAC_LIVE_UNEXPECTED_OBJECT: live sharing objects already exist';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_shift_live_media_path(p_shift_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT 'shift_'
    || coalesce(
      nullif(
        btrim(left(regexp_replace(lower(btrim(p_shift_id)), '[^a-z0-9_]+', '_', 'g'), 40), '_'),
        ''
      ),
      'room'
    )
    || '_'
    || substr(md5(p_shift_id), 1, 8);
$$;

REVOKE ALL ON FUNCTION private.resolve_shift_live_media_path(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.can_manage_shift_live_session(p_shift_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text := private.current_business_user_id();
  v_permission text := private.current_system_permission();
  v_shift record;
BEGIN
  IF v_actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RETURN false;
  END IF;

  SELECT id, brand_id, status, host_id, support_id, technical_id, deleted_at, archived_at
  INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id;

  IF NOT FOUND
    OR v_shift.deleted_at IS NOT NULL
    OR v_shift.archived_at IS NOT NULL
    OR v_shift.status NOT IN ('scheduled', 'preparing', 'live', 'paused') THEN
    RETURN false;
  END IF;

  IF v_permission = 'admin' THEN
    RETURN true;
  END IF;

  IF v_permission = 'leader' THEN
    RETURN coalesce(
      private.rc19_has_any_leader_brand_scope(v_shift.brand_id, ARRAY['shifts.manage']::text[])
      OR v_actor_id = v_shift.support_id
      OR v_actor_id = v_shift.host_id
      OR v_actor_id = v_shift.technical_id,
      false
    );
  END IF;

  IF v_permission = 'member' THEN
    RETURN coalesce(
      (
        v_actor_id = v_shift.support_id
        OR v_actor_id = v_shift.host_id
        OR v_actor_id = v_shift.technical_id
        OR EXISTS (
          SELECT 1
          FROM public.shift_registrations AS reg
          WHERE reg.shift_id = p_shift_id
            AND reg.user_id = v_actor_id
            AND reg.status IN ('approved', 'manually_assigned')
            AND reg.operational_role IN ('support', 'host', 'technical')
        )
      ),
      false
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.can_manage_shift_live_session(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_shift_live_session(text) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_view_shift_live_session(p_shift_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_actor_id text := private.current_business_user_id();
  v_permission text := private.current_system_permission();
  v_shift record;
BEGIN
  IF v_auth_uid IS NULL OR v_actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RETURN false;
  END IF;

  SELECT id, brand_id, status, host_id, support_id, technical_id, deleted_at, archived_at
  INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id;

  IF NOT FOUND
    OR v_shift.deleted_at IS NOT NULL
    OR v_shift.archived_at IS NOT NULL
    OR v_shift.status NOT IN ('scheduled', 'preparing', 'live', 'paused') THEN
    RETURN false;
  END IF;

  IF private.can_manage_shift_live_session(p_shift_id) THEN
    RETURN true;
  END IF;

  IF v_permission = 'leader'
    AND coalesce(
      private.rc19_has_any_leader_brand_scope(v_shift.brand_id, ARRAY['shifts.read', 'shifts.manage']::text[]),
      false
    ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.media_viewer_grants AS g
    WHERE g.auth_user_id = v_auth_uid
      AND g.shift_id = p_shift_id
      AND g.active = true
      AND statement_timestamp() >= g.valid_from
      AND statement_timestamp() < g.valid_until
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.can_view_shift_live_session(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_view_shift_live_session(text) TO authenticated;

CREATE TABLE public.media_publish_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id text NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  media_path text NOT NULL CHECK (media_path ~ '^[a-z][a-z0-9_]{0,63}$'),
  publisher_auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  publisher_business_user_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'superseded', 'ended_by_shift')),
  started_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  ended_at timestamptz NULL,
  ended_by_auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX media_publish_sessions_active_shift_idx
  ON public.media_publish_sessions (shift_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX media_publish_sessions_active_path_idx
  ON public.media_publish_sessions (media_path)
  WHERE status = 'active';

CREATE INDEX media_publish_sessions_shift_history_idx
  ON public.media_publish_sessions (shift_id, started_at DESC);

ALTER TABLE public.media_publish_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.media_publish_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.media_publish_sessions TO authenticated;

CREATE POLICY media_publish_sessions_select_authorized
  ON public.media_publish_sessions
  FOR SELECT TO authenticated
  USING (
    (SELECT private.can_view_shift_live_session(shift_id))
  );

-- Automatic lifecycle revocation: completing, cancelling, deleting, or archiving a shift
-- terminates active tab-sharing sessions and invalidates active viewer grants in one transaction.
CREATE OR REPLACE FUNCTION private.end_media_sessions_on_shift_termination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled')
    OR NEW.deleted_at IS NOT NULL
    OR NEW.archived_at IS NOT NULL THEN
    UPDATE public.media_publish_sessions
    SET status = 'ended_by_shift',
        ended_at = statement_timestamp()
    WHERE shift_id = NEW.id
      AND status = 'active';

    UPDATE public.media_viewer_grants
    SET active = false
    WHERE shift_id = NEW.id
      AND active = true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.end_media_sessions_on_shift_termination() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS shifts_end_active_media_publish_sessions ON public.shifts;
CREATE TRIGGER shifts_end_active_media_publish_sessions
  AFTER UPDATE OF status, deleted_at, archived_at ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION private.end_media_sessions_on_shift_termination();

-- Scoped live link persistence RPC for Admin, in-scope Leader, and assigned Support/Host/Tech.
CREATE OR REPLACE FUNCTION public.update_shift_live_link(
  p_shift_id text,
  p_live_link text,
  p_expected_version integer DEFAULT NULL
)
RETURNS public.shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text;
  v_shift public.shifts;
  v_updated public.shifts;
  v_clean_link text;
  v_host text;
BEGIN
  v_actor_id := private.require_shift_actor(false);

  SELECT *
  INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id
    AND deleted_at IS NULL
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;

  IF NOT coalesce(private.can_manage_shift_live_session(p_shift_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;

  PERFORM private.assert_expected_version('Shift', p_expected_version, v_shift.version);

  v_clean_link := nullif(btrim(coalesce(p_live_link, '')), '');

  IF v_clean_link IS NOT NULL THEN
    IF length(v_clean_link) > 2048
      OR v_clean_link ~ '[\u0000-\u001f\u007f\s]'
      OR v_clean_link !~ '^https://' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_LIVE_STREAM_LINK';
    END IF;

    v_host := lower(coalesce((regexp_match(v_clean_link, '^https://([^/?#\s]+)(?:[/?#]|$)'))[1], ''));
    IF v_host <> ALL (ARRAY[
      'tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com', 'live.tiktok.com',
      'shopee.vn', 'www.shopee.vn', 'live.shopee.vn', 's.shopee.vn',
      'shopee.com', 'www.shopee.com', 'live.shopee.com'
    ]::text[]) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_LIVE_STREAM_LINK';
    END IF;
  END IF;

  -- Trigger `shifts_bump_concurrency_version` increments version/updated_at and
  -- trigger `audit_shifts_change` records the before/after state into audit_logs.
  UPDATE public.shifts AS shift
  SET live_link = v_clean_link,
      updated_by = v_actor_id
  WHERE shift.id = p_shift_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_shift_live_link(text, text, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_shift_live_link(text, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_shift_media_publish_session(
  p_shift_id text,
  p_force_handover boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_actor_id text := private.require_shift_actor(false);
  v_shift public.shifts;
  v_existing public.media_publish_sessions;
  v_created public.media_publish_sessions;
  v_media_path text;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT *
  INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id
    AND deleted_at IS NULL
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;

  IF NOT coalesce(private.can_manage_shift_live_session(p_shift_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.media_publish_sessions
  WHERE shift_id = p_shift_id
    AND status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.publisher_auth_user_id <> v_auth_uid THEN
      IF NOT coalesce(p_force_handover, false) THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'DUPLICATE_ACTIVE_PUBLISHER';
      END IF;
      IF private.current_system_permission() = 'member' THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'HANDOVER_REQUIRES_MANAGER';
      END IF;
    END IF;

    UPDATE public.media_publish_sessions
    SET status = 'superseded',
        ended_at = statement_timestamp(),
        ended_by_auth_user_id = v_auth_uid
    WHERE id = v_existing.id;
  END IF;

  v_media_path := private.resolve_shift_live_media_path(p_shift_id);

  INSERT INTO public.media_publish_sessions (
    shift_id,
    media_path,
    publisher_auth_user_id,
    publisher_business_user_id,
    status
  ) VALUES (
    p_shift_id,
    v_media_path,
    v_auth_uid,
    v_actor_id,
    'active'
  )
  RETURNING * INTO v_created;

  INSERT INTO public.media_viewer_grants (auth_user_id, shift_id, valid_from, valid_until, active)
  VALUES (
    v_auth_uid,
    p_shift_id,
    statement_timestamp(),
    greatest(statement_timestamp() + interval '1 hour', coalesce(v_shift.end_at, statement_timestamp()) + interval '15 minutes'),
    true
  )
  ON CONFLICT (auth_user_id, shift_id) DO UPDATE
  SET valid_from = EXCLUDED.valid_from,
      valid_until = EXCLUDED.valid_until,
      active = true;

  RETURN jsonb_build_object(
    'session_id', v_created.id,
    'shift_id', v_created.shift_id,
    'media_path', v_created.media_path,
    'publisher_auth_user_id', v_created.publisher_auth_user_id,
    'publisher_business_user_id', v_created.publisher_business_user_id,
    'started_at', v_created.started_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_shift_media_publish_session(text, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_shift_media_publish_session(text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.stop_shift_media_publish_session(
  p_shift_id text,
  p_session_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_existing public.media_publish_sessions;
BEGIN
  IF v_auth_uid IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.media_publish_sessions
  WHERE shift_id = p_shift_id
    AND status = 'active'
    AND (p_session_id IS NULL OR id = p_session_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_existing.publisher_auth_user_id <> v_auth_uid
    AND NOT private.can_manage_shift_live_session(p_shift_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;

  UPDATE public.media_publish_sessions
  SET status = 'stopped',
      ended_at = statement_timestamp(),
      ended_by_auth_user_id = v_auth_uid
  WHERE id = v_existing.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.stop_shift_media_publish_session(text, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.stop_shift_media_publish_session(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.authorize_shift_media_viewer(p_shift_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_session public.media_publish_sessions;
  v_valid_until timestamptz := statement_timestamp() + interval '15 minutes';
BEGIN
  IF v_auth_uid IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  IF NOT coalesce(private.can_view_shift_live_session(p_shift_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEDIA_PERMISSION_DENIED';
  END IF;

  SELECT *
  INTO v_session
  FROM public.media_publish_sessions
  WHERE shift_id = p_shift_id
    AND status = 'active'
  ORDER BY started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDIA_SESSION_NOT_ACTIVE';
  END IF;

  INSERT INTO public.media_viewer_grants (auth_user_id, shift_id, valid_from, valid_until, active)
  VALUES (v_auth_uid, p_shift_id, statement_timestamp(), v_valid_until, true)
  ON CONFLICT (auth_user_id, shift_id) DO UPDATE
  SET valid_from = EXCLUDED.valid_from,
      valid_until = EXCLUDED.valid_until,
      active = true;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'shift_id', v_session.shift_id,
    'media_path', v_session.media_path,
    'publisher_auth_user_id', v_session.publisher_auth_user_id,
    'publisher_business_user_id', v_session.publisher_business_user_id,
    'valid_until', v_valid_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_shift_media_viewer(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.authorize_shift_media_viewer(text) TO authenticated;
