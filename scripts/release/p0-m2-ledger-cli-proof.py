#!/usr/bin/env python3
"""Rehearse CLI history on one GitHub-hosted synthetic PostgreSQL 17 database."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

BRANCH = "test/rc16k-p0-m2-ledger-cli-v21210"
IMAGE = "postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73"
M2, M1, SUMMARY = "20261015154159", "20261014190429", "20261014233900"
REMOTE_ONLY = "20261014173408"
LOCAL_ONLY = {"20260919074349", "20260924000000", "20261012171503", M1, SUMMARY, M2}
M2_SHA = "698DB467BB1BCD1B549DCE94CB51704BB4771C814CF8AB6E23D3439564622BA7"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(args, timeout=120, check=True):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
    if check and result.returncode:
        raise RuntimeError(
            f"{args[0]} {args[1:3]} exited {result.returncode}\n"
            f"stdout: {result.stdout[-4000:]}\nstderr: {result.stderr[-4000:]}"
        )
    return result


def psql(database, query):
    return run(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1",
                "-p", "5432", "-U", "postgres", "-d", database, "-c", query]).stdout.strip()


def ledger(database):
    return set(json.loads(psql(database, "SELECT coalesce(json_agg(version ORDER BY version)::text, '[]') "
                                         "FROM supabase_migrations.schema_migrations;")))


def migration_list(label, url):
    result = run(["supabase", "migration", "list", "--db-url", url], timeout=180)
    print(f"{label}_EXIT={result.returncode}")
    print(result.stdout)
    require(all(version in result.stdout for version in LOCAL_ONLY | {REMOTE_ONLY}),
            f"{label} omitted a known history difference")


def dry_run(label, url, database, expected, include_all=False):
    args = ["supabase", "db", "push", "--dry-run", "--db-url", url]
    if include_all:
        args.append("--include-all")
    result = run(args, timeout=180, check=False)
    print(f"{label}_EXIT={result.returncode}")
    print(f"{label}_STDOUT={result.stdout[-6000:]}")
    print(f"{label}_STDERR={result.stderr[-6000:]}")
    require(ledger(database) == expected, f"{label} changed the synthetic ledger")


def main():
    require(os.environ.get("GITHUB_REF_NAME") == BRANCH, "Unexpected workflow branch")
    for name in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "DATABASE_URL",
                 "PGPASSWORD", "PGPASSFILE"):
        require(not os.environ.get(name), f"Unexpected credential variable: {name}")
    require((os.environ.get("PGHOST"), os.environ.get("PGPORT"), os.environ.get("PGUSER"))
            == ("127.0.0.1", "5432", "postgres"), "Synthetic PG connection profile mismatch")
    migration = Path("supabase/migrations/20261015154159_rc16k_member_report_read_rls.sql")
    require(hashlib.sha256(migration.read_bytes()).hexdigest().upper() == M2_SHA,
            "Locked Migration 2 SHA mismatch")
    print(f"M2_SHA256={M2_SHA}")

    container_id = os.environ.get("POSTGRES_CONTAINER_ID", "")
    require(re.fullmatch(r"[0-9a-f]{64}", container_id) is not None, "Synthetic container ID missing")
    inspected = run(["docker", "inspect", "--format", "{{.Id}}|{{.Config.Image}}|{{.State.Running}}",
                     container_id]).stdout.strip()
    require(inspected == f"{container_id}|{IMAGE}|true", "Synthetic container image/state mismatch")
    print(f"POSTGRES_CONTAINER_ID={container_id}")
    print(f"POSTGRES_IMAGE={IMAGE}")

    identity = json.loads(psql(
        "postgres", "SELECT json_build_object('database', current_database(), 'port', inet_server_port(), "
        "'user', current_user, 'version', current_setting('server_version_num'), "
        "'data_directory', current_setting('data_directory'), "
        "'postmaster_start', pg_postmaster_start_time())::text;"))
    require(identity["database"] == "postgres" and identity["port"] == 5432
            and identity["user"] == "postgres" and str(identity["version"]).startswith("17")
            and str(identity["data_directory"]).startswith("/var/lib/postgresql/"),
            "Synthetic PostgreSQL service identity mismatch")
    print(f"POSTGRES_IDENTITY={json.dumps(identity, sort_keys=True)}")

    run_id, attempt = os.environ.get("GITHUB_RUN_ID", ""), os.environ.get("GITHUB_RUN_ATTEMPT", "")
    require(run_id.isdecimal() and attempt.isdecimal(), "Missing GitHub run identity")
    database = f"w14_ledger_{run_id}_{attempt}"
    run(["createdb", "-h", "127.0.0.1", "-p", "5432", "-U", "postgres", database])
    target = json.loads(psql(database, "SELECT json_build_object('database', current_database(), "
                                       "'port', inet_server_port(), 'user', current_user, "
                                       "'version', current_setting('server_version_num'))::text;"))
    require(target["database"] == database and target["port"] == 5432 and target["user"] == "postgres"
            and str(target["version"]).startswith("17"), "Dedicated synthetic target mismatch")
    psql(database, "CREATE TABLE public.w14_target_marker(marker text PRIMARY KEY); "
                   f"INSERT INTO public.w14_target_marker VALUES ('{database}');")
    require(psql(database, "SELECT marker FROM public.w14_target_marker;") == database,
            "Dedicated synthetic target marker mismatch")
    print(f"TARGET_DATABASE={database}; TARGET_MARKER=PASS")
    url = f"postgresql://postgres@127.0.0.1:5432/{database}?sslmode=disable"

    local = sorted(match.group(1) for path in Path("supabase/migrations").glob("*.sql")
                   if (match := re.fullmatch(r"([0-9]{14})_.+\.sql", path.name)))
    require(len(local) == 72 and len(set(local)) == 72, "Unexpected local migration inventory")
    require(LOCAL_ONLY.issubset(set(local)) and REMOTE_ONLY not in local,
            "Synthetic history does not match source inventory")
    baseline = sorted((set(local) - LOCAL_ONLY) | {REMOTE_ONLY})
    require(len(baseline) == 67 and M1 not in baseline and SUMMARY not in baseline
            and M2 not in baseline, "Expected 67-version baseline not constructed")
    print(f"BASELINE_VERSIONS={len(baseline)}; LOCAL_ONLY={','.join(sorted(LOCAL_ONLY))}; "
          f"REMOTE_ONLY={REMOTE_ONLY}")

    for command, flags in ((["migration", "list"], ("--db-url",)),
                           (["migration", "repair"], ("--db-url", "--status")),
                           (["db", "push"], ("--db-url", "--dry-run", "--include-all"))):
        help_text = run(["supabase", *command, "--help"]).stdout
        require(all(flag in help_text for flag in flags), f"CLI help lacks required flags: {command}")
        print(f"CLI_HELP_{'_'.join(command).upper()}=PASS")

    # A remote-only ledger version has no local SQL file, so CLI repair cannot seed it.
    # Recreate the observed ledger shape as a synthetic fixture, then test CLI repair on M2 only.
    psql(database, "CREATE SCHEMA supabase_migrations; "
                   "CREATE TABLE supabase_migrations.schema_migrations ("
                   "version text PRIMARY KEY, statements text[], name text);")
    local_names = {path.name[:14]: path.stem[15:] for path in Path("supabase/migrations").glob("*.sql")}
    remote_name = "20261012171503_rc16k_bounded_shift_lists"
    values = ",".join(f"('{version}','{remote_name if version == REMOTE_ONLY else local_names[version]}')"
                      for version in baseline)
    psql(database, "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES " + values + ";")
    require(ledger(database) == set(baseline), "Fixture failed to seed exact 67-version ledger")
    print("SYNTHETIC_LEDGER_BASELINE=67_APPLIED; REMOTE_ONLY_FIXTURE=EXPLICIT")
    migration_list("MIGRATION_LIST_BEFORE_M2", url)
    dry_run("DB_PUSH_DRY_RUN_BEFORE_M2", url, database, set(baseline))

    psql(database, "BEGIN; CREATE TABLE public.w14_m2_sql_commit "
                   "(version text PRIMARY KEY, sha256 text NOT NULL); "
                   f"INSERT INTO public.w14_m2_sql_commit VALUES ('{M2}', '{M2_SHA}'); COMMIT;")
    require(psql(database, "SELECT sha256 FROM public.w14_m2_sql_commit "
                           f"WHERE version='{M2}';") == M2_SHA, "Synthetic SQL commit marker not durable")
    require(ledger(database) == set(baseline), "SQL commit changed ledger without repair")
    print("SYNTHETIC_M2_SQL_COMMIT_MARKER=PASS")
    run(["supabase", "migration", "repair", M2, "--status", "applied", "--db-url", url], timeout=180)
    after = set(baseline) | {M2}
    require(ledger(database) == after and len(after) == 68, "CLI M2 tracking mismatch")
    require(M1 not in after and SUMMARY not in after, "Unexecuted migrations marked applied")
    print("SYNTHETIC_M2_TRACKING=APPLIED; M1=PENDING; SUMMARY=PENDING")
    migration_list("MIGRATION_LIST_AFTER_M2", url)
    dry_run("DB_PUSH_DRY_RUN_AFTER_M2", url, database, after)
    dry_run("DB_PUSH_INCLUDE_ALL_DRY_RUN_AFTER_M2", url, database, after, include_all=True)
    require(psql(database, "SELECT marker FROM public.w14_target_marker;") == database,
            "Synthetic target marker changed")
    print("W14_LEDGER_REHEARSAL=PASS; TARGET=GITHUB_HOSTED_SYNTHETIC_ONLY")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(f"W14_LEDGER_REHEARSAL=FAIL: {exc}", file=sys.stderr)
        sys.exit(1)

