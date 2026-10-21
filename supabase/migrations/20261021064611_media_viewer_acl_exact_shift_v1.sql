-- ADA Media P1: exact viewer/shift entitlement. First applied STAGING 2026-10-21.
-- NO seed, NO video storage, NO implicit role-based viewer access.
create table public.media_stream_routes (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id) on delete restrict,
  platform_id text not null references public.platforms(id) on delete restrict,
  studio text not null check (length(studio) between 1 and 128 and studio=btrim(studio)),
  active_shift_id text not null unique references public.shifts(id) on delete restrict,
  media_path text not null unique check (media_path ~ '^[a-z][a-z0-9_]{0,63}$'),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (brand_id,platform_id,studio)
);
create table public.media_viewer_grants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  shift_id text not null references public.shifts(id) on delete cascade,
  valid_from timestamptz not null,
  valid_until timestamptz not null check (valid_until>valid_from),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (auth_user_id,shift_id)
);
create index media_grants_subject_idx on public.media_viewer_grants(auth_user_id,shift_id) where active;
comment on table public.media_stream_routes is 'Media PoC metadata only. Exact brand/platform/studio/active shift -> HLS path. Operator provisioned only, no video.';
comment on table public.media_viewer_grants is 'Explicit user + shift viewer ACL. Default denied, no implicit leader/admin access, no media bytes.';
alter table public.media_viewer_grants enable row level security;
alter table public.media_stream_routes enable row level security;
revoke all on table public.media_viewer_grants from PUBLIC,anon,authenticated;
revoke all on table public.media_stream_routes from PUBLIC,anon,authenticated;
grant select on table public.media_viewer_grants to authenticated;
grant select on table public.media_stream_routes to authenticated;
create policy media_grant_select_exact_subject on public.media_viewer_grants
 for select to authenticated using (
  auth_user_id=(select auth.uid())
  and (select private.current_business_user_is_active())
  and (select private.can_read_shift(shift_id))
 );
create policy media_route_select_granted_shift on public.media_stream_routes
 for select to authenticated using (
  active and (select private.current_business_user_is_active())
  and exists(
    select 1 from public.media_viewer_grants g
    join public.shifts s on s.id=g.shift_id
    where g.auth_user_id=(select auth.uid()) and g.active
      and statement_timestamp()>=g.valid_from and statement_timestamp()<g.valid_until
      and s.id=media_stream_routes.active_shift_id
      and s.brand_id=media_stream_routes.brand_id
      and s.platform_id=media_stream_routes.platform_id
      and s.studio=media_stream_routes.studio
      and s.status='live' and s.deleted_at is null and s.archived_at is null
      and statement_timestamp() >= s.start_at-interval '15 minutes'
      and statement_timestamp() <= s.end_at+interval '15 minutes'
      and (select private.can_read_shift(s.id))
  )
 );
