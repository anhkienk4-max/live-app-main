#!/usr/bin/env bash
set -Eeuo pipefail

fail() { printf 'ONE_SHOT_DB_FAIL: %s\n' "$1" >&2; exit 1; }
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

m1='supabase/migrations/20261014190429_rc16k_reports_forward_reconciliation.sql'
m2='supabase/migrations/20261015154159_rc16k_member_report_read_rls.sql'
snapshot='supabase/migrations/20261019000000_live_dashboard_snapshot_binding.sql'
check_hash() {
  local file="$1" expected="$2" actual
  actual="$(sha256sum "$file" | cut -d' ' -f1 | tr '[:lower:]' '[:upper:]')"
  [[ "$actual" == "$expected" ]] || fail "SHA mismatch for $file: $actual"
}
check_hash "$m1" '40572A4684F7315C26E25DEF3DB1C971EEF1F4BF49DE8851DF5DBE393E040CBC'
check_hash "$m2" '698DB467BB1BCD1B549DCE94CB51704BB4771C814CF8AB6E23D3439564622BA7'
check_hash "$snapshot" '8EB4B4BED7371F9E0E1A559FFA5A63E14A661A15532716E1A2F982705238905B'

admin=(psql -X --no-password --set=ON_ERROR_STOP=1 --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$PGDATABASE")
identity="$("${admin[@]}" --tuples-only --no-align --command="SELECT current_database() || '|' || inet_server_port() || '|' || current_user || '|' || current_setting('server_version') || '|' || current_setting('data_directory');")"
[[ "$identity" == postgres\|5432\|postgres\|17.6*\|/var/lib/postgresql/* ]] || fail "unexpected PostgreSQL target identity: $identity"

database="one_shot_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}"
[[ "$database" =~ ^one_shot_[0-9]+_[0-9]+$ ]] || fail 'invalid synthetic database name'
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --no-password "$database"
cleanup() { dropdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --no-password "$database" >/dev/null 2>&1 || true; }
trap cleanup EXIT
psql_cmd=(psql -X --no-password --set=ON_ERROR_STOP=1 --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$database")

export PGOPTIONS='-c lock_timeout=5s -c statement_timeout=30s'
timeouts="$("${psql_cmd[@]}" --tuples-only --no-align --command="SELECT current_setting('lock_timeout') || '|' || current_setting('statement_timeout');")"
[[ "$timeouts" == '5s|30s' ]] || fail "timeouts ineffective: $timeouts"
"${psql_cmd[@]}" --file tests/release/p0-migration2-standalone-fixture.sql
"${psql_cmd[@]}" --file tests/release/one-shot-release-baseline-extension.sql

"${psql_cmd[@]}" <<SQL
BEGIN;
\i $m1
COMMIT;
SQL
"${psql_cmd[@]}" --command="DO \$\$ BEGIN
  IF pg_get_functiondef('public.get_report_list_page(integer,integer,jsonb,boolean)'::regprocedure) NOT LIKE '%''summary''%' THEN RAISE EXCEPTION 'M1_SUMMARY_MISSING'; END IF;
END \$\$;"
"${psql_cmd[@]}" --command="INSERT INTO supabase_migrations.schema_migrations VALUES ('20261014190429','rc16k_reports_forward_reconciliation');"

# Prove the exact M2 transaction rolls back after M1 has committed. This models
# the release stop condition before retrying the independently-proven M2.
"${psql_cmd[@]}" <<'SQL'
CREATE FUNCTION public.one_shot_fail_policy() RETURNS event_trigger LANGUAGE plpgsql
AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_M2_FAILURE'; END $$;
CREATE EVENT TRIGGER one_shot_fail_policy ON ddl_command_start
  WHEN TAG IN ('CREATE POLICY') EXECUTE FUNCTION public.one_shot_fail_policy();
SQL
set +e
"${psql_cmd[@]}" --file "$m2" > m2-failure.stdout 2> m2-failure.stderr
m2_failure_exit=$?
set -e
[[ "$m2_failure_exit" -ne 0 ]] || fail 'M2 failure injection unexpectedly succeeded'
grep -q 'SYNTHETIC_M2_FAILURE' m2-failure.stderr || fail 'M2 failure did not reach the injected policy error'
"${psql_cmd[@]}" --command='DROP EVENT TRIGGER one_shot_fail_policy; DROP FUNCTION public.one_shot_fail_policy();'
"${psql_cmd[@]}" --command="DO \$\$ BEGIN
  IF to_regprocedure('private.can_read_report(text,text)') IS NOT NULL THEN RAISE EXCEPTION 'M2_ROLLBACK_LEFT_HELPER'; END IF;
  IF pg_get_functiondef('public.get_report_list_page(integer,integer,jsonb,boolean)'::regprocedure) NOT LIKE '%''summary''%' THEN RAISE EXCEPTION 'M1_LOST_AFTER_M2_FAILURE'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 69 THEN RAISE EXCEPTION 'LEDGER_CHANGED_AFTER_M2_FAILURE'; END IF;
END \$\$;"

"${psql_cmd[@]}" --file "$m2"
"${psql_cmd[@]}" --command="INSERT INTO supabase_migrations.schema_migrations VALUES ('20261015154159','rc16k_member_report_read_rls');"
"${psql_cmd[@]}" <<SQL
BEGIN;
\i $snapshot
COMMIT;
SQL
"${psql_cmd[@]}" --file tests/release/one-shot-release-assertions.sql
"${psql_cmd[@]}" --command="INSERT INTO supabase_migrations.schema_migrations VALUES ('20261019000000','live_dashboard_snapshot_binding');"
"${psql_cmd[@]}" --command="DO \$\$ BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 71 THEN RAISE EXCEPTION 'FINAL_LEDGER_COUNT_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261014233900') THEN RAISE EXCEPTION 'DUPLICATE_SUMMARY_MIGRATION_APPLIED'; END IF;
END \$\$;"

printf 'ONE_SHOT_DB_RESULT=PASS database=%s server=%s timeouts=%s m2_failure_exit=%s ledger=68_to_71\n' "$database" "$identity" "$timeouts" "$m2_failure_exit"
