-- RC19 Batch 05A.4.2: reconcile additional physical folders and harden source receipts.
-- Pending ACL folders stay inactive; registry metadata is not evidence of effective Drive ACLs.
BEGIN;

ALTER TABLE public.operational_storage_domain_folders
  DROP CONSTRAINT IF EXISTS operational_storage_domain_folders_access_classification_check;
ALTER TABLE public.operational_storage_domain_folders
  ADD CONSTRAINT operational_storage_domain_folders_access_classification_check
    CHECK (access_classification IN (
      'shared', 'pending_restriction_no_sensitive_upload', 'shared_schema_template_only',
      'restricted_pending_app_acl_verification', 'restricted_verified'
    ));

CREATE TEMP TABLE rc19_batch05a42_folder_seed (
  folder_path text PRIMARY KEY,
  folder_id text NOT NULL UNIQUE,
  parent_folder_id text NOT NULL,
  access_classification text NOT NULL,
  active boolean NOT NULL,
  verified_created boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO rc19_batch05a42_folder_seed
  (folder_path, folder_id, parent_folder_id, access_classification, active, verified_created)
VALUES
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/01_CHECKIN_PHOTOS', '1-CdyoEbNj0eFuwVd72sJPoqBxla4cF4m', '1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/02_CHECKOUT_PHOTOS', '14UbygcI5M5GYEjfkkoxR91tWxyLSqYwd', '1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/03_LATE_NO_SHOW_EVIDENCE', '1Md4kTjCr2uBSyb8qMMkoHTFeEG1wr7H6', '1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/04_REVIEW_AND_CORRECTIONS', '1iwvU_BTNEEAK2WtBqU2iMc87CPhaktJR', '1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/05_FILE_MANIFESTS_CHECKSUMS', '1eWmTddA2Kboak6LHXgnojkSP1JzkKyq3', '1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/01_CHECKIN_EVENT_SNAPSHOTS', '1V4G06V5dTcDtXPTa4TYHE5sxZ-HYtTqx', '1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/02_CHECKOUT_EVENT_SNAPSHOTS', '1RxpMbQSpJiLB7HD_t4gho2ccf9FuHbhd', '1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/03_REVIEW_DECISION_SNAPSHOTS', '1y2HJHAozyEP7AWNSW8Ka_uaESOPmxXM3', '1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/04_APPROVED_ACTUAL_HOURS_SNAPSHOTS', '1RGFh8qM0DJATFUNIkxtFvM5rN-CL-fQo', '1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/05_RECONCILIATION_AUDIT', '1XjsybCzv5vyKqxu00L2l4Nq7coARGrrO', '1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/06_EXPORTS', '1PZeeFukjyvGVQz-IEfsIxUW1aUnQFrAq', '1ssFPVQnGcdj9KTgRFoXTm1tf1uiHgKA7', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/01_DRAFT_CALCULATIONS', '1_cxIezRWXmlQeupGx8DeZXgQovwtm_N1', '1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/02_REVIEW_APPROVALS', '1M7TAy0NgNfa17pZC_-NNr43u3425_jlu', '1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/03_LOCKED_PUBLISHED_STATEMENTS', '1is7hTY1rM1KQF09ce2hA3pAQ1hr74i_m', '1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/04_PERSONAL_PAYSLIPS', '1wGruAoc2SiGlOhyPB73_RQP6eVa8DyqC', '1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/05_ADJUSTMENTS_CORRECTIONS', '163BtV3erjzNMAYt57wlL5oDb72yhlPed', '1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/06_RECONCILIATION', '1481hW5yuEntTyx9NCHDPUxUHasSdypDO', '1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/07_EXPORTS_BACKUPS', '12x4mOCgmmYFDnvuNo1ogPU8hEIygeG9o', '1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/08_VERSION_MANIFESTS', '1TlxdE_zSMYgxlW_rOM92-wpFpctDDM5N', '1q8yOdOKH9aNN3Kja8qX9bI05_NP1vIna', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/04_RATE_CARDS/01_ACTIVE_APPROVED_RATES', '1z1C-I-KsqcGiqBlHZh9c33W_ebnVyDVE', '1uHn3hJIKnzgo4r_YBB_jvSwdAYqBJGyY', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/04_RATE_CARDS/02_HISTORICAL_RATE_VERSIONS', '1x4wqaosSSZxpLXLC-6pnK9Hra2d0a2c6', '1uHn3hJIKnzgo4r_YBB_jvSwdAYqBJGyY', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/04_RATE_CARDS/03_RATE_REVIEW_APPROVALS', '11NfWSNfWV4hNYK7QvAWn5XHmsAHqYYEI', '1uHn3hJIKnzgo4r_YBB_jvSwdAYqBJGyY', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/04_RATE_CARDS/04_RATE_CHANGE_AUDIT', '1nTv-y1oRHwMgU4VIHo_RKGP3D3J8L37f', '1uHn3hJIKnzgo4r_YBB_jvSwdAYqBJGyY', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/05_PERSONNEL_RECORDS/01_STAFF_PROFILE_SNAPSHOTS', '1chy-Q0wrvWJxBossy-pHdSCpBPgdNNmL', '1A6QgDPZ6mxaDWWIT4hwsFZzXzbDW0aMM', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/05_PERSONNEL_RECORDS/02_ROLE_ASSIGNMENT_HISTORY', '1O8sB_MSErYdxuyPCUhR-uS-bG9CYWnyy', '1A6QgDPZ6mxaDWWIT4hwsFZzXzbDW0aMM', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/05_PERSONNEL_RECORDS/03_CONTRACT_REFERENCES', '1EmsF9hpGXuRpDOwbqHKJhVHXymskk4gL', '1A6QgDPZ6mxaDWWIT4hwsFZzXzbDW0aMM', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/05_PERSONNEL_RECORDS/04_ONBOARDING_OFFBOARDING', '1ePfpauUVTJEmvAZ-IjyI4EaDiQ0pUz_h', '1A6QgDPZ6mxaDWWIT4hwsFZzXzbDW0aMM', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/06_ACCESS_AUDIT/01_FILE_ACCESS_EVENTS', '1dgoG7AJdoHA_BC7zw7qsmHBUEqoe8G39', '1Ole-hOkRoAS4jrIFzE_XZcaLf-bDbNjE', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/06_ACCESS_AUDIT/02_DATA_OBJECT_CHANGE_AUDIT', '1h3Kou3v99PS8D0cmawC4KSLRnMlLbuQs', '1Ole-hOkRoAS4jrIFzE_XZcaLf-bDbNjE', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/06_ACCESS_AUDIT/03_ROLE_PERMISSION_CHANGE_AUDIT', '1gc76L-q7Reinok4-3gQVVZ_nUTqvEMcm', '1Ole-hOkRoAS4jrIFzE_XZcaLf-bDbNjE', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/06_ACCESS_AUDIT/04_RETENTION_AND_RECOVERY_AUDIT', '11wQoX-NxmZmsWUhlmDy3RdZN60fl0YaC', '1Ole-hOkRoAS4jrIFzE_XZcaLf-bDbNjE', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/01_DRAFT_CALCULATIONS/2026', '1jtUrYvWrPBBRd6sriYaf7tSv42aXjWI1', '1_cxIezRWXmlQeupGx8DeZXgQovwtm_N1', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/02_REVIEW_APPROVALS/2026', '1h69Epo9VrRXyifc5tpPOhNjtDVNztc-5', '1M7TAy0NgNfa17pZC_-NNr43u3425_jlu', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/03_LOCKED_PUBLISHED_STATEMENTS/2026', '1C9UcMOhE7iiBXI3IgTe-GWr47x6Pge9g', '1is7hTY1rM1KQF09ce2hA3pAQ1hr74i_m', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/04_PERSONAL_PAYSLIPS/2026', '13qjQ0hrQRBqJqbwO6NSox663BDGdibf-', '1wGruAoc2SiGlOhyPB73_RQP6eVa8DyqC', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/05_ADJUSTMENTS_CORRECTIONS/2026', '1VpAWI-stZCUBWWt1GGYOdfl3c5nPMAQE', '163BtV3erjzNMAYt57wlL5oDb72yhlPed', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/06_RECONCILIATION/2026', '17dYa053vzDrO3rLr4F2Qvbf45hheVdRK', '1481hW5yuEntTyx9NCHDPUxUHasSdypDO', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/07_EXPORTS_BACKUPS/2026', '1HJw_YRjcv9bnjyhQ8IGW_eWgAcgu8Quv', '12x4mOCgmmYFDnvuNo1ogPU8hEIygeG9o', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/08_VERSION_MANIFESTS/2026', '1CiIZ3pAcBcJ_lKRmlawxh3rnTujTsxEg', '1TlxdE_zSMYgxlW_rOM92-wpFpctDDM5N', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/01_DRAFT_CALCULATIONS/2026/THÁNG 10', '1tSIouQQl7Fm9tF3oGB56YVUBhAf81zh-', '1jtUrYvWrPBBRd6sriYaf7tSv42aXjWI1', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/01_DRAFT_CALCULATIONS/2026/THÁNG 11', '1muA5AV1P9Ofop15Z6uY9aLsMvqlepnYV', '1jtUrYvWrPBBRd6sriYaf7tSv42aXjWI1', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/02_REVIEW_APPROVALS/2026/THÁNG 10', '1TDcbocRB1eCUCUKQrL3poxNmACeEM7k6', '1h69Epo9VrRXyifc5tpPOhNjtDVNztc-5', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/02_REVIEW_APPROVALS/2026/THÁNG 11', '1edLF9xIRLYapkK6xAhOBqup_Q_vXlShe', '1h69Epo9VrRXyifc5tpPOhNjtDVNztc-5', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/03_LOCKED_PUBLISHED_STATEMENTS/2026/THÁNG 10', '191Xd8TsZr1cb2OCda_DyTvTmH2jwUZ_0', '1C9UcMOhE7iiBXI3IgTe-GWr47x6Pge9g', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/03_LOCKED_PUBLISHED_STATEMENTS/2026/THÁNG 11', '12qi7fna33MOeSZ2vsdpnVLpiVzQod5Hl', '1C9UcMOhE7iiBXI3IgTe-GWr47x6Pge9g', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/04_PERSONAL_PAYSLIPS/2026/THÁNG 10', '1CGYyREKBhHgoW6mMIjOiwpr9UI-CM077', '13qjQ0hrQRBqJqbwO6NSox663BDGdibf-', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/04_PERSONAL_PAYSLIPS/2026/THÁNG 11', '1VvjEeyvytUzP4qJdvUDUhp6x3oVpxJab', '13qjQ0hrQRBqJqbwO6NSox663BDGdibf-', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/05_ADJUSTMENTS_CORRECTIONS/2026/THÁNG 10', '18TZPc5vc4yrvx_P8DoJPgBk2-F3XOl3Z', '1VpAWI-stZCUBWWt1GGYOdfl3c5nPMAQE', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/05_ADJUSTMENTS_CORRECTIONS/2026/THÁNG 11', '1fkOSoL5_SKO-z_Gs5I1QKYUTskmI8_yv', '1VpAWI-stZCUBWWt1GGYOdfl3c5nPMAQE', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/06_RECONCILIATION/2026/THÁNG 10', '1hHYXdT0v3qxtzJ9Qm0rys28v0KA2y3CW', '17dYa053vzDrO3rLr4F2Qvbf45hheVdRK', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/06_RECONCILIATION/2026/THÁNG 11', '122SGoq9LhbwLsXG0M1UeNN0CTt8BIxxq', '17dYa053vzDrO3rLr4F2Qvbf45hheVdRK', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/07_EXPORTS_BACKUPS/2026/THÁNG 10', '1D8Z1YahNWShSfxzQlfHOSK0Sf1lEiQCW', '1HJw_YRjcv9bnjyhQ8IGW_eWgAcgu8Quv', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/07_EXPORTS_BACKUPS/2026/THÁNG 11', '1JUSizDWbok_hRR1uVL4BxmH62SsoqwCL', '1HJw_YRjcv9bnjyhQ8IGW_eWgAcgu8Quv', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/08_VERSION_MANIFESTS/2026/THÁNG 10', '1pehrcMnUwnONvR0MBLS8CqVTY3u5-A7L', '1CiIZ3pAcBcJ_lKRmlawxh3rnTujTsxEg', 'restricted_pending_app_acl_verification', false, true),
('00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/03_PAYROLL_STATEMENTS/08_VERSION_MANIFESTS/2026/THÁNG 11', '1C22Whj8ST4Ot3l57DArXLCbAUNINvtvj', '1CiIZ3pAcBcJ_lKRmlawxh3rnTujTsxEg', 'restricted_pending_app_acl_verification', false, true);

INSERT INTO public.operational_storage_domain_folders
  (folder_path, folder_id, parent_folder_id, access_classification, active, verified_created)
SELECT folder_path, folder_id, parent_folder_id, access_classification, active, verified_created
FROM rc19_batch05a42_folder_seed
ON CONFLICT (folder_path) DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM rc19_batch05a42_folder_seed) <> 55
    OR EXISTS (
      SELECT 1
      FROM rc19_batch05a42_folder_seed expected
      LEFT JOIN public.operational_storage_domain_folders actual USING (folder_path)
      WHERE actual.folder_path IS NULL
        OR actual.folder_id IS DISTINCT FROM expected.folder_id
        OR actual.parent_folder_id IS DISTINCT FROM expected.parent_folder_id
        OR actual.access_classification IS DISTINCT FROM expected.access_classification
        OR actual.active IS DISTINCT FROM false
        OR actual.verified_created IS DISTINCT FROM true
    ) THEN
    RAISE EXCEPTION 'RC19_BATCH05A42_DOMAIN_FOLDER_SEED_MISMATCH';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.require_excel_schedule_source_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.import_batch_id IS NOT NULL
    AND OLD.import_batch_id IS DISTINCT FROM NEW.import_batch_id
    AND EXISTS (
      SELECT 1 FROM public.schedule_import_batches batch
      WHERE batch.id = OLD.import_batch_id AND batch.source = 'excel' AND batch.status = 'confirmed'
    ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_CONFIRMED_BATCH_REFERENCE_IMMUTABLE';
  END IF;

  IF NEW.import_batch_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.schedule_import_batches batch
      WHERE batch.id = NEW.import_batch_id AND batch.source = 'excel'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.operational_schedule_source_files source_file
      WHERE source_file.batch_id = NEW.import_batch_id
        AND source_file.reconciliation_status = 'provider_verified'
        AND source_file.external_file_id IS NOT NULL
        AND source_file.external_parent_id IS NOT NULL
    ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_REQUIRED_BEFORE_IMPORT';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.require_excel_source_before_batch_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed'
    AND (OLD.id IS DISTINCT FROM NEW.id
      OR OLD.source IS DISTINCT FROM NEW.source
      OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_CONFIRMED_BATCH_IMMUTABLE';
  END IF;

  IF NEW.status = 'confirmed' AND NEW.source = 'excel'
    AND NOT EXISTS (
      SELECT 1 FROM public.operational_schedule_source_files source_file
      WHERE source_file.batch_id = NEW.id
        AND source_file.reconciliation_status = 'provider_verified'
        AND source_file.external_file_id IS NOT NULL
        AND source_file.external_parent_id IS NOT NULL
    ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_REQUIRED_BEFORE_CONFIRM';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_excel_source_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  source_batch_id text;
  source_batch_status text;
BEGIN
  source_batch_id := CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN OLD.batch_id ELSE NEW.batch_id END;
  SELECT status INTO source_batch_status
  FROM public.schedule_import_batches
  WHERE id = source_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_BATCH_NOT_FOUND';
  END IF;
  IF source_batch_status = 'confirmed' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_CONFIRMED_RECEIPT_IMMUTABLE';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.reconciliation_status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_RECEIPT_MUST_START_PENDING';
  END IF;
  IF TG_OP = 'UPDATE'
    AND (NEW.batch_id IS DISTINCT FROM OLD.batch_id
      OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_RECEIPT_IDENTITY_IMMUTABLE';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.require_excel_schedule_source_receipt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.require_excel_source_before_batch_confirmation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_excel_source_receipt_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS shifts_require_excel_schedule_source_receipt ON public.shifts;
CREATE TRIGGER shifts_require_excel_schedule_source_receipt
  BEFORE INSERT OR UPDATE OF import_batch_id ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION private.require_excel_schedule_source_receipt();

DROP TRIGGER IF EXISTS schedule_import_batches_require_excel_source ON public.schedule_import_batches;
CREATE TRIGGER schedule_import_batches_require_excel_source
  BEFORE INSERT OR UPDATE OF id, source, status ON public.schedule_import_batches
  FOR EACH ROW EXECUTE FUNCTION private.require_excel_source_before_batch_confirmation();

DROP TRIGGER IF EXISTS operational_schedule_source_files_guard_mutation ON public.operational_schedule_source_files;
CREATE TRIGGER operational_schedule_source_files_guard_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.operational_schedule_source_files
  FOR EACH ROW EXECUTE FUNCTION private.guard_excel_source_receipt_mutation();

COMMENT ON FUNCTION private.require_excel_source_before_batch_confirmation() IS
  'Require a backend-verified source receipt before Excel batch confirmation; provider bytes are re-read and checksummed by the API before import.';
COMMENT ON FUNCTION private.guard_excel_source_receipt_mutation() IS
  'Lock the parent batch while mutating source receipts and preserve receipt/batch references after confirmation.';

COMMIT;
