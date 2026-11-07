#!/usr/bin/env bash
set -Eeuo pipefail

expected_sha='240a0d51b49863167be252d94545ea7c5ab2ac9a'
[[ "${RC19_C4_SOURCE_SHA:-}" == "$expected_sha" ]] || { echo 'REFUSED_SOURCE_SHA_MISMATCH' >&2; exit 40; }
[[ "${RC19_C4_REHEARSAL_CONFIRM:-}" == 'APPLY_TO_DISPOSABLE_ONLY' ]] || { echo 'REFUSED_MISSING_DISPOSABLE_CONFIRMATION' >&2; exit 41; }
[[ "${PGHOST:-}" == '127.0.0.1' && "${PGPORT:-}" == '55432' ]] || { echo 'REFUSED_NONLOCAL_OR_UNEXPECTED_POSTGRES_ENDPOINT' >&2; exit 42; }
[[ "${PGDATABASE:-}" == rc19_c4_rehearsal_* ]] || { echo 'REFUSED_NON_REHEARSAL_DATABASE_NAME' >&2; exit 43; }

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
manifest="$repo_root/scripts/rc19-c4-migration-rehearsal/evidence/migration-manifest.json"
[[ -f "$manifest" ]] || { echo 'REFUSED_MANIFEST_MISSING' >&2; exit 44; }
python3 - "$manifest" "$repo_root/supabase/migrations" <<'PY'
import hashlib, json, pathlib, sys
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
root = pathlib.Path(sys.argv[2])
items = manifest.get('migrations', [])
if manifest.get('candidate_sha') != '240a0d51b49863167be252d94545ea7c5ab2ac9a' or len(items) != 17:
    raise SystemExit('REFUSED_MANIFEST_SOURCE_OR_COUNT_MISMATCH')
for item in items:
    path = root / item['file']
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
        raise SystemExit('REFUSED_MIGRATION_HASH_MISMATCH:' + item['file'])
PY

identity="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select current_database() || '|' || coalesce(shobj_description(d.oid, 'pg_database'),'') || '|' || current_setting('server_version_num') from pg_database d where d.datname=current_database()")"
IFS='|' read -r db marker version_num <<< "$identity"
[[ "$db" == "$PGDATABASE" && "$marker" == 'CODEX_DISPOSABLE_RC19_C4_REHEARSAL_ONLY' ]] || { echo 'REFUSED_DATABASE_IDENTITY_MARKER_MISMATCH' >&2; exit 45; }
(( version_num >= 170000 && version_num < 180000 )) || { echo 'REFUSED_NOT_POSTGRESQL_17' >&2; exit 46; }

ledger_count="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select count(*) from supabase_migrations.schema_migrations")"
[[ "$ledger_count" == '89' ]] || { echo "REFUSED_NOT_PRODUCTION_LEDGER_BASELINE:$ledger_count/89" >&2; exit 47; }
ledger_latest="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select version || '|' || name from supabase_migrations.schema_migrations order by version desc limit 1")"
[[ "$ledger_latest" == '20261101073742|20261101073646_rc19_brand01_catalog' ]] || { echo "REFUSED_UNEXPECTED_PRODUCTION_LEDGER_HEAD:$ledger_latest" >&2; exit 48; }
production_only_count="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select count(*) from supabase_migrations.schema_migrations where (version,name) in (('20261101073720','20261101073643_rc19_sto02_resource_registry'),('20261101073742','20261101073646_rc19_brand01_catalog'))")"
[[ "$production_only_count" == '2' ]] || { echo "REFUSED_PRODUCTION_ONLY_LEDGER_MISMATCH:$production_only_count/2" >&2; exit 49; }
required="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select count(*) from (values ('public.business_users'),('public.shifts'),('public.storage_resources'),('public.operational_storage_routes'),('public.reports')) as expected(name) where to_regclass(name) is not null")"
[[ "$required" == '5' ]] || { echo "REFUSED_BASELINE_INCOMPLETE:$required/5" >&2; exit 50; }
[[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "select to_regclass('public.operational_storage_domain_folders') is null")" == 't' ]] || { echo 'REFUSED_CANDIDATE_DOMAIN_SCHEMA_ALREADY_PRESENT' >&2; exit 51; }
[[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "select count(*) from pg_class where oid in ('public.business_users'::regclass,'public.shifts'::regclass,'public.storage_resources'::regclass,'public.operational_storage_routes'::regclass,'public.reports'::regclass) and relrowsecurity")" == '5' ]] || { echo 'REFUSED_BASELINE_RLS_MISMATCH' >&2; exit 52; }
visibility_constraint="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.storage_resources'::regclass and conname='storage_resources_visibility_check'")"
[[ "$visibility_constraint" == *'admin_only'* && "$visibility_constraint" == *'owner_only'* && "$visibility_constraint" == *'granted_users'* && "$visibility_constraint" != *'public'* ]] || { echo 'REFUSED_STORAGE_VISIBILITY_SHAPE_MISMATCH' >&2; exit 53; }
[[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "select to_regclass('public.shifts_active_slot_uidx') is not null")" == 't' ]] || { echo 'REFUSED_OLD_SHIFT_INDEX_MISSING' >&2; exit 54; }
[[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "select to_regclass('public.shifts_active_identity_uidx') is null")" == 't' ]] || { echo 'REFUSED_CANDIDATE_SHIFT_INDEX_ALREADY_PRESENT' >&2; exit 55; }
existing="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select count(*) from supabase_migrations.schema_migrations where version between '20261102110000' and '20261105120000'")"
[[ "$existing" == '0' ]] || { echo "REFUSED_CANDIDATE_MIGRATIONS_ALREADY_PRESENT:$existing" >&2; exit 56; }

echo "DATABASE=$db"
echo "POSTGRESQL_VERSION_NUM=$version_num"
echo "SOURCE_SHA=$expected_sha"
echo 'MIGRATION_COUNT=17'
for entry in $(python3 - "$manifest" <<'PY'
import json, pathlib, sys
for item in json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8-sig'))['migrations']:
    print(item['file'])
PY
); do
  echo "APPLYING=$entry"
  psql -X -v ON_ERROR_STOP=1 -f "$repo_root/supabase/migrations/$entry"
done
echo 'SEQUENCE_RESULT=PASS'
