#!/usr/bin/env python3
"""Replay sanitized Production receipts and the effective C4 chain into the local Supabase DB."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "scripts/rc19-c4-migration-rehearsal/evidence"
CONTAINER = "supabase_db_rc19-supabase-recovery"
MARKER = "CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY"
LEDGER = EVIDENCE / "production-ledger-replay-manifest.json"
FORWARD = EVIDENCE / "c5.3-final-migration-manifest.json"
OVERRIDES = EVIDENCE / "production-history-statement-override-manifest.json"
CAPTURE = EVIDENCE / "production-ledger-statements-shift-rpc-20260831-20260913.json"
LOG = EVIDENCE / "c5.11-local-pg1711-ledger-replay.log"


def run(args: list[str], *, input_text: str | None = None, expected: int = 0) -> str:
    result = subprocess.run(args, input=input_text, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT)
    if result.returncode != expected:
        raise RuntimeError(f"exit={result.returncode}: {' '.join(args)}\n" + "\n".join(result.stdout.splitlines()[-30:]))
    return result.stdout


def psql(sql: str) -> str:
    return run(["docker", "exec", "-i", CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                "-U", "postgres", "-d", "postgres", "-At"], input_text=sql)


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def receipt(version: str, name: str, source: str, digest: str) -> None:
    psql("insert into supabase_migrations.schema_migrations "
         "(version,statements,name,created_by,idempotency_key,rollback) values ("
         f"{quote(version)},array[{quote('source_file=' + source)},{quote('sha256=' + digest)}],"
         f"{quote(name)},'c511-local-sanitized-replay',{quote('c511:' + version + ':' + digest)},null);\n")


def apply_sql(label: str, sql: str, output) -> None:
    output.write(f"\nAPPLY {label}\n")
    output.flush()
    result = subprocess.run(["docker", "exec", "-i", CONTAINER, "psql", "-X", "-v",
                            "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"],
                           input=sql, text=True, stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(f"MIGRATION_FAILED:{label}:exit={result.returncode}")


def canonical_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")).hexdigest()


def raw_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    info = psql("select current_database()||'|'||coalesce(shobj_description(oid,'pg_database'),'')||'|'||current_setting('server_version_num') from pg_database where datname=current_database();").strip()
    fields = info.split("|")
    if len(fields) != 3 or fields[0] != "postgres" or fields[1] != MARKER or not 170000 <= int(fields[2]) < 180000:
        raise RuntimeError("REFUSED_DATABASE_IDENTITY_OR_VERSION")
    if "127.0.0.1:54322" not in run(["docker", "port", CONTAINER, "5432/tcp"]).strip():
        raise RuntimeError("REFUSED_NON_LOOPBACK_DATABASE_PORT")
    if "rc19-supabase-recovery" not in run(["docker", "inspect", "-f", '{{ index .Config.Labels "com.docker.compose.project" }}', CONTAINER]).strip():
        raise RuntimeError("REFUSED_UNEXPECTED_SUPABASE_STACK")
    if psql("select count(*) from auth.users;").strip() != "0":
        raise RuntimeError("REFUSED_AUTH_USERS_PRESENT")
    if psql("select to_regclass('supabase_migrations.schema_migrations') is not null;").strip() == "t" \
            and psql("select count(*) from supabase_migrations.schema_migrations where created_by is distinct from 'c511-local-sanitized-replay';").strip() != "0":
        raise RuntimeError("REFUSED_NONEMPTY_MIGRATION_LEDGER")

    ledger = json.loads(LEDGER.read_text(encoding="utf-8-sig"))
    forward = json.loads(FORWARD.read_text(encoding="utf-8-sig"))
    override_manifest = json.loads(OVERRIDES.read_text(encoding="utf-8-sig"))
    captured = json.loads(CAPTURE.read_text(encoding="utf-8-sig"))
    if len(ledger["entries"]) != 89 or len(forward["entries"]) != 20:
        raise RuntimeError("REFUSED_MANIFEST_COUNT_MISMATCH")
    if canonical_hash(CAPTURE) != override_manifest["capture_sha256"]:
        raise RuntimeError("REFUSED_HISTORICAL_OVERRIDE_CAPTURE_HASH_MISMATCH")
    override_rows = {entry["version"]: entry for entry in captured["entries"]}
    overrides = {entry["version"] for entry in override_manifest["entries"]}
    if overrides != set(override_rows):
        raise RuntimeError("REFUSED_HISTORICAL_OVERRIDE_SET_MISMATCH")

    with LOG.open("w", encoding="utf-8") as output:
        output.write(f"database=postgres\nmarker={MARKER}\nserver_version_num={fields[2]}\n"
                     "baseline=89 captured source migrations; business rows omitted\n"
                     "forward=20 effective C4 migrations; synthetic storage preservation row omitted\n")
        output.flush()
        # The disposable database was verified empty of Auth identities and has never had a ledger.
        apply_sql("drop previously partial source-only schema", "drop schema if exists public cascade;\ncreate schema public authorization postgres;\n"
                  "grant usage on schema public to anon,authenticated,service_role,postgres;\n"
                  "alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;\n"
                  "alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;\n"
                  "alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;\n"
                  "drop schema if exists private cascade;\n"
                  "do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop execute format('drop policy %I on storage.objects',p.policyname); end loop; end $$;\n", output)
        if psql("select to_regnamespace('cron') is null;").strip() == "t":
            apply_sql("local pg_cron metadata adapter", "create schema cron;\n"
                      "create table cron.job(jobid bigint generated always as identity primary key,schedule text not null,command text not null,nodename text not null default 'localhost',nodeport integer not null default 5432,database text not null default current_database(),username text not null default current_user,active boolean not null default true,jobname text unique);\n"
                      "create function cron.schedule(text,text,text) returns bigint language plpgsql security definer set search_path='' as $$ declare result bigint; begin insert into cron.job(jobname,schedule,command,username,database) values ($1,$2,$3,current_user,current_database()) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid into result; return result; end $$;\n", output)
        psql("drop schema if exists supabase_migrations cascade;\n"
             "create schema supabase_migrations authorization postgres;\n"
             "create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text,rollback text[]);\n"
             "revoke all on schema supabase_migrations from public,anon,authenticated,service_role;\n")

        for item in sorted(ledger["entries"], key=lambda row: row["sequence"]):
            source = ROOT / item["source_file"]
            if raw_hash(source) != item["source_sha256"]:
                raise RuntimeError("REFUSED_HISTORY_SOURCE_HASH:" + item["source_file"])
            version = item["production_version"]
            sql = source.read_text(encoding="utf-8-sig")
            source_name = item["source_file"]
            digest = item["source_sha256"]
            if version in overrides:
                captured_row = override_rows[version]
                if captured_row["name"] != item["production_name"] or not captured_row["statements"]:
                    raise RuntimeError("REFUSED_OVERRIDE_IDENTITY:" + version)
                sql = "\n;\n".join(s.rstrip().rstrip(";") for s in captured_row["statements"]) + "\n;\n"
                digest = hashlib.sha256(sql.encode()).hexdigest()
                source_name += "#captured-production-receipt-" + version
            if source.name == "20261021034515_shift_automatic_status_scheduling_and_read_safety.sql":
                needle = "create extension if not exists pg_cron with schema pg_catalog;"
                if sql.lower().count(needle) != 1:
                    raise RuntimeError("REFUSED_PGCRON_ADAPTER_SOURCE_MISMATCH")
                sql = sql.replace(needle, "-- local adapter: cron metadata only; no worker is simulated.")
            apply_sql(version + " " + item["production_name"], "set role postgres;\n" + sql, output)
            receipt(version, item["production_name"], source_name, digest)
            output.write(f"RECEIPT {version} {digest}\n"); output.flush()

        if psql("select count(*) from supabase_migrations.schema_migrations;").strip() != "89":
            raise RuntimeError("PRODUCTION_BASELINE_RECEIPT_COUNT_MISMATCH")
        for item in sorted(forward["entries"], key=lambda row: row["order"]):
            source = ROOT / item["file"]
            if canonical_hash(source) != item["sha256"]:
                raise RuntimeError("REFUSED_FORWARD_SOURCE_HASH:" + item["file"])
            sql = source.read_text(encoding="utf-8-sig")
            apply_sql(item["version"] + " " + source.name, "set role postgres;\n" + sql, output)
            receipt(item["version"], source.stem.split("_", 1)[-1], item["file"], item["sha256"])
            output.write(f"RECEIPT {item['version']} {item['sha256']}\n"); output.flush()

        migration = ROOT / "supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql"
        apply_sql(migration.name, "set role postgres;\n" + migration.read_text(encoding="utf-8-sig"), output)
        receipt("20261109100000", migration.stem.split("_", 1)[-1], migration.relative_to(ROOT).as_posix(), canonical_hash(migration))
        total = psql("select count(*) from supabase_migrations.schema_migrations;").strip()
        version = psql("select current_setting('server_version');").strip()
        output.write(f"replay=PASS production_history=89 effective_c4=20 c511=1 total_receipts={total} server={version}\n")
        output.flush()
    print(f"PASS log={LOG.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
