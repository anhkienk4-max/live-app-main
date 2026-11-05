-- Keep runtime mutation limited to the one permission with matching API and RLS enforcement.
BEGIN;

UPDATE private.rbac_permission_catalog
SET role_override_roles = CASE WHEN permission = 'audit.view_team' THEN ARRAY['leader']::text[] ELSE '{}'::text[] END,
    account_override_roles = CASE WHEN permission = 'audit.view_team' THEN ARRAY['leader']::text[] ELSE '{}'::text[] END,
    account_allow_roles = CASE WHEN permission = 'audit.view_team' THEN ARRAY['leader']::text[] ELSE '{}'::text[] END;

COMMIT;
