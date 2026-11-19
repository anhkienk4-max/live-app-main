#!/usr/bin/env python3
"""Replay the captured Production migration ledger and C4 chain on one marked PG17 DB."""

from __future__ import annotations

import difflib
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


EXPECTED_SHA = "240a0d51b49863167be252d94545ea7c5ab2ac9a"
EXPECTED_MARKER = "CODEX_DISPOSABLE_RC19_C4_REHEARSAL_ONLY"
EXPECTED_SOCKET = os.environ.get("PGHOST", "/home/anhkienk4/.codex/pg17-rc19-c4-rehearsal/socket")
EXPECTED_DATABASE = os.environ.get("PGDATABASE", "rc19_c4_rehearsal_prodshape_20261106_r2")
PG_PORT = os.environ.get("PGPORT", "55432")
PG_USER = os.environ.get("PGUSER", "anhkienk4")

ROOT = Path(__file__).resolve().parents[2]
REHEARSAL = ROOT / "scripts" / "rc19-c4-migration-rehearsal"
EVIDENCE = REHEARSAL / "evidence"
LEDGER_MANIFEST = EVIDENCE / "production-ledger-replay-manifest.json"
EFFECTIVE_MANIFEST = EVIDENCE / "effective-migration-manifest.json"
PRODUCTION_OVERRIDE_MANIFEST = EVIDENCE / "production-history-statement-override-manifest.json"
PREREQUISITES = REHEARSAL / "fixtures" / "supabase-prerequisites.sql"
SEED = REHEARSAL / "fixtures" / "seed-storage-preservation.sql"


def run(args: list[str], *, log: Path | None = None, expected: int = 0) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if log:
        log.parent.mkdir(parents=True, exist_ok=True)
        log.write_text(result.stdout, encoding="utf-8")
    if result.returncode != expected:
        tail = "\n".join(result.stdout.splitlines()[-25:])
        raise RuntimeError(f"COMMAND_EXIT_{result.returncode}_EXPECTED_{expected}: {' '.join(args)}\n{tail}")
    return result


def q(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def canonical_sql_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def psql(query: str, *, tuples_only: bool = True) -> str:
    args = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", EXPECTED_SOCKET, "-p", PG_PORT,
            "-U", PG_USER, "-d", EXPECTED_DATABASE]
    args += ["-Atqc", query] if tuples_only else ["-c", query]
    return run(args).stdout.strip()


def schema_dump(path: Path) -> str:
    args = ["pg_dump", "-h", EXPECTED_SOCKET, "-p", PG_PORT, "-U", PG_USER,
            "-d", EXPECTED_DATABASE, "--schema-only", "--no-owner", "--no-privileges",
            "-n", "public", "-n", "private", "-n", "auth", "-n", "storage",
            "-n", "extensions", "-n", "cron", "-n", "supabase_migrations"]
    content = run(args).stdout
    path.write_text(content, encoding="utf-8")
    return content


def write_receipt(version: str, name: str, source: str, sha: str) -> None:
    insert = (
        "INSERT INTO supabase_migrations.schema_migrations "
        "(version, statements, name, created_by, idempotency_key, rollback) VALUES ("
        f"{q(version)}, ARRAY[{q('source_file=' + source)},{q('sha256=' + sha)}], "
        f"{q(name) if name else 'NULL'}, 'codex-local-rehearsal', "
        f"{q('rc19-c4:' + version + ':' + sha)}, NULL);"
    )
    psql("SET ROLE postgres; " + insert, tuples_only=False)


def execute_migration(source: Path, log: Path, *, adapter: bool = False, expected: int = 0) -> int:
    sql = source.read_bytes().decode("utf-8-sig")
    if adapter:
        needle = "create extension if not exists pg_cron with schema pg_catalog;"
        if sql.lower().count(needle) != 1:
            raise RuntimeError("PGCRON_ADAPTER_SOURCE_MISMATCH")
        sql = sql.replace(needle, "-- REHEARSAL ADAPTER: pg_cron worker is unavailable; cron.schedule is recorded by local shim.")
    temp = EVIDENCE / "active-migration.sql"
    temp.write_bytes(("SET ROLE postgres;\n" + sql).encode("utf-8"))
    args = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", EXPECTED_SOCKET, "-p", PG_PORT,
            "-U", PG_USER, "-d", EXPECTED_DATABASE, "-f", str(temp)]
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log.write_text(result.stdout, encoding="utf-8")
    if result.returncode != expected:
        tail = "\n".join(result.stdout.splitlines()[-25:])
        raise RuntimeError(f"MIGRATION_EXIT_{result.returncode}_EXPECTED_{expected}:{source.name}\n{tail}")
    return result.returncode


def verify_manifest(manifest: dict, count: int, label: str) -> None:
    if manifest.get("candidate_sha") != EXPECTED_SHA:
        raise RuntimeError(f"{label}_CANDIDATE_SHA_MISMATCH")
    items = manifest.get("entries", manifest.get("migrations", []))
    if len(items) != count:
        raise RuntimeError(f"{label}_COUNT_MISMATCH:{len(items)}/{count}")
    for item in items:
        source = ROOT / item.get("source_file", "supabase/migrations/" + item.get("file", ""))
        sha = item.get("source_sha256", item.get("sha256"))
        if not source.is_file():
            raise RuntimeError(f"{label}_SOURCE_MISSING:{source}")
        actual_sha = (
            canonical_sql_sha256(source)
            if manifest.get("hash_basis") == "git_text_blob_sha256"
            else hashlib.sha256(source.read_bytes()).hexdigest()
        )
        if actual_sha != sha:
            raise RuntimeError(f"{label}_SOURCE_HASH_MISMATCH:{source}")


def main() -> int:
    if os.environ.get("RC19_C4_SOURCE_SHA") != EXPECTED_SHA:
        raise RuntimeError("REFUSED_SOURCE_SHA_MISMATCH")
    if os.environ.get("RC19_C4_REHEARSAL_CONFIRM") != "APPLY_TO_DISPOSABLE_ONLY":
        raise RuntimeError("REFUSED_MISSING_DISPOSABLE_CONFIRMATION")
    if os.environ.get("PGHOST") != EXPECTED_SOCKET or os.environ.get("PGPORT") != PG_PORT:
        raise RuntimeError("REFUSED_NONLOCAL_OR_UNEXPECTED_POSTGRES_ENDPOINT")
    if os.environ.get("PGDATABASE") != EXPECTED_DATABASE:
        raise RuntimeError("REFUSED_UNEXPECTED_DISPOSABLE_DATABASE")
    if not EXPECTED_SOCKET.startswith("/home/anhkienk4/.codex/pg17"):
        raise RuntimeError("REFUSED_NONLOCAL_POSTGRES_SOCKET")
    if not EXPECTED_DATABASE.startswith("rc19_c4_rehearsal_prodshape_") or PG_PORT not in {"55432", "55436"}:
        raise RuntimeError("REFUSED_NON_REHEARSAL_DATABASE_OR_PORT")
    head = os.environ.get("RC19_C4_SOURCE_SHA", "")
    if head != EXPECTED_SHA:
        raise RuntimeError("REFUSED_SOURCE_HEAD_MISMATCH")
    ledger_manifest = json.loads(LEDGER_MANIFEST.read_text(encoding="utf-8-sig"))
    effective_manifest = json.loads(EFFECTIVE_MANIFEST.read_text(encoding="utf-8-sig"))
    override_manifest = json.loads(PRODUCTION_OVERRIDE_MANIFEST.read_text(encoding="utf-8-sig"))
    verify_manifest(ledger_manifest, 89, "PRODUCTION_LEDGER")
    verify_manifest(effective_manifest, 17, "C4_EFFECTIVE")
    override_file = EVIDENCE / override_manifest["capture_file"]
    if hashlib.sha256(override_file.read_bytes()).hexdigest() != override_manifest["capture_sha256"]:
        raise RuntimeError("PRODUCTION_STATEMENT_OVERRIDE_CAPTURE_HASH_MISMATCH")
    override_capture = json.loads(override_file.read_text(encoding="utf-8-sig"))
    captured = {entry["version"]: entry for entry in override_capture["entries"]}
    overrides = {entry["version"]: entry for entry in override_manifest["entries"]}
    if set(captured) != set(overrides):
        raise RuntimeError("PRODUCTION_STATEMENT_OVERRIDE_VERSION_MISMATCH")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = EVIDENCE / f"prodshape-pg17-{stamp}"
    out.mkdir(parents=True, exist_ok=False)
    rehearsal_commit = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()
    rehearsal_worktree_clean = not subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True
    ).strip()
    (out / "source.txt").write_text(
        f"candidate_application_sha={head}\nrehearsal_code_commit={rehearsal_commit}\n"
        f"rehearsal_worktree_clean_at_run_start={str(rehearsal_worktree_clean).lower()}\n"
        "effective_migration_hash_basis=git_text_blob_sha256\n"
        f"postgres_database={EXPECTED_DATABASE}\n"
        f"production_project=egdjnpmoasarrttvhgds\nproduction_ledger=89\n"
        f"candidate_migrations=17\ncreated_utc={stamp}\n", encoding="utf-8")

    identity = psql("SELECT current_database() || '|' || shobj_description(oid, 'pg_database') "
                    "|| '|' || current_setting('server_version_num') FROM pg_database "
                    "WHERE datname=current_database()")
    fields = identity.split("|")
    if len(fields) != 3 or fields[0] != EXPECTED_DATABASE or fields[1] != EXPECTED_MARKER:
        raise RuntimeError("REFUSED_DATABASE_IDENTITY_MARKER_MISMATCH")
    version_num = int(fields[2])
    if not 170000 <= version_num < 180000:
        raise RuntimeError(f"REFUSED_NOT_POSTGRESQL_17:{version_num}")
    if psql("SELECT to_regclass('supabase_migrations.schema_migrations') IS NULL") != "t":
        raise RuntimeError("REFUSED_DATABASE_NOT_EMPTY_OR_ALREADY_REPLAYED")

    run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", EXPECTED_SOCKET, "-p", PG_PORT,
         "-U", PG_USER, "-d", EXPECTED_DATABASE, "-f", str(PREREQUISITES)],
        log=out / "bootstrap-prerequisites.log")
    psql("SET ROLE postgres; CREATE SCHEMA supabase_migrations AUTHORIZATION postgres; "
         "CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, "
         "statements text[], name text, created_by text, idempotency_key text, rollback text[]); "
         "REVOKE ALL ON SCHEMA supabase_migrations FROM PUBLIC, anon, authenticated, service_role; "
         "GRANT USAGE ON SCHEMA supabase_migrations TO postgres;", tuples_only=False)

    if psql("SELECT rolsuper::text FROM pg_roles WHERE rolname='postgres'") != "true":
        raise RuntimeError("LOCAL_POSTGRES_MIGRATION_ROLE_NOT_SUPERUSER")

    progress = ["phase\tsequence\tversion\tname\tsource_file\tsha256\tstatus\tlog"]
    override_receipts = []
    for entry in sorted(ledger_manifest["entries"], key=lambda e: e["sequence"]):
        seq = int(entry["sequence"])
        log = out / f"history-{seq:03d}-{entry['production_version']}.log"
        run_source = ROOT / entry["source_file"]
        execution_source = run_source
        execution_source_name = entry["source_file"]
        execution_sha = entry["source_sha256"]
        version = entry["production_version"]
        if version in overrides:
            captured_entry = captured[version]
            if captured_entry["name"] != entry.get("production_name") or not captured_entry["statements"]:
                raise RuntimeError(f"PRODUCTION_STATEMENT_OVERRIDE_IDENTITY_MISMATCH:{version}")
            override_sql = "\n;\n".join(statement.rstrip().rstrip(";") for statement in captured_entry["statements"]) + "\n;\n"
            execution_source = EVIDENCE / f"active-production-history-{version}.sql"
            execution_source.write_bytes(override_sql.encode("utf-8"))
            execution_source_name = f"{override_file.relative_to(ROOT).as_posix()}#{version}"
            execution_sha = hashlib.sha256(override_sql.encode("utf-8")).hexdigest()
            override_receipts.append({
                "version": version,
                "production_name": captured_entry["name"],
                "source_file": entry["source_file"],
                "source_sha256": entry["source_sha256"],
                "execution_source": execution_source_name,
                "execution_sha256": execution_sha,
                "statement_count": len(captured_entry["statements"]),
                "capture_sha256": override_manifest["capture_sha256"],
            })
        adapter = entry["source_file"].endswith("20261021034515_shift_automatic_status_scheduling_and_read_safety.sql")
        execute_migration(execution_source, log, adapter=adapter)
        write_receipt(version, entry.get("production_name") or "", execution_source_name, execution_sha)
        progress.append(f"production-ledger\t{seq}\t{version}\t{entry.get('production_name') or ''}\t{execution_source_name}\t{execution_sha}\tPASS\t{log.name}")
        (out / "progress.tsv").write_text("\n".join(progress) + "\n", encoding="utf-8")

    (out / "production-history-overrides-used.json").write_text(
        json.dumps(override_receipts, indent=2) + "\n", encoding="utf-8")

    if psql("SELECT count(*) FROM supabase_migrations.schema_migrations") != "89":
        raise RuntimeError("PRODUCTION_LEDGER_REPLAY_RECEIPT_COUNT_MISMATCH")
    if psql("SELECT version || '|' || name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1") != "20261101073742|20261101073646_rc19_brand01_catalog":
        raise RuntimeError("PRODUCTION_LEDGER_REPLAY_HEAD_MISMATCH")
    prior_dump = schema_dump(out / "schema-after-89-production-ledger.sql")
    progress.append(f"production-ledger\t89\t20261101073742\t20261101073646_rc19_brand01_catalog\t\t\tSCHEMA_SNAPSHOT\t{hashlib.sha256(prior_dump.encode()).hexdigest()}")

    for index, entry in enumerate(effective_manifest["entries"], start=1):
        version = entry["version"]
        name = entry["file"].removesuffix(".sql").split("_", 1)[-1]
        source_rel = entry["source_file"]
        source = ROOT / source_rel
        if version == "20261103195519":
            run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", EXPECTED_SOCKET, "-p", PG_PORT,
                 "-U", PG_USER, "-d", EXPECTED_DATABASE, "-f", str(SEED)],
                log=out / "seed-storage-preservation.log")
            before_data = psql((REHEARSAL / "fixtures" / "storage-preservation-fingerprint.sql").read_text(encoding="utf-8"))
            injected = out / "c2-injected-failure.sql"
            sql = source.read_bytes().decode("utf-8-sig")
            table_start = sql.index("create table public.storage_resource_edit_grants (")
            table_end = sql.index("\n);", table_start) + len("\n);")
            if table_start < 0 or table_end <= table_start:
                raise RuntimeError("C2_FAILURE_INJECTION_MARKER_MISMATCH")
            sql = sql[:table_end] + "\nDO $rehearsal_failure$ BEGIN RAISE EXCEPTION 'SYNTHETIC_C2_TRANSACTION_ROLLBACK'; END $rehearsal_failure$;" + sql[table_end:]
            injected.write_bytes(("SET ROLE postgres;\n" + sql).encode("utf-8"))
            failure_log = out / "c2-atomicity-injected-failure.log"
            execute_migration(injected, failure_log, expected=3)
            rollback_check = psql(
                "SELECT (to_regclass('public.storage_resource_edit_grants') IS NULL "
                "AND to_regclass('public.attendance_photo_drive_folders') IS NULL "
                "AND to_regclass('public.operational_storage_folder_locks') IS NULL "
                "AND NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103195519') "
                "AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_resources'::regclass "
                "AND pg_get_constraintdef(oid) LIKE '%public%'))::text")
            after_failure_data = psql((REHEARSAL / "fixtures" / "storage-preservation-fingerprint.sql").read_text(encoding="utf-8"))
            if rollback_check != "true" or before_data != after_failure_data:
                raise RuntimeError("C2_INJECTED_FAILURE_DID_NOT_ROLL_BACK_ATOMICALLY")

        before_file = out / f"schema-before-{version}.sql"
        after_file = out / f"schema-after-{version}.sql"
        before_dump = schema_dump(before_file)
        log = out / f"candidate-{index:02d}-{version}.log"
        adapter = entry.get("adapter") == "pg_cron_test_shim"
        execute_migration(source, log, adapter=adapter)
        sha = canonical_sql_sha256(source)
        write_receipt(version, name, source_rel, sha)
        after_dump = schema_dump(after_file)
        diff = "".join(difflib.unified_diff(before_dump.splitlines(True), after_dump.splitlines(True),
                                             fromfile=f"before-{version}", tofile=f"after-{version}"))
        diff_path = out / f"schema-diff-{version}.patch"
        diff_path.write_text(diff, encoding="utf-8")
        progress.append(f"c4-candidate\t{index}\t{version}\t{name}\t{source_rel}\t{sha}\tPASS\t{log.name}")
        progress.append(f"catalog-diff\t{index}\t{version}\t\t\t\tPASS:{len(diff.splitlines())}_lines\t{diff_path.name}")
        (out / "progress.tsv").write_text("\n".join(progress) + "\n", encoding="utf-8")

    expected_versions = [e["version"] for e in effective_manifest["entries"]]
    versions_sql = "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN (" + ",".join(q(v) for v in expected_versions) + ")"
    if psql(versions_sql) != "17":
        raise RuntimeError("C4_MIGRATION_RECEIPT_COUNT_MISMATCH")
    if psql("SELECT count(*) FROM public.storage_resources WHERE id LIKE 'c4-rehearsal-%'") != "2":
        raise RuntimeError("SYNTHETIC_STORAGE_RESOURCE_PRESERVATION_FAILED")
    if psql("SELECT count(*) FROM public.storage_resource_audit_events WHERE resource_id LIKE 'c4-rehearsal-%'") != "3":
        raise RuntimeError("SYNTHETIC_STORAGE_AUDIT_PRESERVATION_FAILED")
    run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", EXPECTED_SOCKET, "-p", PG_PORT,
         "-U", PG_USER, "-d", EXPECTED_DATABASE, "-f",
         str(REHEARSAL / "fixtures" / "c2-storage-rls-assertions.sql")],
        log=out / "c2-storage-rls-assertions.log")
    anon = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", EXPECTED_SOCKET,
                           "-p", PG_PORT, "-U", PG_USER, "-d", EXPECTED_DATABASE, "-Atqc",
                           "BEGIN; SET LOCAL ROLE anon; SELECT id FROM public.storage_resources"],
                          text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if anon.returncode != 1 or "permission denied for table storage_resources" not in anon.stdout:
        raise RuntimeError("C2_RLS_ANON_ACCESS_NOT_DENIED")
    (out / "c2-storage-anon-denial.log").write_text(anon.stdout, encoding="utf-8")
    (out / "result.txt").write_text(
        f"RESULT=PASS\nsource_sha={head}\npostgresql={fields[2]}\n"
        "production_ledger_replayed=89\ncandidate_migrations_applied=17\n"
        "c2_storage_admin_leader_member_rls=PASS\nc2_anon_denied=PASS\n"
        "pg_cron_worker=NOT_SIMULATED\n", encoding="utf-8")
    print(f"RESULT=PASS\nDATABASE={EXPECTED_DATABASE}\nEVIDENCE={out}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"REHEARSAL_FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
