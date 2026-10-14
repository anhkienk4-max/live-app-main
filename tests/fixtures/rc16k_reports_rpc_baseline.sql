-- Isolated RC1.6K Reports RPC fixture. Do not apply to Supabase Production.
-- Minimal typed schema enables PostgreSQL 17 to execute the actual RC1.6K Reports migration.
create schema private;
create table public.brands (id text primary key, name text not null);
create table public.platforms (id text primary key, name text not null);
create table public.campaigns (id text primary key, name text not null);
create table public.shifts (
  id text primary key, date date not null, start_time time not null,
  status text not null, title text not null,
  brand_id text references public.brands(id),
  platform_id text references public.platforms(id),
  campaign_id text references public.campaigns(id)
);
create table public.reports (
  id text primary key, shift_id text references public.shifts(id),
  status text, metrics_confirmed boolean,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz, archived_at timestamptz,
  normalized_metrics jsonb, platform_metrics jsonb,
  revenue numeric, orders numeric
);
create function private.current_business_user_id()
returns text language sql stable as $$ select 'fixture-actor'::text $$;
create function private.filtered_shift_ids(p_scope text, p_filters jsonb)
returns table(id text, date date, start_time time, status text)
language sql stable security invoker set search_path='' as $$
  select s.id, s.date, s.start_time, s.status from public.shifts s
  where (not p_filters ? 'from' or s.date >= (p_filters->>'from')::date)
    and (not p_filters ? 'to' or s.date <= (p_filters->>'to')::date)
    and (jsonb_array_length(coalesce(p_filters->'brandIds','[]'::jsonb))=0
       or s.brand_id in (select jsonb_array_elements_text(p_filters->'brandIds')))
$$;
create function private.rc16k_report_metric(r public.reports, k text)
returns numeric language plpgsql immutable security invoker set search_path=''
as $$
begin
  if k='revenue' then return coalesce((r.normalized_metrics->>'revenue')::numeric,r.revenue); end if;
  if k='orders' then return coalesce((r.normalized_metrics->>'orders')::numeric,r.orders); end if;
  return null;
end;
$$;
insert into public.brands values ('b1','Alpha');
insert into public.platforms values ('p1','TikTok Shop');
insert into public.campaigns values ('c1','Midmonth');
insert into public.shifts(id,date,start_time,status,title,brand_id,platform_id,campaign_id)
  select 'shift-'||i, date '2026-10-01' + (i%7), time '10:00',
    'completed', 'Regular Livestream '||i, 'b1','p1','c1'
  from generate_series(1,117) i;
insert into public.reports(id,shift_id,status,metrics_confirmed,updated_at,revenue,orders)
  select 'report-'||i,'shift-'||i,
    case when i%4=0 then 'draft' else 'confirmed' end,
    i%4<>0,
    timestamp with time zone '2026-10-12 00:00:00+00' + i * interval '1 second',
    case when i%10=0 then null else 100 end,
    2
  from generate_series(1,117) i;
-- An explicit NULL exercises nullable unconfirmed semantics.
insert into public.shifts values ('old-special',date '2026-09-01',time '10:00',
  'completed','Special Older Brand Livestream','b1','p1','c1');
insert into public.reports(id,shift_id,status,metrics_confirmed,revenue,orders)
  values ('report-old','old-special','draft',null,null,null);
