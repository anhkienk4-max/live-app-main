#!/usr/bin/env python3
"""Provision one marked local PostgreSQL DB from the verified C4 schema snapshot."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "scripts/rc19-c4-migration-rehearsal/evidence"
BASELINE_DIR = EVIDENCE / "c5.3-final-pg176-20261108T191556Z"
BASELINE = BASELINE_DIR / "schema-after-20.sql"
BASELINE_RESULT = BASELINE_DIR / "result.json"
MANIFEST = EVIDENCE / "c5.3-final-migration-manifest.json"
MIGRATION = ROOT / "supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql"
SOURCE_DB = "postgres"
SOURCE_MARKER = "CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY"


DB_CONTAINER = "supabase_db_rc19-supabase-recovery"


def run(args: list[str], *, input_text: str | None = None, timeout: int = 180) -> str:
    if args[0] in {"psql", "pg_dump", "createdb"}:
        args = ["docker", "exec", "-i", DB_CONTAINER, *args]
    result = subprocess.run(args, input=input_text, text=True, capture_output=True,
                            timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"exit={result.returncode} {' '.join(args)}\n{(result.stderr or result.stdout)[-3500:]}")
    return result.stdout


def query(sql: str, db: str = SOURCE_DB) -> str:
    return run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db,
                "-At", "-c", sql])


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")).hexdigest()


def main() -> None:
    source_head = sys.argv[1] if len(sys.argv) > 1 else "UNRECORDED"
    worktree_dirty = sys.argv[2].lower() == "true" if len(sys.argv) > 2 else True
    baseline_result = json.loads(BASELINE_RESULT.read_text(encoding="utf-8-sig"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8-sig"))
    if baseline_result.get("result") != "PASS" or baseline_result.get("effective_migrations_applied") != 20:
        raise RuntimeError("REFUSED_UNVERIFIED_C4_BASELINE")
    if sha(BASELINE) != baseline_result.get("final_schema_dump_sha256"):
        raise RuntimeError("REFUSED_C4_SCHEMA_SNAPSHOT_CHECKSUM_MISMATCH")
    if len(manifest.get("entries", [])) != 20:
        raise RuntimeError("REFUSED_C4_MIGRATION_MANIFEST_COUNT")
    for item in manifest["entries"]:
        if sha(ROOT / item["file"]) != item["sha256"]:
            raise RuntimeError("REFUSED_C4_MIGRATION_SOURCE_HASH:" + item["file"])

    source = query("select current_setting('server_version_num')||'|'||current_database()||'|'||coalesce(shobj_description(oid,'pg_database'),'')||'|'||(select count(*) from auth.users) from pg_database where datname=current_database()")
    fields = source.strip().split("|")
    if len(fields) != 4 or fields[1] != SOURCE_DB or fields[2] != SOURCE_MARKER:
        raise RuntimeError("REFUSED_SOURCE_STACK_IDENTITY")
    if not (170000 <= int(fields[0]) < 180000) or fields[3] != "0":
        raise RuntimeError("REFUSED_SOURCE_PG_VERSION_OR_AUTH_STATE")
    docker_running = run(["docker", "inspect", "--format", "{{.State.Running}}", DB_CONTAINER], timeout=10)
    listeners = run(["docker", "port", DB_CONTAINER], timeout=10)
    if docker_running.strip() != "true" or "127.0.0.1:54322" not in listeners:
        raise RuntimeError("REFUSED_NON_LOOPBACK_SUPABASE_RUNTIME")

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    db_name = "rc19_c511_e2e_" + run_id.replace("T", "").replace("Z", "")
    log_dir = EVIDENCE / "c5.11-local-pg1711"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"isolated-db-{run_id}.log"
    result_path = log_dir / f"isolated-db-{run_id}.json"
    log = [f"source_runtime={source.strip()}", f"target_database={db_name}",
           f"c4_schema_snapshot={BASELINE.relative_to(ROOT).as_posix()}",
           f"c4_schema_snapshot_sha256={sha(BASELINE)}", f"c4_forward_migrations_verified={len(manifest['entries'])}",
           f"c511_migration={MIGRATION.relative_to(ROOT).as_posix()}", f"c511_migration_sha256={sha(MIGRATION)}"]

    run(["createdb", "-U", "postgres", db_name])
    query(f"comment on database {db_name} is 'CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY';")
    try:
        query("drop schema public cascade;", db_name)
        restored = run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db_name],
                       input_text=BASELINE.read_text(encoding="utf-8"), timeout=240)
        log.append("verified_c4_schema_snapshot_restore=PASS")
        log.append("snapshot_restore_lines=" + str(len(restored.splitlines())))
        source_auth_users = query("select count(*) from auth.users").strip()
        if source_auth_users != "0":
            raise RuntimeError("REFUSED_LOCAL_AUTH_SOURCE_HAS_USERS")
        auth_schema = run(["pg_dump", "-U", "postgres", "-d", SOURCE_DB, "--schema-only",
                           "--no-owner", "--no-acl", "--schema=auth"], timeout=90)
        run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", db_name],
            input_text="drop schema auth cascade;\n" + auth_schema)
        auth_ownership = """
        alter schema auth owner to supabase_admin;
        do $$ declare r record; begin
          for r in select c.relkind,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='auth' and c.relkind in ('r','p','v','m','S','f')
              and (c.relkind<>'S' or not exists(select 1 from pg_depend d
                where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype in ('a','i'))) loop
            execute format('alter %s %I.%I owner to supabase_auth_admin',
              case r.relkind when 'S' then 'sequence' when 'v' then 'view' when 'm' then 'materialized view' else 'table' end,
              r.nspname,r.relname);
          end loop;
          for r in select p.prokind,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' loop
            execute format('alter %s %I.%I(%s) owner to supabase_auth_admin',
              case r.prokind when 'p' then 'procedure' else 'function' end,r.nspname,r.proname,r.args);
          end loop;
        end $$;
        grant usage,create on schema auth to supabase_auth_admin;
        grant all on all tables in schema auth to supabase_auth_admin;
        grant all on all sequences in schema auth to supabase_auth_admin;
        """
        run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", db_name],
            input_text=auth_ownership)
        auth_ledger = run(["pg_dump", "-U", "postgres", "-d", SOURCE_DB, "--data-only",
                           "--column-inserts", "--no-owner", "--no-acl", "--table=auth.schema_migrations"], timeout=60)
        run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", db_name],
            input_text=auth_ledger)
        auth_ledger_count = query("select count(*) from auth.schema_migrations", db_name).strip()
        source_auth_ledger_count = query("select count(*) from auth.schema_migrations", SOURCE_DB).strip()
        if auth_ledger_count != source_auth_ledger_count or not int(auth_ledger_count):
            raise RuntimeError("AUTH_MIGRATION_LEDGER_RESTORE_MISMATCH:" + auth_ledger_count)
        log.append("local_auth_schema_dump_restored=true")
        log.append("local_auth_schema_migration_receipts_copied=" + auth_ledger_count)
        postgrest_grants = """
        grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
        grant all privileges on all tables in schema public to anon, authenticated, service_role;
        grant all privileges on all sequences in schema public to anon, authenticated, service_role;
        alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
        alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
        alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
        """
        run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db_name],
            input_text=postgrest_grants)
        log.append("supabase_postgrest_default_grants_replayed_from_local_source=true")
        rbac_seed_migration = ROOT / "supabase/migrations/20261104085945_rc19_rbac01_role_permission_enforcement.sql"
        rbac_seed_sql = re.search(
            r"INSERT INTO private\.rbac_permission_catalog\b.*?ON CONFLICT \(permission\) DO NOTHING;",
            rbac_seed_migration.read_text(encoding="utf-8"), re.IGNORECASE | re.DOTALL)
        if not rbac_seed_sql:
            raise RuntimeError("REFUSED_RBAC_PERMISSION_SEED_NOT_FOUND")
        run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db_name],
            input_text=rbac_seed_sql.group(0))
        rbac_seed_count = query("select count(*) from private.rbac_permission_catalog", db_name).strip()
        if not rbac_seed_count.isdigit() or int(rbac_seed_count) < 30:
            raise RuntimeError("RBAC_PERMISSION_SEED_INCOMPLETE:" + rbac_seed_count)
        log.append("rbac_permission_catalog_seed_restored_from_canonical_migration=true")
        log.append("rbac_permission_catalog_seed_migration_sha256=" + sha(rbac_seed_migration))
        log.append("rbac_permission_catalog_seed_rows=" + rbac_seed_count)
        before = query("select current_setting('server_version_num')||'|'||current_database()||'|'||coalesce(shobj_description(oid,'pg_database'),'')||'|'||(select count(*) from auth.users)||'|'||(select count(*) from storage.objects) from pg_database where datname=current_database()", db_name).strip()
        b = before.split("|")
        if len(b) != 5 or b[1] != db_name or b[2] != "CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY" or b[3:] != ["0", "0"]:
            raise RuntimeError("REFUSED_NONEMPTY_OR_UNMARKED_TARGET_DATABASE " + before)

        applied = run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db_name],
                      input_text=MIGRATION.read_text(encoding="utf-8"), timeout=120)
        log.append("c511_migration_apply=PASS")
        log.append("migration_output_lines=" + str(len(applied.splitlines())))
        query("insert into supabase_migrations.schema_migrations(version,statements,name,created_by,idempotency_key) values ("+
              "'20261109100000',array['file=supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql','sha256="+sha(MIGRATION)+"'],"+
              "'rc19_c511_persisted_staffing_segments','c511-local-pg1711','c511:20261109100000:"+sha(MIGRATION)+"');", db_name)
        final = query("select current_setting('server_version_num')||'|'||current_database()||'|'||coalesce(shobj_description(oid,'pg_database'),'')||'|'||(select count(*) from auth.users)||'|'||(select count(*) from public.shift_staffing_segments)||'|'||(select count(*) from supabase_migrations.schema_migrations) from pg_database where datname=current_database()", db_name).strip()
        log.append("final_state=" + final)
        log.append("c511_receipt_inserted_after_successful_apply=1")
        evidence = {
            "result": "PASS",
            "target_database": db_name,
            "target_marker": "CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY",
            "postgres_server_version_num": b[0],
            "source_c5_11_candidate_head": source_head,
            "worktree_dirty_at_run": worktree_dirty,
            "c4_schema_snapshot": str(BASELINE.relative_to(ROOT).as_posix()),
            "c4_schema_snapshot_sha256": sha(BASELINE),
            "c4_forward_migration_count_previously_verified": len(manifest["entries"]),
            "c511_migration": str(MIGRATION.relative_to(ROOT).as_posix()),
            "c511_migration_sha256": sha(MIGRATION),
            "auth_users_after_restore": 0,
            "storage_objects_after_restore": 0,
            "shift_staffing_segments_created": 0,
            "actual_auth_users_created": 0,
            "log": str(log_path.relative_to(ROOT).as_posix()),
        }
        log.append("auth_users_created=0")
        log_path.write_text("\n".join(log) + "\n", encoding="utf-8")
        result_path.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
        print(f"PASS db={db_name} postgres={b[0]} schema=20-verified+C511 evidence={result_path.relative_to(ROOT).as_posix()}")
    except Exception as exc:
        log.append("result=FAIL")
        log.append(str(exc))
        log_path.write_text("\n".join(log) + "\n", encoding="utf-8")
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
