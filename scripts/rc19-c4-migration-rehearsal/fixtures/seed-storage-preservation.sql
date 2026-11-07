-- Synthetic-only data seeded after the 89-entry schema replay and before C2.
INSERT INTO auth.users (id, email, email_confirmed_at, raw_app_meta_data)
VALUES
  ('c4c00000-0000-4000-8000-000000000001', 'c4-admin@example.invalid', now(), '{"provider":"email"}'),
  ('c4c00000-0000-4000-8000-000000000002', 'c4-leader@example.invalid', now(), '{"provider":"email"}'),
  ('c4c00000-0000-4000-8000-000000000003', 'c4-member@example.invalid', now(), '{"provider":"email"}');

INSERT INTO public.business_users (
  id, auth_user_id, email, full_name, role, system_permission, operational_roles,
  status, account_status, email_verified, auth_provider
)
VALUES
  ('c4-rehearsal-admin', 'c4c00000-0000-4000-8000-000000000001', 'c4-admin@example.invalid', 'C4 Synthetic Admin', 'admin', 'admin', ARRAY['host','support','technical'], 'active', 'active', true, 'email'),
  ('c4-rehearsal-leader', 'c4c00000-0000-4000-8000-000000000002', 'c4-leader@example.invalid', 'C4 Synthetic Leader', 'leader', 'leader', ARRAY['host'], 'active', 'active', true, 'email'),
  ('c4-rehearsal-member', 'c4c00000-0000-4000-8000-000000000003', 'c4-member@example.invalid', 'C4 Synthetic Member', 'staff', 'member', ARRAY['host'], 'active', 'active', true, 'email');

INSERT INTO public.storage_resources (
  id, provider, canonical_id, canonical_url, title, resource_type, owner_id,
  visibility, verification_status, is_active, created_by, updated_by
)
VALUES
  ('c4-rehearsal-owner-resource', 'google_drive', 'c4-owner-folder', 'https://drive.google.com/drive/folders/c4-owner-folder', 'Synthetic owner folder', 'root_folder', 'c4-rehearsal-admin', 'owner_only', 'unverified', true, 'c4-rehearsal-admin', 'c4-rehearsal-admin'),
  ('c4-rehearsal-granted-resource', 'google_drive', 'c4-granted-folder', 'https://drive.google.com/drive/folders/c4-granted-folder', 'Synthetic granted folder', 'root_folder', 'c4-rehearsal-admin', 'granted_users', 'unverified', true, 'c4-rehearsal-admin', 'c4-rehearsal-admin');

INSERT INTO public.storage_resource_user_grants (resource_id, user_id, granted_by)
VALUES ('c4-rehearsal-granted-resource', 'c4-rehearsal-member', 'c4-rehearsal-admin');
