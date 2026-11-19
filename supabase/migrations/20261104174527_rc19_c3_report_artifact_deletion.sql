-- Durable coordination for external artifact deletion; provider I/O is outside transactions.
BEGIN;

CREATE TABLE public.rc19_report_artifact_deletions (
  operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stored_file_id text NOT NULL UNIQUE REFERENCES public.stored_files(id) ON DELETE RESTRICT,
  report_id text NOT NULL REFERENCES public.reports(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('google_drive', 'onedrive')),
  external_file_id text NOT NULL CHECK (btrim(external_file_id) <> ''),
  external_parent_id text CHECK (external_parent_id IS NULL OR btrim(external_parent_id) <> ''),
  requested_by text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  lease_actor text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'provider_deleting', 'provider_deleted', 'completed', 'retryable_failure', 'manual_review')),
  fencing_version integer NOT NULL DEFAULT 1 CHECK (fencing_version > 0),
  lease_owner uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK (external_parent_id IS NOT NULL OR status = 'manual_review')
);
CREATE TABLE public.rc19_report_artifact_deletion_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES public.rc19_report_artifact_deletions(operation_id) ON DELETE RESTRICT,
  status text NOT NULL,
  fencing_version integer NOT NULL,
  actor_business_user_id text REFERENCES public.business_users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.rc19_report_artifact_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rc19_report_artifact_deletion_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rc19_report_artifact_deletions, public.rc19_report_artifact_deletion_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.rc19_report_artifact_deletions TO service_role;

CREATE FUNCTION private.rc19_artifact_delete_authorized(p_file_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((
    SELECT private.current_business_user_is_active()
      AND private.current_business_user_id() IS NOT NULL
      AND public.rbac01_effective_permission('reports.submit')
      AND public.rbac01_effective_permission(CASE WHEN private.current_system_permission() = 'member'
        THEN 'storage.edit_own' ELSE 'storage.delete' END)
      AND private.rc19_can_mutate_report(f.report_id)
      AND (private.current_system_permission() <> 'member' OR f.uploaded_by = private.current_business_user_id())
      AND r.shift_id = f.shift_id AND r.deleted_at IS NULL AND r.archived_at IS NULL
      AND NOT coalesce(r.metrics_confirmed, false) AND r.status <> 'confirmed'
      AND btrim(f.external_file_id) <> ''
    FROM public.stored_files f JOIN public.reports r ON r.id = f.report_id
    WHERE f.id = p_file_id
  ), false);
$$;
REVOKE ALL ON FUNCTION private.rc19_artifact_delete_authorized(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.rc19_claim_report_artifact_deletion(p_file_id text, p_lease_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE f public.stored_files; op public.rc19_report_artifact_deletions; actor text := private.current_business_user_id();
BEGIN
  IF p_file_id IS NULL OR p_lease_owner IS NULL OR NOT private.rc19_artifact_delete_authorized(p_file_id) THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM public.stored_files WHERE id = p_file_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  SELECT * INTO op FROM public.rc19_report_artifact_deletions WHERE stored_file_id = f.id FOR UPDATE;
  IF FOUND THEN
    IF op.requested_by <> actor AND private.current_system_permission() <> 'admin' THEN
      RAISE EXCEPTION 'REPORT_ARTIFACT_NOT_FOUND' USING ERRCODE = '42501';
    END IF;
    IF op.status = 'retryable_failure' OR (op.status = 'pending' AND op.lease_expires_at <= clock_timestamp()) THEN
      UPDATE public.rc19_report_artifact_deletions SET status = 'pending', lease_owner = p_lease_owner, lease_actor = actor,
        lease_expires_at = clock_timestamp() + interval '2 minutes', fencing_version = fencing_version + 1,
        last_error_code = NULL, updated_at = clock_timestamp() WHERE operation_id = op.operation_id RETURNING * INTO op;
      INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
        VALUES(op.operation_id,op.status,op.fencing_version,actor);
    ELSIF op.status = 'provider_deleting' AND op.lease_expires_at <= clock_timestamp() THEN
      UPDATE public.rc19_report_artifact_deletions SET status = 'manual_review',
        last_error_code = 'PROVIDER_OUTCOME_UNKNOWN', updated_at = clock_timestamp()
        WHERE operation_id = op.operation_id RETURNING * INTO op;
      INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
        VALUES(op.operation_id,op.status,op.fencing_version,actor);
    END IF;
    IF (op.status = 'pending' AND op.lease_owner <> p_lease_owner) OR op.status = 'provider_deleting' THEN
      RETURN jsonb_build_object('status','in_progress');
    END IF;
  ELSE
    IF f.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'REPORT_ARTIFACT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.rc19_report_artifact_deletions(stored_file_id,report_id,provider,external_file_id,external_parent_id,requested_by,lease_actor,status,lease_owner,lease_expires_at,last_error_code)
      VALUES(f.id,f.report_id,f.provider,f.external_file_id,nullif(btrim(f.external_parent_id),''),actor,actor,
        CASE WHEN nullif(btrim(f.external_parent_id),'') IS NULL THEN 'manual_review' ELSE 'pending' END,
        p_lease_owner,clock_timestamp()+interval '2 minutes',
        CASE WHEN nullif(btrim(f.external_parent_id),'') IS NULL THEN 'LEGACY_PARENT_VERIFICATION_REQUIRED' ELSE NULL END)
      RETURNING * INTO op;
    INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
      VALUES(op.operation_id,op.status,op.fencing_version,actor);
  END IF;
  RETURN jsonb_build_object('operation_id',op.operation_id,'status',op.status,'fencing_version',op.fencing_version,
    'lease_owner',op.lease_owner,'provider',op.provider,'external_file_id',op.external_file_id,'external_parent_id',op.external_parent_id);
END;
$$;

CREATE FUNCTION public.rc19_begin_report_artifact_deletion(p_operation_id uuid, p_lease_owner uuid, p_fencing_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op public.rc19_report_artifact_deletions; actor text := private.current_business_user_id();
BEGIN
  SELECT * INTO op FROM public.rc19_report_artifact_deletions WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR op.lease_actor IS DISTINCT FROM actor OR NOT private.rc19_artifact_delete_authorized(op.stored_file_id)
    OR op.status <> 'pending' OR op.lease_owner IS DISTINCT FROM p_lease_owner
    OR op.fencing_version IS DISTINCT FROM p_fencing_version OR op.lease_expires_at <= clock_timestamp()
    OR NOT EXISTS (SELECT 1 FROM public.stored_files f WHERE f.id = op.stored_file_id AND f.deleted_at IS NULL
      AND f.report_id = op.report_id AND f.provider = op.provider AND f.external_file_id = op.external_file_id
      AND f.external_parent_id = op.external_parent_id) THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;
  UPDATE public.rc19_report_artifact_deletions SET status = 'provider_deleting', attempt_count = attempt_count + 1,
    updated_at = clock_timestamp() WHERE operation_id = op.operation_id RETURNING * INTO op;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,op.status,op.fencing_version,actor);
  RETURN jsonb_build_object('operation_id',op.operation_id,'provider',op.provider,
    'external_file_id',op.external_file_id,'external_parent_id',op.external_parent_id);
END;
$$;

-- Releasing a pre-provider claim is safe even after the actor's Brand grant is revoked.
CREATE FUNCTION public.rc19_release_report_artifact_delete_claim(p_operation_id uuid, p_lease_owner uuid, p_fencing_version integer, p_needs_review boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op public.rc19_report_artifact_deletions; actor text := private.current_business_user_id();
BEGIN
  IF actor IS NULL OR p_needs_review IS NULL THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_CLAIM_INVALID' USING ERRCODE = '42501'; END IF;
  UPDATE public.rc19_report_artifact_deletions SET status = CASE WHEN p_needs_review THEN 'manual_review' ELSE 'retryable_failure' END,
    last_error_code = CASE WHEN p_needs_review THEN 'REFERENCE_VERIFICATION_FAILED' ELSE 'PRE_PROVIDER_ABORTED' END,
    updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id AND lease_actor = actor AND status = 'pending'
      AND lease_owner = p_lease_owner AND fencing_version = p_fencing_version RETURNING * INTO op;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,op.status,op.fencing_version,actor);
  RETURN op.status;
END;
$$;

-- Only the server may record a provider outcome; a failed/unknown call requires review.
CREATE FUNCTION public.rc19_record_report_artifact_delete_outcome(p_operation_id uuid, p_lease_owner uuid, p_fencing_version integer, p_success boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op public.rc19_report_artifact_deletions;
BEGIN
  IF p_success IS NULL THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_OUTCOME_INVALID'; END IF;
  UPDATE public.rc19_report_artifact_deletions SET status = CASE WHEN p_success THEN 'provider_deleted' ELSE 'manual_review' END,
    last_error_code = CASE WHEN p_success THEN NULL ELSE 'PROVIDER_OUTCOME_UNKNOWN' END, updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id AND status = 'provider_deleting'
      AND lease_owner = p_lease_owner AND fencing_version = p_fencing_version RETURNING * INTO op;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,op.status,op.fencing_version,op.lease_actor);
  RETURN op.status;
END;
$$;

CREATE FUNCTION public.rc19_finalize_report_artifact_deletion(p_operation_id uuid, p_lease_owner uuid, p_fencing_version integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op public.rc19_report_artifact_deletions; file_id text;
BEGIN
  SELECT stored_file_id INTO file_id FROM public.rc19_report_artifact_deletions WHERE operation_id = p_operation_id;
  IF file_id IS NULL THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001'; END IF;
  PERFORM 1 FROM public.stored_files WHERE id = file_id FOR UPDATE;
  SELECT * INTO op FROM public.rc19_report_artifact_deletions WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR op.lease_owner IS DISTINCT FROM p_lease_owner OR op.fencing_version IS DISTINCT FROM p_fencing_version
    OR op.status NOT IN ('provider_deleted','completed') THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001';
  END IF;
  IF op.status = 'completed' THEN RETURN 'completed'; END IF;
  UPDATE public.stored_files SET deleted_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = op.stored_file_id AND report_id = op.report_id AND provider = op.provider
      AND external_file_id = op.external_file_id AND external_parent_id = op.external_parent_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_REFERENCE_CHANGED' USING ERRCODE = '40001'; END IF;
  UPDATE public.rc19_report_artifact_deletions SET status = 'completed', completed_at = clock_timestamp(),
    updated_at = clock_timestamp() WHERE operation_id = op.operation_id;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,'completed',op.fencing_version,op.lease_actor);
  RETURN 'completed';
END;
$$;

-- Server-only: call after independently verifying this exact provider object is trashed.
CREATE FUNCTION public.rc19_reconcile_report_artifact_deleted(p_operation_id uuid, p_lease_owner uuid, p_fencing_version integer,
  p_provider text, p_external_file_id text, p_external_parent_id text, p_actor_business_user_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op public.rc19_report_artifact_deletions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.business_users u WHERE u.id = p_actor_business_user_id
    AND u.system_permission = 'admin' AND u.status = 'active' AND u.account_status = 'active'
    AND u.deleted_at IS NULL AND u.archived_at IS NULL) THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_AUTHORIZATION_INVALID' USING ERRCODE = '42501';
  END IF;
  UPDATE public.rc19_report_artifact_deletions SET status = 'provider_deleted', last_error_code = NULL, updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id AND status = 'manual_review' AND attempt_count > 0
      AND lease_owner = p_lease_owner AND fencing_version = p_fencing_version AND lease_expires_at <= clock_timestamp()
      AND provider = p_provider AND external_file_id = p_external_file_id AND external_parent_id = p_external_parent_id
    RETURNING * INTO op;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,op.status,op.fencing_version,p_actor_business_user_id);
  RETURN op.status;
END;
$$;

-- Server-only: caller must first verify the provider ancestry against an approved route.
CREATE FUNCTION public.rc19_backfill_report_artifact_parent(p_operation_id uuid, p_fencing_version integer,
  p_provider text, p_external_file_id text, p_external_parent_id text, p_actor_business_user_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op public.rc19_report_artifact_deletions; file_id text;
BEGIN
  IF p_provider <> 'google_drive' OR nullif(btrim(p_external_parent_id),'') IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.business_users u WHERE u.id = p_actor_business_user_id AND u.system_permission = 'admin'
      AND u.status = 'active' AND u.account_status = 'active' AND u.deleted_at IS NULL AND u.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'REPORT_ARTIFACT_PARENT_VERIFICATION_INVALID' USING ERRCODE = '42501'; END IF;
  SELECT stored_file_id INTO file_id FROM public.rc19_report_artifact_deletions WHERE operation_id = p_operation_id;
  IF file_id IS NULL THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001'; END IF;
  PERFORM 1 FROM public.stored_files WHERE id = file_id FOR UPDATE;
  SELECT * INTO op FROM public.rc19_report_artifact_deletions WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR op.status <> 'manual_review' OR op.last_error_code <> 'LEGACY_PARENT_VERIFICATION_REQUIRED'
    OR op.attempt_count <> 0 OR op.fencing_version IS DISTINCT FROM p_fencing_version
    OR op.provider IS DISTINCT FROM p_provider OR op.external_file_id IS DISTINCT FROM p_external_file_id
    OR op.external_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001';
  END IF;
  UPDATE public.stored_files SET external_parent_id = p_external_parent_id, updated_at = clock_timestamp()
    WHERE id = op.stored_file_id AND report_id = op.report_id AND provider = op.provider
      AND external_file_id = op.external_file_id AND nullif(btrim(external_parent_id),'') IS NULL AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_REFERENCE_CHANGED' USING ERRCODE = '40001'; END IF;
  UPDATE public.rc19_report_artifact_deletions SET external_parent_id = p_external_parent_id,
    status = 'retryable_failure', last_error_code = NULL, updated_at = clock_timestamp() WHERE operation_id = op.operation_id;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,'legacy_parent_verified',op.fencing_version,p_actor_business_user_id);
  RETURN 'retryable_failure';
END;
$$;

REVOKE ALL ON FUNCTION public.rc19_claim_report_artifact_deletion(text,uuid),
  public.rc19_begin_report_artifact_deletion(uuid,uuid,integer),
  public.rc19_release_report_artifact_delete_claim(uuid,uuid,integer,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rc19_claim_report_artifact_deletion(text,uuid),
  public.rc19_begin_report_artifact_deletion(uuid,uuid,integer),
  public.rc19_release_report_artifact_delete_claim(uuid,uuid,integer,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.rc19_record_report_artifact_delete_outcome(uuid,uuid,integer,boolean),
  public.rc19_finalize_report_artifact_deletion(uuid,uuid,integer),
  public.rc19_reconcile_report_artifact_deleted(uuid,uuid,integer,text,text,text,text),
  public.rc19_backfill_report_artifact_parent(uuid,integer,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rc19_record_report_artifact_delete_outcome(uuid,uuid,integer,boolean),
  public.rc19_finalize_report_artifact_deletion(uuid,uuid,integer),
  public.rc19_reconcile_report_artifact_deleted(uuid,uuid,integer,text,text,text,text),
  public.rc19_backfill_report_artifact_parent(uuid,integer,text,text,text,text) TO service_role;
COMMIT;
