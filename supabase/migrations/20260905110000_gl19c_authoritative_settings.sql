-- GL-19C: Authoritative Settings

create table public.system_settings (
  id uuid primary key default gen_random_uuid(),
  require_shift_capacity_validation boolean not null default true,
  require_time_overlap_validation boolean not null default true,
  allow_leader_schedule_edit boolean not null default false,
  strict_host_role_binding boolean not null default true,
  default_view_mode text not null default 'timeline',
  calendar_density text not null default 'comfortable',
  show_unassigned_shifts boolean not null default true,
  updated_at timestamptz not null default now()
);

create unique index system_settings_single_row_idx on public.system_settings ((true));

alter table public.system_settings enable row level security;

create policy "Settings are readable by authenticated users"
  on public.system_settings for select
  to authenticated using (true);

create policy "Settings are updatable by admin only"
  on public.system_settings for update
  to authenticated using (private.is_admin());

-- Insert default row
insert into public.system_settings default values;
