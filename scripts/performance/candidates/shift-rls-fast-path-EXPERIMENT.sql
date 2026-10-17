-- EXPERIMENTAL / ISOLATED FIXTURE ONLY. NOT a migration. DO NOT APPLY ON PRODUCTION.
-- Goal: retain the original row-sensitive permission check for members while
-- allowing active Admin / Leader roles to avoid repeated can_read_shift(id)
-- lookups during large paginated reads.
--
-- SECURITY: The original private.can_read_shift checks active business user
-- before applying admin / leader / member logic. Preserve that gate first.
-- Unknown roles, NULL permissions, and members remain on original helper.
-- Existing RLS remains enabled; policy keeps TO authenticated scope unchanged.
-- Candidate requires full Admin / Leader / Member / revoked-user parity testing.
ALTER POLICY shifts_scoped_select ON public.shifts
USING (
  CASE
    WHEN (SELECT private.current_business_user_is_active()) IS DISTINCT FROM TRUE
      THEN FALSE
    WHEN (SELECT private.current_system_permission()) = 'admin'
      THEN TRUE
    WHEN (SELECT private.current_system_permission()) = 'leader'
      THEN deleted_at IS NULL AND archived_at IS NULL
    ELSE (SELECT private.can_read_shift(id))
  END
);
