-- RC19 Batch 05A.4.1: bind raw Excel receipts to real batches and make the
-- receipt a database invariant before imported shifts or confirmation persist.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.operational_schedule_source_files'::regclass
      AND conname = 'operational_schedule_source_files_batch_id_fkey'
  ) THEN
    ALTER TABLE public.operational_schedule_source_files
      ADD CONSTRAINT operational_schedule_source_files_batch_id_fkey
      FOREIGN KEY (batch_id) REFERENCES public.schedule_import_batches(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.operational_schedule_source_files
  VALIDATE CONSTRAINT operational_schedule_source_files_batch_id_fkey;

CREATE OR REPLACE FUNCTION private.require_excel_schedule_source_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
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

REVOKE ALL ON FUNCTION private.require_excel_schedule_source_receipt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.require_excel_source_before_batch_confirmation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS shifts_require_excel_schedule_source_receipt ON public.shifts;
CREATE TRIGGER shifts_require_excel_schedule_source_receipt
  BEFORE INSERT OR UPDATE OF import_batch_id ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION private.require_excel_schedule_source_receipt();

DROP TRIGGER IF EXISTS schedule_import_batches_require_excel_source ON public.schedule_import_batches;
CREATE TRIGGER schedule_import_batches_require_excel_source
  BEFORE UPDATE OF status ON public.schedule_import_batches
  FOR EACH ROW EXECUTE FUNCTION private.require_excel_source_before_batch_confirmation();

COMMENT ON FUNCTION private.require_excel_schedule_source_receipt() IS
  'Require provider-verified raw Excel bytes before a batch-linked shift write.';
COMMENT ON FUNCTION private.require_excel_source_before_batch_confirmation() IS
  'Require provider-verified raw Excel bytes before an Excel import batch is confirmed.';

COMMIT;
