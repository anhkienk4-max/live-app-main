#!/usr/bin/env bash
set -euo pipefail

database=rc19_rbac_enforcement_disposable
identity=$(psql -X -h localhost -U rc19_ci -d "$database" -Atqc "
  select current_database() || '|' || session_user || '|' || left(current_setting('server_version_num'),2)
    || '|' || coalesce(shobj_description(d.oid,'pg_database'),'')
  from pg_database d where d.datname=current_database()")
test "$identity" = "$database|rc19_ci|17|RC19_RBAC_ENFORCEMENT_DISPOSABLE_TEST_DATABASE"

current_version=$(psql -X -h localhost -U rc19_ci -d "$database" -Atqc "
  select coalesce(max(version),0) from private.rbac02_account_permission_versions
  where target_business_user_id='leader-a' and permission='audit.view_team'")
test "$current_version" = 5

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
run_update() {
  psql -X -h localhost -U rc19_ci -d "$database" -v ON_ERROR_STOP=1 -c "
    begin;
    set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
    set local role authenticated;
    select pg_sleep(0.2);
    select public.rbac02_set_account_override(
      'leader-a','audit.view_team','$1','concurrent version test',null,5);
    commit;" >"$2" 2>&1
}

set +e
run_update allow "$tmpdir/first.log" & first=$!
run_update deny "$tmpdir/second.log" & second=$!
wait "$first"; first_status=$?
wait "$second"; second_status=$?
set -e

if [ "$first_status" -eq 0 ] && [ "$second_status" -ne 0 ]; then
  loser="$tmpdir/second.log"
elif [ "$second_status" -eq 0 ] && [ "$first_status" -ne 0 ]; then
  loser="$tmpdir/first.log"
else
  cat "$tmpdir/first.log" "$tmpdir/second.log"
  echo 'RBAC account version lock did not yield exactly one winner' >&2
  exit 1
fi
grep -q 'RBAC02_VERSION_CONFLICT' "$loser"
final_version=$(psql -X -h localhost -U rc19_ci -d "$database" -Atqc "
  select max(version) from private.rbac02_account_permission_versions
  where target_business_user_id='leader-a' and permission='audit.view_team'")
test "$final_version" = 6
echo 'RC19_RBAC_ACCOUNT_OVERRIDE_CONCURRENCY_PG17: PASS'
