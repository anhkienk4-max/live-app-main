-- RC19 Batch 05A.3: verified ADA Ops Drive folder registry.
-- Domain-first mapping is separate from legacy Brand-first operational_storage_routes.
-- All entries start inactive. This migration does not activate Production routes or move files.
BEGIN;

CREATE TABLE IF NOT EXISTS public.operational_storage_domain_folders (
  folder_path text PRIMARY KEY CHECK (btrim(folder_path) <> ''),
  folder_id text NOT NULL UNIQUE CHECK (btrim(folder_id) <> ''),
  parent_folder_id text NOT NULL CHECK (btrim(parent_folder_id) <> ''),
  access_classification text NOT NULL CHECK (access_classification IN (
    'shared', 'pending_restriction_no_sensitive_upload', 'shared_schema_template_only'
  )),
  active boolean NOT NULL DEFAULT false,
  verified_created boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

ALTER TABLE public.operational_storage_domain_folders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operational_storage_domain_folders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.operational_storage_domain_folders TO service_role;
COMMENT ON TABLE public.operational_storage_domain_folders IS
  'Exact metadata-only registry for verified ADA Ops Drive folders; inactive until separately approved.';

CREATE TEMP TABLE rc19_batch05a3_domain_folder_seed (
  folder_path text PRIMARY KEY,
  folder_id text NOT NULL UNIQUE,
  parent_folder_id text NOT NULL,
  access_classification text NOT NULL,
  active boolean NOT NULL,
  verified_created boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO rc19_batch05a3_domain_folder_seed
  (folder_path, folder_id, parent_folder_id, access_classification, active, verified_created)
VALUES
('00_ADA_OPS_PLATFORM','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm','shared',false,true),
('00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT','1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/01_RAW_XLSX_CSV','1vikkWOtthV4ZebZxr3JZF5NkchrNaV15','1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9','shared',false,true),
('00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/02_NORMALIZED_SNAPSHOTS','1ydCV8n11ikxWc982kvxhgBIjeSaNNg-x','1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9','shared',false,true),
('00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/03_SCHEDULE_EXPORTS','1MlmQBAY3PKfYmDLdn8E1V8xDilcWrWVo','1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9','shared',false,true),
('00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/04_IMPORT_TEMPLATES','10Dd7EXwlc_1SyLlBQTkrvAOJv9bvyJF5','1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9','shared',false,true),
('00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/05_IMPORT_AUDIT_LOGS','1YSihS1fyHE_7CwcQhPC82ApCb05GvM1X','1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9','shared',false,true),
('00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT/06_DUPLICATE_RECONCILIATION','1Onqqr8wp-czIzdWXS9rmIn9lAN37ZPfm','1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9','shared',false,true),
('00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING','1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/01_SHIFT_MANIFESTS','1P5_HClbESXe1uOVB28zV0hriUCcvhhJV','1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx','shared',false,true),
('00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/02_STAFFING_SEGMENTS','14JyOe3lBZ17XBY3AiUmFRvW8V6cfruOW','1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx','shared',false,true),
('00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/03_REGISTRATION_APPROVAL','1RcZQOH75-SyIYuBKIYlfr-fsKkOLPK3D','1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx','shared',false,true),
('00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/04_PASS_SWAP_HANDOFF','1XMGfJ1krBOyCUXlU1vHMaDJWxxZfQHRt','1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx','shared',false,true),
('00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING/05_STAFFING_EXPORTS','1ya58ltFDDzSg5-jtN2C6LeP8ETqMJpCz','1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx','shared',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS','19t3RguHpduM9GXBFquCRvUKU4MXmXgtA','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE','1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi','19t3RguHpduM9GXBFquCRvUKU4MXmXgtA','shared',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/01_UNROUTED_ARTIFACTS_HOLD','12sYCUG3R0HLpFifKB5JqQrvuJ5GC3Ta_','19t3RguHpduM9GXBFquCRvUKU4MXmXgtA','shared',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/02_PERIODIC_REPORT_EXPORTS','1gcNO9AZiLJUmsty5UIyLnLBlcN6RbE1I','19t3RguHpduM9GXBFquCRvUKU4MXmXgtA','shared',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/03_REPORT_FILE_MANIFESTS','1wTICICrE4-FDXsUrSTTL0A9rjaAd7Ae1','19t3RguHpduM9GXBFquCRvUKU4MXmXgtA','shared',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/04_BACKFILL_RECONCILIATION','1MOBORV1btZ6sKMOAqIHxdPIZeIlP-JNa','19t3RguHpduM9GXBFquCRvUKU4MXmXgtA','shared',false,true),
('00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS','10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/01_BRAND_LOGOS_GUIDELINES','1EcE8q2RZi33pQbO4_kWurmu3h81z6Hly','10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc','shared',false,true),
('00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/02_KEY_VISUAL_ASSETS','1igGLxhfjtUiAxk0KMdT2Z8FTVyNkHxhy','10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc','shared',false,true),
('00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/03_PRODUCT_PACKSHOTS','1IslTBDUfqGyjDE0mm-BVjD9l749RFqh8','10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc','shared',false,true),
('00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/04_CAMPAIGN_ASSETS','1sV1boY0-bZl7fchdujSpTMl8tj3ilb7b','10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc','shared',false,true),
('00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/05_LIVECUT_TEASERS','1drCcEN3ruH8iWiEnlPWJt4mFUWLedhgZ','10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc','shared',false,true),
('00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/06_THUMBNAILS','1dqOorntrmqgVRhMH0Iy1a1_KXAdv21ag','10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc','shared',false,true),
('00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/07_VIDEO_OUTPUTS','11NXPwLhCGo0S7eavOaztoJ2iRrDTUDkB','10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc','shared',false,true),
('00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS/08_SCRIPT_BRIEFS','1hLlt4LUBlGLl2m10hynxH2kCyjmHPyBg','10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc','shared',false,true),
('00_ADA_OPS_PLATFORM/05_BRAND_CATALOG','1afOcAufbaf1Kv8q0CfGzUamohF62RWUz','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/05_BRAND_CATALOG/01_BRAND_MASTER','1VAB_nh6RshtOFegJZTacXW34yOi7DAqU','1afOcAufbaf1Kv8q0CfGzUamohF62RWUz','shared',false,true),
('00_ADA_OPS_PLATFORM/05_BRAND_CATALOG/02_PRODUCT_SKU_MASTER','1TsUNt2bLnmb8GIBbfHJiYZQR3JBnD_OI','1afOcAufbaf1Kv8q0CfGzUamohF62RWUz','shared',false,true),
('00_ADA_OPS_PLATFORM/05_BRAND_CATALOG/03_VARIANTS_ATTRIBUTES','1cMrZuM5Ee8XF69bcUoEkp7BnqmeGvg4o','1afOcAufbaf1Kv8q0CfGzUamohF62RWUz','shared',false,true),
('00_ADA_OPS_PLATFORM/05_BRAND_CATALOG/04_APPROVED_CLAIMS','1ZB5qkAmOgOXT6IgO0ZBl1yOJbaD1QFYy','1afOcAufbaf1Kv8q0CfGzUamohF62RWUz','shared',false,true),
('00_ADA_OPS_PLATFORM/05_BRAND_CATALOG/05_CATALOG_EXPORTS','1X44_Qrr9sR5X34B7_PQiQ2NZu5Q1aw9c','1afOcAufbaf1Kv8q0CfGzUamohF62RWUz','shared',false,true),
('00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION','1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION/01_TIKTOK_SHOP_RAW','1Z10VxtGTTse1Bt3feMbH-EtFItppt5iF','1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq','shared',false,true),
('00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION/02_SHOPEE_RAW','1TCQu2_wJv-l1av7CMw3K8Ku8sueTFzh-','1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq','shared',false,true),
('00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION/03_NORMALIZED_DATA','1dkWx5OA644tOFld6F25-yIDmMYkPtMK9','1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq','shared',false,true),
('00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION/04_OCR_INPUTS','1Qdipe-pTLPmwv4LSV8uRxCEl02ibFLle','1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq','shared',false,true),
('00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION/05_DATA_QUALITY','1J8Yi0ejOfgGxPvWI9uLC8p8hW1HCpXdG','1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq','shared',false,true),
('00_ADA_OPS_PLATFORM/07_ANALYTICS_BI','1coUaRS-LSXq2xfm3imclH663EpPrtbfo','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/07_ANALYTICS_BI/01_SHIFT_PERFORMANCE_METRICS','1Haub-HOODGdvlaexDwTpL43eN_09SaHe','1coUaRS-LSXq2xfm3imclH663EpPrtbfo','shared',false,true),
('00_ADA_OPS_PLATFORM/07_ANALYTICS_BI/02_BRAND_PERIOD_REPORTS','18R8T7fSAnAWEnmbywvA5FhKg55zM4s4e','1coUaRS-LSXq2xfm3imclH663EpPrtbfo','shared',false,true),
('00_ADA_OPS_PLATFORM/07_ANALYTICS_BI/03_WORKFORCE_PERFORMANCE_AGGREGATES','17deEVr6oxybpixDRWyVe5Z51AemZXe4x','1coUaRS-LSXq2xfm3imclH663EpPrtbfo','shared',false,true),
('00_ADA_OPS_PLATFORM/07_ANALYTICS_BI/04_BI_DASHBOARD_EXPORTS','1dUf2c-FBnhOkkGu9yJ8k7IIbP89JIL_W','1coUaRS-LSXq2xfm3imclH663EpPrtbfo','shared',false,true),
('00_ADA_OPS_PLATFORM/07_ANALYTICS_BI/05_COST_ACTUAL_VS_PLAN','1_BXvqXmFb2OYa9x6eE7Nt2jw5cihxpiG','1coUaRS-LSXq2xfm3imclH663EpPrtbfo','shared',false,true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS','1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE','1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG','1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS','1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7','1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS','1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna','1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/04_RATE_CARDS','1uHn3hJIKnzgo4r_YBB_jvSwdAYqBJGyY','1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/05_PERSONNEL_RECORDS','1A6QgDPZ6mxaDWWIT4hwsFZzXzbDW0aMM','1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/06_ACCESS_AUDIT','1Ole-hOkRoAS4jrIFzE_XZcaLf-bDbNjE','1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS','11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/01_STORAGE_ROUTE_REGISTRY','1bef3yLtPZsU0HNXgYfkDx5y3MVrG5wUx','11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC','shared',false,true),
('00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/02_SCHEMA_MIGRATION_DOCS','1O8kz7pco0MQGfQMppYUWdCzQ_mmaJFBq','11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC','shared',false,true),
('00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/03_RECOVERY_RECONCILIATION','1PZBbX_jmo4xEneC8_1yfCNb6fg859iNA','11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC','shared',false,true),
('00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/04_INTEGRATION_DIAGNOSTICS','18bQH4hIewmYe1ul-NRMA5l_a1G1W_0ps','11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC','shared',false,true),
('00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/05_DATA_EXPORT_BACKUPS','1hRc_c9T9z5N1NN2vtN1Vnt64x6Jklmqg','11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC','shared',false,true),
('00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/06_RETENTION_POLICIES','1XRMBqVBEbq0CAWl6Rrb_LNzf66npJpvL','11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC','shared',false,true),
('00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/07_RELEASE_UAT_EVIDENCE','177g-GBHRY06rHx9ID8rpQOqR-uve9-kj','11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC','shared',false,true),
('00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS/08_DATA_DICTIONARY','1zT5M87qDu6KI2XaZqyyU7qOG_Sc3D4jA','11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC','shared',false,true),
('00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE','1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/01_CONTENT_RESEARCH','1EdhNSgPdqUJhjRHx3EPcaC4uXuQWV7z4','1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT','shared',false,true),
('00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/02_CONTENT_SCRIPTS','1ooA44422iqWYOoIRlYx4duPB8g8oXwRz','1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT','shared',false,true),
('00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/03_MARKET_RESEARCH','1gaDe8-ubDCq9MkbRbBaMPaqdhdyWN68n','1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT','shared',false,true),
('00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/04_AGENT_OUTPUTS','1TvP2RSI86jps1Fb-O3tFz4_1hI--nIso','1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT','shared',false,true),
('00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/05_PROMPT_TEMPLATES','1NhWNle235MU8w2N232LRNbXiCRiXjwwe','1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT','shared',false,true),
('00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE/06_MEDIA_AUTOMATION','18GI0al5vqRz_1rhJbVX3M_93kI3guiSD','1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT','shared',false,true),
('00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED','1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED/01_CONTRACTS_SOW','1jSRkH_VRA9Gf_5uLE_fu0EDMGuY3fwhB','1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED/02_ACCEPTANCE_BBNT','1V-m1bFCnB9PrvYVvuurrOd25A1BIUFGE','1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED/03_INVOICES_PAYMENTS','17MtKcYJkccBwa1A78NwH5PZaT92D1BXR','1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED/04_FINANCE_TRACKERS','1iGJtAcCwMj2YBmys2-jZpTGMCSZH7yfC','1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ','pending_restriction_no_sensitive_upload',false,true),
('00_ADA_OPS_PLATFORM/12_ARCHIVE_IMPORT_LEGACY','1bFSEPaeY0qCtno_KHfWBezsVBYq4Y1db','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/12_ARCHIVE_IMPORT_LEGACY/01_LEGACY_FOLDER_INDEX','1jsnhqSMnLomnidWjO9Dbf8YODU-KOP8-','1bFSEPaeY0qCtno_KHfWBezsVBYq4Y1db','shared',false,true),
('00_ADA_OPS_PLATFORM/12_ARCHIVE_IMPORT_LEGACY/02_MIGRATION_RECONCILIATION','1CRbfRN5H6bt3Uk9krd0RXMuz4QNUbCUK','1bFSEPaeY0qCtno_KHfWBezsVBYq4Y1db','shared',false,true),
('00_ADA_OPS_PLATFORM/12_ARCHIVE_IMPORT_LEGACY/03_RETIRED_EXPORTS','1XO02WIgJ9BHyen0CKdUmDGjJJ17Ty3n1','1bFSEPaeY0qCtno_KHfWBezsVBYq4Y1db','shared',false,true),
('00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT','1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ','1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh','shared',false,true),
('00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT/01_TASK_TRACKERS','1riyV0OKp6FLuEik2KLutaSjGxUPmJIqB','1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ','shared',false,true),
('00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT/02_STANDARD_OPERATING_PROCEDURES','16C-fjr62MSC0N1K9poU0a6vnlorc0lUS','1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ','shared',false,true),
('00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT/03_UI_UX_REFERENCE_SCREENSHOTS','1F-4xI_s-dKfeV7JUBnssaPl6n_bGQj3q','1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ','shared',false,true),
('00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT/04_ONBOARDING_KNOWLEDGE_BASE','1WEaJ41ZtJ-DK_8tvcY3jb3raTMdkCDn3','1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ','shared',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/01_KV_BEFORE_LIVE','1s99VtJ1Ln_5PXyCm5CdmPftcIr6vmBju','1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi','shared_schema_template_only',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/02_KV_AFTER_LIVE','1e05QmP_mjF1uMz4LI2mHge9tYx2a0IH0','1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi','shared_schema_template_only',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/03_DASHBOARD_SUMMARY','1YO61dHPf_YOKvBbGG4KnZOwrGitl5mZz','1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi','shared_schema_template_only',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/04_DASHBOARD_30MIN','1ZooEGViKANQG6HyAPDEg2o-wFs8C28KD','1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi','shared_schema_template_only',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/05_LIVE_SESSION_PHOTOS','1C35IMZtWRh1sGnxqFFWHwyTbEg56lorg','1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi','shared_schema_template_only',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/06_OTHER_EVIDENCE','1kg41d6QleIam2KhF52mwycjZSH-M-duP','1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi','shared_schema_template_only',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/07_FINAL_REPORT_AND_INSIGHTS','1uZyj_B0hXQJfnouQEkkEef0pa9W6be9n','1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi','shared_schema_template_only',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/08_METRICS_DATA_SNAPSHOTS','151jA6sN5ivLyRCMkj9MQXrrxxaL6SOha','1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi','shared_schema_template_only',false,true),
('00_ADA_OPS_PLATFORM/03_LIVE_REPORTS/00_SHIFT_FOLDER_TEMPLATE/09_FILE_MANIFEST_CHECKSUMS','1-m6q6pkOe5lvUqjUVme9mK7zkQkNasJs','1pJ7LM6wQcGyczza5oWLrRxiyuST1rYyi','shared_schema_template_only',false,true);

INSERT INTO public.operational_storage_domain_folders
  (folder_path, folder_id, parent_folder_id, access_classification, active, verified_created)
SELECT folder_path, folder_id, parent_folder_id, access_classification, active, verified_created
FROM rc19_batch05a3_domain_folder_seed
ON CONFLICT (folder_path) DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM rc19_batch05a3_domain_folder_seed) <> 93
    OR EXISTS (
      SELECT 1
      FROM rc19_batch05a3_domain_folder_seed expected
      LEFT JOIN public.operational_storage_domain_folders actual USING (folder_path)
      WHERE actual.folder_path IS NULL
        OR actual.folder_id IS DISTINCT FROM expected.folder_id
        OR actual.parent_folder_id IS DISTINCT FROM expected.parent_folder_id
        OR actual.access_classification IS DISTINCT FROM expected.access_classification
        OR actual.verified_created IS DISTINCT FROM expected.verified_created
    ) THEN
    RAISE EXCEPTION 'RC19_DOMAIN_STORAGE_SEED_MISMATCH';
  END IF;
END;
$$;

COMMIT;