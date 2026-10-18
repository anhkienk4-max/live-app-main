#!/usr/bin/env bash
set -Eeuo pipefail

fail() { printf 'M2_STANDALONE_FAIL: %s\n' "$1" >&2; exit 1; }
log() { printf '%s\n' "$1"; }

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
migration='supabase/migrations/20261015154159_rc16k_member_report_read_rls.sql'
fixture='tests/release/p0-migration2-standalone-fixture.sql'
expected_sha='698DB467BB1BCD1B549DCE94CB51704BB4771C814CF8AB6E23D3439564622BA7'
actual_sha="$(sha256sum "$migration" | cut -d' ' -f1 | tr '[:lower:]' '[:upper:]')"
[[ "$actual_sha" == "$expected_sha" ]] || fail "Migration 2 SHA mismatch: $actual_sha"
[[ -f "$fixture" ]] || fail 'synthetic baseline fixture missing'

admin_psql=(psql -X --no-password --set=ON_ERROR_STOP=1 --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$PGDATABASE")
"${admin_psql[@]}" --tuples-only --no-align --command='SELECT json_build_object(
  '\''database'\'', current_database(), '\''port'\'', inet_server_port(), '\''user'\'', current_user,
  '\''version'\'', current_setting('\''server_version'\''), '\''version_num'\'', current_setting('\''server_version_num'\''),
  '\''data_directory'\'', current_setting('\''data_directory'\''), '\''postmaster_start'\'', pg_postmaster_start_time())::text;' > target.json
node -e "const x=JSON.parse(require('fs').readFileSync('target.json','utf8')); if(x.database!=='postgres'||+x.port!==5432||x.user!=='postgres'||!String(x.version_num).startsWith('17')||!String(x.data_directory).startsWith('/var/lib/postgresql/')||!Number.isFinite(Date.parse(x.postmaster_start))) process.exit(1); console.log('Synthetic PG17 service identity: PASS '+JSON.stringify(x))"
synthetic_db="p0_m2_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}"
[[ "$synthetic_db" =~ ^p0_m2_[0-9]+_[0-9]+$ ]] || fail 'invalid synthetic database name'
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --no-password "$synthetic_db"
psql_cmd=(psql -X --no-password --set=ON_ERROR_STOP=1 --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$synthetic_db")
"${psql_cmd[@]}" --tuples-only --no-align --command='SELECT json_build_object(
  '\''database'\'', current_database(), '\''port'\'', inet_server_port(), '\''user'\'', current_user,
  '\''version'\'', current_setting('\''server_version'\''), '\''version_num'\'', current_setting('\''server_version_num'\''),
  '\''data_directory'\'', current_setting('\''data_directory'\''), '\''postmaster_start'\'', pg_postmaster_start_time())::text;' > target-synthetic.json
EXPECTED_DB="$synthetic_db" node -e "const x=JSON.parse(require('fs').readFileSync('target-synthetic.json','utf8')); if(x.database!==process.env.EXPECTED_DB||+x.port!==5432||x.user!=='postgres'||!String(x.version_num).startsWith('17')||!String(x.data_directory).startsWith('/var/lib/postgresql/')||!Number.isFinite(Date.parse(x.postmaster_start))) process.exit(1); console.log('Dedicated synthetic DB identity: PASS '+JSON.stringify(x))"
run_marker="p0_m2_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}"
[[ "$run_marker" =~ ^p0_m2_[0-9]+_[0-9]+$ ]] || fail 'invalid synthetic run marker'
"${psql_cmd[@]}" --command="CREATE TABLE public.${run_marker}(value text PRIMARY KEY); INSERT INTO public.${run_marker} VALUES ('$run_marker');"
marker="$("${psql_cmd[@]}" --tuples-only --no-align --command="SELECT value FROM public.${run_marker};")"
[[ "$marker" == "$run_marker" ]] || fail 'synthetic target marker mismatch'
log "Synthetic target marker: PASS $run_marker"

"${psql_cmd[@]}" --file="$fixture"
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT private.can_read_shift('s_open') AND private.can_read_shift('s_pending');" > shift-discovery-before.txt
[[ "$(tr -d '[:space:]' < shift-discovery-before.txt)" == 't' ]] || fail 'baseline shift-discovery fixture does not model open/pending semantics'
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT md5(pg_get_functiondef('private.can_read_shift(text)'::regprocedure));" > can-read-shift.before
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT md5(pg_get_functiondef('public.get_report_list_page(integer,integer,jsonb,boolean)'::regprocedure));" > report-list.before
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT proowner::text || '|' || coalesce(proacl::text,'NULL') || '|' || prosecdef || '|' || coalesce(proconfig::text,'NULL') FROM pg_proc WHERE oid='public.get_report_revisions(text)'::regprocedure;" > revisions-meta.before

# Inject a DDL failure into the unmodified migration to prove its own BEGIN/COMMIT
# rolls back earlier function and policy changes. The fixture trigger is synthetic.
"${psql_cmd[@]}" <<'SQL'
CREATE FUNCTION public.p0_m2_fail_create_policy() RETURNS event_trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_M2_ROLLBACK_PROBE'; END $$;
CREATE EVENT TRIGGER p0_m2_fail_create_policy ON ddl_command_start
  WHEN TAG IN ('CREATE POLICY') EXECUTE FUNCTION public.p0_m2_fail_create_policy();
SQL
set +e
"${psql_cmd[@]}" --file="$migration" > migration-injected.stdout 2> migration-injected.stderr
injected_exit=$?
set -e
[[ "$injected_exit" -ne 0 ]] || fail 'injected Migration 2 failure unexpectedly returned 0'
grep -q 'SYNTHETIC_M2_ROLLBACK_PROBE' migration-injected.stderr || fail 'failure injection did not reach migration policy DDL'
"${psql_cmd[@]}" --command='DROP EVENT TRIGGER p0_m2_fail_create_policy; DROP FUNCTION public.p0_m2_fail_create_policy();'
"${psql_cmd[@]}" --command="DO \$\$ BEGIN
  IF to_regprocedure('private.can_read_report(text,text)') IS NOT NULL THEN RAISE EXCEPTION 'rollback left can_read_report behind'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reports' AND policyname='reports_active_select') THEN RAISE EXCEPTION 'rollback lost baseline policy'; END IF;
END \$\$;"
log "Migration 2 injected SQL error: nonzero_exit=$injected_exit; function/policy rollback=PASS"

# Apply the exact, hash-locked Migration 2 with no Migration 1 execution.
"${psql_cmd[@]}" --file="$migration"
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT md5(pg_get_functiondef('private.can_read_shift(text)'::regprocedure));" > can-read-shift.after
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT md5(pg_get_functiondef('public.get_report_list_page(integer,integer,jsonb,boolean)'::regprocedure));" > report-list.after
"${psql_cmd[@]}" --tuples-only --no-align --command="SELECT proowner::text || '|' || coalesce(proacl::text,'NULL') || '|' || prosecdef || '|' || coalesce(proconfig::text,'NULL') FROM pg_proc WHERE oid='public.get_report_revisions(text)'::regprocedure;" > revisions-meta.after
cmp -s can-read-shift.before can-read-shift.after || fail 'Migration 2 changed baseline can_read_shift'
cmp -s report-list.before report-list.after || fail 'Migration 2 changed existing Reports list/search RPC'
cmp -s revisions-meta.before revisions-meta.after || fail 'Migration 2 changed report revisions RPC owner/ACL/security metadata'

"${psql_cmd[@]}" --file='tests/release/p0-migration2-standalone-assertions.sql'
log 'M2_STANDALONE_RESULT=PASS'
