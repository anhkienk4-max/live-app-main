#!/usr/bin/env bash
set -euo pipefail
container=ada-rc19-attendance-review-pg17
psql=(docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres)

cat tests/fixtures/rc19_attendance_photo_review_base.sql | "${psql[@]}"
cat supabase/proposals/rc19-attendance-photo-review/20261029140000_rc19_p2_04_attendance_photo_review.sql | "${psql[@]}"
# Replay is safe and verifies the proposal's idempotent DDL path.
cat supabase/proposals/rc19-attendance-photo-review/20261029140000_rc19_p2_04_attendance_photo_review.sql | "${psql[@]}"
cat tests/rc19-attendance-photo-review.postgres.sql | "${psql[@]}"

# A rollback transaction restores the schema and an explicit compensating review write.
"${psql[@]}" <<'SQL'
begin;
select set_config('rc19.test_actor','leader-1',false);
select public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0007',0,1,'approved','Rollback transaction fixture','cccccccc-cccc-4ccc-8ccc-cccccccc0007');
rollback;
do $$ begin
  if exists(select 1 from public.self_attendance_photo_review_events where attendance_event_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0007') then
    raise exception 'review rollback did not restore prior state';
  end if;
end $$;
SQL

run_decision() {
  local actor="$1" key="$2" output="$3"
  docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "select set_config('rc19.test_actor','${actor}',false); select pg_sleep(0.15); select public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0006',0,1,'approved','Concurrent reviewer verified','${key}');" >"$output" 2>&1
}
set +e
run_decision admin-1 cccccccc-cccc-4ccc-8ccc-cccccccc0012 /tmp/rc19-review-a.log & a=$!
run_decision leader-1 cccccccc-cccc-4ccc-8ccc-cccccccc0013 /tmp/rc19-review-b.log & b=$!
wait "$a"; a_status=$?
wait "$b"; b_status=$?
set -e
if [[ $a_status -eq $b_status ]]; then
  cat /tmp/rc19-review-a.log /tmp/rc19-review-b.log
  echo 'Expected exactly one concurrent review to win' >&2
  exit 1
fi
if ! grep -q 'ATTENDANCE_REVIEW_VERSION_CONFLICT' /tmp/rc19-review-a.log /tmp/rc19-review-b.log; then
  cat /tmp/rc19-review-a.log /tmp/rc19-review-b.log
  echo 'Concurrent loser did not receive ATTENDANCE_REVIEW_VERSION_CONFLICT' >&2
  exit 1
fi

# The migration's rollback can be rehearsed transactionally without retaining synthetic data.
"${psql[@]}" <<'SQL'
begin;
drop function public.review_self_attendance_photo(uuid,integer,integer,text,text,uuid);
drop function public.commit_self_attendance_photo_correction(uuid,integer,uuid,uuid,text,text,text,integer,text,jsonb,text);
drop function public.get_self_attendance_photo_correction_context(uuid);
drop table public.self_attendance_photo_evidence_revisions;
drop table public.self_attendance_photo_review_events;
rollback;
do $$ begin
  if to_regclass('public.self_attendance_photo_review_events') is null or
     to_regclass('public.self_attendance_photo_evidence_revisions') is null or
     to_regprocedure('public.review_self_attendance_photo(uuid,integer,integer,text,text,uuid)') is null or
     to_regprocedure('public.commit_self_attendance_photo_correction(uuid,integer,uuid,uuid,text,text,text,integer,text,jsonb,text)') is null or
     to_regprocedure('public.get_self_attendance_photo_correction_context(uuid)') is null then
    raise exception 'migration rollback rehearsal did not restore objects';
  end if;
end $$;
select 'PG17 ATTENDANCE PHOTO REVIEW PASS';
SQL
