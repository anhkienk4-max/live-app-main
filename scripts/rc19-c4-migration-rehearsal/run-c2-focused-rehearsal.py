#!/usr/bin/env python3
"""Focused C2 rehearsal against the Production STO-02 registry shape on disposable PG17."""

import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


SHA = "240a0d51b49863167be252d94545ea7c5ab2ac9a"
MARKER = "CODEX_DISPOSABLE_RC19_C4_REHEARSAL_ONLY"
DB = os.environ.get("PGDATABASE", "")
HOST = os.environ.get("PGHOST", "")
PORT = os.environ.get("PGPORT", "")
USER = os.environ.get("PGUSER", "anhkienk4")
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "scripts" / "rc19-c4-migration-rehearsal"
EV = BASE / "evidence"


def psql(sql=None, *, file=None, expected=0, log=None, database=DB):
    args = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", HOST, "-p", PORT, "-U", USER, "-d", database]
    args += ["-f", str(file)] if file else ["-Atqc", sql]
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if log:
        log.write_text(result.stdout, encoding="utf-8")
    if result.returncode != expected:
        raise RuntimeError(f"PSQL_EXIT_{result.returncode}_EXPECTED_{expected}\n" + "\n".join(result.stdout.splitlines()[-20:]))
    return result.stdout.strip()


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def receipt(version, name, filename, sha):
    sql = ("INSERT INTO supabase_migrations.schema_migrations "
           "(version,statements,name,created_by,idempotency_key,rollback) VALUES ("
           f"{literal(version)},ARRAY[{literal('source_file='+filename)},{literal('sha256='+sha)}],"
           f"{literal(name)},'codex-local-rehearsal',{literal('c2-focus:'+version+':'+sha)},NULL)")
    psql("SET ROLE postgres; " + sql)


def exec_file(sql, log, expected=0, database=DB):
    temp = EV / "active-c2-focused.sql"
    temp.write_bytes(("SET ROLE postgres;\n" + sql).encode("utf-8"))
    return psql(file=temp, expected=expected, log=log, database=database)


def verify_incompatible_schema_fails_closed(sql, fingerprint_sql, out):
    database = f"{DB}_schema_mismatch"
    if len(database) > 63 or not database.replace("_", "").isalnum():
        raise RuntimeError("REFUSED_INVALID_MISMATCH_DATABASE_NAME")
    psql(f"CREATE DATABASE {database} TEMPLATE {DB}", database="postgres")
    psql(f"COMMENT ON DATABASE {database} IS {literal(MARKER)}", database="postgres")
    identity = psql(
        "SELECT current_database()||'|'||shobj_description(oid,'pg_database')||'|'||current_setting('server_version_num') "
        "FROM pg_database WHERE datname=current_database()",
        database=database,
    )
    bits = identity.split("|")
    if len(bits) != 3 or bits[0] != database or bits[1] != MARKER or not (170000 <= int(bits[2]) < 180000):
        raise RuntimeError("REFUSED_MISMATCH_DATABASE_IDENTITY_OR_VERSION")

    psql(
        "ALTER TABLE public.storage_resources ADD COLUMN c2_rehearsal_incompatible boolean",
        database=database,
    )
    before = psql(fingerprint_sql, database=database)
    rejected = exec_file(sql, out / "c2-incompatible-schema-rejected.log", expected=3, database=database)
    if "C2_RECONCILIATION_COLUMNS_MISMATCH:storage_resources" not in rejected:
        raise RuntimeError("C2_INCOMPATIBLE_SCHEMA_NOT_REJECTED_BY_SHAPE_GUARD")
    after = psql(fingerprint_sql, database=database)
    no_partial_c2 = psql(
        "SELECT (to_regclass('public.storage_resource_edit_grants') IS NULL "
        "AND to_regclass('public.attendance_photo_drive_folders') IS NULL "
        "AND to_regclass('public.operational_storage_folder_locks') IS NULL "
        "AND NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103195519'))::text",
        database=database,
    )
    if before != after or no_partial_c2 != "true":
        raise RuntimeError("C2_INCOMPATIBLE_SCHEMA_REJECTION_LEFT_PARTIAL_CHANGES")
    return database


def main():
    if os.environ.get("RC19_C4_SOURCE_SHA") != SHA or os.environ.get("RC19_C4_REHEARSAL_CONFIRM") != "APPLY_TO_DISPOSABLE_ONLY":
        raise RuntimeError("REFUSED_SOURCE_OR_DISPOSABLE_CONFIRMATION")
    if not HOST.startswith("/home/anhkienk4/.codex/pg17") or PORT not in {"55432", "55436"} or not DB.startswith("rc19_c4_rehearsal_c2focus_"):
        raise RuntimeError("REFUSED_DATABASE_ENDPOINT")
    if os.environ.get("RC19_C4_SOURCE_SHA") != SHA:
        raise RuntimeError("REFUSED_SOURCE_HEAD")
    ledger = json.loads((EV / "production-ledger-replay-manifest.json").read_text(encoding="utf-8-sig"))
    effective = json.loads((EV / "effective-migration-manifest.json").read_text(encoding="utf-8-sig"))
    items = ledger["entries"][:60]
    if len(items) != 60:
        raise RuntimeError("HISTORY_PREFIX_COUNT_MISMATCH")
    for e in items:
        src = ROOT / e["source_file"]
        if hashlib.sha256(src.read_bytes()).hexdigest() != e["source_sha256"]:
            raise RuntimeError("HISTORY_PREFIX_HASH_MISMATCH:" + e["source_file"])
    c2 = next(e for e in effective["entries"] if e["version"] == "20261103195519")
    c2_source = ROOT / c2["source_file"]
    if hashlib.sha256(c2_source.read_bytes()).hexdigest() != c2["sha256"]:
        raise RuntimeError("C2_EFFECTIVE_HASH_MISMATCH")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = EV / f"c2-focused-pg17-{stamp}"
    out.mkdir(parents=True, exist_ok=False)
    ident = psql("SELECT current_database()||'|'||shobj_description(oid,'pg_database')||'|'||current_setting('server_version_num') FROM pg_database WHERE datname=current_database()")
    bits = ident.split("|")
    if len(bits) != 3 or bits[0] != DB or bits[1] != MARKER or not (170000 <= int(bits[2]) < 180000):
        raise RuntimeError("REFUSED_DATABASE_IDENTITY_OR_VERSION")
    if psql("SELECT to_regclass('supabase_migrations.schema_migrations') IS NULL") != "t":
        raise RuntimeError("REFUSED_NONEMPTY_DATABASE")

    psql(file=BASE / "fixtures" / "supabase-prerequisites.sql", log=out / "bootstrap.log")
    psql("SET ROLE postgres; CREATE SCHEMA supabase_migrations AUTHORIZATION postgres; "
         "CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text, created_by text, idempotency_key text, rollback text[])")

    for e in items:
        source = ROOT / e["source_file"]
        sql = source.read_bytes().decode("utf-8-sig")
        temp = EV / "active-c2-focused.sql"
        temp.write_bytes(("SET ROLE postgres;\n" + sql).encode("utf-8"))
        logfile = out / f"history-{e['sequence']:03d}-{e['production_version']}.log"
        psql(file=temp, log=logfile)
        receipt(e["production_version"], e.get("production_name") or "", e["source_file"], e["source_sha256"])

    sto = ledger["entries"][87]
    sto_source = ROOT / sto["source_file"]
    sql = sto_source.read_bytes().decode("utf-8-sig")
    exec_file(sql, out / "production-sto02.log")
    receipt(sto["production_version"], sto["production_name"], sto["source_file"], sto["source_sha256"])

    psql(file=BASE / "fixtures" / "seed-storage-preservation.sql", log=out / "seed.log")
    fingerprint_sql = (BASE / "fixtures" / "storage-preservation-fingerprint.sql").read_text(encoding="utf-8")
    before = psql(fingerprint_sql)
    sql = c2_source.read_bytes().decode("utf-8-sig")
    table_start = sql.index("create table public.storage_resource_edit_grants (")
    table_end = sql.index("\n);", table_start) + len("\n);")
    injected = sql[:table_end] + "\nDO $rehearsal_failure$ BEGIN RAISE EXCEPTION 'SYNTHETIC_C2_TRANSACTION_ROLLBACK'; END $rehearsal_failure$;" + sql[table_end:]
    exec_file(injected, out / "c2-atomicity-injected-failure.log", expected=3)
    rollback_check = psql(
        "SELECT (to_regclass('public.storage_resource_edit_grants') IS NULL AND "
        "to_regclass('public.attendance_photo_drive_folders') IS NULL AND "
        "to_regclass('public.operational_storage_folder_locks') IS NULL AND "
        "NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103195519') "
        "AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_resources'::regclass "
        "AND pg_get_constraintdef(oid) LIKE '%public%'))::text")
    after_failure = psql(fingerprint_sql)
    if rollback_check != "true" or before != after_failure:
        raise RuntimeError("C2_ATOMIC_FAILURE_RECOVERY_FAIL")

    mismatch_database = verify_incompatible_schema_fails_closed(sql, fingerprint_sql, out)
    exec_file(sql, out / "c2-effective-migration.log")
    receipt(c2["version"], c2["file"].removesuffix(".sql").split("_",1)[-1], c2["source_file"], c2["sha256"])
    after = psql(fingerprint_sql)
    if before != after:
        raise RuntimeError("C2_EXISTING_DATA_CHANGED")
    if psql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261103195519'") != "1":
        raise RuntimeError("C2_RECEIPT_MISSING_AFTER_SUCCESS")
    if psql("SELECT count(*) FROM public.storage_resources WHERE id LIKE 'c4-rehearsal-%'") != "2":
        raise RuntimeError("C2_RESOURCE_PRESERVATION_FAIL")
    if psql("SELECT count(*) FROM public.storage_resource_audit_events WHERE resource_id LIKE 'c4-rehearsal-%'") != "3":
        raise RuntimeError("C2_AUDIT_PRESERVATION_FAIL")
    psql(file=BASE / "fixtures" / "c2-storage-rls-assertions.sql", log=out / "c2-storage-rls-assertions.log")
    anon_result = psql("BEGIN; SET LOCAL ROLE anon; SELECT id FROM public.storage_resources", expected=1)
    if "permission denied for table storage_resources" not in anon_result:
        raise RuntimeError("C2_RLS_ANON_ACCESS_NOT_DENIED")
    (out / "result.txt").write_text(
        f"RESULT=PASS\nPOSTGRES={bits[2]}\nDB={DB}\nC4_SOURCE_SHA={SHA}\n"
        f"PRODUCTION_PREFIX_REPLAYED=60\nPRODUCTION_STO02_APPLIED={sto['production_version']}\n"
        f"C2_VERSION={c2['version']}\nC2_EFFECTIVE_SHA256={c2['sha256']}\n"
        f"DATA_FINGERPRINT_BEFORE={before}\nDATA_FINGERPRINT_AFTER={after}\n"
        f"MISMATCH_DATABASE={mismatch_database}\nINCOMPATIBLE_SCHEMA_REJECTED=PASS\n"
        "ROLLBACK_INJECTION=PASS\nC2_STORAGE_ADMIN_LEADER_MEMBER_RLS=PASS\nC2_ANON_DENY=PASS\nFULL_89_HISTORY=NOT_RUN\n", encoding="utf-8")
    print(f"C2_FOCUSED_RESULT=PASS\nDATABASE={DB}\nEVIDENCE={out}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"C2_FOCUSED_FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
