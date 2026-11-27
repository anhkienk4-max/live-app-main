import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationPath = fileURLToPath(new URL(
  '../supabase/migrations/20261126051534_rc19_w4_d3_report_revision_snapshot.sql',
  import.meta.url,
))

const fixture = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA private;
CREATE TABLE public.business_users(id text PRIMARY KEY);
CREATE TABLE public.shifts(id text PRIMARY KEY, brand_id text);
CREATE TABLE public.shift_staffing_segments(id text PRIMARY KEY, shift_id text NOT NULL);
CREATE TABLE public.reports(
  id text PRIMARY KEY, shift_id text NOT NULL, status text NOT NULL DEFAULT 'draft',
  revenue numeric NOT NULL DEFAULT 0, orders integer NOT NULL DEFAULT 0,
  peak_viewer integer NOT NULL DEFAULT 0, average_viewer integer NOT NULL DEFAULT 0,
  gmv numeric, viewers integer, product_clicks integer, ctr numeric, cvr numeric,
  average_order_value numeric, live_duration_minutes integer,
  dashboard_platform text NOT NULL DEFAULT 'other', version_number integer NOT NULL DEFAULT 0,
  submitted_by text, updated_by text, deleted_at timestamptz, archived_at timestamptz,
  final_recap jsonb, ocr_review jsonb
);
CREATE TABLE public.report_revisions(
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_id text NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  version integer NOT NULL, created_by text, created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  status text NOT NULL, reason text, event text NOT NULL, metrics jsonb, ocr_review jsonb,
  final_recap jsonb, image_references text[]
);
CREATE TABLE public.shift_operational_notes(
  id text PRIMARY KEY, shift_id text NOT NULL, business_date date NOT NULL,
  actual_event_time timestamptz NOT NULL, category text NOT NULL, note text NOT NULL,
  workflow_state text NOT NULL, author_id text NOT NULL, author_name text, author_role text,
  affected_role text, affected_user_id text, staffing_segment_id text,
  canonical_incident_id uuid, version integer NOT NULL, created_at timestamptz NOT NULL,
  deleted_at timestamptz
);
CREATE TABLE private.rc19_staff_incidents(
  id uuid PRIMARY KEY, shift_id text NOT NULL, staffing_segment_id text,
  original_registration_id text NOT NULL, original_staff_id text NOT NULL,
  replacement_registration_id text, replacement_staff_id text, replacement_receipt_id uuid,
  operational_role text NOT NULL, business_date date NOT NULL, incident_type text NOT NULL,
  review_state text NOT NULL, effective_at timestamptz, reason text NOT NULL,
  evidence_reference_id text, verified_late_minutes integer, created_by text NOT NULL,
  version integer NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE FUNCTION private.current_business_user_id() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')
$$;
CREATE FUNCTION private.current_system_permission() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT nullif(current_setting('app.actor_permission', true), '')
$$;
CREATE FUNCTION private.current_business_user_is_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(nullif(current_setting('app.actor_active', true), '')::boolean, false)
$$;
CREATE FUNCTION private.require_report_actor(boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE actor text := private.current_business_user_id(); BEGIN
  IF actor IS NULL OR NOT private.current_business_user_is_active() THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;
CREATE FUNCTION private.can_read_report(text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT private.current_business_user_id() IS NOT NULL AND private.current_business_user_is_active()
$$;
CREATE FUNCTION private.can_read_shift_operational_notes(text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT private.current_business_user_is_active() AND private.current_system_permission() IN ('admin','leader')
$$;
CREATE FUNCTION private.rc19_can_mutate_report(text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT private.current_business_user_is_active() AND private.current_system_permission() IN ('admin','leader')
$$;
CREATE FUNCTION private.rc19_has_any_leader_brand_scope(text, text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT private.current_business_user_is_active() AND private.current_system_permission()='leader'
$$;
CREATE FUNCTION private.report_revision_snapshot(public.reports) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('revenue', ($1).revenue, 'orders', ($1).orders)
$$;
`

test('D3 migration captures immutable source versions, safe external projection and idempotent CAS save in PGlite', async () => {
  const db = new PGlite()
  try {
    await db.exec(fixture)
    await db.exec(await readFile(migrationPath, 'utf8'))
    const grants = await db.query<{ table_access: boolean; preview_exec: boolean; writer_exec: boolean }>(`
      SELECT has_table_privilege('authenticated','private.rc19_report_revision_sources','SELECT') AS table_access,
        has_function_privilege('authenticated','public.preview_report_revision_sources_v1(text,text)','EXECUTE') AS preview_exec,
        has_function_privilege('authenticated','private.record_report_revision(text,text,text,text,text,jsonb,jsonb,jsonb,text[])','EXECUTE') AS writer_exec
    `)
    assert.equal(grants.rows[0].table_access, false)
    assert.equal(grants.rows[0].preview_exec, true)
    assert.equal(grants.rows[0].writer_exec, false)
    await db.exec(`
      INSERT INTO public.business_users(id) VALUES ('actor-1'), ('staff-a'), ('staff-b');
      INSERT INTO public.shifts(id,brand_id) VALUES ('shift-1','brand-1');
      INSERT INTO public.shift_staffing_segments(id,shift_id) VALUES ('segment-1','shift-1');
      INSERT INTO public.reports(id,shift_id,status,submitted_by,final_recap)
        VALUES ('report-1','shift-1','draft','actor-1','{"summary":"manual recap remains separate"}');
      INSERT INTO public.shift_operational_notes(
        id,shift_id,business_date,actual_event_time,category,note,workflow_state,
        author_id,author_name,author_role,affected_role,affected_user_id,staffing_segment_id,
        canonical_incident_id,version,created_at
      ) VALUES (
        'note-1','shift-1','2026-11-25','2026-11-25T11:00:00Z','incident','private source note','submitted',
        'staff-a','A','member','host','staff-a','segment-1','00000000-0000-4000-8000-000000000001',1,'2026-11-25T11:00:00Z'
      );
      INSERT INTO private.rc19_staff_incidents(
        id,shift_id,staffing_segment_id,original_registration_id,original_staff_id,
        replacement_registration_id,replacement_staff_id,replacement_receipt_id,
        operational_role,business_date,incident_type,review_state,effective_at,reason,
        evidence_reference_id,verified_late_minutes,created_by,version,created_at,updated_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000001','shift-1','segment-1','registration-a','staff-a',
        'registration-b','staff-b','00000000-0000-4000-8000-000000000002',
        'host','2026-11-25','planned_reassignment','pending','2026-11-25T13:30:00Z',
        'internal reason','private-evidence-id',NULL,'actor-1',1,'2026-11-25T11:00:00Z','2026-11-25T11:00:00Z'
      );
      SELECT set_config('app.actor_id','actor-1',false);
      SELECT set_config('app.actor_permission','admin',false);
      SELECT set_config('app.actor_active','true',false);
      SELECT private.record_report_revision('report-1','actor-1','draft','create',NULL,'{}',NULL,NULL,ARRAY[]::text[]);
    `)

    const initial = await db.query<{ id: string; version: number }>(`
      SELECT revision.id, revision.version FROM public.report_revisions revision WHERE revision.report_id='report-1'
    `)
    assert.equal(initial.rows.length, 1)
    assert.equal(initial.rows[0].version, 1)

    await db.exec(`
      UPDATE public.shift_operational_notes SET note='corrected source',version=2 WHERE id='note-1';
      UPDATE private.rc19_staff_incidents SET reason='corrected reason',version=2 WHERE id='00000000-0000-4000-8000-000000000001';
    `)
    const preview = await db.query<{ result: Record<string, unknown> }>(`
      SELECT public.preview_report_revision_sources_v1('report-1','internal') AS result
    `)
    const previewData = preview.rows[0].result as { sourceSnapshot: { notes: Array<{ version: number; note: string }>; noteRefs: Array<{ noteId: string; version: number }>; incidentRefs: Array<{ incidentId: string; version: number }> } }
    assert.equal(previewData.sourceSnapshot.notes[0].version, 2)
    assert.equal(previewData.sourceSnapshot.notes[0].note, 'corrected source')
    assert.equal(previewData.sourceSnapshot.noteRefs[0].noteId, 'note-1')
    assert.equal(previewData.sourceSnapshot.noteRefs[0].version, 2)
    assert.equal(previewData.sourceSnapshot.incidentRefs[0].version, 2)

    const oldSnapshot = await db.query<{ result: Record<string, unknown> }>(`
      SELECT public.get_report_revision_sources_v1('report-1',1,'internal') AS result
    `)
    const first = oldSnapshot.rows[0].result as { sourceSnapshot: { notes: Array<{ version: number; note: string }>; incidents: Array<{ version: number; reason: string; evidenceReferenceId: string }> } }
    assert.equal(first.sourceSnapshot.notes[0].version, 1)
    assert.equal(first.sourceSnapshot.notes[0].note, 'private source note')
    assert.equal(first.sourceSnapshot.incidents[0].version, 1)
    assert.equal(first.sourceSnapshot.incidents[0].reason, 'internal reason')
    assert.equal(first.sourceSnapshot.incidents[0].evidenceReferenceId, 'private-evidence-id')

    const external = await db.query<{ result: Record<string, unknown> }>(`
      SELECT public.get_report_revision_sources_v1('report-1',1,'external') AS result
    `)
    const externalJson = JSON.stringify(external.rows[0].result)
    assert.match(externalJson, /"metrics"/u)
    assert.doesNotMatch(externalJson, /private source note|internal reason|private-evidence-id|staff-a|incidentRefs|noteRefs/u)

    await db.exec(`
      CREATE FUNCTION public.update_report(text,jsonb,integer,text,text) RETURNS public.reports
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
      DECLARE actor text := private.require_report_actor(false); target public.reports;
      BEGIN
        SELECT * INTO target FROM public.reports WHERE id=$1 FOR UPDATE;
        IF target.version_number <> $3 THEN RAISE EXCEPTION 'REPORT_VERSION_CONFLICT' USING ERRCODE='P0001'; END IF;
        UPDATE public.reports SET revenue=coalesce(($2->>'revenue')::numeric,revenue),updated_by=actor WHERE id=$1 RETURNING * INTO target;
        PERFORM private.record_report_revision($1,actor,target.status,$5,$4,private.report_revision_snapshot(target),target.ocr_review,target.final_recap,ARRAY[]::text[]);
        SELECT * INTO target FROM public.reports WHERE id=$1;
        RETURN target;
      END $$;
    `)
    const saved = await db.query<{ result: Record<string, unknown> }>(`
      SELECT public.update_report_with_revision_snapshot_v1(
        'report-1','{"revenue":200}'::jsonb,1,NULL,'save','4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85'
      ) AS result
    `)
    assert.equal((saved.rows[0].result as { revisionVersion: number }).revisionVersion, 2)
    assert.equal((saved.rows[0].result as { replayed: boolean }).replayed, false)
    const replayed = await db.query<{ result: Record<string, unknown> }>(`
      SELECT public.update_report_with_revision_snapshot_v1(
        'report-1','{"revenue":200}'::jsonb,1,NULL,'save','4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85'
      ) AS result
    `)
    assert.equal((replayed.rows[0].result as { revisionVersion: number }).revisionVersion, 2)
    assert.equal((replayed.rows[0].result as { replayed: boolean }).replayed, true)
    await assert.rejects(db.query(`
      SELECT public.update_report_with_revision_snapshot_v1(
        'report-1','{"revenue":201}'::jsonb,1,NULL,'save','4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85'
      )
    `), /REPORT_IDEMPOTENCY_CONFLICT/u)
    await db.exec(`SELECT set_config('app.actor_permission','member',false);`)
    await assert.rejects(db.query(`
      SELECT public.update_report_with_revision_snapshot_v1(
        'report-1','{"revenue":200}'::jsonb,1,NULL,'save','4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85'
      )
    `), /REPORT_NOT_FOUND/u)
    await db.exec(`SELECT set_config('app.actor_permission','admin',false);`)
    const count = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.report_revisions WHERE report_id='report-1'`)
    assert.equal(count.rows[0].count, 2)

    await db.exec(`
      UPDATE public.shift_operational_notes SET note='later edit',version=3 WHERE id='note-1';
      UPDATE private.rc19_staff_incidents SET reason='later reason',version=3 WHERE id='00000000-0000-4000-8000-000000000001';
    `)
    const revisionTwo = await db.query<{ result: Record<string, unknown> }>(`
      SELECT public.get_report_revision_sources_v1('report-1',2,'internal') AS result
    `)
    const revisionTwoData = revisionTwo.rows[0].result as { sourceSnapshot: { notes: Array<{ version: number; note: string }>; incidents: Array<{ version: number; reason: string }> } }
    assert.equal(revisionTwoData.sourceSnapshot.notes[0].version, 2)
    assert.equal(revisionTwoData.sourceSnapshot.notes[0].note, 'corrected source')
    assert.equal(revisionTwoData.sourceSnapshot.incidents[0].version, 2)
    assert.equal(revisionTwoData.sourceSnapshot.incidents[0].reason, 'corrected reason')

    await assert.rejects(db.query(`UPDATE private.rc19_report_revision_sources SET source_snapshot='{}' WHERE report_id='report-1'`), /REPORT_REVISION_SNAPSHOT_IMMUTABLE/u)
  } finally {
    await db.close()
  }
})
