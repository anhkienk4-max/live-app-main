-- Core V1 F11 Patch-1: recursively sanitize persisted audit snapshots.
-- This forward-only replacement preserves the existing audit function contract
-- and trigger transaction coupling while preventing nested credential leakage.

create or replace function private.audit_sanitize_row(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb;
  item record;
  sanitized jsonb;
  normalized_key text;
begin
  if p_value is null then
    return null;
  end if;

  case jsonb_typeof(p_value)
    when 'object' then
      result := '{}'::jsonb;

      for item in
        select entry.key, entry.value
        from jsonb_each(p_value) as entry(key, value)
      loop
        normalized_key := lower(regexp_replace(coalesce(item.key, ''), '[^a-z0-9]', '', 'g'));

        -- Keep the key visible for audit shape compatibility, but never retain
        -- a credential value. Separators/case are normalized before comparison.
        if normalized_key = any (array[
          'password', 'passwd', 'passphrase', 'passwordhash',
          'token', 'accesstoken', 'accesskey', 'refreshtoken', 'idtoken',
          'apikey', 'clientsecret', 'secret', 'secretkey',
          'authorization', 'authtoken', 'bearer',
          'privatekey', 'oauthtoken', 'oauthsecret',
          'providertoken', 'providersecret',
          'credentials', 'credential', 'cookie', 'sessiontoken',
          'refresh', 'otp', 'base64', 'binary'
        ]) then
          sanitized := to_jsonb('[REDACTED]'::text);
        elsif normalized_key ~ '^(file|image|thumbnail)url$'
          and jsonb_typeof(item.value) = 'string' then
          sanitized := to_jsonb('[redacted_reference]'::text);
        else
          sanitized := private.audit_sanitize_row(item.value);
        end if;

        result := result || jsonb_build_object(item.key, sanitized);
      end loop;

      return result;

    when 'array' then
      select coalesce(
        jsonb_agg(private.audit_sanitize_row(entry.value) order by entry.ordinality),
        '[]'::jsonb
      )
      into result
      from jsonb_array_elements(p_value) with ordinality as entry(value, ordinality);

      return result;

    when 'string' then
      if length(p_value #>> '{}') > 10000 then
        return to_jsonb('[redacted_large_value]'::text);
      end if;
      return p_value;

    else
      -- Numbers, booleans, and JSON null are safe scalar values and are
      -- retained exactly. SQL NULL was handled above.
      return p_value;
  end case;
end;
$$;

-- Keep this private helper unavailable to application roles. It is invoked by
-- the existing SECURITY DEFINER audit trigger only.
revoke all on function private.audit_sanitize_row(jsonb) from public, anon, authenticated;

