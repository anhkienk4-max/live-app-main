BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.approve_shift_swap_request(text,text)') IS NULL
    OR to_regprocedure('public.approve_shift_swap_request(text,text,integer)') IS NULL
    OR to_regprocedure('private.assert_expected_version(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_APPROVAL_VERSION_GUARD_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.approve_shift_swap_request(
  p_request_id text,
  p_notes text,
  p_expected_version integer
)
RETURNS public.swap_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_version integer;
BEGIN
  SELECT version INTO current_version
  FROM public.swap_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF current_version IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SWAP_NOT_FOUND';
  END IF;

  PERFORM private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  RETURN public.approve_shift_swap_request(p_request_id, p_notes);
END;
$$;

ALTER FUNCTION public.approve_shift_swap_request(text, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text, text, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_shift_swap_request(text, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text, text) FROM PUBLIC, anon, authenticated, service_role;

DO $verify$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.approve_shift_swap_request(text,text,integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.approve_shift_swap_request(text,text,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.approve_shift_swap_request(text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.approve_shift_swap_request(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_APPROVAL_VERSION_GUARD_PRIVILEGE_CHECK_FAILED';
  END IF;
END;
$verify$;

COMMIT;
