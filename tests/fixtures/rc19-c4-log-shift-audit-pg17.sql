-- Disposable PG17 fixture matching the verified Production helper signature.
-- This is test setup only; it is not a migration or a Production replacement.
CREATE OR REPLACE FUNCTION private.log_shift_audit(
  p_module text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_reason text,
  p_metadata jsonb,
  p_shift_ids text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text := private.current_business_user_id();
  v_actor_name text;
  v_actor_role text := private.current_system_permission();
BEGIN
  SELECT full_name INTO v_actor_name
  FROM public.business_users
  WHERE id = v_actor_id;

  INSERT INTO public.audit_logs (
    actor_auth_user_id,
    actor_business_user_id,
    actor_name,
    actor_role,
    module,
    action,
    entity_type,
    entity_id,
    entity_name,
    after_data,
    reason,
    metadata,
    related_records
  ) VALUES (
    auth.uid(),
    v_actor_id,
    v_actor_name,
    v_actor_role,
    p_module,
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_entity_id, 'unknown'),
    p_metadata,
    p_reason,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('entity_type', 'shift', 'entity_id', shift_id))
      FROM unnest(coalesce(p_shift_ids, ARRAY[]::text[])) shift_id
    ), '[]'::jsonb)
  );
END;
$$;

ALTER FUNCTION private.log_shift_audit(text, text, text, text, text, jsonb, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.log_shift_audit(text, text, text, text, text, jsonb, text[])
  FROM PUBLIC, anon, authenticated, service_role;
