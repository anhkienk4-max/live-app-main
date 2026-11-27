import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  new URL('../supabase/migrations/20261126120000_rc19_w4_d3_external_operational_summary.sql', import.meta.url),
  'utf8',
)

test('external summary migration installs private workflow and snapshots only approved content', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema private;
      create table public.business_users (id text primary key);
      create table public.shifts (id text primary key, brand_id text);
      create table public.reports (
        id text primary key, shift_id text not null references public.shifts(id), status text not null,
        revenue numeric, orders integer, peak_viewer integer, average_viewer integer, gmv numeric,
        viewers integer, product_clicks integer, ctr numeric, cvr numeric, average_order_value numeric,
        live_duration_minutes integer, dashboard_platform text, deleted_at timestamptz, archived_at timestamptz,
        metrics_confirmed boolean default false, version_number integer default 1,
        ocr_review jsonb, final_recap jsonb
      );
      create table public.report_revisions (id text primary key, report_id text, version integer, created_at timestamptz default now());
      create table private.rc19_report_revision_sources (
        report_revision_id text primary key, report_id text, revision_version integer,
        source_snapshot jsonb not null, external_projection jsonb not null
      );
      alter table private.rc19_report_revision_sources enable row level security;
      create function private.reject_rc19_report_revision_source_mutation()
        returns trigger language plpgsql as $$ begin raise exception 'REPORT_REVISION_SNAPSHOT_IMMUTABLE'; end $$;
      create trigger rc19_report_revision_sources_immutable before update or delete
        on private.rc19_report_revision_sources for each row
        execute function private.reject_rc19_report_revision_source_mutation();
      create function private.record_report_revision(text,text,text,text,text,jsonb,jsonb,jsonb,text[])
        returns void language sql security definer as $$ select $$;
      create function private.rc19_can_mutate_report(text) returns boolean language sql stable as $$ select true $$;
      create function private.can_read_report(text) returns boolean language sql stable as $$ select true $$;
      create function private.log_shift_audit(text,text,text,text,text,jsonb,text[])
        returns void language sql security definer as $$ select $$;
      create function private.current_business_user_id() returns text language sql stable as $$ select 'admin-1' $$;
      create function private.current_system_permission() returns text language sql stable as $$ select 'admin' $$;
      create function private.current_business_user_is_active() returns boolean language sql stable as $$ select true $$;
      create function private.rc19_has_any_leader_brand_scope(text,text[]) returns boolean language sql stable as $$ select true $$;
      create function private.rc19_has_leader_brand_scope(text,text) returns boolean language sql stable as $$ select true $$;
      create function private.report_revision_snapshot(public.reports) returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      create function private.report_image_references(text) returns text[] language sql stable as $$ select array[]::text[] $$;
      create function private.rc19_report_external_projection(public.reports, integer)
        returns jsonb language sql immutable as $$ select '{}'::jsonb $$;
    `)

    await db.exec(migration)
    const migrationObjects = await db.query(`
      select to_regclass('private.rc19_report_external_summaries') is not null as summary_table,
             to_regclass('private.rc19_report_external_summary_events') is not null as event_table,
             to_regprocedure('public.external_report_summary_workflow_v1(text,text,uuid,text,integer,text,uuid)') is not null as workflow_rpc,
             to_regprocedure('public.get_report_external_summary_workflow_v1(text)') is not null as read_rpc
    `)
    assert.deepEqual(migrationObjects.rows[0], { summary_table: true, event_table: true, workflow_rpc: true, read_rpc: true })

    await db.exec(`
      insert into public.business_users(id) values ('admin-1');
      insert into public.shifts(id, brand_id) values ('shift-1', 'brand-1');
      insert into public.reports(id, shift_id, status, revenue, orders, peak_viewer, average_viewer, dashboard_platform)
        values ('report-1', 'shift-1', 'draft', 100, 1, 10, 5, 'other');
      insert into private.rc19_report_external_summaries (
        id, report_id, shift_id, content, workflow_state, version, created_by, updated_by, reviewed_by, reviewed_at
      ) values ('9a0e98c5-90ef-4f44-8baa-733f47fa237e', 'report-1', 'shift-1',
        'Approved external operations summary.', 'approved', 3, 'admin-1', 'admin-1', 'admin-1', now());
      insert into private.rc19_report_revision_sources (
        report_revision_id, report_id, revision_version, source_snapshot, external_projection
      ) values ('revision-1', 'report-1', 4, '{}'::jsonb, '{"metrics":{"revenue":100}}'::jsonb);
    `)
    const approved = await db.query(`select external_summary_snapshot, source_snapshot, external_projection
      from private.rc19_report_revision_sources where report_revision_id = 'revision-1'`)
    const row = approved.rows[0] as { external_summary_snapshot: Record<string, unknown>; source_snapshot: Record<string, unknown>; external_projection: Record<string, unknown> }
    assert.equal(row.external_summary_snapshot.reportRevisionId, 'revision-1')
    assert.equal(row.external_summary_snapshot.reportRevisionVersion, 4)
    assert.equal(row.external_summary_snapshot.content, 'Approved external operations summary.')
    assert.equal((row.external_projection.operationalSummary as Record<string, unknown>).content, 'Approved external operations summary.')
    assert.equal((row.source_snapshot.approvedExternalSummary as Record<string, unknown>).approvedBy, 'admin-1')

    await db.exec(`
      update private.rc19_report_external_summaries set workflow_state = 'submitted' where report_id = 'report-1';
      insert into private.rc19_report_revision_sources (
        report_revision_id, report_id, revision_version, source_snapshot, external_projection
      ) values ('revision-2', 'report-1', 5, '{}'::jsonb, '{"metrics":{"revenue":100}}'::jsonb);
    `)
    const pending = await db.query(`select external_summary_snapshot, external_projection
      from private.rc19_report_revision_sources where report_revision_id = 'revision-2'`)
    assert.equal(pending.rows[0].external_summary_snapshot, null)
    assert.equal((pending.rows[0].external_projection as Record<string, unknown>).operationalSummary, null)
    await assert.rejects(() => db.exec(`update private.rc19_report_revision_sources set external_projection = '{}' where report_revision_id = 'revision-1'`), /REPORT_REVISION_SNAPSHOT_IMMUTABLE/u)
  } finally {
    await db.close()
  }
})
