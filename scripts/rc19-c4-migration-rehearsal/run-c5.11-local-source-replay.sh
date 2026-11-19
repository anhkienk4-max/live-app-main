#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
db_container='supabase_db_rc19-supabase-recovery'
expected_marker='CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY'
log_file="$repo_root/scripts/rc19-c4-migration-rehearsal/evidence/c5.11-local-pg1711-source-replay.log"

test "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$db_container")" = 'rc19-supabase-recovery'
test "$(docker port "$db_container" 5432/tcp)" = '127.0.0.1:54322'
identity="$(docker exec "$db_container" psql -X -U postgres -d postgres -Atqc "select current_database() || '|' || coalesce(shobj_description(oid,'pg_database'),'') || '|' || current_setting('server_version_num') from pg_database where datname=current_database()")"
IFS='|' read -r db marker version_num <<< "$identity"
test "$db" = 'postgres' && test "$marker" = "$expected_marker"
(( version_num >= 170000 && version_num < 180000 ))
test "$(docker exec "$db_container" psql -X -U postgres -d postgres -Atqc "select count(*) from pg_tables where schemaname='public'")" = '0'
test "$(docker exec "$db_container" psql -X -U postgres -d postgres -Atqc 'select count(*) from auth.users')" = '0'
test "$(docker exec "$db_container" psql -X -U postgres -d postgres -Atqc "select to_regclass('supabase_migrations.schema_migrations') is null")" = 't'

mkdir -p "$(dirname "$log_file")"
exec > >(tee "$log_file") 2>&1
printf 'database=%s marker=%s postgres=%s\n' "$db" "$marker" "$(docker exec "$db_container" psql -X -U postgres -d postgres -Atqc 'show server_version')"

mapfile -t migrations < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)
printf 'source_migration_count=%s\n' "${#migrations[@]}"
for migration in "${migrations[@]}"; do
  printf 'APPLY %s\n' "$migration"
  docker exec -i "$db_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -f - < "$repo_root/supabase/migrations/$migration"
done

printf 'source_replay=PASS migrations=%s\n' "${#migrations[@]}"
docker exec "$db_container" psql -X -U postgres -d postgres -c \
  "select current_setting('server_version') as server_version, count(*) as public_tables from pg_tables where schemaname='public';"
