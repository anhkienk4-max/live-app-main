import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const databaseUrl = process.env.DATABASE_URL
const databaseName = 'rc19_brand01_disposable'
const setup = fs.readFileSync(path.resolve('tests/brand01/postgres17_setup.sql'), 'utf8')
const brandProposal = fs.readFileSync(path.resolve('supabase/proposals/rc19-brand01/20261030120000_rc19_brand01_catalog_review_only.sql'), 'utf8')
const stoProposal = fs.readFileSync(path.resolve('supabase/proposals/rc19-sto02-resource-registry/20261027150000_rc19_sto02_resource_registry.sql'), 'utf8')
const stoPreflight = fs.readFileSync(path.resolve('supabase/proposals/rc19-sto02-resource-registry/preflight.sql'), 'utf8')
const assertions = fs.readFileSync(path.resolve('tests/brand01/postgres17_assertions.sql'), 'utf8')

test('BRAND-01 proposal and STO-02 resource relationships enforce scoped PostgreSQL 17 security', async t => {
  if (!databaseUrl) {
    if (process.env.CI) throw new Error('[POSTGRES-17] DATABASE_URL is required in CI')
    t.skip('Dedicated disposable PostgreSQL 17 server is not configured')
    return
  }
  let url: URL
  try { url = new URL(databaseUrl) } catch { throw new Error('[POSTGRES-17] DATABASE_URL must identify the dedicated disposable database') }
  const name = decodeURIComponent(url.pathname.slice(1))
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname.toLowerCase())
    || name !== databaseName || process.env.RC19_BRAND01_DISPOSABLE_TEST_DATABASE !== 'I_UNDERSTAND') {
    throw new Error('[POSTGRES-17] Refusing destructive initialization outside the explicitly confirmed BRAND-01 disposable database')
  }
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 })
  await client.connect()
  try {
    const identity = await client.query("select current_database() as db, current_user as actor, current_setting('server_version_num')::int as version")
    assert.equal(identity.rows[0]?.db, databaseName)
    assert.equal(identity.rows[0]?.actor, 'postgres')
    assert.ok(identity.rows[0]?.version >= 170000 && identity.rows[0]?.version < 180000, 'PostgreSQL Server 17 is required')
    const occupied = await client.query("select count(*)::int as count from (select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' union all select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' union all select t.oid from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public') objects")
    assert.equal(occupied.rows[0]?.count, 0, '[POSTGRES-17] Refusing to initialize a database with existing public objects')
    const protectedSchemaObjects = await client.query("select count(*)::int as count from (select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('private','auth') union all select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','auth') union all select t.oid from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('private','auth')) objects")
    assert.equal(protectedSchemaObjects.rows[0]?.count, 0, '[POSTGRES-17] Refusing to drop non-empty auth/private schemas')
    await client.query('begin')
    await client.query("drop schema public cascade; drop schema if exists private cascade; drop schema if exists auth cascade; create schema public; create schema private; create schema auth;")
    await client.query(setup)
    await client.query(stoPreflight)
    await client.query(stoProposal)
    await client.query(brandProposal)
    await client.query('set local role authenticated')
    await client.query(assertions)
    await client.query('reset role')
    await client.query("set local role anon")
    await assert.rejects(client.query("select * from public.brand01_products"), (error: { code?: string }) => error.code === '42501')
  } finally {
    await client.query('rollback').catch(() => undefined)
    await client.end()
  }
})
