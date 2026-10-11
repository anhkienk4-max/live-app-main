import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

// SQL 3-Valued Logic Evaluator
function sqlAnd(a: boolean | null, b: boolean | null): boolean | null {
  if (a === false || b === false) return false;
  if (a === true && b === true) return true;
  return null;
}

function sqlOr(a: boolean | null, b: boolean | null): boolean | null {
  if (a === true || b === true) return true;
  if (a === false && b === false) return false;
  return null;
}

function sqlIn(val: string | null, list: string[]): boolean | null {
  if (val === null) return null;
  return list.includes(val);
}

function sqlIsNull(val: string | null): boolean {
  return val === null;
}

function sqlIsNotNull(val: string | null): boolean {
  return val !== null;
}

function sqlBtrimNotEqualEmpty(val: string | null): boolean | null {
  if (val === null) return null;
  return val.trim() !== '';
}

function evaluatePostgresCheck(provider: string | null, external_file_id: string | null) {
  // Clause 1: (provider is null and external_file_id is null)
  const c1 = sqlAnd(sqlIsNull(provider), sqlIsNull(external_file_id));

  // Clause 2:
  // (provider is not null
  //  and provider in ('google_drive', 'onedrive')
  //  and external_file_id is not null
  //  and btrim(external_file_id) <> '')
  let c2: boolean | null = sqlIsNotNull(provider);
  c2 = sqlAnd(c2, sqlIn(provider, ['google_drive', 'onedrive']));
  c2 = sqlAnd(c2, sqlIsNotNull(external_file_id));
  c2 = sqlAnd(c2, sqlBtrimNotEqualEmpty(external_file_id));

  const checkExpr = sqlOr(c1, c2);
  // In PostgreSQL, CHECK constraint passes if expr is NOT FALSE (i.e. TRUE or UNKNOWN/NULL)
  const passes = checkExpr !== false;
  return { checkExpr, passes };
}

test('H.5.1 Truth Table: All 10 provider and external_file_id combinations', () => {
  const matrix = [
    { provider: null, external_file_id: null, shouldPass: true, desc: 'Both NULL (legacy Supabase storage file)' },
    { provider: 'google_drive', external_file_id: 'drive-file-123', shouldPass: true, desc: 'Valid google_drive + valid file id' },
    { provider: 'onedrive', external_file_id: 'od-file-456', shouldPass: true, desc: 'Valid onedrive + valid file id' },
    { provider: 'google_drive', external_file_id: null, shouldPass: false, desc: 'P0 Bug Reproduction: Valid provider + NULL file id must be REJECTED' },
    { provider: 'onedrive', external_file_id: null, shouldPass: false, desc: 'P0 Bug Reproduction: onedrive + NULL file id must be REJECTED' },
    { provider: 'google_drive', external_file_id: '', shouldPass: false, desc: 'Valid provider + empty string file id must be REJECTED' },
    { provider: 'google_drive', external_file_id: '   ', shouldPass: false, desc: 'Valid provider + whitespace file id must be REJECTED' },
    { provider: null, external_file_id: 'file-123', shouldPass: false, desc: 'NULL provider + non-NULL file id must be REJECTED' },
    { provider: 'dropbox', external_file_id: 'file-123', shouldPass: false, desc: 'Unsupported provider + file id must be REJECTED' },
    { provider: 'dropbox', external_file_id: null, shouldPass: false, desc: 'Unsupported provider + NULL file id must be REJECTED' },
  ];

  for (const tc of matrix) {
    const res = evaluatePostgresCheck(tc.provider, tc.external_file_id);
    assert.equal(
      res.passes,
      tc.shouldPass,
      `Failed on ${tc.desc}: expected passes=${tc.shouldPass}, got passes=${res.passes} (expr=${res.checkExpr})`
    );
    // Extra assertion: invalid states must evaluate strictly to FALSE, never UNKNOWN/null
    if (!tc.shouldPass) {
      assert.equal(
        res.checkExpr,
        false,
        `Security flaw: ${tc.desc} evaluated to ${res.checkExpr} instead of strict FALSE`
      );
    }
  }
});

test('H.5.1 Migration AST/Regex: Verify hardened constraint definitions in 20261011221500', () => {
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261011221500_rc15_provider_metadata_forward_compat.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Verify report_images constraint
  assert.match(
    sql,
    /report_images_file_provider_pair\s+check\s*\(\s*\(provider is null and external_file_id is null\)\s*or\s*\(\s*provider is not null\s*and provider in \('google_drive',\s*'onedrive'\)\s*and external_file_id is not null\s*and btrim\(external_file_id\) <> ''\s*\)/i,
    'report_images constraint must contain explicit provider is not null and external_file_id is not null guards'
  );

  // Verify live_report_images constraint
  assert.match(
    sql,
    /live_report_images_file_provider_pair\s+check\s*\(\s*\(provider is null and external_file_id is null\)\s*or\s*\(\s*provider is not null\s*and provider in \('google_drive',\s*'onedrive'\)\s*and external_file_id is not null\s*and btrim\(external_file_id\) <> ''\s*\)/i,
    'live_report_images constraint must contain explicit provider is not null and external_file_id is not null guards'
  );

  // Verify NULL uploaded_by and submitted_by guards in authorize_report_image_delete
  assert.match(
    sql,
    /if actor_permission = 'member' and \(target_image\.uploaded_by is null or target_image\.uploaded_by <> actor_id\)/i,
    'authorize_report_image_delete must guard against NULL uploaded_by'
  );
  assert.match(
    sql,
    /if actor_permission = 'member' and \(target_report\.submitted_by is null or target_report\.submitted_by <> actor_id\)/i,
    'authorize_report_image_delete must guard against NULL submitted_by'
  );

  // Verify NULL uploaded_by and submitted_by guards in authorize_live_report_image_delete
  assert.match(
    sql,
    /if actor_permission = 'member' and \(target_image\.uploaded_by is null or target_image\.uploaded_by <> actor_id\)/i,
    'authorize_live_report_image_delete must guard against NULL uploaded_by'
  );
  assert.match(
    sql,
    /if actor_permission = 'member' and \(target_report\.submitted_by is null or target_report\.submitted_by <> actor_id\)/i,
    'authorize_live_report_image_delete must guard against NULL submitted_by'
  );

  // Verify Idempotency Winner Guard in upsert_live_report_image_with_provider
  assert.match(
    sql,
    /if created_image\.external_file_id is not null then return created_image; end if;/i,
    'upsert_live_report_image_with_provider must preserve winner of concurrent idempotent retry'
  );

  // Verify Metadata Validation in upload functions
  assert.match(
    sql,
    /raise exception using errcode = '22023',\s*message = 'REPORT_FILE_PROVIDER_METADATA_INVALID'/i,
    'Upload RPCs must reject invalid provider metadata with SQL errcode 22023'
  );
});
