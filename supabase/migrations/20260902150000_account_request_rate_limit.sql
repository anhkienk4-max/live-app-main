-- MASTER-F7 PATCH-1: persistence-backed public Account Request abuse boundary.
-- Five accepted insert attempts per hashed request key in a rolling 15-minute
-- window. The raw proxy address is never persisted.

create table private.account_request_rate_limits (
  request_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  constraint account_request_rate_limits_key_not_blank check (btrim(request_key) <> ''),
  constraint account_request_rate_limits_count_nonnegative check (request_count >= 0)
);

alter table private.account_request_rate_limits enable row level security;
revoke all on table private.account_request_rate_limits from public, anon, authenticated;

create or replace function private.consume_account_request_rate_limit(
  p_request_key text,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into private.account_request_rate_limits (
    request_key, window_started_at, request_count, updated_at
  ) values (
    p_request_key, p_now, 1, p_now
  )
  on conflict (request_key) do update
  set
    window_started_at = case
      when private.account_request_rate_limits.window_started_at + interval '15 minutes' <= excluded.updated_at
        then excluded.updated_at
      else private.account_request_rate_limits.window_started_at
    end,
    request_count = case
      when private.account_request_rate_limits.window_started_at + interval '15 minutes' <= excluded.updated_at
        then 1
      else private.account_request_rate_limits.request_count + 1
    end,
    updated_at = excluded.updated_at
  returning request_count into v_count;

  return v_count <= 5;
end;
$$;

revoke all on function private.consume_account_request_rate_limit(text, timestamptz) from public, anon, authenticated;

create or replace function private.enforce_account_request_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_forwarded text;
  v_request_key text;
begin
  v_forwarded := left(coalesce(
    nullif(btrim(current_setting('request.header.x-forwarded-for', true)), ''),
    nullif(btrim(current_setting('request.header.x-real-ip', true)), ''),
    'unknown'
  ), 256);
  v_request_key := pg_catalog.md5(btrim(split_part(v_forwarded, ',', 1)));

  if not private.consume_account_request_rate_limit(v_request_key) then
    raise exception 'ACCOUNT_REQUEST_RATE_LIMITED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_account_request_rate_limit() from public, anon, authenticated;

create trigger account_requests_rate_limit
before insert on public.account_requests
for each row execute function private.enforce_account_request_rate_limit();

comment on table private.account_request_rate_limits is
  'Hashed request-key counters for public Account Request submission; no raw IP is persisted.';
comment on function private.consume_account_request_rate_limit(text, timestamptz) is
  'Atomic five-per-fifteen-minute Account Request submission counter.';
comment on function private.enforce_account_request_rate_limit() is
  'Derives a non-reversible request key from trusted request metadata and enforces the public submission limit.';
