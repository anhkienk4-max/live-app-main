-- Enforce the configurable staffing-assignment action at the authoritative row boundary.
BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_rbac_staffing_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enabled boolean;
  v_requires_assignment boolean := false;
BEGIN
  SELECT enabled INTO v_enabled
  FROM private.rbac_runtime_gate
  WHERE id = true;

  IF NOT coalesce(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_requires_assignment := NEW.status = 'manually_assigned';
  ELSIF (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'manually_assigned')
    OR (OLD.status IN ('approved', 'manually_assigned') AND NEW.status = 'removed') THEN
    v_requires_assignment := true;
  END IF;

  IF v_requires_assignment AND NOT private.rbac_has_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION 'RBAC_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_rbac_staffing_permission()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS shift_registrations_rbac_staffing_permission
  ON public.shift_registrations;
CREATE TRIGGER shift_registrations_rbac_staffing_permission
  BEFORE INSERT OR UPDATE OF status ON public.shift_registrations
  FOR EACH ROW EXECUTE FUNCTION private.enforce_rbac_staffing_permission();

COMMIT;
