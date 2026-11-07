--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6 (Ubuntu 17.6-2.pgdg24.04+1)
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) FROM stdin;
c4c00000-0000-4000-8000-000000000001	c4-admin@example.invalid	2026-11-07 10:19:10.940173+00	{"provider": "email"}	{}	2026-11-07 10:19:10.940173+00	2026-11-07 10:19:10.940173+00
c4c00000-0000-4000-8000-000000000002	c4-leader@example.invalid	2026-11-07 10:19:10.940173+00	{"provider": "email"}	{}	2026-11-07 10:19:10.940173+00	2026-11-07 10:19:10.940173+00
c4c00000-0000-4000-8000-000000000003	c4-member@example.invalid	2026-11-07 10:19:10.940173+00	{"provider": "email"}	{}	2026-11-07 10:19:10.940173+00	2026-11-07 10:19:10.940173+00
\.


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: job; Type: TABLE DATA; Schema: cron; Owner: -
--

COPY cron.job (jobid, schedule, command, nodename, nodeport, database, username, active, jobname) FROM stdin;
1	* * * * *	select private.refresh_automatic_shift_statuses_scheduled();	localhost	5432	rc19_c4_rehearsal_prodshape_20261107_pg176_r4	anhkienk4	t	refresh-automatic-shift-statuses
\.


--
-- Data for Name: account_request_rate_limits; Type: TABLE DATA; Schema: private; Owner: -
--

COPY private.account_request_rate_limits (request_key, window_started_at, request_count, updated_at) FROM stdin;
\.


--
-- Data for Name: business_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.business_users (id, auth_user_id, email, full_name, avatar_url, avatar_storage_path, phone, role, system_permission, operational_roles, department, status, account_status, email_verified, auth_provider, join_date, created_at, updated_at, deleted_at, deleted_by, archived_at, archived_by, deletion_reason) FROM stdin;
c4-rehearsal-admin	c4c00000-0000-4000-8000-000000000001	c4-admin@example.invalid	C4 Synthetic Admin	\N	\N	\N	admin	admin	{host,support,technical}	\N	active	active	t	email	2026-11-07	2026-11-07 10:19:10.94619+00	2026-11-07 10:19:10.94619+00	\N	\N	\N	\N	\N
c4-rehearsal-leader	c4c00000-0000-4000-8000-000000000002	c4-leader@example.invalid	C4 Synthetic Leader	\N	\N	\N	leader	leader	{host}	\N	active	active	t	email	2026-11-07	2026-11-07 10:19:10.94619+00	2026-11-07 10:19:10.94619+00	\N	\N	\N	\N	\N
c4-rehearsal-member	c4c00000-0000-4000-8000-000000000003	c4-member@example.invalid	C4 Synthetic Member	\N	\N	\N	staff	member	{host}	\N	active	active	t	email	2026-11-07	2026-11-07 10:19:10.94619+00	2026-11-07 10:19:10.94619+00	\N	\N	\N	\N	\N
\.


--
-- Data for Name: rbac01_role_default_versions; Type: TABLE DATA; Schema: private; Owner: -
--

COPY private.rbac01_role_default_versions (id, role, version, expected_active_version, expected_active_version_id, decisions, proposed_by, proposed_at, reason) FROM stdin;
\.


--
-- Data for Name: rbac01_role_default_events; Type: TABLE DATA; Schema: private; Owner: -
--

COPY private.rbac01_role_default_events (id, version_id, role, event_type, actor_business_user_id, occurred_at, effective_at, resulting_version_id, reason, before_state, after_state) FROM stdin;
\.


--
-- Data for Name: rbac_permission_catalog; Type: TABLE DATA; Schema: private; Owner: -
--

COPY private.rbac_permission_catalog (permission, legacy_defaults, hard_restricted, role_override_roles, account_override_roles, account_allow_roles) FROM stdin;
shifts.view_assigned	{"admin": true, "leader": true, "member": true}	f	{member,leader,admin}	{}	{}
shifts.view_open	{"admin": true, "leader": true, "member": true}	f	{}	{}	{}
shifts.register	{"admin": true, "leader": true, "member": true}	f	{}	{}	{}
shifts.cancel_registration	{"admin": true, "leader": true, "member": true}	f	{}	{}	{}
shifts.approve_registration	{"admin": true, "leader": true, "member": false}	f	{}	{}	{}
shifts.edit	{"admin": true, "leader": true, "member": false}	f	{}	{}	{}
shifts.delete	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
shifts.lock	{"admin": true, "leader": true, "member": false}	f	{}	{}	{}
reports.export	{"admin": true, "leader": true, "member": false}	f	{}	{}	{}
swaps.export	{"admin": true, "leader": true, "member": false}	f	{}	{}	{}
profile.edit_own	{"admin": true, "leader": true, "member": true}	f	{}	{}	{}
staff.manage	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
brands.manage	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
platforms.manage	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
campaigns.manage	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
campaigns.edit_operational	{"admin": true, "leader": true, "member": false}	f	{}	{}	{}
settings.member	{"admin": true, "leader": true, "member": true}	f	{}	{}	{}
settings.leader	{"admin": true, "leader": true, "member": false}	f	{}	{}	{}
settings.admin	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
permissions.manage	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
audit.view	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
audit.view_team	{"admin": true, "leader": true, "member": false}	f	{leader}	{leader}	{leader}
audit.restore	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
audit.review	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
data.force_delete	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
storage.resource_manage	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
payroll.view_own	{"admin": true, "leader": true, "member": true}	t	{}	{}	{}
payroll.manage	{"admin": true, "leader": false, "member": false}	t	{}	{}	{}
shifts.assign_staff	{"admin": true, "leader": true, "member": false}	f	{leader,admin}	{}	{}
shifts.import	{"admin": true, "leader": true, "member": false}	f	{leader,admin}	{}	{}
shifts.export	{"admin": true, "leader": true, "member": false}	f	{leader,admin}	{}	{}
reports.submit	{"admin": true, "leader": true, "member": true}	f	{member,leader,admin}	{leader}	{leader}
reports.review	{"admin": true, "leader": true, "member": false}	f	{leader,admin}	{leader}	{leader}
swaps.request	{"admin": true, "leader": true, "member": true}	f	{member,leader,admin}	{member,leader}	{member,leader}
swaps.approve	{"admin": true, "leader": true, "member": false}	f	{leader,admin}	{leader}	{leader}
attendance.record_own	{"admin": true, "leader": true, "member": true}	f	{member,leader,admin}	{member,leader}	{member,leader}
storage.upload	{"admin": true, "leader": true, "member": true}	f	{member,leader,admin}	{member,leader}	{member,leader}
storage.edit_own	{"admin": true, "leader": true, "member": true}	f	{member,leader,admin}	{}	{}
storage.delete	{"admin": true, "leader": true, "member": false}	f	{leader,admin}	{}	{}
\.


--
-- Data for Name: rbac02_account_permission_versions; Type: TABLE DATA; Schema: private; Owner: -
--

COPY private.rbac02_account_permission_versions (id, target_business_user_id, permission, version, expected_version, decision, actor_business_user_id, reason, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: rbac_runtime_gate; Type: TABLE DATA; Schema: private; Owner: -
--

COPY private.rbac_runtime_gate (id, enabled, changed_at) FROM stdin;
t	f	2026-11-07 10:19:12.528925+00
\.


--
-- Data for Name: account_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.account_requests (id, email, full_name, phone, department, status, provisioning_status, staff_id, auth_user_id, submitted_at, reviewed_at, reviewed_by, rejection_reason, provisioning_error_code, created_at, updated_at, version) FROM stdin;
\.


--
-- Data for Name: brands; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brands (id, name, logo_url, color, description, category, status, contact_person, contact_email, contact_phone, brand_guideline, tone_of_voice, key_products, mandatory_claims, restricted_claims, dos, donts, asset_links, notes, updated_by, created_at, updated_at, deleted_at, deleted_by, archived_at, archived_by, deletion_reason, storage_profile, storage_profile_reviewed_by, storage_profile_reviewed_at) FROM stdin;
\.


--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.campaigns (id, name, brand_id, start_date, end_date, type, notes, campaign_url, website_url, website_title, website_preview_image, website_embed_enabled, platform_source, platform_ids, status, owner_id, created_at, updated_at, deleted_at, deleted_by, archived_at, archived_by, deletion_reason) FROM stdin;
\.


--
-- Data for Name: platforms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platforms (id, name, icon, logo_url, platform_type, platform_url, status, account_information, policy_notes, livestream_rules, content_restrictions, technical_requirements, report_requirements, external_links, updated_by, created_at, updated_at, deleted_at, deleted_by, archived_at, archived_by, deletion_reason) FROM stdin;
\.


--
-- Data for Name: schedule_import_batches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schedule_import_batches (id, source, source_name, status, total_rows, valid_rows, invalid_rows, warning_rows, imported_rows, duplicate_rows, failed_rows, retryable_rows, created_by, created_at, updated_at, confirmed_at, deleted_at, deleted_by, deletion_reason) FROM stdin;
\.


--
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shifts (id, date, start_time, end_time, timezone, start_at, end_at, end_date, crosses_midnight, duration_minutes, brand_id, platform_id, campaign_id, title, studio, host_id, support_id, technical_id, required_host_count, required_support_count, required_technical_count, registration_locked, registration_cutoff_at, allow_multi_role, import_batch_id, status, live_link, product_notes, updated_by, created_at, updated_at, deleted_at, deleted_by, archived_at, archived_by, deletion_reason, host_names, assistant_names, technical_names, version, status_mode, execution_source, agency_code, supplemental_fields) FROM stdin;
\.


--
-- Data for Name: attendance_photo_drive_folders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attendance_photo_drive_folders (shift_id, event_kind, operational_role, provider, folder_id, parent_folder_id, logical_path, last_materialized_by, created_at, last_verified_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, created_at, actor_auth_user_id, actor_business_user_id, actor_name, actor_role, module, action, entity_type, entity_id, entity_name, before_data, after_data, changed_fields, reason, source, status, error_code, correlation_id, related_records, metadata, entity_exists) FROM stdin;
7a41de27-c25b-4f21-baf6-40e07daa069e	2026-11-07 10:19:10.94619+00	\N	\N	\N	\N	staff	create	business users	c4-rehearsal-admin	C4 Synthetic Admin	\N	{"id": "c4-rehearsal-admin", "role": "admin", "email": "c4-admin@example.invalid", "phone": null, "status": "active", "full_name": "C4 Synthetic Admin", "join_date": "2026-11-07", "avatar_url": null, "created_at": "2026-11-07T10:19:10.94619+00:00", "deleted_at": null, "deleted_by": null, "department": null, "updated_at": "2026-11-07T10:19:10.94619+00:00", "archived_at": null, "archived_by": null, "auth_user_id": "c4c00000-0000-4000-8000-000000000001", "auth_provider": "email", "account_status": "active", "email_verified": true, "deletion_reason": null, "operational_roles": ["host", "support", "technical"], "system_permission": "admin", "avatar_storage_path": null}	{account_status,archived_at,archived_by,auth_provider,auth_user_id,avatar_storage_path,avatar_url,created_at,deleted_at,deleted_by,deletion_reason,department,email,email_verified,full_name,id,join_date,operational_roles,phone,role,status,system_permission,updated_at}	\N	manual	success	\N	4228a24c-2e31-4631-9ee5-224d5f2c0909	\N	{"table": "business_users", "status": "active", "operation": "INSERT"}	t
910e705e-3ab8-46c3-96ca-61ddb588fd0a	2026-11-07 10:19:10.94619+00	\N	\N	\N	\N	staff	create	business users	c4-rehearsal-leader	C4 Synthetic Leader	\N	{"id": "c4-rehearsal-leader", "role": "leader", "email": "c4-leader@example.invalid", "phone": null, "status": "active", "full_name": "C4 Synthetic Leader", "join_date": "2026-11-07", "avatar_url": null, "created_at": "2026-11-07T10:19:10.94619+00:00", "deleted_at": null, "deleted_by": null, "department": null, "updated_at": "2026-11-07T10:19:10.94619+00:00", "archived_at": null, "archived_by": null, "auth_user_id": "c4c00000-0000-4000-8000-000000000002", "auth_provider": "email", "account_status": "active", "email_verified": true, "deletion_reason": null, "operational_roles": ["host"], "system_permission": "leader", "avatar_storage_path": null}	{account_status,archived_at,archived_by,auth_provider,auth_user_id,avatar_storage_path,avatar_url,created_at,deleted_at,deleted_by,deletion_reason,department,email,email_verified,full_name,id,join_date,operational_roles,phone,role,status,system_permission,updated_at}	\N	manual	success	\N	443b19e9-de88-4a50-aad2-e8374bddaab6	\N	{"table": "business_users", "status": "active", "operation": "INSERT"}	t
99012fea-9bdd-421b-b9f4-6a5a08009fcc	2026-11-07 10:19:10.94619+00	\N	\N	\N	\N	staff	create	business users	c4-rehearsal-member	C4 Synthetic Member	\N	{"id": "c4-rehearsal-member", "role": "staff", "email": "c4-member@example.invalid", "phone": null, "status": "active", "full_name": "C4 Synthetic Member", "join_date": "2026-11-07", "avatar_url": null, "created_at": "2026-11-07T10:19:10.94619+00:00", "deleted_at": null, "deleted_by": null, "department": null, "updated_at": "2026-11-07T10:19:10.94619+00:00", "archived_at": null, "archived_by": null, "auth_user_id": "c4c00000-0000-4000-8000-000000000003", "auth_provider": "email", "account_status": "active", "email_verified": true, "deletion_reason": null, "operational_roles": ["host"], "system_permission": "member", "avatar_storage_path": null}	{account_status,archived_at,archived_by,auth_provider,auth_user_id,avatar_storage_path,avatar_url,created_at,deleted_at,deleted_by,deletion_reason,department,email,email_verified,full_name,id,join_date,operational_roles,phone,role,status,system_permission,updated_at}	\N	manual	success	\N	6a3e2718-6fc2-4835-9b25-a15dd9c6ab62	\N	{"table": "business_users", "status": "active", "operation": "INSERT"}	t
\.


--
-- Data for Name: audit_log_reviews; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log_reviews (audit_id, admin_note, review_status, handling_reason, updated_by, updated_at) FROM stdin;
\.


--
-- Data for Name: brand01_products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_products (id, product_code, name, category, description, lifecycle_status, owner_id, version, created_by, updated_by, created_at, updated_at, archived_at, archived_by) FROM stdin;
\.


--
-- Data for Name: brand01_product_skus; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_product_skus (id, product_id, sku_code, variant_name, size_or_package, packaging_type, lifecycle_status, owner_id, version, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: brand01_campaign_product_skus; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_campaign_product_skus (campaign_id, sku_id, owner_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: storage_resources; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.storage_resources (id, provider, canonical_id, canonical_url, title, resource_type, owner_id, visibility, verification_status, verification_checked_at, verification_error_code, is_active, created_by, updated_by, created_at, updated_at) FROM stdin;
c4-rehearsal-owner-resource	google_drive	c4-owner-folder	https://drive.google.com/drive/folders/c4-owner-folder	Synthetic owner folder	root_folder	c4-rehearsal-admin	owner_only	unverified	\N	\N	t	c4-rehearsal-admin	c4-rehearsal-admin	2026-11-07 10:19:10.962765+00	2026-11-07 10:19:10.962765+00
c4-rehearsal-granted-resource	google_drive	c4-granted-folder	https://drive.google.com/drive/folders/c4-granted-folder	Synthetic granted folder	root_folder	c4-rehearsal-admin	granted_users	unverified	\N	\N	t	c4-rehearsal-admin	c4-rehearsal-admin	2026-11-07 10:19:10.962765+00	2026-11-07 10:19:10.962765+00
c4-rls-public	google_drive	c4-rls-public	https://drive.google.com/drive/folders/c4-rls-public	Synthetic public metadata	image	c4-rehearsal-admin	public	unverified	\N	\N	t	c4-rehearsal-admin	c4-rehearsal-admin	2026-11-07 10:19:18.544157+00	2026-11-07 10:19:18.544157+00
c4-rls-admin-only	google_drive	c4-rls-admin-only	https://drive.google.com/drive/folders/c4-rls-admin-only	Synthetic admin metadata	image	c4-rehearsal-admin	admin_only	unverified	\N	\N	t	c4-rehearsal-admin	c4-rehearsal-admin	2026-11-07 10:19:18.544157+00	2026-11-07 10:19:18.544157+00
\.


--
-- Data for Name: brand01_campaign_schemes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_campaign_schemes (id, campaign_id, sku_id, scheme_name, terms, eligibility, exclusions, valid_from, valid_to, owner_id, status, source_resource_id, source_url, reviewed_by, reviewed_at, version, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: brand01_catalog_audit_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_catalog_audit_events (id, table_name, record_id, action, actor_id, before_data, after_data, created_at) FROM stdin;
\.


--
-- Data for Name: brand01_product_knowledge_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_product_knowledge_versions (id, product_id, sku_id, knowledge_type, content, version, status, source_resource_id, source_url, source_reference, effective_from, effective_to, owner_id, created_by, reviewed_by, reviewed_at, created_at) FROM stdin;
\.


--
-- Data for Name: brand01_knowledge_reviews; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_knowledge_reviews (id, knowledge_version_id, decision, reviewer_id, reason, created_at) FROM stdin;
\.


--
-- Data for Name: brand01_product_brands; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_product_brands (product_id, brand_id, is_active, created_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: brand01_product_platform_skus; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_product_platform_skus (sku_id, platform_id, external_sku_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: brand01_product_resource_links; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_product_resource_links (id, resource_id, product_id, sku_id, campaign_id, relation_type, owner_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: brand01_user_brand_access; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand01_user_brand_access (grant_id, user_id, brand_id, access_level, granted_by, granted_at, expires_at, revoked_at, revoked_by) FROM stdin;
\.


--
-- Data for Name: operational_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.operational_files (id, scope_key, category, brand_id, platform_id, shift_id, campaign_id, period_date, execution_source, provider, external_file_id, external_parent_id, provider_metadata, folder_path, file_name, mime_type, size_bytes, checksum_sha256, integrity_status, artifact_key, uploaded_by, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: dashboard_updates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dashboard_updates (id, shift_id, "time", revenue, gmv, orders, peak_viewers, current_viewers, total_views, total_viewers, likes, comments, shares, screenshot_url, screenshot_storage_path, dashboard_platform, normalized_metrics, ocr_review, raw_ocr_output, notes, created_by, created_at, updated_at, deleted_at, screenshot_file_id) FROM stdin;
\.


--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reports (id, shift_id, status, revenue, orders, peak_viewer, average_viewer, likes, comments, shares, top_products, insights_good, insights_improvement, replay_url, dashboard_url, gmv, viewers, product_clicks, ctr, cvr, average_order_value, live_duration_minutes, dashboard_platform, normalized_metrics, platform_metrics, raw_ocr_output, ocr_review, final_recap, metrics_confirmed, confirmed_at, confirmed_by, submitted_by, reviewed_by, reviewed_at, review_notes, version_number, updated_by, created_at, updated_at, deleted_at, deleted_by, archived_at, archived_by, deletion_reason) FROM stdin;
\.


--
-- Data for Name: live_report_images; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.live_report_images (id, report_id, category, title, description, captured_at, file_url, thumbnail_url, file_name, mime_type, size_bytes, sort_order, is_cover, uploaded_by, created_at, updated_at, storage_file_name, storage_idempotency_key, provider, external_file_id, external_parent_id, checksum_sha256) FROM stdin;
\.


--
-- Data for Name: media_stream_routes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.media_stream_routes (id, brand_id, platform_id, studio, active_shift_id, media_path, active, created_at) FROM stdin;
\.


--
-- Data for Name: media_viewer_grants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.media_viewer_grants (id, auth_user_id, shift_id, valid_from, valid_until, active, created_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, title, message, type, read, created_at, recipient_id, notification_type, severity, related_entity_type, related_entity_id, action_url, event_key, read_at) FROM stdin;
\.


--
-- Data for Name: operational_schedule_source_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.operational_schedule_source_files (id, batch_id, provider, external_file_id, external_parent_id, provider_metadata, folder_path, file_name, mime_type, size_bytes, checksum_sha256, reconciliation_status, uploaded_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: operational_storage_domain_folders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.operational_storage_domain_folders (folder_path, folder_id, parent_folder_id, access_classification, active, verified_created, created_at, updated_at) FROM stdin;
00_ADA_OPS_PLATFORM/07_ANALYTICS_BI/05_COST_ACTUAL_VS_PLAN	1_BXvqXmFb2OYa9x6eE7Nt2jw5cihxpiG	1coUaRS-LSXq2xfm3imclH663EpPrtbfo	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT	1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/02_NORMALIZED_SNAPSHOTS	1ydCV8n11ikxWc982kvxhgBIjeSaNNg-x	1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/03_SCHEDULE_EXPORTS	1MlmQBAY3PKfYmDLdn8E1V8xDilcWrWVo	1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/04_IMPORT_TEMPLATES	10Dd7EXwlc_1SyLlBQTkrvAOJv9bvyJF5	1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/05_IMPORT_AUDIT_LOGS	1YSihS1fyHE_7CwcQhPC82ApCb05GvM1X	1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/06_DUPLICATE_RECONCILIATION	1Onqqr8wp-czIzdWXS9rmIn9lAN37ZPfm	1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING	1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/01_SHIFT_MANIFESTS	1P5_HClbESXe1uOVB28zV0hriUCcvhhJV	1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/02_STAFFING_SEGMENTS	14JyOe3lBZ17XBY3AiUmFRvW8V6cfruOW	1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/03_REGISTRATION_APPROVAL	1RcZQOH75-SyIYuBKIYlfr-fsKkOLPK3D	1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/04_PASS_SWAP_HANDOFF	1XMGfJ1krBOyCUXlU1vHMaDJWxxZfQHRt	1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE	1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi	19t3RguHpduM9GXBFquCRvUKU4MXmXgtA	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/01_UNROUTED_ARTIFACTS_HOLD	12sYCUG3R0HLpFifKB5JqQrvuJ5GC3Ta_	19t3RguHpduM9GXBFquCRvUKU4MXmXgtA	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/02_PERIODIC_REPORT_EXPORTS	1gcNO9AZiLJUmsty5UIyLnLBlcN6RbE1I	19t3RguHpduM9GXBFquCRvUKU4MXmXgtA	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/03_REPORT_FILE_MANIFESTS	1wTICICrE4-FDXsUrSTTL0A9rjaAd7Ae1	19t3RguHpduM9GXBFquCRvUKU4MXmXgtA	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/04_BACKFILL_RECONCILIATION	1MOBORV1btZ6sKMOAqIHxdPIZeIlP-JNa	19t3RguHpduM9GXBFquCRvUKU4MXmXgtA	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS	10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/01_BRAND_LOGOS_GUIDELINES	1EcE8q2RZi33pQbO4_kWurmu3h81z6Hly	10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/02_KEY_VISUAL_ASSETS	1igGLxhfjtUiAxk0KMdT2Z8FTVyNkHxhy	10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/03_PRODUCT_PACKSHOTS	1IslTBDUfqGyjDE0mm-BVjD9l749RFqh8	10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/04_CAMPAIGN_ASSETS	1sV1boY0-bZl7fchdujSpTMl8tj3ilb7b	10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/05_LIVECUT_TEASERS	1drCcEN3ruH8iWiEnlPWJt4mFUWLedhgZ	10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/06_THUMBNAILS	1dqOorntrmqgVRhMH0Iy1a1_KXAdv21ag	10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/07_VIDEO_OUTPUTS	11NXPwLhCGo0S7eavOaztoJ2iRrDTUDkB	10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/08_SCRIPT_BRIEFS	1hLlt4LUBlGLl2m10hynxH2kCyjmHPyBg	10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/05_BRAND_CATALOG	1afOcAufbaf1Kv8q0CfGzUamohF62RWUz	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/05_BRAND_CATALOG/01_BRAND_MASTER	1VAB_nh6RshtOFegJZTacXW34yOi7DAqU	1afOcAufbaf1Kv8q0CfGzUamohF62RWUz	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/05_BRAND_CATALOG/02_PRODUCT_SKU_MASTER	1TsUNt2bLnmb8GIBbfHJiYZQR3JBnD_OI	1afOcAufbaf1Kv8q0CfGzUamohF62RWUz	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/05_BRAND_CATALOG/03_VARIANTS_ATTRIBUTES	1cMrZuM5Ee8XF69bcUoEkp7BnqmeGvg4o	1afOcAufbaf1Kv8q0CfGzUamohF62RWUz	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/05_BRAND_CATALOG/04_APPROVED_CLAIMS	1ZB5qkAmOgOXT6IgO0ZBl1yOJbaD1QFYy	1afOcAufbaf1Kv8q0CfGzUamohF62RWUz	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/05_BRAND_CATALOG/05_CATALOG_EXPORTS	1X44_Qrr9sR5X34B7_PQiQ2NZu5Q1aw9c	1afOcAufbaf1Kv8q0CfGzUamohF62RWUz	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION	1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION/01_TIKTOK_SHOP_RAW	1Z10VxtGTTse1Bt3feMbH-EtFItppt5iF	1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION/02_SHOPEE_RAW	1TCQu2_wJv-l1av7CMw3K8Ku8sueTFzh-	1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION/03_NORMALIZED_DATA	1dkWx5OA644tOFld6F25-yIDmMYkPtMK9	1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION/04_OCR_INPUTS	1Qdipe-pTLPmwv4LSV8uRxCEl02ibFLle	1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION/05_DATA_QUALITY	1J8Yi0ejOfgGxPvWI9uLC8p8hW1HCpXdG	1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/07_ANALYTICS_BI	1coUaRS-LSXq2xfm3imclH663EpPrtbfo	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/07_ANALYTICS_BI/01_SHIFT_PERFORMANCE_METRICS	1Haub-HOODGdvlaexDwTpL43eN_09SaHe	1coUaRS-LSXq2xfm3imclH663EpPrtbfo	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/07_ANALYTICS_BI/02_BRAND_PERIOD_REPORTS	18R8T7fSAnAWEnmbywvA5FhKg55zM4s4e	1coUaRS-LSXq2xfm3imclH663EpPrtbfo	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/07_ANALYTICS_BI/03_WORKFORCE_PERFORMANCE_AGGREGATES	17deEVr6oxybpixDRWyVe5Z51AemZXe4x	1coUaRS-LSXq2xfm3imclH663EpPrtbfo	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/07_ANALYTICS_BI/04_BI_DASHBOARD_EXPORTS	1dUf2c-FBnhOkkGu9yJ8k7IIbP89JIL_W	1coUaRS-LSXq2xfm3imclH663EpPrtbfo	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS	1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE	1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG	1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS	1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7	1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS	1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna	1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/04_RATE_CARDS	1uHn3hJIKnzgo4r_YBB_jvSwdAYqBJGyY	1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/05_PERSONNEL_RECORDS	1A6QgDPZ6mxaDWWIT4hwsFZzXzbDW0aMM	1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/06_ACCESS_AUDIT	1Ole-hOkRoAS4jrIFzE_XZcaLf-bDbNjE	1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS	11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/01_STORAGE_ROUTE_REGISTRY	1bef3yLtPZsU0HNXgYfkDx5y3MVrG5wUx	11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/02_SCHEMA_MIGRATION_DOCS	1O8kz7pco0MQGfQMppYUWdCzQ_mmaJFBq	11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/03_RECOVERY_RECONCILIATION	1PZBbX_jmo4xEneC8_1yfCNb6fg859iNA	11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/04_INTEGRATION_DIAGNOSTICS	18bQH4hIewmYe1ul-NRMA5l_a1G1W_0ps	11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/06_RETENTION_POLICIES	1XRMBqVBEbq0CAWl6Rrb_LNzf66npJpvL	11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/07_RELEASE_UAT_EVIDENCE	177g-GBHRY06rHx9ID8rpQOqR-uve9-kj	11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/08_DATA_DICTIONARY	1zT5M87qDu6KI2XaZqyyU7qOG_Sc3D4jA	11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE	1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/01_CONTENT_RESEARCH	1EdhNSgPdqUJhjRHx3EPcaC4uXuQWV7z4	1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/02_CONTENT_SCRIPTS	1ooA44422iqWYOoIRlYx4duPB8g8oXwRz	1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/03_MARKET_RESEARCH	1gaDe8-ubDCq9MkbRbBaMPaqdhdyWN68n	1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/04_AGENT_OUTPUTS	1TvP2RSI86jps1Fb-O3tFz4_1hI--nIso	1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/05_PROMPT_TEMPLATES	1NhWNle235MU8w2N232LRNbXiCRiXjwwe	1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/06_MEDIA_AUTOMATION	18GI0al5vqRz_1rhJbVX3M_93kI3guiSD	1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED	1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED/01_CONTRACTS_SOW	1jSRkH_VRA9Gf_5uLE_fu0EDMGuY3fwhB	1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED/02_ACCEPTANCE_BBNT	1V-m1bFCnB9PrvYVvuurrOd25A1BIUFGE	1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED/03_INVOICES_PAYMENTS	17MtKcYJkccBwa1A78NwH5PZaT92D1BXR	1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED/04_FINANCE_TRACKERS	1iGJtAcCwMj2YBmys2-jZpTGMCSZH7yfC	1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/12_ARCHIVE_IMPORT_LEGACY	1bFSEPaeY0qCtno_KHfWBezsVBYq4Y1db	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/12_ARCHIVE_IMPORT_LEGACY/01_LEGACY_FOLDER_INDEX	1jsnhqSMnLomnidWjO9Dbf8YODU-KOP8-	1bFSEPaeY0qCtno_KHfWBezsVBYq4Y1db	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/12_ARCHIVE_IMPORT_LEGACY/02_MIGRATION_RECONCILIATION	1CRbfRN5H6bt3Uk9krd0RXMuz4QNUbCUK	1bFSEPaeY0qCtno_KHfWBezsVBYq4Y1db	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/12_ARCHIVE_IMPORT_LEGACY/03_RETIRED_EXPORTS	1XO02WIgJ9BHyen0CKdUmDGjJJ17Ty3n1	1bFSEPaeY0qCtno_KHfWBezsVBYq4Y1db	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT	1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT/01_TASK_TRACKERS	1riyV0OKp6FLuEik2KLutaSjGxUPmJIqB	1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT/02_STANDARD_OPERATING_PROCEDURES	16C-fjr62MSC0N1K9poU0a6vnlorc0lUS	1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT/03_UI_UX_REFERENCE_SCREENSHOTS	1F-4xI_s-dKfeV7JUBnssaPl6n_bGQj3q	1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT/04_ONBOARDING_KNOWLEDGE_BASE	1WEaJ41ZtJ-DK_8tvcY3jb3raTMdkCDn3	1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ	shared	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/01_KV_BEFORE_LIVE	1s99VtJ1Ln_5PXyCm5CdmPftcIr6vmBju	1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi	shared_schema_template_only	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/02_KV_AFTER_LIVE	1e05QmP_mjF1uMz4LI2mHge9tYx2a0IH0	1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi	shared_schema_template_only	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/03_DASHBOARD_SUMMARY	1YO61dHPf_YOKvBbGG4KnZOwrGitl5mZz	1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi	shared_schema_template_only	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/04_DASHBOARD_30MIN	1ZooEGViKANQG6HyAPDEg2o-wFs8C28KD	1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi	shared_schema_template_only	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/05_LIVE_SESSION_PHOTOS	1C35IMZtWRh1sGnxqFFWHwyTbEg56lorg	1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi	shared_schema_template_only	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/06_OTHER_EVIDENCE	1kg41d6QleIam2KhF52mwycjZSH-M-duP	1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi	shared_schema_template_only	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/07_FINAL_REPORT_AND_INSIGHTS	1uZyj_B0hXQJfnouQEkkEef0pa9W6be9n	1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi	shared_schema_template_only	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/08_METRICS_DATA_SNAPSHOTS	151jA6sN5ivLyRCMkj9MQXrrxxaL6SOha	1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi	shared_schema_template_only	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/09_FILE_MANIFEST_CHECKSUMS	1-m6q6pkOe5lvUqjUVme9mK7zkQkNasJs	1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi	shared_schema_template_only	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/01_RAW_XLSX_CSV	1vikkWOtthV4ZebZxr3JZF5NkchrNaV15	1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/05_STAFFING_EXPORTS	1ya58ltFDDzSg5-jtN2C6LeP8ETqMJpCz	1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/03_LIVE_REPORTS	19t3RguHpduM9GXBFquCRvUKU4MXmXgtA	1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/05_DATA_EXPORT_BACKUPS	1hRc_c9T9z5N1NN2vtN1Vnt64x6Jklmqg	11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC	pending_restriction_no_sensitive_upload	t	t	2026-11-07 10:19:05.991133+00	2026-11-07 10:19:06.684026+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/01_CHECKIN_PHOTOS	1-CdyoEbNj0eFuwVd72sJPoqBxla4cF4m	1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/02_CHECKOUT_PHOTOS	14UbygcI5M5GYEjfkkoxR91tWxyLSqYwd	1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/03_LATE_NO_SHOW_EVIDENCE	1Md4kTjCr2uBSyb8qMMkoHTFeEG1wr7H6	1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/04_REVIEW_AND_CORRECTIONS	1iwvU_BTNEEAK2WtBqU2iMc87CPhaktJR	1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/05_FILE_MANIFESTS_CHECKSUMS	1eWmTddA2Kboak6LHXgnojkSP1JzkKyq3	1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/01_CHECKIN_EVENT_SNAPSHOTS	1V4G06V5dTcDtXPTa4TYHE5sxZ-HYtTqx	1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/02_CHECKOUT_EVENT_SNAPSHOTS	1RxpMbQSpJiLB7HD_t4gho2ccf9FuHbhd	1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/03_REVIEW_DECISION_SNAPSHOTS	1y2HJHAozyEP7AWNSW8Ka_uaESOPmxXM3	1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/04_APPROVED_ACTUAL_HOURS_SNAPSHOTS	1RGFh8qM0DJATFUNIkxtFvM5rN-CL-fQo	1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/05_RECONCILIATION_AUDIT	1XjsybCzv5vyKqxu00L2l4Nq7coARGrrO	1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/06_EXPORTS	1PZeeFukjyvGVQz-IEfsIxUW1aUnQFrAq	1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/01_DRAFT_CALCULATIONS	1_cxIezRWXmlQeupGx8DeZXgQovwtm_N1	1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/02_REVIEW_APPROVALS	1M7TAy0NgNfa17pZC_-NNr43u3425_jlu	1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/03_LOCKED_PUBLISHED_STATEMENTS	1is7hTY1rM1KQF09ce2hA3pAQ1hr74i_m	1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/04_PERSONAL_PAYSLIPS	1wGruAoc2SiGlOhyPB73_RQP6eVa8DyqC	1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/05_ADJUSTMENTS_CORRECTIONS	163BtV3erjzNMAYt57wlL5oDb72yhlPed	1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/06_RECONCILIATION	1481hW5yuEntTyx9NCHDPUxUHasSdypDO	1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/07_EXPORTS_BACKUPS	12x4mOCgmmYFDnvuNo1ogPU8hEIygeG9o	1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/08_VERSION_MANIFESTS	1TlxdE_zSMYgxlW_rOM92-wpFpctDDM5N	1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/04_RATE_CARDS/01_ACTIVE_APPROVED_RATES	1z1C-I-KsqcGiqBlHZh9c33W_ebnVyDVE	1uHn3hJIKnzgo4r_YBB_jvSwdAYqBJGyY	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/04_RATE_CARDS/02_HISTORICAL_RATE_VERSIONS	1x4wqaosSSZxpLXLC-6pnK9Hra2d0a2c6	1uHn3hJIKnzgo4r_YBB_jvSwdAYqBJGyY	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/04_RATE_CARDS/03_RATE_REVIEW_APPROVALS	11NfWSNfWV4hNYK7QvAWn5XHmsAHqYYEI	1uHn3hJIKnzgo4r_YBB_jvSwdAYqBJGyY	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/04_RATE_CARDS/04_RATE_CHANGE_AUDIT	1nTv-y1oRHwMgU4VIHo_RKGP3D3J8L37f	1uHn3hJIKnzgo4r_YBB_jvSwdAYqBJGyY	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/05_PERSONNEL_RECORDS/01_STAFF_PROFILE_SNAPSHOTS	1chy-Q0wrvWJxBossy-pHdSCpBPgdNNmL	1A6QgDPZ6mxaDWWIT4hwsFZzXzbDW0aMM	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/05_PERSONNEL_RECORDS/02_ROLE_ASSIGNMENT_HISTORY	1O8sB_MSErYdxuyPCUhR-uS-bG9CYWnyy	1A6QgDPZ6mxaDWWIT4hwsFZzXzbDW0aMM	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/05_PERSONNEL_RECORDS/03_CONTRACT_REFERENCES	1EmsF9hpGXuRpDOwbqHKJhVHXymskk4gL	1A6QgDPZ6mxaDWWIT4hwsFZzXzbDW0aMM	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/05_PERSONNEL_RECORDS/04_ONBOARDING_OFFBOARDING	1ePfpauUVTJEmvAZ-IjyI4EaDiQ0pUz_h	1A6QgDPZ6mxaDWWIT4hwsFZzXzbDW0aMM	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/06_ACCESS_AUDIT/01_FILE_ACCESS_EVENTS	1dgoG7AJdoHA_BC7zw7qsmHBUEqoe8G39	1Ole-hOkRoAS4jrIFzE_XZcaLf-bDbNjE	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/06_ACCESS_AUDIT/02_DATA_OBJECT_CHANGE_AUDIT	1h3Kou3v99PS8D0cmawC4KSLRnMlLbuQs	1Ole-hOkRoAS4jrIFzE_XZcaLf-bDbNjE	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/06_ACCESS_AUDIT/03_ROLE_PERMISSION_CHANGE_AUDIT	1gc76L-q7Reinok4-3gQVVZ_nUTqvEMcm	1Ole-hOkRoAS4jrIFzE_XZcaLf-bDbNjE	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/06_ACCESS_AUDIT/04_RETENTION_AND_RECOVERY_AUDIT	11wQoX-NxmZmsWUhlmDy3RdZN60fl0YaC	1Ole-hOkRoAS4jrIFzE_XZcaLf-bDbNjE	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/01_DRAFT_CALCULATIONS/2026	1jtUrYvWrPBBRd6sriYaf7tSv42aXjWI1	1_cxIezRWXmlQeupGx8DeZXgQovwtm_N1	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/02_REVIEW_APPROVALS/2026	1h69Epo9VrRXyifc5tpPOhNjtDVNztc-5	1M7TAy0NgNfa17pZC_-NNr43u3425_jlu	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/03_LOCKED_PUBLISHED_STATEMENTS/2026	1C9UcMOhE7iiBXI3IgTe-GWr47x6Pge9g	1is7hTY1rM1KQF09ce2hA3pAQ1hr74i_m	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/04_PERSONAL_PAYSLIPS/2026	13qjQ0hrQRBqJqbwO6NSox663BDGdibf-	1wGruAoc2SiGlOhyPB73_RQP6eVa8DyqC	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/05_ADJUSTMENTS_CORRECTIONS/2026	1VpAWI-stZCUBWWt1GGYOdfl3c5nPMAQE	163BtV3erjzNMAYt57wlL5oDb72yhlPed	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/06_RECONCILIATION/2026	17dYa053vzDrO3rLr4F2Qvbf45hheVdRK	1481hW5yuEntTyx9NCHDPUxUHasSdypDO	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/07_EXPORTS_BACKUPS/2026	1HJw_YRjcv9bnjyhQ8IGW_eWgAcgu8Quv	12x4mOCgmmYFDnvuNo1ogPU8hEIygeG9o	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/08_VERSION_MANIFESTS/2026	1CiIZ3pAcBcJ_lKRmlawxh3rnTujTsxEg	1TlxdE_zSMYgxlW_rOM92-wpFpctDDM5N	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/01_DRAFT_CALCULATIONS/2026/THÁNG 10	1tSIouQQl7Fm9tF3oGB56YVUBhAf81zh-	1jtUrYvWrPBBRd6sriYaf7tSv42aXjWI1	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/01_DRAFT_CALCULATIONS/2026/THÁNG 11	1muA5AV1P9Ofop15Z6uY9aLsMvqlepnYV	1jtUrYvWrPBBRd6sriYaf7tSv42aXjWI1	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/02_REVIEW_APPROVALS/2026/THÁNG 10	1TDcbocRB1eCUCUKQrL3poxNmACeEM7k6	1h69Epo9VrRXyifc5tpPOhNjtDVNztc-5	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/02_REVIEW_APPROVALS/2026/THÁNG 11	1edLF9xIRLYapkK6xAhOBqup_Q_vXlShe	1h69Epo9VrRXyifc5tpPOhNjtDVNztc-5	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/03_LOCKED_PUBLISHED_STATEMENTS/2026/THÁNG 10	191Xd8TsZr1cb2OCda_DyTvTmH2jwUZ_0	1C9UcMOhE7iiBXI3IgTe-GWr47x6Pge9g	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/03_LOCKED_PUBLISHED_STATEMENTS/2026/THÁNG 11	12qi7fna33MOeSZ2vsdpnVLpiVzQod5Hl	1C9UcMOhE7iiBXI3IgTe-GWr47x6Pge9g	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/04_PERSONAL_PAYSLIPS/2026/THÁNG 10	1CGYyREKBhHgoW6mMIjOiwpr9UI-CM077	13qjQ0hrQRBqJqbwO6NSox663BDGdibf-	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/04_PERSONAL_PAYSLIPS/2026/THÁNG 11	1VvjEeyvytUzP4qJdvUDUhp6x3oVpxJab	13qjQ0hrQRBqJqbwO6NSox663BDGdibf-	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/05_ADJUSTMENTS_CORRECTIONS/2026/THÁNG 10	18TZPc5vc4yrvx_P8DoJPgBk2-F3XOl3Z	1VpAWI-stZCUBWWt1GGYOdfl3c5nPMAQE	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/05_ADJUSTMENTS_CORRECTIONS/2026/THÁNG 11	1fkOSoL5_SKO-z_Gs5I1QKYUTskmI8_yv	1VpAWI-stZCUBWWt1GGYOdfl3c5nPMAQE	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/06_RECONCILIATION/2026/THÁNG 10	1hHYXdT0v3qxtzJ9Qm0rys28v0KA2y3CW	17dYa053vzDrO3rLr4F2Qvbf45hheVdRK	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/06_RECONCILIATION/2026/THÁNG 11	122SGoq9LhbwLsXG0M1UeNN0CTt8BIxxq	17dYa053vzDrO3rLr4F2Qvbf45hheVdRK	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/07_EXPORTS_BACKUPS/2026/THÁNG 10	1D8Z1YahNWShSfxzQlfHOSK0Sf1lEiQCW	1HJw_YRjcv9bnjyhQ8IGW_eWgAcgu8Quv	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/07_EXPORTS_BACKUPS/2026/THÁNG 11	1JUSizDWbok_hRR1uVL4BxmH62SsoqwCL	1HJw_YRjcv9bnjyhQ8IGW_eWgAcgu8Quv	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/08_VERSION_MANIFESTS/2026/THÁNG 10	1pehrcMnUwnONvR0MBLS8CqVTY3u5-A7L	1CiIZ3pAcBcJ_lKRmlawxh3rnTujTsxEg	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/08_VERSION_MANIFESTS/2026/THÁNG 11	1C22Whj8ST4Ot3l57DArXLCbAUNINvtvj	1CiIZ3pAcBcJ_lKRmlawxh3rnTujTsxEg	restricted_pending_app_acl_verification	f	t	2026-11-07 10:19:08.149543+00	2026-11-07 10:19:08.149543+00
\.


--
-- Data for Name: operational_storage_drive_probe_rate_limits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.operational_storage_drive_probe_rate_limits (actor_auth_user_id, window_started_at, request_count) FROM stdin;
\.


--
-- Data for Name: operational_storage_drive_probe_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.operational_storage_drive_probe_runs (id, actor_auth_user_id, actor_business_user_id, actor_role, mode, status, folder_id, expected_parent_id, provider_file_id, provider_parent_id, checksum_sha256, folder_can_add_children, readback_verified, cleanup_status, error_code, created_at, completed_at) FROM stdin;
\.


--
-- Data for Name: operational_storage_folder_locks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.operational_storage_folder_locks (lock_key, lock_owner, expires_at) FROM stdin;
\.


--
-- Data for Name: operational_storage_routes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.operational_storage_routes (id, provider, execution_source, brand_id, platform_id, subbrand_key, storage_profile, root_folder_id, base_folder_id, folder_labels, period_naming_style, period_label_overrides, period_date_ranges, folder_label_overrides, active, approved_by, approved_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: rc19_leader_brand_scopes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rc19_leader_brand_scopes (id, leader_business_user_id, brand_id, scope_key, status, valid_from, valid_until, revoked_at, version, granted_by, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: rc19_leader_brand_scope_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rc19_leader_brand_scope_events (id, scope_id, leader_business_user_id, brand_id, scope_key, event_type, prior_status, new_status, version, actor_business_user_id, reason, occurred_at) FROM stdin;
\.


--
-- Data for Name: stored_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stored_files (id, provider, external_file_id, external_parent_id, provider_metadata, logical_category, folder_path, file_name, mime_type, size_bytes, checksum_sha256, artifact_key, report_id, shift_id, report_version, uploaded_by, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: rc19_report_artifact_deletions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rc19_report_artifact_deletions (operation_id, stored_file_id, report_id, provider, external_file_id, external_parent_id, requested_by, lease_actor, status, fencing_version, lease_owner, lease_expires_at, attempt_count, last_error_code, created_at, updated_at, completed_at) FROM stdin;
\.


--
-- Data for Name: rc19_report_artifact_deletion_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rc19_report_artifact_deletion_events (id, operation_id, status, fencing_version, actor_business_user_id, occurred_at) FROM stdin;
\.


--
-- Data for Name: rc19_report_export_audit; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rc19_report_export_audit (id, actor_business_user_id, report_count, export_kind, occurred_at) FROM stdin;
\.


--
-- Data for Name: report_images; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.report_images (id, report_id, image_url, storage_path, original_name, mime_type, size_bytes, image_type, uploaded_by, created_at, updated_at, deleted_at, provider, external_file_id, external_parent_id, checksum_sha256) FROM stdin;
\.


--
-- Data for Name: report_revisions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.report_revisions (id, report_id, version, created_by, created_at, status, reason, event, metrics, ocr_review, final_recap, image_references) FROM stdin;
\.


--
-- Data for Name: schedule_import_batch_rows; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schedule_import_batch_rows (id, batch_id, row_number, outcome, shift_id, source_row, failure_code, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: self_attendance_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.self_attendance_events (id, request_id, shift_id, staff_id, operational_role, event_kind, recorded_at, verification_status, evidence_note) FROM stdin;
\.


--
-- Data for Name: self_attendance_photo_evidence; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.self_attendance_photo_evidence (id, request_id, shift_id, staff_id, operational_role, provider, external_file_id, external_parent_id, file_name, mime_type, size_bytes, checksum_sha256, shift_context, capture_source, created_at, event_kind) FROM stdin;
\.


--
-- Data for Name: shift_registrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shift_registrations (id, shift_id, user_id, operational_role, status, source, requested_at, reviewed_by, reviewed_at, review_notes, cancelled_at, created_at, updated_at, imported_name, match_method, version) FROM stdin;
\.


--
-- Data for Name: storage_resource_audit_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.storage_resource_audit_events (id, resource_id, action, actor_id, before_data, after_data, created_at) FROM stdin;
1	c4-rehearsal-owner-resource	resource_insert	\N	\N	{"id": "c4-rehearsal-owner-resource", "title": "Synthetic owner folder", "owner_id": "c4-rehearsal-admin", "provider": "google_drive", "is_active": true, "created_at": "2026-11-07T10:19:10.962765+00:00", "created_by": "c4-rehearsal-admin", "updated_at": "2026-11-07T10:19:10.962765+00:00", "updated_by": "c4-rehearsal-admin", "visibility": "owner_only", "canonical_id": "c4-owner-folder", "canonical_url": "https://drive.google.com/drive/folders/c4-owner-folder", "resource_type": "root_folder", "verification_status": "unverified", "verification_checked_at": null, "verification_error_code": null}	2026-11-07 10:19:10.962765+00
2	c4-rehearsal-granted-resource	resource_insert	\N	\N	{"id": "c4-rehearsal-granted-resource", "title": "Synthetic granted folder", "owner_id": "c4-rehearsal-admin", "provider": "google_drive", "is_active": true, "created_at": "2026-11-07T10:19:10.962765+00:00", "created_by": "c4-rehearsal-admin", "updated_at": "2026-11-07T10:19:10.962765+00:00", "updated_by": "c4-rehearsal-admin", "visibility": "granted_users", "canonical_id": "c4-granted-folder", "canonical_url": "https://drive.google.com/drive/folders/c4-granted-folder", "resource_type": "root_folder", "verification_status": "unverified", "verification_checked_at": null, "verification_error_code": null}	2026-11-07 10:19:10.962765+00
3	c4-rehearsal-granted-resource	grant_insert	\N	\N	{"user_id": "c4-rehearsal-member", "created_at": "2026-11-07T10:19:10.968648+00:00", "granted_by": "c4-rehearsal-admin", "revoked_at": null, "resource_id": "c4-rehearsal-granted-resource"}	2026-11-07 10:19:10.968648+00
4	c4-rls-public	resource_insert	\N	\N	{"id": "c4-rls-public", "title": "Synthetic public metadata", "owner_id": "c4-rehearsal-admin", "provider": "google_drive", "is_active": true, "created_at": "2026-11-07T10:19:18.544157+00:00", "created_by": "c4-rehearsal-admin", "updated_at": "2026-11-07T10:19:18.544157+00:00", "updated_by": "c4-rehearsal-admin", "visibility": "public", "canonical_id": "c4-rls-public", "canonical_url": "https://drive.google.com/drive/folders/c4-rls-public", "resource_type": "image", "verification_status": "unverified", "verification_checked_at": null, "verification_error_code": null}	2026-11-07 10:19:18.544157+00
5	c4-rls-admin-only	resource_insert	\N	\N	{"id": "c4-rls-admin-only", "title": "Synthetic admin metadata", "owner_id": "c4-rehearsal-admin", "provider": "google_drive", "is_active": true, "created_at": "2026-11-07T10:19:18.544157+00:00", "created_by": "c4-rehearsal-admin", "updated_at": "2026-11-07T10:19:18.544157+00:00", "updated_by": "c4-rehearsal-admin", "visibility": "admin_only", "canonical_id": "c4-rls-admin-only", "canonical_url": "https://drive.google.com/drive/folders/c4-rls-admin-only", "resource_type": "image", "verification_status": "unverified", "verification_checked_at": null, "verification_error_code": null}	2026-11-07 10:19:18.544157+00
\.


--
-- Data for Name: storage_resource_edit_grants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.storage_resource_edit_grants (resource_id, user_id, decision, granted_by, created_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: storage_resource_scopes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.storage_resource_scopes (id, resource_id, brand_id, campaign_id, platform_id, shift_id, staff_id, client_group_key, sku_key, year, month, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: storage_resource_user_grants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.storage_resource_user_grants (resource_id, user_id, granted_by, created_at, revoked_at) FROM stdin;
c4-rehearsal-granted-resource	c4-rehearsal-member	c4-rehearsal-admin	2026-11-07 10:19:10.968648+00	\N
\.


--
-- Data for Name: swap_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.swap_requests (id, requester_id, source_registration_id, source_shift_id, target_shift_id, counterpart_registration_id, counterpart_id, operational_role, mode, status, reason, notes, created_at, updated_at, responded_at, responded_by, approved_at, approved_by, completed_at, shift_id, original_staff_id, replacement_staff_id, new_host_id, new_support_id, new_technical_id, approval_history, deleted_at, deleted_by, deletion_reason, version) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_settings (id, require_shift_capacity_validation, require_time_overlap_validation, allow_leader_schedule_edit, strict_host_role_binding, default_view_mode, calendar_density, show_unassigned_shifts, updated_at, registration_cutoff_hours, require_registration_approval, auto_lock_filled_shifts, allow_multi_role_per_shift, default_host_count, default_support_count, default_technical_count) FROM stdin;
bdb8e86e-d3e2-42bd-89db-5661927ffc4e	t	t	f	t	timeline	comfortable	t	2026-11-07 10:18:56.944423+00	6	t	t	f	1	1	1
\.


--
-- Data for Name: workforce_actual_segments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workforce_actual_segments (id, shift_id, staff_id, operational_role, event_kind, coverage_kind, actual_start_at, actual_end_at, review_status, evidence_note, review_note, created_by, reviewed_by, reviewed_at, created_at, updated_at, version) FROM stdin;
\.


--
-- Data for Name: workforce_attendance_import_batches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workforce_attendance_import_batches (id, source_type, source_name, source_fingerprint, brand_id, timezone, status, total_rows, matched_rows, exception_rows, drafted_segments, metadata, created_by, created_at, updated_at, version) FROM stdin;
\.


--
-- Data for Name: workforce_attendance_import_rows; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workforce_attendance_import_rows (id, batch_id, source_row_number, raw_payload, parsed_date, parsed_start_time, parsed_end_time, parsed_start_at, parsed_end_at, raw_staff_name, raw_role, raw_notes, matched_shift_id, matched_staff_id, operational_role, coverage_kind, evidence_kind, status, exception_code, exception_detail, resulting_segment_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: workforce_payroll_periods; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workforce_payroll_periods (id, period_start, period_end, status, revision, created_by, reviewed_by, confirmed_by, locked_by, locked_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: workforce_rate_cards; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workforce_rate_cards (id, staff_id, operational_role, effective_from, effective_through, vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note, created_at) FROM stdin;
\.


--
-- Data for Name: workforce_payroll_lines; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workforce_payroll_lines (id, period_id, segment_id, rate_card_id, staff_id, operational_role, actual_minutes, payable_minutes, overtime_minutes, rate_vnd_per_hour, overtime_multiplier_basis_points, gross_vnd, adjustment_vnd, adjustment_reason, calculation_version, created_at, version, updated_at, voided_at) FROM stdin;
\.


--
-- Data for Name: workforce_payroll_audit; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workforce_payroll_audit (id, period_id, action, from_status, to_status, actor_id, reason, created_at, line_id, line_version, request_id, request_payload, previous_values, updated_values, rate_card_id) FROM stdin;
\.


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.buckets (id, name, public, file_size_limit, allowed_mime_types) FROM stdin;
profile-avatars	profile-avatars	t	5242880	{image/png,image/jpeg,image/webp}
report-images	report-images	f	10485760	\N
live-dashboard-images	live-dashboard-images	f	10485760	{image/png,image/jpeg,image/webp}
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.objects (id, bucket_id, name, owner_id, owner, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: supabase_migrations; Owner: -
--

COPY supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback) FROM stdin;
20260811110219	{source_file=supabase/migrations/20260811110219_p1b_foundation.sql,sha256=950b7163d685eaeca92d50bf44adf7e1c59cdfe0c6d06bbc880bbe6b8e84db69}	p1b_foundation	codex-local-rehearsal	rc19-c4:20260811110219:950b7163d685eaeca92d50bf44adf7e1c59cdfe0c6d06bbc880bbe6b8e84db69	\N
20260811110239	{source_file=supabase/migrations/20260811110239_p1b_master_data.sql,sha256=5fcb549ed2266abe445c346e36e2127fbef8ab5a124cf82c82ae152151e5fac7}	p1b_master_data	codex-local-rehearsal	rc19-c4:20260811110239:5fcb549ed2266abe445c346e36e2127fbef8ab5a124cf82c82ae152151e5fac7	\N
20260811112834	{source_file=supabase/migrations/20260811112834_p1b_production_bootstrap.sql,sha256=344da213e3c98cd9b48d67b1268e5c656066e9f02450f1e021bd2cf86d0ea668}	p1b_production_bootstrap	codex-local-rehearsal	rc19-c4:20260811112834:344da213e3c98cd9b48d67b1268e5c656066e9f02450f1e021bd2cf86d0ea668	\N
20260814064606	{source_file=supabase/migrations/20260814064606_p1b_security_hardening.sql,sha256=6fc346dcbce0db1eba1679740bde4d16223f973e834a0a0fadf6dd13a64d59ac}	p1b_security_hardening	codex-local-rehearsal	rc19-c4:20260814064606:6fc346dcbce0db1eba1679740bde4d16223f973e834a0a0fadf6dd13a64d59ac	\N
20260814085659	{source_file=supabase/migrations/20260814085659_p1c_shift_persistence.sql,sha256=7435a3b0a1d88eb1933a2eb31db012ea43a8322176ea4adfe60a2fb56fb612fc}	p1c_shift_persistence	codex-local-rehearsal	rc19-c4:20260814085659:7435a3b0a1d88eb1933a2eb31db012ea43a8322176ea4adfe60a2fb56fb612fc	\N
20260815122237	{source_file=supabase/migrations/20260815122237_p1c_shift_lifecycle.sql,sha256=86c3b06035229a7b7da8f2df60296bfbce05ff61837483dbf88135ff79152c5a}	p1c_shift_lifecycle	codex-local-rehearsal	rc19-c4:20260815122237:86c3b06035229a7b7da8f2df60296bfbce05ff61837483dbf88135ff79152c5a	\N
20260816105052	{source_file=supabase/migrations/20260816105052_p1c_cancel_manual_assignment.sql,sha256=0683e4cb4f85e5465f383b698ad64be999df3a00513b01886fec237cd2645e66}	p1c_cancel_manual_assignment	codex-local-rehearsal	rc19-c4:20260816105052:0683e4cb4f85e5465f383b698ad64be999df3a00513b01886fec237cd2645e66	\N
20260820120000	{source_file=supabase/migrations/20260820120000_s4a_import_batch_foundation.sql,sha256=66d9ca84b51f338e0217e063aea416acf2b462edf37cb07fd76261e9949e8f46}	s4a_import_batch_foundation	codex-local-rehearsal	rc19-c4:20260820120000:66d9ca84b51f338e0217e063aea416acf2b462edf37cb07fd76261e9949e8f46	\N
20260821083750	{source_file=supabase/migrations/20260821083750_s4f_lite_staffing_display_labels.sql,sha256=1d363ecba5577432212db01f52411e49c0bbbd88b8a50ffec8599fe21202b977}	s4f_lite_staffing_display_labels	codex-local-rehearsal	rc19-c4:20260821083750:1d363ecba5577432212db01f52411e49c0bbbd88b8a50ffec8599fe21202b977	\N
20260822140432	{source_file=supabase/migrations/20260822140432_s4f1_edit_staffing_display_labels.sql,sha256=524a23bd48bfa3b66d026c1b60b1b9d4bdf3a5d379cec1c766e946bacaee5128}	s4f1_edit_staffing_display_labels	codex-local-rehearsal	rc19-c4:20260822140432:524a23bd48bfa3b66d026c1b60b1b9d4bdf3a5d379cec1c766e946bacaee5128	\N
20260822144531	{source_file=supabase/migrations/20260822144531_s4e_import_recovery_reconciliation.sql,sha256=123d249f00c0cace1ee7201e5d216eb8c27c807a465fb769eeb992a3ae311e2e}	s4e_import_recovery_reconciliation	codex-local-rehearsal	rc19-c4:20260822144531:123d249f00c0cace1ee7201e5d216eb8c27c807a465fb769eeb992a3ae311e2e	\N
20260822160308	{source_file=supabase/migrations/20260822160308_s5_staff_identity_mapping.sql,sha256=165fa95833ced8969146ad6598b78b18a221c3a78fc37407b7b42f7314bb6508}	s5_staff_identity_mapping	codex-local-rehearsal	rc19-c4:20260822160308:165fa95833ced8969146ad6598b78b18a221c3a78fc37407b7b42f7314bb6508	\N
20260823000000	{source_file=supabase/migrations/20260823000000_p3_report_persistence.sql,sha256=407eb44065b3abd8732f4ecc8d3590316f36eb7b0ab946e05a4d3ef8e0d7ae31}	p3_report_persistence	codex-local-rehearsal	rc19-c4:20260823000000:407eb44065b3abd8732f4ecc8d3590316f36eb7b0ab946e05a4d3ef8e0d7ae31	\N
20260823120000	{source_file=supabase/migrations/20260823120000_s2b_staff_management_writes.sql,sha256=b17d5bb8e92009fc238d547a9fe7fe726441632c94dd3ff6d89d2e9203da098a}	s2b_staff_management_writes	codex-local-rehearsal	rc19-c4:20260823120000:b17d5bb8e92009fc238d547a9fe7fe726441632c94dd3ff6d89d2e9203da098a	\N
20260824120000	{source_file=supabase/migrations/20260824120000_bulk_staffing_approval.sql,sha256=cc4faad808a2a741e6c15dccf15967affd89cbbeb104e7255fd05f0bc75b4a5a}	bulk_staffing_approval	codex-local-rehearsal	rc19-c4:20260824120000:cc4faad808a2a741e6c15dccf15967affd89cbbeb104e7255fd05f0bc75b4a5a	\N
20260826082036	{source_file=supabase/migrations/20260826082036_shift_swap_production.sql,sha256=f35e5b3e5de709cf7289bbc750a1ee20b728478d3fd62d9bbb409b3fc8d624f5}	20260826082036_shift_swap_production	codex-local-rehearsal	rc19-c4:20260826082036:f35e5b3e5de709cf7289bbc750a1ee20b728478d3fd62d9bbb409b3fc8d624f5	\N
20260826082055	{source_file=supabase/migrations/20260826082055_shift_swap_p0_hardening.sql,sha256=fc403cae14a935efcc3d6cdcbf9daa29f3b89862571e85dbd87aa752979be744}	20260826082055_shift_swap_p0_hardening	codex-local-rehearsal	rc19-c4:20260826082055:fc403cae14a935efcc3d6cdcbf9daa29f3b89862571e85dbd87aa752979be744	\N
20260826083723	{source_file=supabase/migrations/20260826083723_shift_swap_lock_helper_fix.sql,sha256=8018f586083a49a23921d6c581f407f1a0e71775de5d07391d2b97f743708a2a}	20260826083723_shift_swap_lock_helper_fix	codex-local-rehearsal	rc19-c4:20260826083723:8018f586083a49a23921d6c581f407f1a0e71775de5d07391d2b97f743708a2a	\N
20260826172730	{source_file=supabase/migrations/20260826172730_shift_swap_two_flow_semantics.sql,sha256=9d8d67cecb76b7097f8d03d1d06ec7e1d89cd5d714574b8f365ecdff985991a3}	20260826172730_shift_swap_two_flow_semantics	codex-local-rehearsal	rc19-c4:20260826172730:9d8d67cecb76b7097f8d03d1d06ec7e1d89cd5d714574b8f365ecdff985991a3	\N
20260827094704	{source_file=supabase/migrations/20260827094704_core_account_lifecycle.sql,sha256=3171fcbdb3749bafbed41ab83e065950d279a8f4e3428e60152a4a2bcca8b004}	core_account_lifecycle	codex-local-rehearsal	rc19-c4:20260827094704:3171fcbdb3749bafbed41ab83e065950d279a8f4e3428e60152a4a2bcca8b004	\N
20260827110001	{source_file=supabase/migrations/20260827110001_notifications_persistent_realtime.sql,sha256=b325b5067372758aac0ac62b9b25e744e688a65da7fb3dca496538a3b93608dd}	notifications_persistent_realtime	codex-local-rehearsal	rc19-c4:20260827110001:b325b5067372758aac0ac62b9b25e744e688a65da7fb3dca496538a3b93608dd	\N
20260829120000	{source_file=supabase/migrations/20260829120000_core_v1_timezone_contract.sql,sha256=0977b7b44065672f0788dcce2cc420f3519358f34c834137214ca4fae3a1b3be}	core_v1_timezone_contract	codex-local-rehearsal	rc19-c4:20260829120000:0977b7b44065672f0788dcce2cc420f3519358f34c834137214ca4fae3a1b3be	\N
20260829130000	{source_file=supabase/migrations/20260829130000_core_v1_data_integrity_p1b.sql,sha256=1a54a837cdc77cfcc1e41be39c288a13826f5f9d125eedcc27b0e408bc9059c7}	core_v1_data_integrity_p1b	codex-local-rehearsal	rc19-c4:20260829130000:1a54a837cdc77cfcc1e41be39c288a13826f5f9d125eedcc27b0e408bc9059c7	\N
20260830085911	{source_file=supabase/migrations/20260830085911_core_v1_data_integrity_p1c.sql,sha256=6dba5271c2a645816e6a2dae43cfef6f67233573ad04a72298d1aa7cabc90b39}	core_v1_data_integrity_p1c	codex-local-rehearsal	rc19-c4:20260830085911:6dba5271c2a645816e6a2dae43cfef6f67233573ad04a72298d1aa7cabc90b39	\N
20260830102222	{source_file=supabase/migrations/20260830102222_core_v1_permission_rls_final.sql,sha256=720244b13687734833833dbd50113a9eb5012e41148c164970d2a8f8757fdd96}	core_v1_permission_rls_final	codex-local-rehearsal	rc19-c4:20260830102222:720244b13687734833833dbd50113a9eb5012e41148c164970d2a8f8757fdd96	\N
20260830113000	{source_file=supabase/migrations/20260830113000_core_v1_persistent_audit.sql,sha256=88e829f73386ad494eea3d056d4eaf5769c71952430263ff8ce68c65b756d81f}	core_v1_persistent_audit	codex-local-rehearsal	rc19-c4:20260830113000:88e829f73386ad494eea3d056d4eaf5769c71952430263ff8ce68c65b756d81f	\N
20260830114000	{source_file=supabase/migrations/20260830114000_core_v1_persistent_audit_read_permission.sql,sha256=ec6c407a15dd6f0bbec8e5274f03b6d525ef8ab2823b2869006eca58ac036f31}	core_v1_persistent_audit_read_permission	codex-local-rehearsal	rc19-c4:20260830114000:ec6c407a15dd6f0bbec8e5274f03b6d525ef8ab2823b2869006eca58ac036f31	\N
20260831120000	{source_file=scripts/rc19-c4-migration-rehearsal/evidence/production-ledger-statements-shift-rpc-20260831-20260913.json#20260831120000,sha256=9a279d1f19d2b17c4378de708c4e3f54c986bb3f449046cbce17723d31581061}	core_v1_shift_lifecycle_admin_guard	codex-local-rehearsal	rc19-c4:20260831120000:9a279d1f19d2b17c4378de708c4e3f54c986bb3f449046cbce17723d31581061	\N
20260831130000	{source_file=supabase/migrations/20260831130000_core_v1_audit_update_before_state.sql,sha256=7f54982af0c3f40f167ad1657ffe3b5fcd5bb39fec19e93cb25193a65732e594}	core_v1_audit_update_before_state	codex-local-rehearsal	rc19-c4:20260831130000:7f54982af0c3f40f167ad1657ffe3b5fcd5bb39fec19e93cb25193a65732e594	\N
20260901120000	{source_file=supabase/migrations/20260901120000_account_provisioning_foundation.sql,sha256=789f594dba1bb10c63f85f169c1128c397f2572481d85b51e8668c41f7ce798a}	account_provisioning_foundation	codex-local-rehearsal	rc19-c4:20260901120000:789f594dba1bb10c63f85f169c1128c397f2572481d85b51e8668c41f7ce798a	\N
20260901150241	{source_file=supabase/migrations/20260901150241_before_user_created_google_hook.sql,sha256=4a72a14ca265ec915f2d646bed75d37fc7da1d05262404bbac4ea2d2e4bac536}	before_user_created_google_hook	codex-local-rehearsal	rc19-c4:20260901150241:4a72a14ca265ec915f2d646bed75d37fc7da1d05262404bbac4ea2d2e4bac536	\N
20260901190744	{source_file=supabase/migrations/20260901190744_account_requests_foundation.sql,sha256=926e100545df73ca17a494a0353d6f4f19df04e7064d68bf56f7ee390ff39b46}	account_requests_foundation	codex-local-rehearsal	rc19-c4:20260901190744:926e100545df73ca17a494a0353d6f4f19df04e7064d68bf56f7ee390ff39b46	\N
20260902110000	{source_file=supabase/migrations/20260902110000_account_request_review.sql,sha256=111eed52617ab982617b1151ab725526b3b193801b082ef0ae6a490f384052b8}	account_request_review	codex-local-rehearsal	rc19-c4:20260902110000:111eed52617ab982617b1151ab725526b3b193801b082ef0ae6a490f384052b8	\N
20260902130000	{source_file=supabase/migrations/20260902130000_f6_import_outcome_existing_shift.sql,sha256=7c4c8c08e333cd615efe782b30ed47c54c8a72599c0842ad757e792819e7e6d3}	f6_import_outcome_existing_shift	codex-local-rehearsal	rc19-c4:20260902130000:7c4c8c08e333cd615efe782b30ed47c54c8a72599c0842ad757e792819e7e6d3	\N
20260902140000	{source_file=supabase/migrations/20260902140000_account_request_provisioning.sql,sha256=a896925a1c90fa2b221a8ce0a3b22745b4a70efaf50813b264ca5feb7833f5e4}	account_request_provisioning	codex-local-rehearsal	rc19-c4:20260902140000:a896925a1c90fa2b221a8ce0a3b22745b4a70efaf50813b264ca5feb7833f5e4	\N
20260902150000	{source_file=supabase/migrations/20260902150000_account_request_rate_limit.sql,sha256=2bf4c791b65ed244e4b6fe5937c7fff4b6b4984064771930bd3da74de7b27391}	account_request_rate_limit	codex-local-rehearsal	rc19-c4:20260902150000:2bf4c791b65ed244e4b6fe5937c7fff4b6b4984064771930bd3da74de7b27391	\N
20260902160000	{source_file=supabase/migrations/20260902160000_account_request_provisioning_boundary.sql,sha256=67a15241c193c3156f109c22e8c5bf7347a034613042acdcdee8504aac5793cc}	account_request_provisioning_boundary	codex-local-rehearsal	rc19-c4:20260902160000:67a15241c193c3156f109c22e8c5bf7347a034613042acdcdee8504aac5793cc	\N
20260902170000	{source_file=supabase/migrations/20260902170000_f9_campaign_leader_edit.sql,sha256=44b750d34608013a320fd731685483a8abd130487782eda7fb36db1fd8646227}	f9_campaign_leader_edit	codex-local-rehearsal	rc19-c4:20260902170000:44b750d34608013a320fd731685483a8abd130487782eda7fb36db1fd8646227	\N
20260902180000	{source_file=supabase/migrations/20260902180000_f9_delete_archive_integrity.sql,sha256=9c990404d1e50461dc28c185fe61be45052351ba78846b76efec844fce6013b1}	f9_delete_archive_integrity	codex-local-rehearsal	rc19-c4:20260902180000:9c990404d1e50461dc28c185fe61be45052351ba78846b76efec844fce6013b1	\N
20260903085439	{source_file=supabase/migrations/20260903085439_fix_account_request_identity_composite_assignment.sql,sha256=8b37a79f3f43ad3595a2cb66b5bdb5de4ca1bf83737f3674f1d4c27cc12ab6d3}	fix_account_request_identity_composite_assignment	codex-local-rehearsal	rc19-c4:20260903085439:8b37a79f3f43ad3595a2cb66b5bdb5de4ca1bf83737f3674f1d4c27cc12ab6d3	\N
20260903110000	{source_file=supabase/migrations/20260903110000_f10_report_active_business_user_rls.sql,sha256=b97f4522a0897e2590f0d87c85278e619a49ca6abc7eeffd63e0bbb8b3d6cca0}	f10_report_active_business_user_rls	codex-local-rehearsal	rc19-c4:20260903110000:b97f4522a0897e2590f0d87c85278e619a49ca6abc7eeffd63e0bbb8b3d6cca0	\N
20260903120000	{source_file=supabase/migrations/20260903120000_core_v1_recursive_audit_sanitizer.sql,sha256=50462c63e03238eac383f3b18cc3cd2d790368510bc49e1dd8cfc2da41cba834}	core_v1_recursive_audit_sanitizer	codex-local-rehearsal	rc19-c4:20260903120000:50462c63e03238eac383f3b18cc3cd2d790368510bc49e1dd8cfc2da41cba834	\N
20260903130000	{source_file=supabase/migrations/20260903130000_f11_sanitizer_case_normalization.sql,sha256=6bc6e9830b1eb3590c0883906fda0bb7ba5d929318278ed5b37d6039c1962e27}	f11_sanitizer_case_normalization	codex-local-rehearsal	rc19-c4:20260903130000:6bc6e9830b1eb3590c0883906fda0bb7ba5d929318278ed5b37d6039c1962e27	\N
20260905110000	{source_file=supabase/migrations/20260905110000_gl19c_authoritative_settings.sql,sha256=d8d00bca8c0be551e188252357f0423e5dd68778115942402577bc1aa1319a5c}	gl19c_authoritative_settings	codex-local-rehearsal	rc19-c4:20260905110000:d8d00bca8c0be551e188252357f0423e5dd68778115942402577bc1aa1319a5c	\N
20260905190925	{source_file=supabase/migrations/20260905190925_profile_avatar_storage.sql,sha256=a09193f8ec61de291caf1ecd110235aaed41fd31dbe4c7e29e98ffa312b2416a}	profile_avatar_storage	codex-local-rehearsal	rc19-c4:20260905190925:a09193f8ec61de291caf1ecd110235aaed41fd31dbe4c7e29e98ffa312b2416a	\N
20260905191836	{source_file=supabase/migrations/20260905191836_live_dashboard_update_persistence.sql,sha256=7898474d30e5289e6683c764d6cad08b147e78b172286a5328d7111e92599ee5}	live_dashboard_update_persistence	codex-local-rehearsal	rc19-c4:20260905191836:7898474d30e5289e6683c764d6cad08b147e78b172286a5328d7111e92599ee5	\N
20260906100000	{source_file=supabase/migrations/20260906100000_gl19c_operational_settings_consumers.sql,sha256=d7171d6aac44c02814a2f6ee0a7f782ded6c80ebddf478586bb3488927715280}	gl19c_operational_settings_consumers	codex-local-rehearsal	rc19-c4:20260906100000:d7171d6aac44c02814a2f6ee0a7f782ded6c80ebddf478586bb3488927715280	\N
20260906141234	{source_file=supabase/migrations/20260906141234_rw004_admin_self_operational_roles.sql,sha256=943f1226fb393b1262e9e67b0ebb3c3557674a97eaccd1af68f4eb7f759d773a}	rw004_admin_self_operational_roles	codex-local-rehearsal	rc19-c4:20260906141234:943f1226fb393b1262e9e67b0ebb3c3557674a97eaccd1af68f4eb7f759d773a	\N
20260912083056	{source_file=supabase/migrations/20260912083056_report_draft_nullable_metrics.sql,sha256=3d26d5ce6b09118f4dc1c9a7be49e912e684ca45620211710dab9ac0fe34acbc}	report_draft_nullable_metrics	codex-local-rehearsal	rc19-c4:20260912083056:3d26d5ce6b09118f4dc1c9a7be49e912e684ca45620211710dab9ac0fe34acbc	\N
20260913120000	{source_file=scripts/rc19-c4-migration-rehearsal/evidence/production-ledger-statements-shift-rpc-20260831-20260913.json#20260913120000,sha256=ad5a52da4d352220a58b210f62901ad4f1582fbf1024bca32cbd3d56cfba1a6d}	shift_status_mode_and_auto_completion	codex-local-rehearsal	rc19-c4:20260913120000:ad5a52da4d352220a58b210f62901ad4f1582fbf1024bca32cbd3d56cfba1a6d	\N
20260913122832	{source_file=supabase/migrations/20260913122832_20260913125000_account_request_provisioning_boundary_hardening.sql,sha256=cdc880e4a6bacde4577677b87f0697b9dc4440aecab13559b46332c17db61850}	20260913125000_account_request_provisioning_boundary_hardening	codex-local-rehearsal	rc19-c4:20260913122832:cdc880e4a6bacde4577677b87f0697b9dc4440aecab13559b46332c17db61850	\N
20260913130000	{source_file=supabase/migrations/20260913130000_account_request_active_lifecycle.sql,sha256=b825283a6820130104483579e3ff14a6611aaeeafdcd4c8c77824b0f3c57182c}	account_request_active_lifecycle	codex-local-rehearsal	rc19-c4:20260913130000:b825283a6820130104483579e3ff14a6611aaeeafdcd4c8c77824b0f3c57182c	\N
20260913200045	{source_file=supabase/migrations/20260913200045_restore_import_create_shift_staffing_contract.sql,sha256=0359b4b22e49a2a4709c4d09c587b3fb4c0739d51ff54dec413ba5c79ee9bfc0}	restore_import_create_shift_staffing_contract	codex-local-rehearsal	rc19-c4:20260913200045:0359b4b22e49a2a4709c4d09c587b3fb4c0739d51ff54dec413ba5c79ee9bfc0	\N
20260913233111	{source_file=supabase/migrations/20260913233111_report_storage_security.sql,sha256=f38a7b296ada065ee2a8156c77b10f412349e4e4ade4781befc884c69ba0f0a3}	report_storage_security	codex-local-rehearsal	rc19-c4:20260913233111:f38a7b296ada065ee2a8156c77b10f412349e4e4ade4781befc884c69ba0f0a3	\N
20260916090000	{source_file=supabase/migrations/20260916090000_report_expected_version_cas.sql,sha256=ce49577e0c97dc51741c829b8f86ad8560f13f7d4215a6f6beeaccd704cf8907}	report_expected_version_cas	codex-local-rehearsal	rc19-c4:20260916090000:ce49577e0c97dc51741c829b8f86ad8560f13f7d4215a6f6beeaccd704cf8907	\N
20261006160000	{source_file=supabase/migrations/20261006160000_rc14_live_image_storage_contract.sql,sha256=2c874d29ba845a3a8ae3987df1b159e137dd60cd277e9bb2de3028d93bfe1ba9}	rc14_live_image_storage_contract	codex-local-rehearsal	rc19-c4:20261006160000:2c874d29ba845a3a8ae3987df1b159e137dd60cd277e9bb2de3028d93bfe1ba9	\N
20261007183831	{source_file=supabase/migrations/20261007183831_rc14_report_data_artifacts.sql,sha256=0d05d78116d6072d7b9ae198cdcbdaa63d5ee07850a2a271eab61259fde893ec}	rc14_report_data_artifacts	codex-local-rehearsal	rc19-c4:20261007183831:0d05d78116d6072d7b9ae198cdcbdaa63d5ee07850a2a271eab61259fde893ec	\N
20261008160638	{source_file=supabase/migrations/20261008160638_member_registration_directory_privacy.sql,sha256=4e3b028495fb1bba3ca48b7588578ecad35f29f621548a9b0240d17eafc807b6}	member_registration_directory_privacy	codex-local-rehearsal	rc19-c4:20261008160638:4e3b028495fb1bba3ca48b7588578ecad35f29f621548a9b0240d17eafc807b6	\N
20261008160645	{source_file=supabase/migrations/20261008160645_repair_report_revision_history_rpc.sql,sha256=d510242185993444826822ff336b05995a31f8aab21e973e9e7bf9ed268c26fe}	repair_report_revision_history_rpc	codex-local-rehearsal	rc19-c4:20261008160645:d510242185993444826822ff336b05995a31f8aab21e973e9e7bf9ed268c26fe	\N
20261011091925	{source_file=supabase/migrations/20261011091925_rc15_storage_route_prerequisites.sql,sha256=319ea68aea1cb42ca88b7403a0c61dac6a9fc4c64025cbe5fab5d946f9380357}	rc15_storage_route_prerequisites	codex-local-rehearsal	rc19-c4:20261011091925:319ea68aea1cb42ca88b7403a0c61dac6a9fc4c64025cbe5fab5d946f9380357	\N
20261011092015	{source_file=supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql,sha256=f65f2dee5c5218408f61cd875ffa4559f4cd419c6a23150f9a9cc8baa6bd4956}	rc15_shift_rpc_compatibility	codex-local-rehearsal	rc19-c4:20261011092015:f65f2dee5c5218408f61cd875ffa4559f4cd419c6a23150f9a9cc8baa6bd4956	\N
20261011092051	{source_file=supabase/migrations/20261011092051_rc15_operational_files.sql,sha256=33aa62e14b50d6d2195d094423b7f876877fd86c9116bdf8434b573906637bb2}	rc15_operational_files	codex-local-rehearsal	rc19-c4:20261011092051:33aa62e14b50d6d2195d094423b7f876877fd86c9116bdf8434b573906637bb2	\N
20261011221500	{source_file=supabase/migrations/20261011221500_rc15_provider_metadata_forward_compat.sql,sha256=f649eab692c892f66019b1aad7ad5b98b5f168ca8e69247577554ed7d0723155}	rc15_provider_metadata_forward_compat	codex-local-rehearsal	rc19-c4:20261011221500:f649eab692c892f66019b1aad7ad5b98b5f168ca8e69247577554ed7d0723155	\N
20261012000000	{source_file=supabase/migrations/20261012000000_rc16_workforce_payroll_foundation.sql,sha256=889fae5221c16b4e983f22e07da7e1212f796440eb06f4e327db0b862568b170}	rc16_workforce_payroll_foundation	codex-local-rehearsal	rc19-c4:20261012000000:889fae5221c16b4e983f22e07da7e1212f796440eb06f4e327db0b862568b170	\N
20261012000001	{source_file=supabase/migrations/20261012000001_rc16b_draft_payroll_correction.sql,sha256=5f3484fe3a2203cfa8cb484a97900975b1f72c75a35f8a09f49eb243283c7e72}	rc16b_draft_payroll_correction	codex-local-rehearsal	rc19-c4:20261012000001:5f3484fe3a2203cfa8cb484a97900975b1f72c75a35f8a09f49eb243283c7e72	\N
20261012145735	{source_file=supabase/migrations/20261012145735_p0_audit_privilege_hardening.sql,sha256=c493b6393cb5e12cd71dba63614bc109a77d0e3a2b39e7c2886f232cf71996fd}	p0_audit_privilege_hardening	codex-local-rehearsal	rc19-c4:20261012145735:c493b6393cb5e12cd71dba63614bc109a77d0e3a2b39e7c2886f232cf71996fd	\N
20261014173408	{source_file=supabase/migrations/20261012171503_rc16k_bounded_shift_lists.sql,sha256=5a8fb9165b4132b9508ee49d74ce7027933dbf2b6ac3f4bdbbbc34940071541e}	20261012171503_rc16k_bounded_shift_lists	codex-local-rehearsal	rc19-c4:20261014173408:5a8fb9165b4132b9508ee49d74ce7027933dbf2b6ac3f4bdbbbc34940071541e	\N
20261017000000	{source_file=supabase/migrations/20261017000000_rc17a_actual_staffing_audit.sql,sha256=84b0b5ae34a5a0593ebaaabf0613d89c85e432996d2f0e228211006c61ccd41c}	rc17a_actual_staffing_audit	codex-local-rehearsal	rc19-c4:20261017000000:84b0b5ae34a5a0593ebaaabf0613d89c85e432996d2f0e228211006c61ccd41c	\N
20261019000000	{source_file=supabase/migrations/20261019000000_rc17b_rate_supersession_and_recalc.sql,sha256=b85b46bc36b0631a7db6f5e21f76cb0574a423186feb2b4dc780c7b971d02ee1}	rc17b_rate_supersession_and_recalc	codex-local-rehearsal	rc19-c4:20261019000000:b85b46bc36b0631a7db6f5e21f76cb0574a423186feb2b4dc780c7b971d02ee1	\N
20261021100941	{source_file=supabase/migrations/20261020164351_rc18a_publish_shifts_realtime.sql,sha256=b695fbd5c865bda7638df10755d4f4aeb6674437779cd807f973df9b7acfa530}	rc18a_publish_shifts_realtime_production	codex-local-rehearsal	rc19-c4:20261021100941:b695fbd5c865bda7638df10755d4f4aeb6674437779cd807f973df9b7acfa530	\N
20261021100953	{source_file=supabase/migrations/20261021120000_global_report_obligation_page.sql,sha256=d9cd804db9c417af4647f865b37c89f242245b97109cb1e64b3644d46aa9b4ce}	global_report_obligation_page_production	codex-local-rehearsal	rc19-c4:20261021100953:d9cd804db9c417af4647f865b37c89f242245b97109cb1e64b3644d46aa9b4ce	\N
20261021101021	{source_file=supabase/migrations/20261021000000_rc17c_attendance_import_foundation.sql,sha256=ae08e2dcf301d30de96d12e97ad94510e090ff52e79a44e1c97dbb645e12efd1}	rc17c_attendance_import_foundation_production	codex-local-rehearsal	rc19-c4:20261021101021:ae08e2dcf301d30de96d12e97ad94510e090ff52e79a44e1c97dbb645e12efd1	\N
20261021101030	{source_file=supabase/migrations/20261021190000_global_report_notification_transition_keys.sql,sha256=da296ae6ff3d1519ed1d135db19e73a05b5456404772c01df098b86ddc3808d2}	global_report_notification_transition_keys_production	codex-local-rehearsal	rc19-c4:20261021101030:da296ae6ff3d1519ed1d135db19e73a05b5456404772c01df098b86ddc3808d2	\N
20261021101104	{source_file=supabase/migrations/20261021034515_shift_automatic_status_scheduling_and_read_safety.sql,sha256=001d066d3fb92633967b1cca1402b45616f98df914dc91652432da2d6e65e588}	shift_automatic_status_scheduling_and_read_safety_production	codex-local-rehearsal	rc19-c4:20261021101104:001d066d3fb92633967b1cca1402b45616f98df914dc91652432da2d6e65e588	\N
20261021101725	{source_file=supabase/migrations/20261021064611_media_viewer_acl_exact_shift_v1.sql,sha256=dbd52e4477c156b0daf03a4ec2393d091dc90274c6523f24a81dafcd0ae5e7ee}	media_viewer_acl_exact_shift_v1	codex-local-rehearsal	rc19-c4:20261021101725:dbd52e4477c156b0daf03a4ec2393d091dc90274c6523f24a81dafcd0ae5e7ee	\N
20261022185140	{source_file=supabase/migrations/20261022185140_rc19_p2_04_member_attendance_event_journal.sql,sha256=e6ca215841ecc5a973b004c7d948089ffd129c8d34375dd6dcfbd401b2d966f3}	\N	codex-local-rehearsal	rc19-c4:20261022185140:e6ca215841ecc5a973b004c7d948089ffd129c8d34375dd6dcfbd401b2d966f3	\N
20261023144000	{source_file=supabase/migrations/20261023144000_rc19_p2_04b_drive_photo_checkin.sql,sha256=6d0ab55a781570d14c6cb0d04483a38f275a370c852bbbefa45d6f8114ce39ea}	\N	codex-local-rehearsal	rc19-c4:20261023144000:6d0ab55a781570d14c6cb0d04483a38f275a370c852bbbefa45d6f8114ce39ea	\N
20261023201938	{source_file=supabase/migrations/20261023093000_rc19_p0_report_read_ownership_and_revisions.sql,sha256=79ca1ceae9d5c3e9b340edb4557879b8e1686f217e74158d75d532c73cbf10fc}	rc19_prod_uat_p0_report_read_ownership_and_revisions	codex-local-rehearsal	rc19-c4:20261023201938:79ca1ceae9d5c3e9b340edb4557879b8e1686f217e74158d75d532c73cbf10fc	\N
20261023201941	{source_file=supabase/migrations/20261023103500_rc19_p0_report_revision_invoker_identity_fix.sql,sha256=212acd7746a27c2f6386153b8bea06423264a22e49e4f4f25e92aeda69417237}	rc19_prod_uat_p0_report_revision_invoker_identity_fix	codex-local-rehearsal	rc19-c4:20261023201941:212acd7746a27c2f6386153b8bea06423264a22e49e4f4f25e92aeda69417237	\N
20261023201944	{source_file=supabase/migrations/20261024003000_rc19_p0_orphan_live_image_read_rls.sql,sha256=ce58a742e6ed0f63562b7ca0aafb9bf3b6c89a0b527518a9aba70ab43dea1b47}	rc19_prod_uat_p0_orphan_live_image_read_rls	codex-local-rehearsal	rc19-c4:20261023201944:ce58a742e6ed0f63562b7ca0aafb9bf3b6c89a0b527518a9aba70ab43dea1b47	\N
20261023202331	{source_file=supabase/migrations/20261023112000_rc19_report_authorized_shift_display_context.sql,sha256=e2d077cb404da3cb1d90b786823c82da60d89b0f6a329adf03e480d87ed34fb7}	rc19_prod_uat_report_authorized_shift_context	codex-local-rehearsal	rc19-c4:20261023202331:e2d077cb404da3cb1d90b786823c82da60d89b0f6a329adf03e480d87ed34fb7	\N
20261023202335	{source_file=supabase/migrations/20261023153500_rc19_reports_historical_pagination_v2.sql,sha256=1814835bb8917b17c1e598a55bc2bcebbe0a866457beae119a8be404e52e6bda}	rc19_prod_uat_reports_historical_pagination_v2	codex-local-rehearsal	rc19-c4:20261023202335:1814835bb8917b17c1e598a55bc2bcebbe0a866457beae119a8be404e52e6bda	\N
20261023202339	{source_file=supabase/migrations/20261023155000_rc19_reports_history_validate_filters_v2.sql,sha256=41f210e04245551dd34adf28efb99f1a1fb8d74869447c6abae14e0fd109d32c}	rc19_prod_uat_reports_history_validate_filters_v2	codex-local-rehearsal	rc19-c4:20261023202339:41f210e04245551dd34adf28efb99f1a1fb8d74869447c6abae14e0fd109d32c	\N
20261023202342	{source_file=supabase/migrations/20261023160500_rc19_reports_history_staff_filter_privacy.sql,sha256=c10b889249a329d14df2aa412900c611be38159abacdffd8cf29a8895ea436f5}	rc19_prod_uat_reports_history_staff_filter_privacy	codex-local-rehearsal	rc19-c4:20261023202342:c10b889249a329d14df2aa412900c611be38159abacdffd8cf29a8895ea436f5	\N
20261025180000	{source_file=supabase/migrations/20261025180000_rc19_u14_1_mandatory_checkout_photo.sql,sha256=1113e4fc81b4d050dc75225d3ec7acf23f76bb0d8b1f325c5161ce5e5cfc76d0}	\N	codex-local-rehearsal	rc19-c4:20261025180000:1113e4fc81b4d050dc75225d3ec7acf23f76bb0d8b1f325c5161ce5e5cfc76d0	\N
20261031164416	{source_file=supabase/migrations/20261028010000_rc19_reg02_multi_applicant_approval.sql,sha256=fd9129e575c87a2f3df5322d4fe5e68931bd1af8d3359532039d90a6e0ddaab2}	rc19_reg02_multi_applicant_approval	codex-local-rehearsal	rc19-c4:20261031164416:fd9129e575c87a2f3df5322d4fe5e68931bd1af8d3359532039d90a6e0ddaab2	\N
20261031164529	{source_file=supabase/migrations/20261029120000_rc19_staffing_role_scoped_gap_filter.sql,sha256=a317494940fd6aacb961003e1254c72bc8467f853e7ad583132b354978e2bdd3}	rc19_staffing_role_scoped_gap_filter	codex-local-rehearsal	rc19-c4:20261031164529:a317494940fd6aacb961003e1254c72bc8467f853e7ad583132b354978e2bdd3	\N
20261101073720	{source_file=supabase/proposals/rc19-sto02-resource-registry/20261027150000_rc19_sto02_resource_registry.sql,sha256=3ef93264c7192eff309610fe19596c730a5aea2f5ddef58ab39d51bb7497fb4d}	20261101073643_rc19_sto02_resource_registry	codex-local-rehearsal	rc19-c4:20261101073720:3ef93264c7192eff309610fe19596c730a5aea2f5ddef58ab39d51bb7497fb4d	\N
20261101073742	{source_file=supabase/proposals/rc19-brand01/20261030120000_rc19_brand01_catalog_review_only.sql,sha256=78ee6e8c1d3e3d27356c482176690112b82c63383af5d9f501fd53251444be9f}	20261101073646_rc19_brand01_catalog	codex-local-rehearsal	rc19-c4:20261101073742:78ee6e8c1d3e3d27356c482176690112b82c63383af5d9f501fd53251444be9f	\N
20261102110000	{source_file=supabase/migrations/20261102110000_rc19_batch05a_report_storage.sql,sha256=51f17d84f157ae82bbfc5baaa399ff6eda510e4c234f7732bf84a0abff926824}	rc19_batch05a_report_storage	codex-local-rehearsal	rc19-c4:20261102110000:51f17d84f157ae82bbfc5baaa399ff6eda510e4c234f7732bf84a0abff926824	\N
20261102135047	{source_file=supabase/migrations/20261102135047_rc19_batch05a3_domain_storage_routes.sql,sha256=613668b237e56f438a57795b280fb060b7ea3042bbdb92e5506d0bfee4494aed}	rc19_batch05a3_domain_storage_routes	codex-local-rehearsal	rc19-c4:20261102135047:613668b237e56f438a57795b280fb060b7ea3042bbdb92e5506d0bfee4494aed	\N
20261102150000	{source_file=supabase/migrations/20261102150000_rc19_batch05a4_storage_runtime.sql,sha256=29d986326c51f39e06317e41d84d4abca061179f88c337d5a40b58016df384bd}	rc19_batch05a4_storage_runtime	codex-local-rehearsal	rc19-c4:20261102150000:29d986326c51f39e06317e41d84d4abca061179f88c337d5a40b58016df384bd	\N
20261102160334	{source_file=supabase/migrations/20261102160334_rc19_batch05a41_storage_release_blockers.sql,sha256=5d9c322efe68ad9ebe66fa680893711bf1691124dadc9fb99a9e57c502a39965}	rc19_batch05a41_storage_release_blockers	codex-local-rehearsal	rc19-c4:20261102160334:5d9c322efe68ad9ebe66fa680893711bf1691124dadc9fb99a9e57c502a39965	\N
20261102170608	{source_file=supabase/migrations/20261102170608_rc19_batch05a42_registry_and_excel_integrity.sql,sha256=6af251246946a7f437797e28c78d332a823fc6664cd68eefe1b1275f878996fe}	rc19_batch05a42_registry_and_excel_integrity	codex-local-rehearsal	rc19-c4:20261102170608:6af251246946a7f437797e28c78d332a823fc6664cd68eefe1b1275f878996fe	\N
20261102190000	{source_file=supabase/migrations/20261102190000_rc19_batch01_1_agency_code.sql,sha256=f4fbb773463b1e6677f8d9690c1ee5322978ce10494ce6a617779dba34568053}	rc19_batch01_1_agency_code	codex-local-rehearsal	rc19-c4:20261102190000:f4fbb773463b1e6677f8d9690c1ee5322978ce10494ce6a617779dba34568053	\N
20261102200000	{source_file=supabase/migrations/20261102200000_rc19_batch01_3_shift_identity_index.sql,sha256=f4f0ea3e24dc72a4ea7ff0d2f551eb215cf17402f8363cb1850df32674b9db37}	rc19_batch01_3_shift_identity_index	codex-local-rehearsal	rc19-c4:20261102200000:f4f0ea3e24dc72a4ea7ff0d2f551eb215cf17402f8363cb1850df32674b9db37	\N
20261103093137	{source_file=supabase/migrations/20261103093137_rc19_unified_import_agency_supplemental_fields.sql,sha256=fa5797b21fdc1c39582e8edb49d65d1169b20fca175827f1f77f178921bea0f2}	rc19_unified_import_agency_supplemental_fields	codex-local-rehearsal	rc19-c4:20261103093137:fa5797b21fdc1c39582e8edb49d65d1169b20fca175827f1f77f178921bea0f2	\N
20261103195519	{source_file=supabase/migrations/20261103195519_rc19_c2_resource_public_and_app_edit.sql,sha256=1c063e0e1240a04351d39c4d80999838f6093d5fa1c976f34cd605897f43242b}	rc19_c2_resource_public_and_app_edit	codex-local-rehearsal	rc19-c4:20261103195519:1c063e0e1240a04351d39c4d80999838f6093d5fa1c976f34cd605897f43242b	\N
20261104085945	{source_file=supabase/migrations/20261104085945_rc19_rbac01_role_permission_enforcement.sql,sha256=2e0131e497e53bece73b107ec1efe99f6b2fecb36461adbd7d5263509af9d908}	rc19_rbac01_role_permission_enforcement	codex-local-rehearsal	rc19-c4:20261104085945:2e0131e497e53bece73b107ec1efe99f6b2fecb36461adbd7d5263509af9d908	\N
20261104085946	{source_file=supabase/migrations/20261104085946_rc19_rbac02_account_permission_enforcement.sql,sha256=8255f31fbf2eebd4324fe61834f768af29383b10ffd99c6306a3fb9a505423c4}	rc19_rbac02_account_permission_enforcement	codex-local-rehearsal	rc19-c4:20261104085946:8255f31fbf2eebd4324fe61834f768af29383b10ffd99c6306a3fb9a505423c4	\N
20261104093735	{source_file=supabase/migrations/20261104093735_rc19_rbac03_supported_permission_enforcement.sql,sha256=b6a02b4b0825437d77155cb9a5f42b51712086786f3137b5fddb6f761f4f80a5}	rc19_rbac03_supported_permission_enforcement	codex-local-rehearsal	rc19-c4:20261104093735:b6a02b4b0825437d77155cb9a5f42b51712086786f3137b5fddb6f761f4f80a5	\N
20261104110000	{source_file=supabase/migrations/20261104110000_rc19_c3_scoped_action_catalog.sql,sha256=2a21d177fcb2a2cbc13c59be9af7b676862ed7292df519207ed35a01ec14307f}	rc19_c3_scoped_action_catalog	codex-local-rehearsal	rc19-c4:20261104110000:2a21d177fcb2a2cbc13c59be9af7b676862ed7292df519207ed35a01ec14307f	\N
20261104113000	{source_file=supabase/migrations/20261104113000_rc19_c3_staffing_permission_guard.sql,sha256=01bfe9b0c627e86fae8f366afa1dcf8124947c84035df393ed64ce2a8c7ac231}	rc19_c3_staffing_permission_guard	codex-local-rehearsal	rc19-c4:20261104113000:01bfe9b0c627e86fae8f366afa1dcf8124947c84035df393ed64ce2a8c7ac231	\N
20261104120000	{source_file=supabase/migrations/20261104120000_rc19_c3_leader_brand_scope_reports.sql,sha256=7d0a0bcba8bccbdfe864c464d6d622f4a7796f6ca1c2b2b2fdea587a76cd6812}	rc19_c3_leader_brand_scope_reports	codex-local-rehearsal	rc19-c4:20261104120000:7d0a0bcba8bccbdfe864c464d6d622f4a7796f6ca1c2b2b2fdea587a76cd6812	\N
20261104174527	{source_file=supabase/migrations/20261104174527_rc19_c3_report_artifact_deletion.sql,sha256=927e19fdc152f9e3754ded6d038cedac45d9d9e1345b609f2336fb2798bce31e}	rc19_c3_report_artifact_deletion	codex-local-rehearsal	rc19-c4:20261104174527:927e19fdc152f9e3754ded6d038cedac45d9d9e1345b609f2336fb2798bce31e	\N
20261105120000	{source_file=supabase/migrations/20261105120000_rc19_c3_scoped_report_export.sql,sha256=1c99d2fa7887e085195bd0aa3d439ead56bc908834155f20fbe1881c8cb1abe9}	rc19_c3_scoped_report_export	codex-local-rehearsal	rc19-c4:20261105120000:1c99d2fa7887e085195bd0aa3d439ead56bc908834155f20fbe1881c8cb1abe9	\N
\.


--
-- Name: job_jobid_seq; Type: SEQUENCE SET; Schema: cron; Owner: -
--

SELECT pg_catalog.setval('cron.job_jobid_seq', 1, true);


--
-- Name: rbac01_role_default_events_id_seq; Type: SEQUENCE SET; Schema: private; Owner: -
--

SELECT pg_catalog.setval('private.rbac01_role_default_events_id_seq', 1, false);


--
-- Name: rbac01_role_default_versions_id_seq; Type: SEQUENCE SET; Schema: private; Owner: -
--

SELECT pg_catalog.setval('private.rbac01_role_default_versions_id_seq', 1, false);


--
-- Name: rbac02_account_permission_versions_id_seq; Type: SEQUENCE SET; Schema: private; Owner: -
--

SELECT pg_catalog.setval('private.rbac02_account_permission_versions_id_seq', 1, false);


--
-- Name: brand01_catalog_audit_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.brand01_catalog_audit_events_id_seq', 1, false);


--
-- Name: rc19_leader_brand_scope_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rc19_leader_brand_scope_events_id_seq', 1, false);


--
-- Name: rc19_leader_brand_scopes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rc19_leader_brand_scopes_id_seq', 1, false);


--
-- Name: rc19_report_artifact_deletion_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rc19_report_artifact_deletion_events_id_seq', 1, false);


--
-- Name: rc19_report_export_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rc19_report_export_audit_id_seq', 1, false);


--
-- Name: storage_resource_audit_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.storage_resource_audit_events_id_seq', 5, true);


--
-- Name: workforce_payroll_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.workforce_payroll_audit_id_seq', 1, false);


--
-- PostgreSQL database dump complete
--


