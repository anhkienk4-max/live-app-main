// Run with: node tests/rc14-live-image-migration.integration.mjs <path-to-pglite-dist-index.js>
// Uses isolated in-memory PostgreSQL only; no remote database or project dependency.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const migration = readFileSync('supabase/migrations/20261006160000_rc14_live_image_storage_contract.sql', 'utf8')
const original = readFileSync('supabase/migrations/20260823000000_p3_report_persistence.sql', 'utf8')
const oldRpc = original.slice(original.indexOf('create or replace function public.upsert_live_report_image('), original.indexOf('create or replace function public.set_live_report_image_cover('))
const provider = readFileSync('supabase/migrations/20260919074349_rc12_report_file_provider.sql', 'utf8')
const oldWrapper = provider.slice(provider.indexOf('create or replace function public.upsert_live_report_image_with_provider('), provider.indexOf('-- Provider-backed deletes'))
for (const databaseMode of [false, true]) {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema private;
      create table public.reports (id text primary key, submitted_by text, metrics_confirmed boolean default false,
        status text default 'draft', deleted_at timestamptz, archived_at timestamptz, ocr_review jsonb, final_recap jsonb);
      create table public.live_report_images (id text primary key default gen_random_uuid()::text, report_id text references public.reports(id),
        category text not null check (category in ('key_visual','live_session','other')), title text, description text, captured_at timestamptz,
        file_url text not null, thumbnail_url text, file_name text not null, mime_type text, size_bytes bigint,
        sort_order integer, is_cover boolean, uploaded_by text, created_at timestamptz default now(), updated_at timestamptz default now());
      create unique index live_report_images_dedupe_key on public.live_report_images (report_id, file_url);
      alter table public.live_report_images enable row level security;
      create policy live_report_images_read on public.live_report_images for select to authenticated using (true);
      grant select on public.live_report_images to authenticated;
      create table private.revisions (note text);
      create function private.require_report_actor(boolean) returns text language sql as $$select 'member-1'::text$$;
      create function private.current_system_permission() returns text language sql as $$select 'member'::text$$;
      create function private.report_revision_snapshot(public.reports) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function private.report_image_references(text) returns jsonb language sql as $$select '[]'::jsonb$$;
      create function private.record_report_revision(text,text,text,text,text,jsonb,jsonb,jsonb,jsonb) returns void language sql
        as $$insert into private.revisions(note) values ($5)$$;
      insert into public.reports (id,submitted_by) values ('r1','member-1'),('r2','member-2');
    `)
    await db.exec(oldRpc)
    if (databaseMode) {
      await db.exec('alter table public.live_report_images add column provider text, add column external_file_id text;')
      await db.exec(oldWrapper)
    }
    await db.exec(migration)
    await db.exec(migration) // Idempotent on both compat and provider-column schemas.
    const upload = async data => (await db.query('select * from public.upsert_live_report_image($1::jsonb)', [JSON.stringify(data)])).rows[0]
    const legacy = await upload({ report_id:'r1', category:'other', file_name:'legacy.png', file_url:'legacy/path.png', mime_type:'image/png', size_bytes:3 })
    assert.equal(legacy.storage_file_name, null)
    assert.equal(legacy.storage_idempotency_key, null)
    const input = { report_id:'r1', category:'live_session', file_name:'original.png', file_url:'cloudref:v1:google_drive:first',
      mime_type:'image/png', size_bytes:3, storage_file_name:`20260914_live-session_${'A'.repeat(64)}_original.png`, storage_idempotency_key:`live_session:${'a'.repeat(64)}` }
    const first = await upload(input)
    assert.equal(first.file_name,'original.png')
    assert.equal(first.storage_file_name,input.storage_file_name)
    const retries = await Promise.all([upload({...input,file_name:'renamed.png',file_url:'cloudref:v1:google_drive:redundant-1'}),
      upload({...input,file_url:'cloudref:v1:google_drive:redundant-2'})])
    assert.ok(retries.every(row=>row.id === first.id && row.file_url === first.file_url))
    assert.equal((await db.query('select count(*)::int as n from private.revisions')).rows[0].n,2)
    await assert.rejects(()=>db.query('insert into public.live_report_images (report_id,category,file_name,file_url,storage_file_name,storage_idempotency_key) values ($1,$2,$3,$4,$5,$6)',
      ['r1','live_session','same.png','another-url',input.storage_file_name,input.storage_idempotency_key]),error=>error.code === '23505')
    const different = await upload({...input,file_url:'cloudref:v1:google_drive:different',storage_idempotency_key:`live_session:${'b'.repeat(64)}`,
      storage_file_name:`20260914_live-session_${'B'.repeat(64)}_original.png`})
    const other = await upload({...input,category:'key_visual',file_url:'cloudref:v1:google_drive:other-category',
      storage_idempotency_key:`key_visual:${'a'.repeat(64)}`,storage_file_name:`20260914_key-visual_${'A'.repeat(64)}_original.png`})
    assert.notEqual(different.id,first.id)
    assert.notEqual(other.id,first.id)
    await assert.rejects(()=>db.query('update public.live_report_images set category=$1 where id=$2',['key_visual',first.id]),error=>error.code === '23505')
    await db.query('update public.live_report_images set category=$1 where id=$2',['other',different.id])
    assert.equal((await db.query('select storage_idempotency_key from public.live_report_images where id=$1',[different.id])).rows[0].storage_idempotency_key,`other:${'b'.repeat(64)}`)
    await assert.rejects(()=>upload({...input, report_id:'r2'}),/OPERATION_NOT_ALLOWED/u)
    await db.exec("update public.reports set metrics_confirmed=true where id='r1';")
    await assert.rejects(()=>upload(input),/REPORT_CONFIRMED/u)
    await db.exec("update public.reports set metrics_confirmed=false where id='r1'; set role authenticated;")
    assert.equal((await upload(input)).id,first.id)
    await assert.rejects(()=>db.exec("insert into public.live_report_images(report_id,category,file_name,file_url) values ('r1','other','direct.png','direct');"),error=>error.code === '42501')
    await db.exec('reset role; set role anon;')
    await assert.rejects(()=>upload(input),error=>error.code === '42501')
    await db.exec('reset role;')
    if (databaseMode) {
      const wrapped = {...input,category:'other',file_url:'logical/provider.png',storage_idempotency_key:`other:${'c'.repeat(64)}`,
        provider:'google_drive', external_file_id:'winner',storage_file_name:`20260914_other_${'C'.repeat(64)}_original.png`}
      const call = async data => (await db.query('select * from public.upsert_live_report_image_with_provider($1::jsonb)',[JSON.stringify(data)])).rows[0]
      const winner = await call(wrapped)
      const retry = await call({...wrapped,external_file_id:'loser'})
      assert.equal(retry.id,winner.id)
      assert.equal(retry.external_file_id,'winner')
    }
    await db.query('delete from public.live_report_images where id=$1',[first.id])
    assert.notEqual((await upload(input)).id,first.id)
    console.log(`SQL_EXECUTION_${databaseMode?'DATABASE':'COMPAT'}=PASS: rerun, legacy rows, retry, unique key, category edits, auth/grants, delete/retry${databaseMode?', provider winner reference':''}`)
  } finally { await db.close() }
}
