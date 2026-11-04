-- Enable versioned role/account policy only for operations with a matching
-- authenticated handler/RPC guard and retained business-scope validation.
BEGIN;

UPDATE private.rbac_permission_catalog
SET role_override_roles = CASE permission
      WHEN 'shifts.view_assigned' THEN ARRAY['member','leader','admin']::text[]
      WHEN 'shifts.assign_staff' THEN ARRAY['leader','admin']::text[]
      WHEN 'shifts.import' THEN ARRAY['leader','admin']::text[]
      WHEN 'shifts.export' THEN ARRAY['leader','admin']::text[]
      WHEN 'reports.submit' THEN ARRAY['member','leader','admin']::text[]
      WHEN 'reports.review' THEN ARRAY['leader','admin']::text[]
      WHEN 'swaps.request' THEN ARRAY['member','leader','admin']::text[]
      WHEN 'swaps.approve' THEN ARRAY['leader','admin']::text[]
      WHEN 'attendance.record_own' THEN ARRAY['member','leader','admin']::text[]
      WHEN 'storage.upload' THEN ARRAY['member','leader','admin']::text[]
      WHEN 'storage.edit_own' THEN ARRAY['member','leader','admin']::text[]
      WHEN 'storage.delete' THEN ARRAY['leader','admin']::text[]
      ELSE role_override_roles END,
    account_override_roles = CASE permission
      WHEN 'reports.submit' THEN ARRAY['leader']::text[]
      WHEN 'reports.review' THEN ARRAY['leader']::text[]
      WHEN 'swaps.request' THEN ARRAY['member','leader']::text[]
      WHEN 'swaps.approve' THEN ARRAY['leader']::text[]
      WHEN 'attendance.record_own' THEN ARRAY['member','leader']::text[]
      WHEN 'storage.upload' THEN ARRAY['member','leader']::text[]
      ELSE account_override_roles END,
    account_allow_roles = CASE permission
      WHEN 'reports.submit' THEN ARRAY['leader']::text[]
      WHEN 'reports.review' THEN ARRAY['leader']::text[]
      WHEN 'swaps.request' THEN ARRAY['member','leader']::text[]
      WHEN 'swaps.approve' THEN ARRAY['leader']::text[]
      WHEN 'attendance.record_own' THEN ARRAY['member','leader']::text[]
      WHEN 'storage.upload' THEN ARRAY['member','leader']::text[]
      ELSE account_allow_roles END
WHERE permission IN (
  'shifts.view_assigned','shifts.assign_staff','shifts.import','shifts.export',
  'reports.submit','reports.review','swaps.request','swaps.approve',
  'attendance.record_own','storage.upload','storage.edit_own','storage.delete'
);

CREATE OR REPLACE FUNCTION private.enforce_rbac_swap_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_enabled boolean;
  v_permission text;
BEGIN
  SELECT enabled INTO v_enabled FROM private.rbac_runtime_gate WHERE id = true;
  IF NOT coalesce(v_enabled, false) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_permission := 'swaps.request';
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND (
    NEW.status = 'approved'
    OR (NEW.status = 'rejected' AND NEW.approved_by IS NOT NULL
      AND NEW.approved_by IS DISTINCT FROM OLD.approved_by)
  ) THEN
    v_permission := 'swaps.approve';
  ELSE
    RETURN NEW;
  END IF;

  IF NOT private.rbac_has_permission(v_permission) THEN
    RAISE EXCEPTION 'RBAC_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_rbac_swap_permission() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS swap_requests_rbac_permission ON public.swap_requests;
CREATE TRIGGER swap_requests_rbac_permission
  BEFORE INSERT OR UPDATE OF status ON public.swap_requests
  FOR EACH ROW EXECUTE FUNCTION private.enforce_rbac_swap_permission();

COMMIT;
