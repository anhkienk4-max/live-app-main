#!/usr/bin/env bash
set -Eeuo pipefail

expected_sha='240a0d51b49863167be252d94545ea7c5ab2ac9a'
expected_migration_sha='1b16c0add91917c8188195d913e589d7618d8f27233f350dc55819c2b66be9dc'
database='rc19_c4_synthetic_storage_conflict'
port='55432'
cluster="$HOME/.codex/pg17-rc19-c4-rehearsal"
socket="$cluster/socket"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
migration="$repo/supabase/migrations/20261103195519_rc19_c2_resource_public_and_app_edit.sql"
evidence_dir="$repo/evidence"

[[ "${RC19_C4_SOURCE_SHA:-}" == "$expected_sha" ]] || { echo 'REFUSED: Windows wrapper did not verify expected source SHA'; exit 20; }
[[ -f "$migration" ]] || { echo 'REFUSED: migration missing'; exit 21; }
[[ -S "$socket/.s.PGSQL.$port" ]] || { echo 'REFUSED: isolated PostgreSQL socket missing'; exit 22; }
pg_isready -h 127.0.0.1 -p "$port" >/dev/null || { echo 'REFUSED: isolated loopback PostgreSQL 17 is not accepting connections'; exit 23; }

psql_socket=(psql -X -v ON_ERROR_STOP=1 -h "$socket" -p "$port")
server_major="$("${psql_socket[@]}" -d postgres -Atqc 'show server_version_num')"
[[ "$server_major" -ge 170000 && "$server_major" -lt 180000 ]] || { echo 'REFUSED: PostgreSQL 17 required'; exit 24; }

exists="$("${psql_socket[@]}" -d postgres -Atqc "select count(*) from pg_database where datname = '$database'")"
if [[ "$exists" == '0' ]]; then
  createdb -h "$socket" -p "$port" "$database"
  "${psql_socket[@]}" -d postgres -c "comment on database $database is 'CODEX_DISPOSABLE_RC19_C4_REHEARSAL_ONLY'" >/dev/null
  "${psql_socket[@]}" -d "$database" <<'SQL'
create table public.business_users (id text primary key);
create table public.storage_resources (id text primary key);
SQL
fi

marker="$("${psql_socket[@]}" -d postgres -Atqc "select shobj_description(oid, 'pg_database') from pg_database where datname = '$database'")"
[[ "$marker" == 'CODEX_DISPOSABLE_RC19_C4_REHEARSAL_ONLY' ]] || { echo 'REFUSED: database marker mismatch'; exit 25; }

fixture_tables="$("${psql_socket[@]}" -d "$database" -Atqc "select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname = 'public'")"
[[ "$fixture_tables" == 'business_users,storage_resources' ]] || { echo 'REFUSED: disposable database contains unexpected objects'; exit 26; }

actual_migration_sha="$(sha256sum "$migration" | awk '{print $1}')"
[[ "$actual_migration_sha" == "$expected_migration_sha" ]] || { echo 'REFUSED: migration checksum mismatch'; exit 27; }

mkdir -p "$evidence_dir"
run_id="$(date -u +%Y%m%dT%H%M%SZ)"
log="$evidence_dir/pg17-c2-storage-collision-$run_id.log"
{
  echo "SOURCE_SHA=$RC19_C4_SOURCE_SHA"
  echo "POSTGRESQL_VERSION=$("${psql_socket[@]}" -d "$database" -Atqc 'select version()')"
  echo "DATABASE=$database"
  echo "DATABASE_MARKER=$marker"
  echo "MIGRATION_SHA256=$actual_migration_sha"
  echo "MIGRATION=20261103195519_rc19_c2_resource_public_and_app_edit.sql"
  echo "SYNTHETIC_PUBLIC_TABLES_BEFORE=$fixture_tables"
} >"$log"

set +e
"${psql_socket[@]}" -d "$database" -f "$migration" >>"$log" 2>&1
migration_rc=$?
set -e
echo "MIGRATION_EXIT_CODE=$migration_rc" >>"$log"

if [[ "$migration_rc" -ne 3 ]] || ! grep -Fq 'ERROR:  relation "storage_resources" already exists' "$log"; then
  cat "$log"
  echo 'FAIL: expected duplicate storage_resources rejection did not occur'
  exit 28
fi

after_tables="$("${psql_socket[@]}" -d "$database" -Atqc "select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname = 'public'")"
[[ "$after_tables" == "$fixture_tables" ]] || { cat "$log"; echo 'FAIL: migration left partial fixture objects'; exit 29; }

echo 'REHEARSAL_RESULT=BLOCKED_AT_C2_DUPLICATE_OBJECT (expected fail closed)'
echo 'NO_PARTIAL_DDL=PASS'
echo "EVIDENCE=$log"
echo "MIGRATION_STATEMENT=CREATE TABLE public.storage_resources"
