-- Durable profile avatar storage. Objects are public because avatar URLs are
-- rendered in the authenticated staff directory and profile shell.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "profile avatars upload own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1) = 'profiles'
    and exists (
      select 1
      from public.business_users as business_user
      where business_user.id = split_part(name, '/', 2)
        and business_user.auth_user_id = (select auth.uid())
        and business_user.status = 'active'
        and business_user.account_status = 'active'
        and business_user.archived_at is null
        and business_user.deleted_at is null
    )
    and split_part(name, '/', 3) = 'avatar'
  );

create policy "profile avatars replace own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1) = 'profiles'
    and exists (
      select 1
      from public.business_users as business_user
      where business_user.id = split_part(name, '/', 2)
        and business_user.auth_user_id = (select auth.uid())
        and business_user.status = 'active'
        and business_user.account_status = 'active'
        and business_user.archived_at is null
        and business_user.deleted_at is null
    )
  )
  with check (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1) = 'profiles'
    and split_part(name, '/', 3) = 'avatar'
  );

create policy "profile avatars delete own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1) = 'profiles'
    and exists (
      select 1
      from public.business_users as business_user
      where business_user.id = split_part(name, '/', 2)
        and business_user.auth_user_id = (select auth.uid())
        and business_user.status = 'active'
        and business_user.account_status = 'active'
        and business_user.archived_at is null
        and business_user.deleted_at is null
    )
  );

create policy "profile avatars public read"
  on storage.objects
  for select
  using (bucket_id = 'profile-avatars');
