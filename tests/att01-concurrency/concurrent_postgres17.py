#!/usr/bin/env python3
"""ATT-01: concurrent calls on fresh, isolated PostgreSQL 17 CI databases.
No Supabase project, Production credentials, real identities, or historical records.
Runs baseline RPC definitions first (expected race), then review-only SQL patch.
"""
import concurrent.futures
import json
import os
import pathlib
import subprocess
import threading
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests/fixtures/att01_rc17c_foundation.sql"
SETUP = ROOT / "tests/att01-concurrency/postgres17_setup.sql"
PATCH = ROOT / "docs/att01-concurrency/ATT01_LOCK_PATCH_REVIEW_ONLY.sql"
PG = dict(os.environ, PGHOST="127.0.0.1", PGPORT="5432", PGUSER="postgres", PGPASSWORD="")
PHASES = [("baseline", False), ("patched", True)]


def psql(db, sql=None, file=None, fail=False):
    cmd = ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", db]
    if file:
        cmd.extend(["-f", str(file)])
    else:
        cmd.extend(["-c", sql])
    result = subprocess.run(cmd, env=PG, capture_output=True, text=True, check=False)
    if result.returncode and not fail:
        raise AssertionError("PostgreSQL command failed: " + result.stderr[-600:])
    if fail and result.returncode == 0:
        raise AssertionError("Expected PostgreSQL transaction to fail and roll back")
    return result.stdout.strip(), result.returncode


def value(db, statement):
    result, _ = psql(db, statement)
    return result.splitlines()[-1]


def prepare(db, patched):
    psql("postgres", f'CREATE DATABASE "{db}"')
    content = SETUP.read_text()
    base, delays = content.split("-- Force a reproducible no-row SELECT FOR UPDATE race.", 1)
    core = ROOT / "tests/att01-concurrency/postgres17_setup.sql"
    # Core schema must exist before importing the original RC17C ledger/RPC DDL.
    psql(db, "BEGIN; " + base + " COMMIT;")
    psql(db, file=FIXTURE)
    psql(db, "-- Force a reproducible no-row SELECT FOR UPDATE race.\n" + delays)
    if patched:
        psql(db, file=PATCH)
        assert value(db, "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='uq_att01_source_fingerprint' AND indexdef LIKE '%UNIQUE%'") == "1"


def row(num=1, staff="worker-1"):
    return {
        "source_row_number": num, "raw_payload": {"synthetic": True},
        "parsed_date": "2026-10-10", "parsed_start_time": "09:00",
        "parsed_end_time": "10:00", "parsed_start_at": "2026-10-10T09:00:00+07:00",
        "parsed_end_at": "2026-10-10T10:00:00+07:00",
        "raw_staff_name": staff, "raw_role": "host",
        "matched_shift_id": "shift-1", "matched_staff_id": staff,
        "operational_role": "host", "coverage_kind": "planned",
        "evidence_kind": "actual_punch", "status": "matched",
    }


def stage(db, batch, fingerprint, rows=None):
    rows = rows or [row()]
    raw = json.dumps(rows, ensure_ascii=True).replace("'", "''")
    assert all("'" not in x for x in [db, batch, fingerprint])
    q = ("SELECT public.stage_attendance_import_batch("
         f"'{batch}', 'csv_upload', 'synthetic.csv', '{fingerprint}', "
         f"'Asia/Ho_Chi_Minh', NULL, '{{}}'::jsonb, 'admin-1', "
         f"{len(rows)}, {len(rows)}, 0, '{raw}'::jsonb)::text;")
    return json.loads(value(db, q))


def confirm(db, batch, fail=False):
    sql = f"SELECT public.confirm_attendance_import_batch('{batch}', 'admin-1', 1)::text;"
    if fail:
        psql(db, sql, fail=True)
        return None
    return json.loads(value(db, sql))


def parallel(left, right):
    start = threading.Barrier(2)
    def wrapped(func):
        start.wait(timeout=15)
        return func()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(wrapped, left)
        b = pool.submit(wrapped, right)
        return a.result(timeout=35), b.result(timeout=35)


def stage_race(phase, patched):
    db = "att01_" + phase + "_stage"
    prepare(db, patched)
    a, b = parallel(
        lambda: stage(db, "batch-a", "same-fingerprint"),
        lambda: stage(db, "batch-b", "same-fingerprint"))
    count = int(value(db, "SELECT count(*) FROM public.workforce_attendance_import_batches WHERE source_fingerprint='same-fingerprint'"))
    assert a["ok"] and b["ok"], (a, b)
    expected = 1 if patched else 2
    assert count == expected, f"{phase}: expected {expected} same-fingerprint batches, got {count}"
    print(f"{phase.upper()} stage race: same-fingerprint batches={count}, expected={expected}")


def cross_batch_confirm_race(phase, patched):
    db = "att01_" + phase + "_confirm"
    prepare(db, patched)
    assert stage(db, "ca", "fp-a")["ok"]
    assert stage(db, "cb", "fp-b")["ok"]
    a, b = parallel(lambda: confirm(db, "ca"), lambda: confirm(db, "cb"))
    count = int(value(db, "SELECT count(*) FROM public.workforce_actual_segments"))
    expected = 1 if patched else 2
    assert count == expected, f"{phase}: expected {expected} DRAFTs, got {count}"
    assert all(x["ok"] for x in [a, b])
    assert count == sum(x["created_count"] for x in [a, b])
    assert value(db, "SELECT count(*) FROM public.workforce_actual_segments WHERE review_status='draft' AND reviewed_by IS NULL") == str(count)
    print(f"{phase.upper()} cross-batch confirm race: DRAFTs={count}, expected={expected}")


def confirm_replay_and_rollback():
    db = "att01_patched_replay"
    prepare(db, True)
    stage(db, "single", "replay-fp")
    a, b = parallel(lambda: confirm(db, "single"), lambda: confirm(db, "single"))
    assert sum(1 for x in [a, b] if x["ok"] and x.get("created_count") == 1) == 1, (a, b)
    assert sum(1 for x in [a, b] if not x["ok"] and x.get("code") == "BATCH_ALREADY_CONFIRMED") == 1, (a, b)
    assert value(db, "SELECT count(*) FROM public.workforce_actual_segments") == "1"
    assert confirm(db, "single")["code"] == "BATCH_ALREADY_CONFIRMED"
    assert value(db, "SELECT count(*) FROM public.workforce_actual_segments") == "1"
    replay_stage = stage(db, "attempt-after-confirm", "replay-fp")
    assert replay_stage["ok"] is False and replay_stage["code"] == "BATCH_ALREADY_CONFIRMED", replay_stage
    assert value(db, "SELECT count(*) FROM public.workforce_attendance_import_batches WHERE source_fingerprint='replay-fp'") == "1"
    assert value(db, "SELECT count(*) FROM public.workforce_actual_segments WHERE review_status='draft' AND reviewed_by IS NULL") == "1"
    assert value(db, "SELECT count(*) FROM public.workforce_attendance_import_rows WHERE batch_id='single' AND status='drafted' AND resulting_segment_id IS NOT NULL") == "1"
    print("PATCHED replay after Confirm: historical confirmed batch and DRAFT provenance preserved")
    print("PATCHED confirm replay: exactly one DRAFT; duplicate confirmation rejected")

    db = "att01_patched_atomic"
    prepare(db, True)
    stage(db, "atomic", "atomic-fp", [row(1, "worker-1"), row(2, "worker-2")])
    psql(db, """DROP TRIGGER att01_race_actual ON public.workforce_actual_segments;
CREATE OR REPLACE FUNCTION att01_abort_second_insert() returns trigger
language plpgsql as $$
begin
  if NEW.staff_id = 'worker-2' then
    raise exception 'ATT01_TEST_FORCED_SECOND_ROW_FAILURE';
  end if;
  return NEW;
end;
$$;
CREATE TRIGGER att01_force_failure BEFORE INSERT ON public.workforce_actual_segments
FOR EACH ROW EXECUTE FUNCTION att01_abort_second_insert();""")
    confirm(db, "atomic", fail=True)
    assert value(db, "SELECT count(*) FROM public.workforce_actual_segments") == "0"
    assert value(db, "SELECT status FROM public.workforce_attendance_import_batches WHERE id='atomic'") == "staged"
    assert value(db, "SELECT count(*) FROM public.workforce_attendance_import_rows WHERE batch_id='atomic' AND status='matched'") == "2"
    print("PATCHED mid-batch failure: transaction rolled back; zero partial DRAFTs")


def reversed_multistaff_confirm():
    """Two batches with opposite worker ordering: a deadlock means FAIL."""
    db = "att01_patched_reverse"
    prepare(db, True)
    assert stage(db, "reverse-a", "reverse-fp-a", [row(1, "worker-1"), row(2, "worker-2")])["ok"]
    assert stage(db, "reverse-b", "reverse-fp-b", [row(1, "worker-2"), row(2, "worker-1")])["ok"]

    def run(batch):
        # One independent PostgreSQL backend per request; measure lock wait including RPC.
        sql = ("SET deadlock_timeout='200ms'; SET lock_timeout='10000ms'; "
               "SET statement_timeout='15000ms'; "
               f"SELECT public.confirm_attendance_import_batch('{batch}', 'admin-1', 1)::text;")
        cmd = ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-d", db, "-c", sql]
        started = time.monotonic()
        result = subprocess.run(cmd, env=PG, capture_output=True, text=True, check=False, timeout=20)
        elapsed = time.monotonic() - started
        if result.returncode:
            return {"ok": False, "deadlock": "40P01" in result.stderr,
                    "elapsed": elapsed, "code": "40P01" if "40P01" in result.stderr else "OTHER"}
        rows = [x for x in result.stdout.splitlines() if x.startswith("{")]
        assert len(rows) == 1, result.stdout[-300:]
        return {"ok": True, "response": json.loads(rows[0]), "elapsed": elapsed}

    a, b = parallel(lambda: run("reverse-a"), lambda: run("reverse-b"))
    drafts = int(value(db, "SELECT count(*) FROM public.workforce_actual_segments"))
    staged = int(value(db, "SELECT count(*) FROM public.workforce_attendance_import_batches WHERE status='staged'"))
    confirmed = int(value(db, "SELECT count(*) FROM public.workforce_attendance_import_batches WHERE status='confirmed'"))
    print(f"REVERSED multi-staff: A={a['code'] if not a['ok'] else 'OK'} "
          f"B={b['code'] if not b['ok'] else 'OK'} "
          f"wait_seconds={[round(a['elapsed'],2), round(b['elapsed'],2)]} "
          f"drafts={drafts} staged={staged} confirmed={confirmed}", flush=True)
    assert a["ok"] and b["ok"], "DEADLOCK/LOCK ERROR in reversed multi-staff Confirm"
    assert max(a["elapsed"], b["elapsed"]) < 10, "Exceeded 10-second concurrent Confirm completion budget"
    assert a["response"]["ok"] and b["response"]["ok"]
    assert sorted([a["response"]["created_count"], b["response"]["created_count"]]) == [0, 2]
    assert drafts == 2 and staged == 0 and confirmed == 2
    assert value(db, "SELECT count(*) FROM public.workforce_actual_segments WHERE review_status='draft' AND reviewed_by IS NULL") == "2"
    assert value(db, "SELECT count(*) FROM public.workforce_attendance_import_rows WHERE status='drafted' AND resulting_segment_id IS NOT NULL") == "2"
    assert value(db, "SELECT count(*) FROM public.workforce_attendance_import_rows WHERE status='exception' AND exception_code='OVERLAP_CONFLICT'") == "2"
    print("REVERSED multi-staff: PASS no deadlock, two DRAFT, two overlap exceptions", flush=True)


def main():
    psql("postgres", """DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;""")
    assert value("postgres", "SHOW server_version_num")[:2] == "17", "Expected PostgreSQL 17, not PGlite"
    for phase, patched in PHASES:
        stage_race(phase, patched)
        cross_batch_confirm_race(phase, patched)
    confirm_replay_and_rollback()
    reversed_multistaff_confirm()
    print("POSTGRESQL-17-ISOLATED-ATT01-CONCURRENCY: PASS")


if __name__ == "__main__":
    main()
