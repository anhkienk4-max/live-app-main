#!/usr/bin/env python3
"""Bootstrap isolated GoTrue migrations, then serve a marked native C5.11 database."""
from __future__ import annotations

import json
import os
import secrets
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import quote

ROOT = Path("/home/anhkienk4/.local/share/rc19-c511-native")
PGHOST = str(ROOT)
PGPORT = "55439"
AUTH_PORT = 15544
REST_PORT = 15545
MARKER = "CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY"
AUTH = ROOT / "bin/auth"
REST = ROOT / "bin/postgrest"
CONFIG = ROOT / "runtime.json"
DB_PASS = ROOT / "database.pass"


def psql(database: str, sql: str) -> str:
    return subprocess.run(
        ["psql", "-h", PGHOST, "-p", PGPORT, "-U", "postgres", "-d", database,
         "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
        check=True, capture_output=True, text=True, timeout=30,
    ).stdout.strip()


def verify_cluster() -> None:
    identity = psql("postgres", "select current_setting('server_version_num')||'|'||current_setting('data_directory')||'|'||current_setting('listen_addresses')||'|'||current_setting('port')")
    if identity != f"170011|{ROOT}/pgdata|127.0.0.1|{PGPORT}":
        raise RuntimeError("REFUSED_NATIVE_PG_IDENTITY:" + identity)


def configure_roles() -> str:
    password = DB_PASS.read_text(encoding="ascii").strip() if DB_PASS.exists() else secrets.token_hex(32)
    if not DB_PASS.exists():
        DB_PASS.write_text(password, encoding="ascii")
        DB_PASS.chmod(0o600)
    psql("postgres", """
    DO $$ BEGIN
      CREATE ROLE anon NOLOGIN NOINHERIT;
      EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE authenticated NOLOGIN NOINHERIT;
      EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
      EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE authenticator NOLOGIN NOINHERIT;
      EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE supabase_auth_admin LOGIN NOINHERIT BYPASSRLS;
      EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE supabase_admin LOGIN SUPERUSER;
      EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    """)
    psql("postgres", f"ALTER ROLE supabase_auth_admin LOGIN PASSWORD '{password}'; ALTER ROLE supabase_auth_admin SET search_path TO auth, public; ALTER ROLE authenticator LOGIN PASSWORD '{password}'; GRANT anon, authenticated, service_role TO authenticator; GRANT ALL ON DATABASE postgres TO supabase_auth_admin; CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin; GRANT ALL ON SCHEMA auth TO supabase_auth_admin; COMMENT ON DATABASE postgres IS '{MARKER}';")
    return password


def auth_env(database: str, password: str, jwt_secret: str) -> dict[str, str]:
    return {
        "API_EXTERNAL_URL": f"http://127.0.0.1:{AUTH_PORT}",
        "GOTRUE_API_HOST": "127.0.0.1", "GOTRUE_API_PORT": str(AUTH_PORT),
        "GOTRUE_DB_DATABASE_URL": f"postgres://supabase_auth_admin:{quote(password, safe='')}@127.0.0.1:{PGPORT}/{database}",
        "GOTRUE_DB_DRIVER": "postgres", "GOTRUE_DB_DB_NAMESPACE": "auth", "GOTRUE_DB_MAX_IDLE_POOL_SIZE": "5",
        "GOTRUE_DB_MAX_POOL_SIZE": "10", "GOTRUE_DISABLE_SIGNUP": "false",
        "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true", "GOTRUE_EXTERNAL_PHONE_ENABLED": "false",
        "GOTRUE_JWT_ADMIN_ROLES": "service_role,supabase_admin",
        "GOTRUE_JWT_AUD": "authenticated", "GOTRUE_JWT_DEFAULT_GROUP_NAME": "authenticated",
        "GOTRUE_JWT_EXP": "3600", "GOTRUE_JWT_ISSUER": f"http://127.0.0.1:{AUTH_PORT}",
        "GOTRUE_JWT_SECRET": jwt_secret, "GOTRUE_MAILER_AUTOCONFIRM": "true",
        "GOTRUE_SITE_URL": "http://127.0.0.1:3000",
    }


def wait_health(url: str) -> None:
    for _ in range(45):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(1)
    raise RuntimeError("GOTRUE_HEALTH_TIMEOUT")


def start_auth(database: str, password: str, jwt_secret: str, log_path: Path) -> subprocess.Popen:
    log = log_path.open("ab")
    proc = subprocess.Popen([str(AUTH)], env={**os.environ, **auth_env(database, password, jwt_secret)},
                            stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                            start_new_session=True)
    try:
        wait_health(f"http://127.0.0.1:{AUTH_PORT}/health")
    except Exception:
        proc.terminate()
        raise
    return proc


def sign(secret: str, claims: dict) -> str:
    import base64
    import hashlib
    import hmac
    def enc(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")
    header = enc(b'{"alg":"HS256","typ":"JWT"}')
    body = enc(json.dumps(claims, separators=(",", ":")).encode())
    signature = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{enc(signature)}"


def stop_owned_runtime() -> None:
    if not CONFIG.exists():
        return
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if (config.get("runtime_marker") != MARKER or
            config.get("pg_data_directory") != str(ROOT / "pgdata")):
        raise RuntimeError("REFUSED_UNVERIFIED_NATIVE_RUNTIME_CLEANUP")
    for name, expected in (("auth_pid", AUTH), ("rest_pid", REST)):
        pid = config.get(name)
        if not isinstance(pid, int) or pid <= 1:
            continue
        proc = Path(f"/proc/{pid}")
        try:
            if (proc.stat().st_uid != os.getuid() or
                    Path(f"/proc/{pid}/exe").resolve() != expected.resolve()):
                continue
            os.kill(pid, signal.SIGTERM)
            for _ in range(50):
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError("NATIVE_RUNTIME_PROCESS_DID_NOT_STOP:" + name)
        except FileNotFoundError:
            continue
    print("OWNED_AUTH_POSTGREST_PROCESSES_STOPPED")


def main() -> None:
    if len(sys.argv) not in {2, 3} or sys.argv[1] not in {"bootstrap", "serve", "stop"}:
        raise RuntimeError("USAGE: start-c5.11-native-runtime.py bootstrap|serve|stop [marked-database]")
    if ((sys.argv[1] in {"bootstrap", "stop"} and len(sys.argv) != 2) or
            (sys.argv[1] == "serve" and len(sys.argv) != 3)):
        raise RuntimeError("USAGE: start-c5.11-native-runtime.py bootstrap|serve|stop [marked-database]")
    verify_cluster()
    if sys.argv[1] == "stop":
        stop_owned_runtime()
        return
    with socket.socket() as sock:
        if sock.connect_ex(("127.0.0.1", AUTH_PORT)) == 0:
            raise RuntimeError("REFUSED_AUTH_PORT_IN_USE")
    password = configure_roles()
    if sys.argv[1] == "bootstrap":
        proc = start_auth("postgres", password, secrets.token_urlsafe(64), ROOT / "logs/auth-bootstrap.log")
        proc.terminate()
        proc.wait(timeout=10)
        if psql("postgres", "select count(*) from auth.users") != "0":
            raise RuntimeError("REFUSED_BOOTSTRAP_CREATED_USERS")
        print("AUTH_SCHEMA_BOOTSTRAP=PASS")
        return

    database = sys.argv[2] if len(sys.argv) > 2 else ""
    if not database.startswith("rc19_c511_e2e_"):
        raise RuntimeError("REFUSED_UNMARKED_TARGET_DATABASE_NAME")
    identity = psql(database, "select current_setting('server_version_num')||'|'||current_database()||'|'||coalesce(shobj_description(oid,'pg_database'),'')||'|'||(select count(*) from auth.users)||'|'||(select count(*) from storage.objects)||'|'||(select count(*) from public.shift_staffing_segments) from pg_database where datname=current_database()")
    parts = identity.split("|")
    if len(parts) != 6 or parts[1] != database or parts[2] != MARKER or parts[3:5] != ["0", "0"]:
        raise RuntimeError("REFUSED_TARGET_DATABASE_IDENTITY:" + identity)
    if AUTH_PORT == REST_PORT:
        raise RuntimeError("REFUSED_DUPLICATE_LOOPBACK_PORT")
    for port in (AUTH_PORT, REST_PORT):
        with socket.socket() as sock:
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                raise RuntimeError("REFUSED_LOOPBACK_PORT_IN_USE:" + str(port))
    jwt_secret = secrets.token_urlsafe(64)
    auth_log = ROOT / "logs/auth.log"
    rest_log = ROOT / "logs/postgrest.log"
    auth = start_auth(database, password, jwt_secret, auth_log)
    rest_env = {
        "PGRST_DB_URI": f"postgres://authenticator:{quote(password, safe='')}@127.0.0.1:{PGPORT}/{database}?options={quote('-c statement_timeout=120s', safe='')}",
        "PGRST_JWT_SECRET": jwt_secret, "PGRST_DB_SCHEMAS": "public",
        "PGRST_DB_ANON_ROLE": "anon", "PGRST_DB_EXTRA_SEARCH_PATH": "public,extensions",
        "PGRST_SERVER_HOST": "127.0.0.1", "PGRST_SERVER_PORT": str(REST_PORT),
    }
    rest_file = rest_log.open("ab")
    rest = subprocess.Popen([str(REST)], env={**os.environ, **rest_env}, stdin=subprocess.DEVNULL,
                            stdout=rest_file, stderr=subprocess.STDOUT, start_new_session=True)
    anon = sign(jwt_secret, {"iss":"supabase","aud":"authenticated","iat":int(time.time()),"exp":int(time.time())+3600,"role":"anon"})
    req = urllib.request.Request(f"http://127.0.0.1:{REST_PORT}/business_users?select=id&limit=0",
                                 headers={"apikey":anon,"Authorization":f"Bearer {anon}"})
    for _ in range(60):
        try:
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    break
        except urllib.error.HTTPError as exc:
            if exc.code >= 500:
                time.sleep(1)
                continue
            raise
        except Exception:
            time.sleep(1)
    else:
        auth.terminate()
        rest.terminate()
        raise RuntimeError("POSTGREST_HEALTH_TIMEOUT")
    now = int(time.time())
    config = {
        "database":database,"database_identity":identity,"auth_url":f"http://127.0.0.1:{AUTH_PORT}",
        "rest_url":f"http://127.0.0.1:{REST_PORT}","auth_port":AUTH_PORT,"rest_port":REST_PORT,
        "local_jwt_secret":jwt_secret,"anon_key":anon,
        "service_role_key":sign(jwt_secret,{"iss":"supabase","aud":"authenticated","iat":now,"exp":now+3600,"role":"service_role"}),
        "test_password":secrets.token_urlsafe(24),"ports_loopback_only":True,"auth_users":0,"storage_objects":0,
        "auth_pid":auth.pid,"rest_pid":rest.pid,"pg_data_directory":str(ROOT/"pgdata"),"pg_port":int(PGPORT),
        "runtime_marker":MARKER,"component_versions":{"gotrue":"v2.197.0","postgrest":"v16.5","postgres":"17.11"},
    }
    CONFIG.write_text(json.dumps(config),encoding="utf-8")
    CONFIG.chmod(0o600)
    print(json.dumps({"result":"PASS","database":database,"database_identity":identity,
                      "auth_url":config["auth_url"],"rest_url":config["rest_url"],
                      "loopback_only":True,"config_file":str(CONFIG)}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
