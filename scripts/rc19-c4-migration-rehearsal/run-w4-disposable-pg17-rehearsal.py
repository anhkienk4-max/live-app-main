#!/usr/bin/env python3
"""
One-command disposable native PostgreSQL 17.11 rehearsal & concurrency harness for RC19 W4.
Provisioned exclusively with initdb/pg_ctl in /tmp with known local test credentials
on loopback 127.0.0.1:55449 and zero Production connectivity.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_DIR = ROOT / "scripts/rc19-c4-migration-rehearsal/evidence/w4-final-integration-20261118"
BASELINE_SQL = ROOT / "scripts/rc19-c4-migration-rehearsal/evidence/c5.3-final-pg176-20261108T191556Z/schema-after-20.sql"
RBAC_SEED_SQL = ROOT / "supabase/migrations/20261104085945_rc19_rbac01_role_permission_enforcement.sql"
CONSOLIDATED_MANIFEST = ROOT / "scripts/rc19-c4-migration-rehearsal/rc19-w4-production-manifest-13-reconciled.sql"

PRE_W4_MIGRATIONS = [
    ("20261109100000", ROOT / "supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql", "rc19_c511_persisted_staffing_segments"),
    ("20261109131324", ROOT / "supabase/migrations/20261109131324_rc19_c512_attendance_photo_review.sql", "rc19_c512_attendance_photo_review"),
    ("20261110115529", ROOT / "supabase/migrations/20261110115529_rc19_c515_payroll_second_precision.sql", "rc19_c515_payroll_second_precision"),
    ("20261110123000", ROOT / "supabase/migrations/20261110123000_rc19_issue93_pass_swap_lead_times.sql", "rc19_issue93_pass_swap_lead_times"),
    ("20261110130000", ROOT / "supabase/migrations/20261110130000_rc19_c515_payroll_approval_hold.sql", "rc19_c515_payroll_approval_hold"),
    ("20261110140000", ROOT / "supabase/migrations/20261110140000_rc19_c515_overtime_cancellation_approvals.sql", "rc19_c515_overtime_cancellation_approvals"),
    ("20261111000000", ROOT / "supabase/migrations/20261111000000_rc19_c515_live_cancellation_transition.sql", "rc19_c515_live_cancellation_transition"),
]

CANDIDATE_MIGRATIONS = [
    ("20261112000000", ROOT / "supabase/migrations/20261112000000_rc19_c2_calendar_overlap_range.sql"),
    ("20261112120000", ROOT / "supabase/migrations/20261112120000_rc19_audit_history_keyset.sql"),
    ("20261112130000", ROOT / "supabase/migrations/20261112130000_rc19_c6_import_source_reconciliation.sql"),
    ("20261113083000", ROOT / "supabase/migrations/20261113083000_rc19_c4_audit_dependency.sql"),
    ("20261113084154", ROOT / "supabase/migrations/20261113084154_rc19_c4_atomic_staffing_replacement.sql"),
    ("20261115120000", ROOT / "supabase/migrations/20261115120000_rc19_w4_legacy_segment_compatibility.sql"),
    ("20261115130000", ROOT / "supabase/migrations/20261115130000_rc19_w4_segmented_manual_assignment.sql"),
    ("20261115140000", ROOT / "supabase/migrations/20261115140000_rc19_w4_pass_swap_segment_preservation.sql"),
    ("20261115174231", ROOT / "supabase/migrations/20261115174231_rc19_w4_retire_unguarded_swap_approval.sql"),
    ("20261116120000", ROOT / "supabase/migrations/20261116120000_rc19_w4_swap_preflight_and_segment_capacity.sql"),
    ("20261117160000", ROOT / "supabase/migrations/20261117160000_rc19_w4_pass_recipient_visibility.sql"),
    ("20261118140000", ROOT / "supabase/migrations/20261118140000_rc19_w4_atomic_overtime_payroll_sync.sql"),
    ("20261118150000", ROOT / "supabase/migrations/20261118150000_rc19_w4_overtime_payroll_defect_fixes.sql"),
]

PG_BIN = Path("/usr/lib/postgresql/17/bin")
CLUSTER_DIR = Path("/tmp/rc19-w4-disposable-pg17")
PGHOST = "127.0.0.1"
PGPORT = "55449"
PGUSER = "postgres"
PGPASS = "rc19_w4_local_test_only"
DB_MARKER = "RC19_W4_DISPOSABLE_PG17_REHEARSAL_ONLY"


def pg_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PGPASSWORD"] = PGPASS
    return env


def q(val: str) -> str:
    return "'" + val.replace("'", "''") + "'"


def run_cmd(args: list[str], *, input_text: str | None = None, expect: int = 0, timeout: int = 180) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        args,
        input=input_text,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=pg_env(),
        timeout=timeout,
    )
    if expect is not None and proc.returncode != expect:
        raise RuntimeError(f"Command failed (exit={proc.returncode}, expected={expect}): {' '.join(args)}\n{proc.stdout[-3500:]}")
    return proc


def psql(db: str, sql: str, *, expect: int = 0, tuples_only: bool = True) -> subprocess.CompletedProcess[str]:
    args = [str(PG_BIN / "psql"), "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "-d", db, "-X", "-v", "ON_ERROR_STOP=1"]
    if tuples_only:
        args.extend(["-At"])
    return run_cmd(args, input_text=sql, expect=expect)


def start_disposable_cluster() -> None:
    if (CLUSTER_DIR / "data/postmaster.pid").exists():
        subprocess.run([str(PG_BIN / "pg_ctl"), "-D", str(CLUSTER_DIR / "data"), "-m", "immediate", "stop"], capture_output=True)
    if CLUSTER_DIR.exists():
        shutil.rmtree(CLUSTER_DIR)
    (CLUSTER_DIR / "socket").mkdir(parents=True, exist_ok=True)
    pwfile = CLUSTER_DIR / "pgpass.txt"
    pwfile.write_text(PGPASS + "\n", encoding="utf-8")
    os.chmod(pwfile, 0o600)

    run_cmd([
        str(PG_BIN / "initdb"),
        "-D", str(CLUSTER_DIR / "data"),
        "-U", PGUSER,
        "--auth=scram-sha-256",
        f"--pwfile={pwfile}",
        "--encoding=UTF8",
        "--locale=C.UTF-8",
    ])

    conf = CLUSTER_DIR / "data/postgresql.conf"
    with conf.open("a", encoding="utf-8") as fh:
        fh.write(
            f"\nlisten_addresses = '{PGHOST}'\n"
            f"port = {PGPORT}\n"
            f"unix_socket_directories = '{CLUSTER_DIR / 'socket'}'\n"
            "max_connections = 50\n"
            "fsync = off\n"
            "synchronous_commit = off\n"
        )

    run_cmd([
        str(PG_BIN / "pg_ctl"),
        "-D", str(CLUSTER_DIR / "data"),
        "-l", str(CLUSTER_DIR / "postgres.log"),
        "-w", "start",
    ])


def stop_disposable_cluster() -> None:
    if (CLUSTER_DIR / "data/postmaster.pid").exists():
        subprocess.run([str(PG_BIN / "pg_ctl"), "-D", str(CLUSTER_DIR / "data"), "-m", "fast", "stop"], capture_output=True)


def actor_context_sql(sub: str, role: str = "authenticated", db_role: str = "authenticated") -> str:
    claims = json.dumps({"sub": sub, "role": db_role, "aud": "authenticated"})
    return (
        f"SET LOCAL ROLE {db_role};\n"
        f"SELECT set_config('request.jwt.claims', {q(claims)}, true);\n"
        f"SELECT set_config('request.jwt.claim.sub', {q(sub)}, true);\n"
        f"SELECT set_config('request.jwt.claim.role', {q(role)}, true);\n"
    )


def main() -> int:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    start_disposable_cluster()
    try:
        # Verify loopback PG17 cluster identity
        version_num = psql("postgres", "SHOW server_version_num;").stdout.strip()
        assert int(version_num) >= 170000 and int(version_num) < 180000, f"Unexpected PG version: {version_num}"

        # Create Supabase roles
        psql("postgres", """
        DO $$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'rc19_w4_local_test_only'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN CREATE ROLE supabase_admin LOGIN SUPERUSER PASSWORD 'rc19_w4_local_test_only'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN CREATE ROLE supabase_auth_admin LOGIN NOINHERIT BYPASSRLS PASSWORD 'rc19_w4_local_test_only'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        GRANT anon, authenticated, service_role TO authenticator;
        """)

        # Build baseline database matching Production prior to the 13 candidate migrations
        run_cmd([str(PG_BIN / "createdb"), "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "rc19_w4_baseline"])
        psql("rc19_w4_baseline", f"COMMENT ON DATABASE rc19_w4_baseline IS {q(DB_MARKER)}; DROP SCHEMA public CASCADE;")
        psql("rc19_w4_baseline", BASELINE_SQL.read_text(encoding="utf-8"), tuples_only=False)

        # Grant PostgREST schema privileges and seed rbac_permission_catalog
        psql("rc19_w4_baseline", """
        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, supabase_auth_admin;
        GRANT USAGE ON SCHEMA private TO authenticated;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
        """)

        import re
        rbac_text = RBAC_SEED_SQL.read_text(encoding="utf-8")
        m = re.search(r"INSERT INTO private\.rbac_permission_catalog\b.*?ON CONFLICT \(permission\) DO NOTHING;", rbac_text, re.IGNORECASE | re.DOTALL)
        assert m, "RBAC seed INSERT not found"
        psql("rc19_w4_baseline", m.group(0))

        # Apply pre-W4 migrations cleanly and record receipts (incl. 20261110140000, 20261111000000, 20261111200000)
        for ver, path, name in PRE_W4_MIGRATIONS:
            raw = path.read_text(encoding="utf-8").replace("\r\n", "\n")
            psql("rc19_w4_baseline", raw, tuples_only=False)
            psql(
                "rc19_w4_baseline",
                f"INSERT INTO supabase_migrations.schema_migrations (version, name, statements) "
                f"VALUES ({q(ver)}, {q(name)}, ARRAY[{q(raw)}]);"
            )
        # Historical empty marker receipt present in Production
        psql("rc19_w4_baseline", "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111200000', '20261111200000');")

        # 1. Stepwise migration application vs consolidated manifest application
        run_cmd([str(PG_BIN / "createdb"), "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "-T", "rc19_w4_baseline", "rc19_w4_stepwise"])
        run_cmd([str(PG_BIN / "createdb"), "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "-T", "rc19_w4_baseline", "rc19_w4_manifest"])

        for ver, path in CANDIDATE_MIGRATIONS:
            name = path.stem[len(ver) + 1:]
            raw = path.read_text(encoding="utf-8").replace("\r\n", "\n")
            psql("rc19_w4_stepwise", raw, tuples_only=False)
            # Plain INSERT (never ON CONFLICT DO UPDATE) matching canonical Supabase CLI receipt semantics
            psql(
                "rc19_w4_stepwise",
                f"INSERT INTO supabase_migrations.schema_migrations (version, name, statements) "
                f"VALUES ({q(ver)}, {q(name)}, ARRAY[{q(raw)}]);"
            )

        # Verify duplicate receipt insert fails closed without ON CONFLICT DO UPDATE
        dup_proc = psql("rc19_w4_stepwise", "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261118150000', 'dup');", expect=None)
        assert dup_proc.returncode != 0 and "duplicate key" in dup_proc.stdout.lower(), f"Expected duplicate PK failure: {dup_proc.stdout}"

        # Apply consolidated manifest once (must PASS)
        psql("rc19_w4_manifest", CONSOLIDATED_MANIFEST.read_text(encoding="utf-8"), tuples_only=False)

        # Re-applying consolidated manifest MUST fail closed at precheck!
        replay_proc = psql("rc19_w4_manifest", CONSOLIDATED_MANIFEST.read_text(encoding="utf-8"), expect=None)
        assert replay_proc.returncode != 0 and "PRECHECK_FAILED" in replay_proc.stdout, f"Expected PRECHECK_FAILED on replay: {replay_proc.stdout}"

        # Compare schemas & migration ledgers between stepwise and manifest databases
        # Strip pg_dump 17.11's per-invocation random \restrict / \unrestrict meta-commands before hashing
        import re as _re
        def normalize_dump(text: str) -> str:
            return "\n".join(line for line in text.splitlines() if not _re.match(r"^\\(?:restrict|unrestrict)\s+", line))

        dump_args_base = [str(PG_BIN / "pg_dump"), "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "--schema-only", "--no-owner", "--no-privileges", "-n", "public", "-n", "private", "-n", "auth", "-n", "storage", "-n", "supabase_migrations"]
        dump_stepwise = normalize_dump(run_cmd([*dump_args_base, "rc19_w4_stepwise"]).stdout)
        dump_manifest = normalize_dump(run_cmd([*dump_args_base, "rc19_w4_manifest"]).stdout)
        sha_stepwise = hashlib.sha256(dump_stepwise.encode("utf-8")).hexdigest()
        sha_manifest = hashlib.sha256(dump_manifest.encode("utf-8")).hexdigest()
        assert sha_stepwise == sha_manifest, f"Schema parity mismatch! stepwise={sha_stepwise} manifest={sha_manifest}"

        ledger_q = "SELECT version || '|' || coalesce(name, '') || '|' || coalesce(md5(array_to_string(statements, E'\\n')), 'NULL') FROM supabase_migrations.schema_migrations ORDER BY version;"
        ledger_stepwise = psql("rc19_w4_stepwise", ledger_q).stdout.strip()
        ledger_manifest = psql("rc19_w4_manifest", ledger_q).stdout.strip()
        assert ledger_stepwise == ledger_manifest, "Ledger checksum mismatch between stepwise and manifest!"

        # 2. Functional, Security, Rollback, Rounding & Real Multi-Connection Concurrency Tests
        run_cmd([str(PG_BIN / "createdb"), "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "-T", "rc19_w4_manifest", "rc19_w4_test_runtime"])

        # Seed sanitized fixtures in rc19_w4_test_runtime
        admin1_auth = "10000000-0000-4000-8000-000000000001"
        admin2_auth = "10000000-0000-4000-8000-000000000002"
        leader1_auth = "10000000-0000-4000-8000-000000000003"
        leader2_auth = "10000000-0000-4000-8000-000000000004"
        staff1_auth = "10000000-0000-4000-8000-000000000005"

        seed_sql = f"""
        INSERT INTO auth.users (id, email) VALUES
          ({q(admin1_auth)}, 'admin1@test.local'),
          ({q(admin2_auth)}, 'admin2@test.local'),
          ({q(leader1_auth)}, 'leader1@test.local'),
          ({q(leader2_auth)}, 'leader2@test.local'),
          ({q(staff1_auth)}, 'staff1@test.local');

        INSERT INTO public.brands (id, name, status) VALUES
          ('brand-a', 'Brand A', 'active'),
          ('brand-b', 'Brand B', 'active');
        INSERT INTO public.system_settings (registration_cutoff_hours) VALUES (6);

        INSERT INTO public.platforms (id, name, status) VALUES
          ('plat-a', 'Platform A', 'active');

        INSERT INTO public.business_users (id, auth_user_id, email, full_name, role, system_permission, operational_roles, status, account_status) VALUES
          ('u-admin1', {q(admin1_auth)}, 'admin1@test.local', 'Admin One', 'admin', 'admin', ARRAY['host','support','technical'], 'active', 'active'),
          ('u-admin2', {q(admin2_auth)}, 'admin2@test.local', 'Admin Two', 'admin', 'admin', ARRAY['host','support','technical'], 'active', 'active'),
          ('u-leader1', {q(leader1_auth)}, 'leader1@test.local', 'Leader One', 'leader', 'leader', ARRAY['host','support','technical'], 'active', 'active'),
          ('u-leader2', {q(leader2_auth)}, 'leader2@test.local', 'Leader Two', 'leader', 'leader', ARRAY['host','support','technical'], 'active', 'active'),
          ('u-staff1', {q(staff1_auth)}, 'staff1@test.local', 'Staff One', 'staff', 'member', ARRAY['technical'], 'active', 'active');

        SELECT set_config('request.jwt.claim.sub', {q(admin1_auth)}, false);
        SELECT set_config('request.jwt.claims', '{{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}}', false);

        INSERT INTO public.rc19_leader_brand_scopes
          (leader_business_user_id, brand_id, scope_key, status, valid_from, version, granted_by, updated_by)
        VALUES
          ('u-leader1', 'brand-a', 'workforce.read', 'active', now() - interval '1 day', 1, 'u-admin1', 'u-admin1'),
          ('u-leader1', 'brand-a', 'staff.manage', 'active', now() - interval '1 day', 1, 'u-admin1', 'u-admin1'),
          ('u-leader2', 'brand-b', 'workforce.read', 'active', now() - interval '1 day', 1, 'u-admin1', 'u-admin1');

        INSERT INTO public.shifts (id, brand_id, platform_id, date, start_time, end_time, status, required_technical_count) VALUES
          ('sh-round', 'brand-a', 'plat-a', '2026-11-12', '15:00:00', '16:00:01', 'completed', 1),
          ('sh-race1', 'brand-a', 'plat-a', '2026-11-13', '15:00:00', '17:30:00', 'completed', 1),
          ('sh-race2', 'brand-a', 'plat-a', '2026-11-14', '15:00:00', '17:30:00', 'completed', 1),
          ('sh-noprep', 'brand-a', 'plat-a', '2026-11-16', '15:00:00', '17:30:00', 'completed', 1),
          ('sh-voided', 'brand-a', 'plat-a', '2026-11-17', '15:00:00', '17:30:00', 'completed', 1),
          ('sh-locked', 'brand-a', 'plat-a', '2026-10-15', '15:00:00', '17:30:00', 'completed', 1),
          ('sh-locked-np', 'brand-a', 'plat-a', '2026-10-16', '15:00:00', '17:30:00', 'completed', 1);

        INSERT INTO public.reports (id, shift_id, submitted_by, status, metrics_confirmed) VALUES
          ('rp-round', 'sh-round', 'u-staff1', 'confirmed', true),
          ('rp-race1', 'sh-race1', 'u-staff1', 'confirmed', true),
          ('rp-race2', 'sh-race2', 'u-staff1', 'confirmed', true),
          ('rp-noprep', 'sh-noprep', 'u-staff1', 'confirmed', true),
          ('rp-voided', 'sh-voided', 'u-staff1', 'confirmed', true),
          ('rp-locked', 'sh-locked', 'u-staff1', 'confirmed', true),
          ('rp-locked-np', 'sh-locked-np', 'u-staff1', 'confirmed', true);

        INSERT INTO public.live_report_images (id, report_id, category, file_url, file_name, mime_type, size_bytes, uploaded_by, provider, external_file_id, external_parent_id, checksum_sha256) VALUES
          ('kv-round', 'rp-round', 'key_visual', 'https://drive.google.com/file/d/drive-kv-101', 'kv-round.jpg', 'image/jpeg', 1024, 'u-admin1', 'google_drive', 'drive-kv-101', 'drive-parent-1', repeat('a', 64)),
          ('kv-race1', 'rp-race1', 'key_visual', 'https://drive.google.com/file/d/drive-kv-102', 'kv-race1.jpg', 'image/jpeg', 1024, 'u-admin1', 'google_drive', 'drive-kv-102', 'drive-parent-1', repeat('b', 64)),
          ('kv-race2', 'rp-race2', 'key_visual', 'https://drive.google.com/file/d/drive-kv-103', 'kv-race2.jpg', 'image/jpeg', 1024, 'u-admin1', 'google_drive', 'drive-kv-103', 'drive-parent-1', repeat('c', 64)),
          ('kv-noprep', 'rp-noprep', 'key_visual', 'https://drive.google.com/file/d/drive-kv-105', 'kv-noprep.jpg', 'image/jpeg', 1024, 'u-admin1', 'google_drive', 'drive-kv-105', 'drive-parent-1', repeat('e', 64)),
          ('kv-voided', 'rp-voided', 'key_visual', 'https://drive.google.com/file/d/drive-kv-106', 'kv-voided.jpg', 'image/jpeg', 1024, 'u-admin1', 'google_drive', 'drive-kv-106', 'drive-parent-1', repeat('f', 64)),
          ('kv-locked', 'rp-locked', 'key_visual', 'https://drive.google.com/file/d/drive-kv-107', 'kv-locked.jpg', 'image/jpeg', 1024, 'u-admin1', 'google_drive', 'drive-kv-107', 'drive-parent-1', repeat('0', 64)),
          ('kv-locked-np', 'rp-locked-np', 'key_visual', 'https://drive.google.com/file/d/drive-kv-108', 'kv-locked-np.jpg', 'image/jpeg', 1024, 'u-admin1', 'google_drive', 'drive-kv-108', 'drive-parent-1', repeat('9', 64));

        INSERT INTO public.operational_files (id, scope_key, category, brand_id, platform_id, shift_id, period_date, execution_source, provider, external_file_id, external_parent_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, integrity_status, artifact_key, uploaded_by) VALUES
          ('ev-round', 'reports.review', 'live_snapshot', 'brand-a', 'plat-a', 'sh-round', '2026-11-12', 'internal', 'google_drive', 'drive-ev-101', 'drive-parent-1', 'ev/1', 'ev1.png', 'image/png', 1024, repeat('1', 64), 'sha256_verified', 'art-round', 'u-admin1'),
          ('ev-race1', 'reports.review', 'live_snapshot', 'brand-a', 'plat-a', 'sh-race1', '2026-11-13', 'internal', 'google_drive', 'drive-ev-102', 'drive-parent-1', 'ev/2', 'ev2.png', 'image/png', 1024, repeat('2', 64), 'sha256_verified', 'art-race1', 'u-admin1'),
          ('ev-race2', 'reports.review', 'live_snapshot', 'brand-a', 'plat-a', 'sh-race2', '2026-11-14', 'internal', 'google_drive', 'drive-ev-103', 'drive-parent-1', 'ev/3', 'ev3.png', 'image/png', 1024, repeat('3', 64), 'sha256_verified', 'art-race2', 'u-admin1'),
          ('ev-noprep', 'reports.review', 'live_snapshot', 'brand-a', 'plat-a', 'sh-noprep', '2026-11-16', 'internal', 'google_drive', 'drive-ev-105', 'drive-parent-1', 'ev/5', 'ev5.png', 'image/png', 1024, repeat('5', 64), 'sha256_verified', 'art-noprep', 'u-admin1'),
          ('ev-voided', 'reports.review', 'live_snapshot', 'brand-a', 'plat-a', 'sh-voided', '2026-11-17', 'internal', 'google_drive', 'drive-ev-106', 'drive-parent-1', 'ev/6', 'ev6.png', 'image/png', 1024, repeat('6', 64), 'sha256_verified', 'art-voided', 'u-admin1'),
          ('ev-locked', 'reports.review', 'live_snapshot', 'brand-a', 'plat-a', 'sh-locked', '2026-10-15', 'internal', 'google_drive', 'drive-ev-107', 'drive-parent-1', 'ev/7', 'ev7.png', 'image/png', 1024, repeat('7', 64), 'sha256_verified', 'art-locked', 'u-admin1'),
          ('ev-locked-np', 'reports.review', 'live_snapshot', 'brand-a', 'plat-a', 'sh-locked-np', '2026-10-16', 'internal', 'google_drive', 'drive-ev-108', 'drive-parent-1', 'ev/8', 'ev8.png', 'image/png', 1024, repeat('8', 64), 'sha256_verified', 'art-locked-np', 'u-admin1');

        INSERT INTO public.workforce_rate_cards
          (id, staff_id, operational_role, effective_from, effective_through, vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note)
        VALUES
          ('rc-oct-tech', null, 'technical', '2026-10-01', '2026-10-31', 100000, 15000, 'u-admin2', now(), 'PG17 rehearsal Oct rate card'),
          ('rc-tech', null, 'technical', '2026-11-01', null, 100000, 15000, 'u-admin2', now(), 'PG17 rehearsal rate card 100k x 1.5 OT');

        INSERT INTO public.workforce_actual_segments
          (id, shift_id, staff_id, operational_role, event_kind, actual_start_at, actual_end_at, evidence_note, created_by, review_status)
        VALUES
          ('seg-round', 'sh-round', 'u-staff1', 'technical', 'worked', '2026-11-12T08:00:00Z', '2026-11-12T09:00:01Z', '3601s rounding test segment', 'u-leader1', 'draft'),
          ('seg-race1', 'sh-race1', 'u-staff1', 'technical', 'worked', '2026-11-13T08:00:00Z', '2026-11-13T10:30:00Z', 'Concurrency lock vs OT race segment', 'u-leader1', 'draft'),
          ('seg-race2', 'sh-race2', 'u-staff1', 'technical', 'worked', '2026-11-14T08:00:00Z', '2026-11-14T10:30:00Z', 'Concurrency decision vs decision segment', 'u-leader1', 'draft'),
          ('seg-noprep', 'sh-noprep', 'u-staff1', 'technical', 'worked', '2026-11-16T08:00:00Z', '2026-11-16T10:30:00Z', 'Pre-prep OT segment', 'u-leader1', 'draft'),
          ('seg-voided', 'sh-voided', 'u-staff1', 'technical', 'worked', '2026-11-17T08:00:00Z', '2026-11-17T10:30:00Z', 'Voided line OT segment', 'u-leader1', 'draft'),
          ('seg-locked', 'sh-locked', 'u-staff1', 'technical', 'worked', '2026-10-15T08:00:00Z', '2026-10-15T10:30:00Z', 'Locked period segment with line', 'u-leader1', 'draft');

        UPDATE public.workforce_actual_segments
        SET review_status = 'approved', reviewed_by = 'u-admin1', reviewed_at = now(), review_note = 'Approved rehearsal actual segment', version = 2;

        INSERT INTO public.workforce_payroll_segment_decisions
          (segment_id, state, reviewed_by, preapproved_by, confirmed_by, confirmed_at, reason, missing_evidence, segment_version)
        VALUES
          ('seg-round', 'admin_confirmed', 'u-admin1', 'u-leader1', 'u-admin2', now(), 'Rehearsal segment approved for payroll', '{{}}', 2),
          ('seg-race1', 'admin_confirmed', 'u-admin1', 'u-leader1', 'u-admin2', now(), 'Rehearsal segment approved for payroll', '{{}}', 2),
          ('seg-race2', 'admin_confirmed', 'u-admin1', 'u-leader1', 'u-admin2', now(), 'Rehearsal segment approved for payroll', '{{}}', 2),
          ('seg-noprep', 'admin_confirmed', 'u-admin1', 'u-leader1', 'u-admin2', now(), 'Rehearsal segment approved for payroll', '{{}}', 2),
          ('seg-voided', 'admin_confirmed', 'u-admin1', 'u-leader1', 'u-admin2', now(), 'Rehearsal segment approved for payroll', '{{}}', 2),
          ('seg-locked', 'admin_confirmed', 'u-admin1', 'u-leader1', 'u-admin2', now(), 'Rehearsal segment approved for payroll', '{{}}', 2);

        INSERT INTO public.workforce_payroll_periods (id, period_start, period_end, status, created_by) VALUES
          ('per-round', '2026-11-12', '2026-11-12', 'draft', 'u-admin2'),
          ('per-race', '2026-11-13', '2026-11-14', 'draft', 'u-admin2'),
          ('per-nov', '2026-11-15', '2026-11-18', 'draft', 'u-admin2'),
          ('per-oct', '2026-10-15', '2026-10-16', 'draft', 'u-admin2');

        INSERT INTO public.workforce_payroll_lines
          (id, period_id, segment_id, rate_card_id, staff_id, operational_role,
           actual_minutes, payable_minutes, overtime_minutes,
           actual_seconds, payable_seconds, overtime_seconds,
           rate_vnd_per_hour, overtime_multiplier_basis_points, gross_vnd, calculation_version)
        VALUES
          ('ln-round', 'per-round', 'seg-round', 'rc-tech', 'u-staff1', 'technical', 60, 60, 0, 3601, 3601, 0, 100000, 15000, 100028, 'rc19-seconds-v1'),
          ('ln-race1', 'per-race', 'seg-race1', 'rc-tech', 'u-staff1', 'technical', 150, 150, 0, 9000, 9000, 0, 100000, 15000, 250000, 'rc19-seconds-v1'),
          ('ln-race2', 'per-race', 'seg-race2', 'rc-tech', 'u-staff1', 'technical', 150, 150, 0, 9000, 9000, 0, 100000, 15000, 250000, 'rc19-seconds-v1'),
          ('ln-voided', 'per-nov', 'seg-voided', 'rc-tech', 'u-staff1', 'technical', 150, 150, 0, 9000, 9000, 0, 100000, 15000, 250000, 'rc19-seconds-v1'),
          ('ln-locked', 'per-oct', 'seg-locked', 'rc-oct-tech', 'u-staff1', 'technical', 150, 150, 0, null, null, null, 100000, 15000, 250000, 'rc16-v1');

        SELECT public.workforce_rc16b_correct_payroll_line('per-nov', 'ln-voided', 1, gen_random_uuid(), 'void_line', 'u-admin1', 'Voided line for A1 check');
        SELECT public.workforce_rc16_transition_payroll('per-oct', 'draft', 'reviewed', 'u-admin1', 'Review Oct');
        SELECT public.workforce_rc16_transition_payroll('per-oct', 'reviewed', 'confirmed', 'u-admin2', 'Confirm Oct');
        SELECT public.workforce_rc16_transition_payroll('per-oct', 'confirmed', 'payroll_ready', 'u-admin2', 'Ready Oct');
        SELECT public.workforce_rc16_transition_payroll('per-oct', 'payroll_ready', 'locked', 'u-admin2', 'Lock Oct permanently');

        INSERT INTO public.workforce_actual_segments
          (id, shift_id, staff_id, operational_role, event_kind, actual_start_at, actual_end_at, evidence_note, created_by, review_status)
        VALUES
          ('seg-locked-np', 'sh-locked-np', 'u-staff1', 'technical', 'worked', '2026-10-16T08:00:00Z', '2026-10-16T10:30:00Z', 'Late approved segment inside locked period without line', 'u-leader1', 'draft');
        UPDATE public.workforce_actual_segments
        SET review_status = 'approved', reviewed_by = 'u-admin1', reviewed_at = now(), review_note = 'Late approval after Oct lock', version = 2
        WHERE id = 'seg-locked-np';
        """
        psql("rc19_w4_test_runtime", seed_sql, tuples_only=False)

        def request_ot(auth_id: str, seg_id: str, start_at: str, end_at: str, reason: str, ev_id: str, idem: str) -> str:
            out = psql("rc19_w4_test_runtime", f"""
            BEGIN;
            {actor_context_sql(auth_id)}
            SELECT 'OT_ID=' || id::text FROM public.rc19_c515_request_overtime(
              {q(seg_id)}, {q(start_at)}, {q(end_at)},
              'weekday', 'day', {q(reason)}, {q(ev_id)}, {q(idem)}::uuid
            );
            COMMIT;
            """).stdout
            for line in out.splitlines():
                if line.startswith("OT_ID="):
                    return line.split("=", 1)[1].strip()
            raise RuntimeError(f"Failed to extract OT_ID for {seg_id}: {out}")

        # Request OTs as Leader1 via real SET ROLE authenticated + JWT claims
        ot_round_id = request_ot(leader1_auth, "seg-round", "2026-11-12T09:00:00Z", "2026-11-12T09:00:01Z", "Half-up 1 second OT rounding check", "ev-round", "aaaaaaaa-aaaa-4aaa-8aaa-000000000001")
        ot_race1_id = request_ot(leader1_auth, "seg-race1", "2026-11-13T10:00:00Z", "2026-11-13T10:30:00Z", "Lock concurrency race check", "ev-race1", "aaaaaaaa-aaaa-4aaa-8aaa-000000000002")
        ot_race2_id = request_ot(leader1_auth, "seg-race2", "2026-11-14T10:00:00Z", "2026-11-14T10:30:00Z", "Decision vs decision concurrency check", "ev-race2", "aaaaaaaa-aaaa-4aaa-8aaa-000000000003")
        ot_noprep_id = request_ot(admin2_auth, "seg-noprep", "2026-11-16T10:00:00Z", "2026-11-16T10:30:00Z", "Pre-prep OT check", "ev-noprep", "aaaaaaaa-aaaa-4aaa-8aaa-000000000005")
        ot_voided_id = request_ot(leader1_auth, "seg-voided", "2026-11-17T10:00:00Z", "2026-11-17T10:30:00Z", "Voided line OT check", "ev-voided", "aaaaaaaa-aaaa-4aaa-8aaa-000000000006")
        ot_locked_id = request_ot(leader1_auth, "seg-locked", "2026-10-15T10:00:00Z", "2026-10-15T10:30:00Z", "Locked period with line check", "ev-locked", "aaaaaaaa-aaaa-4aaa-8aaa-000000000007")
        ot_locked_np_id = request_ot(leader1_auth, "seg-locked-np", "2026-10-16T10:00:00Z", "2026-10-16T10:30:00Z", "Locked period without line check", "ev-locked-np", "aaaaaaaa-aaaa-4aaa-8aaa-000000000008")

        # Test A2: Leader idempotency ('leader_preapprove' -> stored event 'leader_preapproved') & conflict fail-closed
        leader_idem = "eeeeeeee-eeee-4eee-8eee-000000000001"
        a2_first = psql("rc19_w4_test_runtime", f"""
        BEGIN;
        {actor_context_sql(leader1_auth)}
        SELECT state || '|' || version || '|' || leader_preapproved_by FROM public.rc19_c515_decide_overtime_request(
          {q(ot_noprep_id)}::uuid, 1, 'leader_preapprove', 'Leader verified OT evidence', {q(leader_idem)}::uuid
        );
        COMMIT;
        """).stdout
        assert "pending_admin_confirmation|2|u-leader1" in a2_first, a2_first

        a2_retry = psql("rc19_w4_test_runtime", f"""
        BEGIN;
        {actor_context_sql(leader1_auth)}
        SELECT state || '|' || version || '|' || leader_preapproved_by FROM public.rc19_c515_decide_overtime_request(
          {q(ot_noprep_id)}::uuid, 1, 'leader_preapprove', 'Leader verified OT evidence', {q(leader_idem)}::uuid
        );
        COMMIT;
        """).stdout
        assert "pending_admin_confirmation|2|u-leader1" in a2_retry, a2_retry

        a2_ev_count = psql("rc19_w4_test_runtime", f"SELECT count(*) FROM public.workforce_overtime_request_events WHERE request_id = {q(ot_noprep_id)}::uuid AND action = 'leader_preapproved';").stdout.strip().splitlines()[-1]
        assert a2_ev_count == "1", f"Expected 1 leader_preapproved event, got {a2_ev_count}"

        a2_conflict = psql("rc19_w4_test_runtime", f"""
        BEGIN;
        {actor_context_sql(leader1_auth)}
        SELECT state FROM public.rc19_c515_decide_overtime_request(
          {q(ot_noprep_id)}::uuid, 1, 'leader_preapprove', 'Conflicting reason', {q(leader_idem)}::uuid
        );
        COMMIT;
        """, expect=None)
        assert a2_conflict.returncode != 0 and "C515_OT_IDEMPOTENCY_CONFLICT" in a2_conflict.stdout, a2_conflict.stdout

        # Test A1: Pre-prep confirm succeeds at version=2 and auto_calculate incorporates OT later; locked/voided fail closed
        a1_noprep_confirm = psql("rc19_w4_test_runtime", f"""
        BEGIN;
        {actor_context_sql(admin1_auth)}
        SELECT state || '|' || version FROM public.rc19_c515_decide_overtime_request(
          {q(ot_noprep_id)}::uuid, 2, 'admin_confirm', 'Approve OT prior to draft line prep', 'eeeeeeee-eeee-4eee-8eee-000000000002'::uuid
        );
        COMMIT;
        """).stdout
        assert "admin_confirmed|3" in a1_noprep_confirm, a1_noprep_confirm

        psql("rc19_w4_test_runtime", f"""
        SELECT public.workforce_rc17b_auto_calculate_draft_batch(
          'per-nov',
          'ffffffff-ffff-4fff-8fff-000000000001'::uuid,
          'u-admin1',
          'Prepare pre-confirmed OT line in PG17',
          jsonb_build_array(jsonb_build_object(
            'segment_id', 'seg-noprep',
            'rate_card_id', 'rc-tech',
            'staff_id', 'u-staff1',
            'operational_role', 'technical',
            'actual_minutes', 150,
            'payable_minutes', 150,
            'overtime_minutes', 30,
            'rate_vnd_per_hour', 100000,
            'overtime_multiplier_basis_points', 15000,
            'gross_vnd', 275000,
            'adjustment_vnd', 0
          )),
          '[]'::jsonb
        );
        """, tuples_only=False)
        noprep_line = psql("rc19_w4_test_runtime", "SELECT overtime_seconds || '|' || gross_vnd || '|' || overtime_request_id FROM public.workforce_payroll_lines WHERE segment_id = 'seg-noprep';").stdout.strip().splitlines()[-1]
        assert noprep_line == f"1800|275000|{ot_noprep_id}", f"Unexpected pre-prep incorporation: {noprep_line}"

        for label, req_id, expected_err in [
            ("voided_line", ot_voided_id, "C515_OT_PAYROLL_LINE_VOIDED"),
            ("locked_with_line", ot_locked_id, "C515_OT_PAYROLL_PERIOD_LOCKED"),
            ("locked_without_line", ot_locked_np_id, "C515_OT_PAYROLL_PERIOD_LOCKED"),
        ]:
            res = psql("rc19_w4_test_runtime", f"""
            BEGIN;
            {actor_context_sql(admin1_auth)}
            SELECT * FROM public.rc19_c515_decide_overtime_request({q(req_id)}::uuid, 1, 'admin_confirm', {q('Fail closed ' + label)}, gen_random_uuid());
            COMMIT;
            """, expect=None)
            assert res.returncode != 0 and expected_err in res.stdout, f"{label}: expected {expected_err}, got {res.stdout}"

        # Test R1: Role & RLS negative tests using real authenticated / anon roles
        anon_deny = psql("rc19_w4_test_runtime", f"SET ROLE anon; SELECT * FROM public.rc19_c515_decide_overtime_request({q(ot_round_id)}::uuid, 1, 'admin_confirm', 'Anon denied check', gen_random_uuid());", expect=None)
        assert anon_deny.returncode != 0 and "permission denied" in anon_deny.stdout.lower()

        direct_ot_deny = psql("rc19_w4_test_runtime", f"BEGIN; {actor_context_sql(staff1_auth)} SELECT * FROM public.workforce_overtime_requests;", expect=None)
        assert direct_ot_deny.returncode != 0 and "permission denied" in direct_ot_deny.stdout.lower(), direct_ot_deny.stdout

        payroll_rls_zero = psql("rc19_w4_test_runtime", f"BEGIN; {actor_context_sql(staff1_auth)} SELECT count(*) FROM public.workforce_payroll_lines;", expect=None)
        assert payroll_rls_zero.returncode == 0 and "0" in payroll_rls_zero.stdout.splitlines(), payroll_rls_zero.stdout

        member_rpc_deny = psql("rc19_w4_test_runtime", f"BEGIN; {actor_context_sql(staff1_auth)} SELECT * FROM public.rc19_c515_decide_overtime_request({q(ot_round_id)}::uuid, 1, 'admin_confirm', 'Member denied check', gen_random_uuid());", expect=None)
        assert member_rpc_deny.returncode != 0 and "C515_OT_ACTOR_FORBIDDEN" in member_rpc_deny.stdout, member_rpc_deny.stdout

        leader_other_brand_deny = psql("rc19_w4_test_runtime", f"BEGIN; {actor_context_sql(leader2_auth)} SELECT * FROM public.rc19_c515_decide_overtime_request({q(ot_round_id)}::uuid, 1, 'leader_preapprove', 'Wrong brand denied check', gen_random_uuid());", expect=None)
        assert leader_other_brand_deny.returncode != 0 and "C515_OT_BRAND_SCOPE_DENIED" in leader_other_brand_deny.stdout, leader_other_brand_deny.stdout

        # Test R2: Forced failure rollback verification
        psql("rc19_w4_test_runtime", f"""
        BEGIN;
        {actor_context_sql(admin1_auth)}
        SELECT * FROM public.rc19_c515_decide_overtime_request({q(ot_round_id)}::uuid, 1, 'admin_confirm', 'Temporary confirm before forced rollback', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'::uuid);
        ROLLBACK;
        """, tuples_only=False)
        rb_state = psql("rc19_w4_test_runtime", f"SELECT r.state || '|' || r.version || '|' || l.gross_vnd || '|' || l.version FROM public.workforce_overtime_requests r JOIN public.workforce_payroll_lines l ON l.segment_id = r.segment_id WHERE r.id = {q(ot_round_id)}::uuid;").stdout.strip().splitlines()[-1]
        assert rb_state == "pending_admin_confirmation|1|100028|1", f"Rollback failed! state={rb_state}"

        # Test R3: VND Half-Up Rounding (3600 regular + 1s @ 1.5x OT = 100041.666... -> 100042)
        psql("rc19_w4_test_runtime", f"""
        BEGIN;
        {actor_context_sql(admin1_auth)}
        SELECT * FROM public.rc19_c515_decide_overtime_request({q(ot_round_id)}::uuid, 1, 'admin_confirm', 'Confirm 1s OT for VND rounding parity', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002'::uuid);
        COMMIT;
        """, tuples_only=False)
        round_state = psql("rc19_w4_test_runtime", "SELECT overtime_seconds || '|' || gross_vnd || '|' || net_vnd || '|' || version FROM public.workforce_payroll_lines WHERE id = 'ln-round';").stdout.strip().splitlines()[-1]
        assert round_state == "1|100042|100042|2", f"VND rounding mismatch: {round_state}"

        # Test R4: Two-connection concurrency (Session A transitions per-race to reviewed while Session B tries admin_confirm OT)
        race_results: dict[str, str] = {}

        def tx_transition_period() -> None:
            res = psql("rc19_w4_test_runtime", """
            BEGIN;
            SELECT * FROM public.workforce_rc16_transition_payroll('per-race', 'draft', 'reviewed', 'u-admin1', 'Concurrent review holds period lock');
            SELECT pg_sleep(0.6);
            COMMIT;
            """, expect=None, tuples_only=False)
            race_results["tx_transition"] = f"exit={res.returncode} out={res.stdout.strip()}"

        def tx_confirm_ot_during_lock() -> None:
            time.sleep(0.15)
            res = psql("rc19_w4_test_runtime", f"""
            BEGIN;
            {actor_context_sql(admin1_auth)}
            SELECT * FROM public.rc19_c515_decide_overtime_request({q(ot_race1_id)}::uuid, 1, 'admin_confirm', 'Concurrent OT confirm waits then fails on locked/reviewed period', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000003'::uuid);
            COMMIT;
            """, expect=None, tuples_only=False)
            race_results["tx_confirm_ot"] = f"exit={res.returncode} out={res.stdout.strip()}"

        t1 = threading.Thread(target=tx_transition_period)
        t2 = threading.Thread(target=tx_confirm_ot_during_lock)
        t1.start()
        t2.start()
        t1.join()
        t2.join()
        assert "exit=0" in race_results["tx_transition"], race_results
        assert "C515_OT_PAYROLL_PERIOD_LOCKED" in race_results["tx_confirm_ot"], race_results

        race1_db = psql("rc19_w4_test_runtime", f"SELECT r.state || '|' || l.overtime_seconds || '|' || l.gross_vnd || '|' || p.status FROM public.workforce_overtime_requests r JOIN public.workforce_payroll_lines l ON l.segment_id = r.segment_id JOIN public.workforce_payroll_periods p ON p.id = l.period_id WHERE r.id = {q(ot_race1_id)}::uuid;").stdout.strip().splitlines()[-1]
        assert race1_db == "pending_admin_confirmation|0|250000|reviewed", f"Unexpected concurrent lock invariant state: {race1_db}"

        # Test R5: Concurrent decisions on same OT request (admin_confirm vs reject with expected_version=1 after per-race still non-draft? Wait: per-race is now reviewed, so move a fresh draft line or test concurrent reject vs reject!)
        # Add another draft shift for decision-vs-decision race cleanly:
        psql("rc19_w4_test_runtime", """
        SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
        SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
        INSERT INTO public.shifts (id, brand_id, platform_id, date, start_time, end_time, status, required_technical_count)
        VALUES ('sh-race3', 'brand-a', 'plat-a', '2026-11-19', '15:00:00', '17:30:00', 'completed', 1);
        INSERT INTO public.reports (id, shift_id, submitted_by, status, metrics_confirmed) VALUES ('rp-race3', 'sh-race3', 'u-staff1', 'confirmed', true);
        INSERT INTO public.live_report_images (id, report_id, category, file_url, file_name, mime_type, size_bytes, uploaded_by, provider, external_file_id, external_parent_id, checksum_sha256)
        VALUES ('kv-race3', 'rp-race3', 'key_visual', 'https://drive.google.com/file/d/drive-kv-104', 'kv-race3.jpg', 'image/jpeg', 1024, 'u-admin1', 'google_drive', 'drive-kv-104', 'drive-parent-1', repeat('d', 64));
        INSERT INTO public.operational_files (id, scope_key, category, brand_id, platform_id, shift_id, period_date, execution_source, provider, external_file_id, external_parent_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, integrity_status, artifact_key, uploaded_by)
        VALUES ('ev-race3', 'reports.review', 'live_snapshot', 'brand-a', 'plat-a', 'sh-race3', '2026-11-19', 'internal', 'google_drive', 'drive-ev-104', 'drive-parent-1', 'ev/4', 'ev4.png', 'image/png', 1024, repeat('4', 64), 'sha256_verified', 'art-race3', 'u-admin1');
        INSERT INTO public.workforce_actual_segments (id, shift_id, staff_id, operational_role, event_kind, actual_start_at, actual_end_at, evidence_note, created_by, review_status)
        VALUES ('seg-race3', 'sh-race3', 'u-staff1', 'technical', 'worked', '2026-11-19T08:00:00Z', '2026-11-19T10:30:00Z', 'Decision vs decision draft race', 'u-leader1', 'draft');
        UPDATE public.workforce_actual_segments SET review_status = 'approved', reviewed_by = 'u-admin1', reviewed_at = now(), review_note = 'Approved draft race segment', version = 2 WHERE id = 'seg-race3';
        INSERT INTO public.workforce_payroll_segment_decisions (segment_id, state, reviewed_by, preapproved_by, confirmed_by, confirmed_at, reason, missing_evidence, segment_version)
        VALUES ('seg-race3', 'admin_confirmed', 'u-admin1', 'u-leader1', 'u-admin2', now(), 'Approved payroll gate for draft race', '{}', 2);
        INSERT INTO public.workforce_payroll_periods (id, period_start, period_end, status, created_by) VALUES ('per-race3', '2026-11-19', '2026-11-19', 'draft', 'u-admin2');
        INSERT INTO public.workforce_payroll_lines (id, period_id, segment_id, rate_card_id, staff_id, operational_role, actual_minutes, payable_minutes, overtime_minutes, actual_seconds, payable_seconds, overtime_seconds, rate_vnd_per_hour, overtime_multiplier_basis_points, gross_vnd, calculation_version)
        VALUES ('ln-race3', 'per-race3', 'seg-race3', 'rc-tech', 'u-staff1', 'technical', 150, 150, 0, 9000, 9000, 0, 100000, 15000, 250000, 'rc19-seconds-v1');
        """, tuples_only=False)
        ot_race3_id = request_ot(leader1_auth, "seg-race3", "2026-11-19T10:00:00Z", "2026-11-19T10:30:00Z", "Concurrent admin confirm vs reject race", "ev-race3", "aaaaaaaa-aaaa-4aaa-8aaa-000000000004")

        decision_race: dict[str, tuple[int, str]] = {}

        def tx_admin_confirm() -> None:
            res = psql("rc19_w4_test_runtime", f"""
            BEGIN;
            {actor_context_sql(admin1_auth)}
            SELECT state FROM public.rc19_c515_decide_overtime_request({q(ot_race3_id)}::uuid, 1, 'admin_confirm', 'Admin1 wins race confirm', 'cccccccc-cccc-4ccc-8ccc-000000000001'::uuid);
            SELECT pg_sleep(0.4);
            COMMIT;
            """, expect=None, tuples_only=False)
            decision_race["confirm"] = (res.returncode, res.stdout)

        def tx_admin_reject() -> None:
            time.sleep(0.1)
            res = psql("rc19_w4_test_runtime", f"""
            BEGIN;
            {actor_context_sql(admin2_auth)}
            SELECT state FROM public.rc19_c515_decide_overtime_request({q(ot_race3_id)}::uuid, 1, 'reject', 'Admin2 concurrent reject loses race', 'cccccccc-cccc-4ccc-8ccc-000000000002'::uuid);
            COMMIT;
            """, expect=None, tuples_only=False)
            decision_race["reject"] = (res.returncode, res.stdout)

        d1 = threading.Thread(target=tx_admin_confirm)
        d2 = threading.Thread(target=tx_admin_reject)
        d1.start()
        d2.start()
        d1.join()
        d2.join()
        assert decision_race["confirm"][0] == 0 and decision_race["reject"][0] != 0
        assert "C515_OT_STALE_REQUEST" in decision_race["reject"][1]

        # Test R6: Terminal rejection check on ot_race3_id with current version=2 and clean rejection + from_state audit check
        term_reject = psql("rc19_w4_test_runtime", f"""
        BEGIN;
        {actor_context_sql(admin2_auth)}
        SELECT state FROM public.rc19_c515_decide_overtime_request({q(ot_race3_id)}::uuid, 2, 'reject', 'Late reject on confirmed OT', 'cccccccc-cccc-4ccc-8ccc-000000000003'::uuid);
        COMMIT;
        """, expect=None, tuples_only=False)
        assert term_reject.returncode != 0 and "C515_OT_INVALID_TRANSITION" in term_reject.stdout

        rej_out = psql("rc19_w4_test_runtime", f"""
        BEGIN;
        {actor_context_sql(admin1_auth)}
        SELECT state || '|' || version FROM public.rc19_c515_decide_overtime_request({q(ot_race2_id)}::uuid, 1, 'reject', 'Admin1 rejects unconfirmed OT', 'dddddddd-dddd-4ddd-8ddd-000000000001'::uuid);
        COMMIT;
        """).stdout.strip()
        assert "rejected|2" in rej_out, rej_out

        rej_ev = psql("rc19_w4_test_runtime", f"SELECT from_state || '|' || to_state || '|' || action FROM public.workforce_overtime_request_events WHERE request_id = {q(ot_race2_id)}::uuid AND action = 'rejected';").stdout.strip().splitlines()[-1]
        assert rej_ev == "pending_admin_confirmation|rejected|rejected", f"Unexpected reject audit event: {rej_ev}"

        dbl_reject = psql("rc19_w4_test_runtime", f"""
        BEGIN;
        {actor_context_sql(admin2_auth)}
        SELECT state FROM public.rc19_c515_decide_overtime_request({q(ot_race2_id)}::uuid, 2, 'reject', 'Second reject on rejected OT must fail', 'dddddddd-dddd-4ddd-8ddd-000000000002'::uuid);
        COMMIT;
        """, expect=None, tuples_only=False)
        assert dbl_reject.returncode != 0 and "C515_OT_INVALID_TRANSITION" in dbl_reject.stdout

        # Test R7: Confirm-before-lock two-connection concurrency (Session A confirms OT first, sleeps; Session B blocks then transitions to reviewed)
        psql("rc19_w4_test_runtime", """
        SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
        SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
        INSERT INTO public.shifts (id, brand_id, platform_id, date, start_time, end_time, status, required_technical_count)
        VALUES ('sh-race4', 'brand-a', 'plat-a', '2026-11-20', '15:00:00', '17:30:00', 'completed', 1);
        INSERT INTO public.reports (id, shift_id, submitted_by, status, metrics_confirmed) VALUES ('rp-race4', 'sh-race4', 'u-staff1', 'confirmed', true);
        INSERT INTO public.live_report_images (id, report_id, category, file_url, file_name, mime_type, size_bytes, uploaded_by, provider, external_file_id, external_parent_id, checksum_sha256)
        VALUES ('kv-race4', 'rp-race4', 'key_visual', 'https://drive.google.com/file/d/drive-kv-109', 'kv-race4.jpg', 'image/jpeg', 1024, 'u-admin1', 'google_drive', 'drive-kv-109', 'drive-parent-1', repeat('a', 64));
        INSERT INTO public.operational_files (id, scope_key, category, brand_id, platform_id, shift_id, period_date, execution_source, provider, external_file_id, external_parent_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, integrity_status, artifact_key, uploaded_by)
        VALUES ('ev-race4', 'reports.review', 'live_snapshot', 'brand-a', 'plat-a', 'sh-race4', '2026-11-20', 'internal', 'google_drive', 'drive-ev-109', 'drive-parent-1', 'ev/9', 'ev9.png', 'image/png', 1024, repeat('9', 64), 'sha256_verified', 'art-race4', 'u-admin1');
        INSERT INTO public.workforce_actual_segments (id, shift_id, staff_id, operational_role, event_kind, actual_start_at, actual_end_at, evidence_note, created_by, review_status)
        VALUES ('seg-race4', 'sh-race4', 'u-staff1', 'technical', 'worked', '2026-11-20T08:00:00Z', '2026-11-20T10:30:00Z', 'Confirm before lock race', 'u-leader1', 'draft');
        UPDATE public.workforce_actual_segments SET review_status = 'approved', reviewed_by = 'u-admin1', reviewed_at = now(), review_note = 'Approved confirm-before-lock race segment', version = 2 WHERE id = 'seg-race4';
        INSERT INTO public.workforce_payroll_segment_decisions (segment_id, state, reviewed_by, preapproved_by, confirmed_by, confirmed_at, reason, missing_evidence, segment_version)
        VALUES ('seg-race4', 'admin_confirmed', 'u-admin1', 'u-leader1', 'u-admin2', now(), 'Approved payroll gate for confirm-before-lock race', '{}', 2);
        INSERT INTO public.workforce_payroll_periods (id, period_start, period_end, status, created_by) VALUES ('per-race4', '2026-11-20', '2026-11-20', 'draft', 'u-admin2');
        INSERT INTO public.workforce_payroll_lines (id, period_id, segment_id, rate_card_id, staff_id, operational_role, actual_minutes, payable_minutes, overtime_minutes, actual_seconds, payable_seconds, overtime_seconds, rate_vnd_per_hour, overtime_multiplier_basis_points, gross_vnd, calculation_version)
        VALUES ('ln-race4', 'per-race4', 'seg-race4', 'rc-tech', 'u-staff1', 'technical', 150, 150, 0, 9000, 9000, 0, 100000, 15000, 250000, 'rc19-seconds-v1');
        """, tuples_only=False)
        ot_race4_id = request_ot(leader1_auth, "seg-race4", "2026-11-20T10:00:00Z", "2026-11-20T10:30:00Z", "Confirm before lock race", "ev-race4", "aaaaaaaa-aaaa-4aaa-8aaa-000000000009")

        confirm_before_lock: dict[str, tuple[int, str]] = {}

        def tx_confirm_first() -> None:
            res = psql("rc19_w4_test_runtime", f"""
            BEGIN;
            {actor_context_sql(admin1_auth)}
            SELECT state FROM public.rc19_c515_decide_overtime_request({q(ot_race4_id)}::uuid, 1, 'admin_confirm', 'Confirm before period lock holds period lock', 'dddddddd-dddd-4ddd-8ddd-000000000003'::uuid);
            SELECT pg_sleep(0.45);
            COMMIT;
            """, expect=None, tuples_only=False)
            confirm_before_lock["confirm"] = (res.returncode, res.stdout)

        def tx_transition_after() -> None:
            time.sleep(0.1)
            res = psql("rc19_w4_test_runtime", """
            BEGIN;
            SELECT * FROM public.workforce_rc16_transition_payroll('per-race4', 'draft', 'reviewed', 'u-admin1', 'Transition waits for confirm lock');
            COMMIT;
            """, expect=None, tuples_only=False)
            confirm_before_lock["transition"] = (res.returncode, res.stdout)

        c1 = threading.Thread(target=tx_confirm_first)
        c2 = threading.Thread(target=tx_transition_after)
        c1.start()
        c2.start()
        c1.join()
        c2.join()
        assert confirm_before_lock["confirm"][0] == 0 and confirm_before_lock["transition"][0] == 0, confirm_before_lock
        race4_db = psql("rc19_w4_test_runtime", f"SELECT r.state || '|' || l.overtime_seconds || '|' || l.gross_vnd || '|' || p.status FROM public.workforce_overtime_requests r JOIN public.workforce_payroll_lines l ON l.segment_id = r.segment_id JOIN public.workforce_payroll_periods p ON p.id = l.period_id WHERE r.id = {q(ot_race4_id)}::uuid;").stdout.strip().splitlines()[-1]
        assert race4_db == "admin_confirmed|1800|275000|reviewed", f"Unexpected confirm-before-lock invariant state: {race4_db}"

        # Record summary JSON evidence
        evidence = {
            "result": "PASS",
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "postgres_server_version_num": version_num,
            "endpoint": f"{PGHOST}:{PGPORT}",
            "database_marker": DB_MARKER,
            "stepwise_schema_dump_sha256": sha_stepwise,
            "manifest_schema_dump_sha256": sha_manifest,
            "schema_parity_match": sha_stepwise == sha_manifest,
            "ledger_parity_match": ledger_stepwise == ledger_manifest,
            "candidate_migration_count": len(CANDIDATE_MIGRATIONS),
            "checks": {
                "duplicate_receipt_fail_closed": True,
                "manifest_replay_precheck_fail_closed": True,
                "forced_tx_rollback": "PASS (reverted OT & payroll line cleanly)",
                "vnd_half_up_rounding_3601s_1s_ot": f"PASS ({round_state})",
                "rls_and_role_permissions": "PASS (anon/authenticated direct read denied; cross-brand leader denied)",
                "a1_pre_prep_confirm_and_auto_calculate": f"PASS ({noprep_line})",
                "a1_locked_and_voided_fail_closed": "PASS (voided_line, locked_with_line, locked_without_line)",
                "a2_leader_idempotency_and_conflict": "PASS (1 event on retry; conflicting reason denied)",
                "a3_terminal_rejection_and_from_state": f"PASS ({rej_ev}; terminal reject C515_OT_INVALID_TRANSITION)",
                "concurrent_period_lock_vs_admin_confirm": f"PASS ({race1_db})",
                "concurrent_confirm_before_lock": f"PASS ({race4_db})",
                "concurrent_admin_confirm_vs_reject": "PASS (winner committed, loser C515_OT_STALE_REQUEST)",
            },
        }
        ev_file = EVIDENCE_DIR / "disposable-pg17-rehearsal.json"
        ev_file.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
        print(f"DISPOSABLE_PG17_REHEARSAL_PASS pg={version_num} schema_sha256={sha_manifest} evidence={ev_file.relative_to(ROOT)}")
        return 0
    finally:
        stop_disposable_cluster()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
