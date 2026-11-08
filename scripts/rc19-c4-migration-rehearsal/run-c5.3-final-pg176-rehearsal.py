#!/usr/bin/env python3
"""Rehearse the pinned C5.3 forward SQL on one marked PostgreSQL 17.6 database."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REHEARSAL = ROOT / "scripts" / "rc19-c4-migration-rehearsal"
EVIDENCE = REHEARSAL / "evidence"
MANIFEST = EVIDENCE / "c5.3-final-migration-manifest.json"
OLD_MANIFEST = EVIDENCE / "c5.2-forward-migration-manifest.json"
EXPECTED_DATABASE = "rc19_c5_3_final4_20261109"
BASELINE_SOURCE_DATABASE = "rc19_c4_schema_base_20261107_pg176"
EXPECTED_MARKER = "CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY"
EXPECTED_SOCKET = "/home/anhkienk4/.codex/pg17.6-c5.3-rehearsal/socket"
EXPECTED_PORT = "55437"
EXPECTED_VERSIONS = [
    "20261102110001", "20261102135047", "20261102150000", "20261102160334",
    "20261102170608", "20261102190000", "20261102200000", "20261103093137",
    "20261103195519", "20261104085945", "20261104085946", "20261104093735",
    "20261104110000", "20261104113000", "20261104120000", "20261104174527",
    "20261105120000", "20261107000000", "20261107120000", "20261108135226",
]


def command(args: list[str], *, log: Path | None = None, expect: int = 0,
            env_overrides: dict[str, str] | None = None,
            input_text: str | None = None) -> str:
    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)
    result = subprocess.run(args, cwd=ROOT, text=True, input=input_text, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, env=env)
    if log:
        log.parent.mkdir(parents=True, exist_ok=True)
        log.write_text(result.stdout, encoding="utf-8")
    if result.returncode != expect:
        tail = "\n".join(result.stdout.splitlines()[-30:])
        raise RuntimeError(f"COMMAND_EXIT_{result.returncode}_EXPECTED_{expect}: {' '.join(args)}\n{tail}")
    return result.stdout.strip()


def psql_base(database: str = EXPECTED_DATABASE) -> list[str]:
    return ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
            "-h", EXPECTED_SOCKET, "-p", EXPECTED_PORT, "-U", os.environ["PGUSER"],
            "-d", database]


def query(sql: str, *, database: str = EXPECTED_DATABASE) -> str:
    return command(psql_base(database) + ["-c", "SET ROLE postgres", "-c", sql]).strip()


def run_sql_file(path: Path, log: Path, *, single_transaction: bool = False,
                 database: str = EXPECTED_DATABASE,
                 env_overrides: dict[str, str] | None = None) -> None:
    args = psql_base(database)
    if single_transaction:
        args.append("--single-transaction")
    source_sql = path.read_text(encoding="utf-8-sig")
    wrapper_sql = f"-- C5.3 rehearsal source: {path.relative_to(ROOT).as_posix()}\nSET ROLE postgres;\n{source_sql}\n"
    command(args + ["-f", "-"], log=log, env_overrides=env_overrides,
            input_text=wrapper_sql)


def canonical_sha(path: Path) -> str:
    data = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return hashlib.sha256(data).hexdigest()


def q(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def ident(value: str) -> str:
    if not re.fullmatch(r"[a-z0-9_]+", value):
        raise RuntimeError("REFUSED_UNSAFE_DISPOSABLE_DATABASE_NAME")
    return '"' + value + '"'


def clone_database(source: str, name: str, marker: str, log: Path) -> None:
    if query(f"SELECT count(*) FROM pg_database WHERE datname={q(name)}", database="postgres") != "0":
        raise RuntimeError(f"REFUSED_EXISTING_CONTRACT_TEST_DATABASE:{name}")
    command(psql_base("postgres") + ["-c", f"CREATE DATABASE {ident(name)} TEMPLATE {ident(source)}"], log=log)
    command(psql_base("postgres") + ["-c", f"COMMENT ON DATABASE {ident(name)} IS {q(marker)}"])
    actual = query(
        "SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()",
        database=name,
    )
    if actual != marker:
        raise RuntimeError(f"CONTRACT_TEST_DATABASE_MARKER_MISMATCH:{name}")


def verify_private_contract(manifest: dict, out: Path, stamp: str) -> dict[str, object]:
    runtime = manifest["runtime_compatibility"]
    contract = ROOT / runtime["contract_migration_file"]
    if canonical_sha(contract) != runtime["contract_migration_sha256"]:
        raise RuntimeError("REFUSED_PRIVATE_CONTRACT_HASH_MISMATCH")
    no_attest = f"rc19_c5_3_contract_no_{stamp.lower()}"
    attested = f"rc19_c5_3_contract_yes_{stamp.lower()}"
    marker = "CODEX_DISPOSABLE_RC19_C5_3_CONTRACT_ONLY"
    clone_database(EXPECTED_DATABASE, no_attest, marker, out / "contract-clone-no-attestation.log")
    clone_database(EXPECTED_DATABASE, attested, marker, out / "contract-clone-attested.log")

    denied_log = out / "private-contract-no-attestation.log"
    command(psql_base(no_attest) + ["-c", "SET ROLE postgres", "-f", str(contract)],
            log=denied_log, expect=1)
    if "DASHBOARD_IMAGE_PRIVATE_CONTRACT_NOT_ATTESTED" not in denied_log.read_text(encoding="utf-8"):
        raise RuntimeError("PRIVATE_CONTRACT_DENIAL_REASON_MISMATCH")
    if query("SELECT public::text FROM storage.buckets WHERE id='live-dashboard-images'", database=no_attest) != "true":
        raise RuntimeError("PRIVATE_CONTRACT_DENIAL_CHANGED_BUCKET")
    if query("SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='live dashboard image public read'", database=no_attest) != "1":
        raise RuntimeError("PRIVATE_CONTRACT_DENIAL_DROPPED_PUBLIC_POLICY")

    positive_log = out / "private-contract-attested.log"
    run_sql_file(
        contract,
        positive_log,
        database=attested,
        env_overrides={
            "PGOPTIONS": "-c rc19.dashboard_image_proxy_ready=true -c rc19.dashboard_image_rollback_target=proxy-capable"
        },
    )
    if query("SELECT public::text FROM storage.buckets WHERE id='live-dashboard-images'", database=attested) != "false":
        raise RuntimeError("PRIVATE_CONTRACT_ATTESTED_BUCKET_REMAINS_PUBLIC")
    if query("SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='live dashboard image public read'", database=attested) != "0":
        raise RuntimeError("PRIVATE_CONTRACT_ATTESTED_PUBLIC_POLICY_REMAINS")
    if query("SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='live dashboard image scoped read'", database=attested) != "1":
        raise RuntimeError("PRIVATE_CONTRACT_ATTESTED_SCOPED_POLICY_MISSING")
    return {
        "contract_file": runtime["contract_migration_file"],
        "contract_sha256": runtime["contract_migration_sha256"],
        "no_attestation": "DENIED_AND_ROLLED_BACK",
        "no_attestation_log": denied_log.name,
        "attested_disposable_clone": "PRIVATE_BUCKET_AND_PUBLIC_POLICY_REMOVAL_PASS",
        "attested_log": positive_log.name,
        "production_contract_applied": False,
        "runtime_attestation_verified": False,
    }


def main() -> int:
    expected_sha = os.environ.get("RC19_C53_SOURCE_SHA", "")
    if os.environ.get("RC19_C53_REHEARSAL_CONFIRM") != "APPLY_TO_DISPOSABLE_ONLY":
        raise RuntimeError("REFUSED_MISSING_DISPOSABLE_CONFIRMATION")
    if os.environ.get("PGHOST") != EXPECTED_SOCKET or os.environ.get("PGPORT") != EXPECTED_PORT:
        raise RuntimeError("REFUSED_NONLOCAL_OR_UNEXPECTED_POSTGRES_ENDPOINT")
    if os.environ.get("PGDATABASE") != EXPECTED_DATABASE or os.environ.get("PGUSER") != "anhkienk4":
        raise RuntimeError("REFUSED_UNEXPECTED_TEST_DATABASE_IDENTITY")
    head = command(["git", "rev-parse", "HEAD"])
    if not re.fullmatch(r"[0-9a-f]{40}", expected_sha) or expected_sha != head:
        raise RuntimeError("REFUSED_SOURCE_SHA_MISMATCH")
    if command(["git", "status", "--porcelain"]):
        raise RuntimeError("REFUSED_DIRTY_SOURCE_CHECKOUT")
    command(["git", "merge-base", "--is-ancestor", "240a0d51b49863167be252d94545ea7c5ab2ac9a", "HEAD"])

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8-sig"))
    old = json.loads(OLD_MANIFEST.read_text(encoding="utf-8-sig"))
    entries = sorted(manifest["entries"], key=lambda item: item["order"])
    if [entry["version"] for entry in entries] != EXPECTED_VERSIONS:
        raise RuntimeError("REFUSED_MIGRATION_ORDER_MISMATCH")
    if len(old["entries"]) != 20 or manifest.get("migration_count") != 20:
        raise RuntimeError("REFUSED_MIGRATION_COUNT_MISMATCH")
    if manifest["entries"][0].get("superseded_file_sha256") != old["entries"][0]["sha256"]:
        raise RuntimeError("REFUSED_SUPERSEDED_MIGRATION_HASH_MISMATCH")
    archive = ROOT / manifest["entries"][0]["supersedes_file"]
    if canonical_sha(archive) != old["entries"][0]["sha256"]:
        raise RuntimeError("REFUSED_ARCHIVED_ORIGINAL_CHANGED")
    for entry, old_entry in zip(entries[1:], old["entries"][1:]):
        if entry["version"] != old_entry["version"] or entry["sha256"] != old_entry["sha256"]:
            raise RuntimeError(f"REFUSED_UNEXPECTED_HISTORY_CHANGE:{entry['version']}")
    for entry in entries:
        source = ROOT / entry["file"]
        if canonical_sha(source) != entry["sha256"]:
            raise RuntimeError(f"REFUSED_MIGRATION_HASH_MISMATCH:{entry['version']}")
    private_contract = ROOT / manifest["runtime_compatibility"]["contract_migration_file"]
    if canonical_sha(private_contract) != manifest["runtime_compatibility"]["contract_migration_sha256"]:
        raise RuntimeError("REFUSED_PRIVATE_CONTRACT_HASH_MISMATCH")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = EVIDENCE / f"c5.3-final-pg176-{stamp}"
    out.mkdir(parents=True, exist_ok=False)
    print(f"REHEARSAL_EVIDENCE_DIR={out.relative_to(ROOT)}", flush=True)
    clean_at_start = True
    info = query(
        "SELECT current_database() || '|' || shobj_description(oid,'pg_database') || '|' || "
        "current_setting('server_version') || '|' || current_setting('server_version_num') "
        "FROM pg_database WHERE datname=current_database()"
    )
    fields = info.split("|")
    if len(fields) != 4 or fields[0] != EXPECTED_DATABASE or fields[1] != EXPECTED_MARKER:
        raise RuntimeError("REFUSED_DATABASE_MARKER_MISMATCH")
    if not fields[2].startswith("17.6 ") or fields[3] != "170006":
        raise RuntimeError(f"REFUSED_POSTGRES_VERSION_MISMATCH:{info}")
    if query("SELECT count(*) FROM supabase_migrations.schema_migrations") != "0":
        raise RuntimeError("REFUSED_NONEMPTY_FORWARD_RECEIPT_LEDGER")
    if query("SELECT extversion FROM pg_extension WHERE extname='pgcrypto'") != "1.3":
        raise RuntimeError("REFUSED_PGCRYPTO_BASELINE_MISMATCH")
    if query("SELECT public::text FROM storage.buckets WHERE id='live-dashboard-images'") != "true":
        raise RuntimeError("REFUSED_LEGACY_IMAGE_BUCKET_NOT_PUBLIC")
    if query("SELECT count(*) FROM storage.objects WHERE bucket_id='live-dashboard-images' AND name='synthetic/compatibility-probe.txt'") != "1":
        raise RuntimeError("REFUSED_MISSING_SYNTHETIC_STORAGE_METADATA")
    if query("SELECT count(*) FROM public.system_settings WHERE registration_cutoff_hours=6 AND require_registration_approval AND auto_lock_filled_shifts AND NOT allow_multi_role_per_shift AND default_host_count=1 AND default_support_count=1 AND default_technical_count=1") != "1":
        raise RuntimeError("REFUSED_MISSING_SYNTHETIC_OPERATIONAL_SETTINGS")
    if query("SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='live dashboard image public read' AND cmd='SELECT'") != "1":
        raise RuntimeError("REFUSED_LEGACY_IMAGE_POLICY_MISSING")

    baseline_dump = command(["pg_dump", "-h", EXPECTED_SOCKET, "-p", EXPECTED_PORT, "-U", os.environ["PGUSER"],
                             "-d", EXPECTED_DATABASE, "--schema-only", "--no-owner", "--no-privileges",
                             "-n", "public", "-n", "private", "-n", "auth", "-n", "storage",
                             "-n", "extensions", "-n", "cron", "-n", "supabase_migrations"])
    baseline_schema_hash = hashlib.sha256(baseline_dump.encode("utf-8")).hexdigest()

    (out / "source.txt").write_text(
        f"source_sha={head}\napplication_candidate_sha=240a0d51b49863167be252d94545ea7c5ab2ac9a\n"
        f"database={fields[0]}\ndatabase_marker={fields[1]}\npostgres_server={fields[2]}\n"
        f"baseline_schema_source_database={BASELINE_SOURCE_DATABASE}\nbaseline_schema_dump_sha256={baseline_schema_hash}\n"
        "baseline_schema_source=production-shaped schema-only snapshot after the 89-receipt replay\n"
        "historical_receipts_in_this_clone=0 (not replayed or fabricated)\n"
        "forward_migrations=20; receipts inserted only after each SQL file succeeds\n"
        "pg_cron_worker=not simulated; no forward migration references pg_cron\n"
        "synthetic_operational_settings_rows=1; provider_object_bytes=not present; only one synthetic Storage metadata row\n"
        f"worktree_clean_at_run_start={str(clean_at_start).lower()}\ncreated_utc={stamp}\n",
        encoding="utf-8")

    progress = ["order\tversion\tfile\tsha256\ttransaction_mode\tstatus\tpost_schema_sha256\tlog"]
    preservation_seeded = False
    before_preservation = ""
    for entry in entries:
        order, version = entry["order"], entry["version"]
        source = ROOT / entry["file"]
        sql = source.read_text(encoding="utf-8-sig")
        has_begin = bool(re.search(r"(?im)^\s*begin\s*;", sql))
        has_commit = bool(re.search(r"(?im)^\s*commit\s*;", sql))
        if has_begin != has_commit:
            raise RuntimeError(f"MIGRATION_TRANSACTION_BOUNDARY_MISMATCH:{version}")
        explicit_transaction = has_begin
        transaction_mode = "file_transaction" if explicit_transaction else "runner_single_transaction"
        if version == "20261103195519":
            if not preservation_seeded:
                if query("SELECT count(*) FROM public.storage_resources WHERE id LIKE 'c4-rehearsal-%'") != "0":
                    raise RuntimeError("REFUSED_STORAGE_PRESERVATION_FIXTURE_NOT_EMPTY")
                before_preservation = query((REHEARSAL / "fixtures" / "storage-preservation-fingerprint.sql").read_text(encoding="utf-8"))
                run_sql_file(REHEARSAL / "fixtures" / "seed-storage-preservation.sql", out / "seed-storage-preservation.log")
                after_seed = query((REHEARSAL / "fixtures" / "storage-preservation-fingerprint.sql").read_text(encoding="utf-8"))
                if not after_seed or after_seed == before_preservation:
                    raise RuntimeError("STORAGE_PRESERVATION_SEED_DID_NOT_CHANGE_FINGERPRINT")
                before_preservation = after_seed
                preservation_seeded = True
        if query(f"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version={q(version)}") != "0":
            raise RuntimeError(f"REFUSED_DUPLICATE_FORWARD_RECEIPT:{version}")
        migration_log = out / f"migration-{order:02d}-{version}.log"
        run_sql_file(source, migration_log, single_transaction=not explicit_transaction)
        receipt_sql = (
            "INSERT INTO supabase_migrations.schema_migrations "
            "(version, statements, name, created_by, idempotency_key, rollback) VALUES ("
            f"{q(version)}, ARRAY[{q('source_file=' + entry['file'])},{q('sha256=' + entry['sha256'])},{q('run_id=' + stamp)}], "
            f"{q(source.stem[len(version)+1:])}, 'codex-local-c5.3-rehearsal', "
            f"{q('c5.3:' + version + ':' + entry['sha256'])}, NULL)"
        )
        receipt_log = out / f"receipt-{order:02d}-{version}.log"
        command(psql_base() + ["-c", "SET ROLE postgres", "-c", receipt_sql], log=receipt_log)
        if version == "20261102110001":
            run_sql_file(REHEARSAL / "fixtures" / "c5.3-image-public-compatibility-assertions.sql",
                         out / "image-compat-after-migration-01.log")
        if version == "20261103195519":
            after_preservation = query((REHEARSAL / "fixtures" / "storage-preservation-fingerprint.sql").read_text(encoding="utf-8"))
            if after_preservation != before_preservation:
                raise RuntimeError("C2_STORAGE_DATA_OR_AUDIT_CHANGED_DURING_MIGRATION")
        schema_dump = command(["pg_dump", "-h", EXPECTED_SOCKET, "-p", EXPECTED_PORT, "-U", os.environ["PGUSER"],
                               "-d", EXPECTED_DATABASE, "--schema-only", "--no-owner", "--no-privileges",
                               "-n", "public", "-n", "private", "-n", "auth", "-n", "storage",
                               "-n", "extensions", "-n", "cron", "-n", "supabase_migrations"])
        schema_hash = hashlib.sha256(schema_dump.encode("utf-8")).hexdigest()
        progress.append(f"{order}\t{version}\t{entry['file']}\t{entry['sha256']}\t{transaction_mode}\tPASS\t{schema_hash}\t{migration_log.name}")
        (out / "progress.tsv").write_text("\n".join(progress) + "\n", encoding="utf-8")
        print(f"MIGRATION_PASS order={order:02d}/20 version={version} transaction={transaction_mode}", flush=True)

    if not preservation_seeded:
        raise RuntimeError("C2_STORAGE_PRESERVATION_FIXTURE_NOT_EXECUTED")
    if query("SELECT count(*) FROM supabase_migrations.schema_migrations") != "20":
        raise RuntimeError("FORWARD_RECEIPT_COUNT_MISMATCH")
    if query("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE created_by='codex-local-c5.3-rehearsal'") != "20":
        raise RuntimeError("FORWARD_RECEIPT_PROVENANCE_MISMATCH")

    run_sql_file(REHEARSAL / "fixtures" / "c2-storage-rls-assertions.sql", out / "c2-storage-rls-assertions.log")
    run_sql_file(REHEARSAL / "fixtures" / "c5.3-final-role-assertions.sql", out / "role-brand-shift-assertions.log")
    run_sql_file(REHEARSAL / "fixtures" / "c5.3-image-public-compatibility-assertions.sql", out / "image-compat-final.log")
    contract_gate = verify_private_contract(manifest, out, stamp)
    final_dump = command(["pg_dump", "-h", EXPECTED_SOCKET, "-p", EXPECTED_PORT, "-U", os.environ["PGUSER"],
                          "-d", EXPECTED_DATABASE, "--schema-only", "--no-owner", "--no-privileges",
                          "-n", "public", "-n", "private", "-n", "auth", "-n", "storage",
                          "-n", "extensions", "-n", "cron", "-n", "supabase_migrations"])
    (out / "schema-after-20.sql").write_text(final_dump, encoding="utf-8")
    final_info = {
        "result": "PASS",
        "source_sha": head,
        "application_candidate_sha": manifest.get("application_candidate_sha", "240a0d51b49863167be252d94545ea7c5ab2ac9a"),
        "postgres_server": fields[2],
        "database": fields[0],
        "database_marker": fields[1],
        "baseline_schema_source_database": BASELINE_SOURCE_DATABASE,
        "baseline_schema_dump_sha256": baseline_schema_hash,
        "baseline_snapshot_after_production_ledger_receipt_count": 89,
        "historical_receipts_replayed_in_final_clone": 0,
        "effective_migrations_applied": len(entries),
        "actual_forward_receipts_in_clone": int(query("SELECT count(*) FROM supabase_migrations.schema_migrations")),
        "final_forward_head": query("SELECT max(version) FROM supabase_migrations.schema_migrations"),
        "effective_manifest_sha256": hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
        "final_schema_dump_sha256": hashlib.sha256(final_dump.encode("utf-8")).hexdigest(),
        "image_bucket_public": query("SELECT public::text FROM storage.buckets WHERE id='live-dashboard-images'") == "true",
        "legacy_public_policy_present": query("SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='live dashboard image public read'") == "1",
        "private_contract_gate": contract_gate,
        "provider_bytes_tested": False,
        "pg_cron_worker_simulated": False,
        "production_sql_authorized": False,
    }
    (out / "result.json").write_text(json.dumps(final_info, indent=2) + "\n", encoding="utf-8")
    print(f"C5.3_PG17_REHEARSAL_PASS source={head} database={fields[0]} postgres={fields[2]} evidence={out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"C5.3_PG17_REHEARSAL_FAIL: {exc}", file=sys.stderr)
        raise
