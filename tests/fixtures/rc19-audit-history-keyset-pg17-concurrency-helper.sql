CREATE OR REPLACE FUNCTION public.c12_insert_late_event()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE v_id text := 'audit-added-after-snapshot-' || gen_random_uuid()::text;
BEGIN
  INSERT INTO public.audit_logs (id, created_at, actor_business_user_id, actor_name, actor_role, module, action, entity_type, entity_id, entity_name)
  VALUES (v_id, clock_timestamp(), 'admin-1', 'Admin One', 'admin', 'calendar', 'update', 'shift', 'shift-new', 'Synthetic concurrent event');
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.c12_insert_late_event() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.c12_insert_late_event() TO authenticated;
