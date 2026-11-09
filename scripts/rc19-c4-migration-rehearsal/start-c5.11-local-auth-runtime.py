#!/usr/bin/env python3
"""Start loopback-only Auth/PostgREST containers against one marked local C5.11 DB."""
from __future__ import annotations

import json
import os
import re
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

DB_CONTAINER = "supabase_db_rc19-supabase-recovery"
AUTH_CONTAINER = "supabase_auth_rc19-supabase-recovery"
REST_CONTAINER = "supabase_rest_rc19-supabase-recovery"
MARKER = "CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY"
NETWORK = "rc19-recovery-local"
AUTH_PORT = 15543
REST_PORT = 15542
ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / f"rc19-c511-local-runtime-{uuid.uuid4().hex}.json"


def docker_json(*args: str) -> dict | list:
    result = subprocess.run(["docker", *args], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def inspect(name: str) -> dict:
    return docker_json("inspect", name)[0]


def container_env(name: str) -> dict[str, str]:
    return dict(item.split("=", 1) for item in inspect(name)["Config"]["Env"])


def database_query(database: str, sql: str) -> str:
    return subprocess.run(
        ["docker", "exec", DB_CONTAINER, "psql", "-X", "-U", "postgres", "-d", database,
         "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def local_uri(template: str, database: str) -> str:
    parsed = urllib.parse.urlsplit(template)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.username or not parsed.password:
        raise RuntimeError("LOCAL_DATABASE_URI_SHAPE_INVALID")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "/" + database, parsed.query, parsed.fragment))


def available(port: int) -> bool:
    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) != 0


def run_container(name: str, image: str, env: dict[str, str], port: int, internal_port: int) -> None:
    fd, env_path = tempfile.mkstemp(prefix="c511-env-")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            for key, value in env.items():
                if "\n" in value or "\r" in value:
                    raise RuntimeError("LOCAL_ENV_VALUE_INVALID")
                stream.write(f"{key}={value}\n")
        subprocess.run(
            ["docker", "run", "-d", "--name", name, "--network", NETWORK,
             "-p", f"127.0.0.1:{port}:{internal_port}", "--env-file", env_path, image],
            capture_output=True, text=True, check=True,
        )
    finally:
        Path(env_path).unlink(missing_ok=True)


def wait_health(url: str, expected: int = 200) -> None:
    deadline = time.time() + 45
    last = 0
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                last = response.status
                if last == expected:
                    return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f"LOCAL_AUTH_SERVICE_UNHEALTHY:{last}")


def b64url(raw: bytes) -> str:
    import base64
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def sign(secret: str, claims: dict) -> str:
    import base64
    import hashlib
    import hmac
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64url(json.dumps(claims, separators=(",", ":")).encode())
    signature = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{b64url(signature)}"


def main() -> None:
    if len(os.sys.argv) != 2:
        raise RuntimeError("USAGE: start-c5.11-local-auth-runtime.py <marked-database>")
    database = os.sys.argv[1]
    identity = database_query("postgres", "select current_setting('server_version_num')||'|'||current_database()||'|'||coalesce(shobj_description(oid,'pg_database'),'') from pg_database where datname='postgres'")
    target = database_query(database, "select current_setting('server_version_num')||'|'||current_database()||'|'||coalesce(shobj_description(oid,'pg_database'),'')||'|'||(select count(*) from auth.users)||'|'||(select count(*) from storage.objects)||'|'||(select count(*) from public.shift_staffing_segments) from pg_database where datname=current_database()")
    parts = target.split("|")
    if MARKER not in identity or len(parts) != 6 or parts[1] != database or parts[2] != MARKER:
        raise RuntimeError("REFUSED_WRONG_LOCAL_DATABASE_IDENTITY")
    if not (170000 <= int(parts[0]) < 180000) or parts[3:5] != ["0", "0"]:
        raise RuntimeError("REFUSED_DATABASE_VERSION_OR_NONEMPTY_TEST_DATA")
    if not available(AUTH_PORT) or not available(REST_PORT):
        raise RuntimeError("REFUSED_LOOPBACK_PORT_IN_USE")

    auth_source = inspect(AUTH_CONTAINER)
    rest_source = inspect(REST_CONTAINER)
    auth_source_env = container_env(AUTH_CONTAINER)
    rest_source_env = container_env(REST_CONTAINER)
    auth_db_uri = local_uri(auth_source_env["GOTRUE_DB_DATABASE_URL"], database)
    rest_db_uri = local_uri(rest_source_env["PGRST_DB_URI"], database)
    jwt_secret = secrets.token_urlsafe(64)
    auth_name = "c511_auth_" + uuid.uuid4().hex[:10]
    rest_name = "c511_rest_" + uuid.uuid4().hex[:10]

    auth_env = {
        "API_EXTERNAL_URL": f"http://127.0.0.1:{AUTH_PORT}",
        "GOTRUE_API_HOST": "0.0.0.0",
        "GOTRUE_API_PORT": "9999",
        "GOTRUE_DB_DATABASE_URL": auth_db_uri,
        "GOTRUE_DB_DRIVER": "postgres",
        "GOTRUE_DB_MAX_IDLE_POOL_SIZE": "5",
        "GOTRUE_DB_MAX_POOL_SIZE": "10",
        "GOTRUE_DISABLE_SIGNUP": "false",
        "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true",
        "GOTRUE_EXTERNAL_PHONE_ENABLED": "false",
        "GOTRUE_JWT_ADMIN_ROLES": "service_role,supabase_admin",
        "GOTRUE_JWT_AUD": "authenticated",
        "GOTRUE_JWT_DEFAULT_GROUP_NAME": "authenticated",
        "GOTRUE_JWT_EXP": "3600",
        "GOTRUE_JWT_ISSUER": f"http://127.0.0.1:{AUTH_PORT}",
        "GOTRUE_JWT_SECRET": jwt_secret,
        "GOTRUE_MAILER_AUTOCONFIRM": "true",
        "GOTRUE_SITE_URL": "http://127.0.0.1:3000",
    }
    rest_env = {key: value for key, value in rest_source_env.items()
                if key.startswith("PGRST_") and key not in {"PGRST_DB_URI", "PGRST_JWT_SECRET"}}
    rest_env.update({"PGRST_DB_URI": rest_db_uri, "PGRST_JWT_SECRET": jwt_secret,
                     "PGRST_DB_SCHEMAS": "public",
                     "PGRST_SERVER_HOST": "0.0.0.0", "PGRST_SERVER_PORT": "3000"})

    try:
        run_container(auth_name, auth_source["Config"]["Image"], auth_env, AUTH_PORT, 9999)
        run_container(rest_name, rest_source["Config"]["Image"], rest_env, REST_PORT, 3000)
        wait_health(f"http://127.0.0.1:{AUTH_PORT}/health")
        wait_health(f"http://127.0.0.1:{REST_PORT}/")
        issued_at = int(time.time())
        base_claims = {"iss": "supabase", "aud": "authenticated", "iat": issued_at, "exp": issued_at + 3600}
        config = {
            "database": database,
            "auth_container": auth_name,
            "rest_container": rest_name,
            "auth_url": f"http://127.0.0.1:{AUTH_PORT}",
            "rest_url": f"http://127.0.0.1:{REST_PORT}",
            "local_jwt_secret": jwt_secret,
            "anon_key": sign(jwt_secret, {**base_claims, "role": "anon"}),
            "service_role_key": sign(jwt_secret, {**base_claims, "role": "service_role"}),
            "database_identity": target,
            "auth_users": 0,
            "storage_objects": 0,
            "test_password": secrets.token_urlsafe(24),
        }
        CONFIG_PATH.write_text(json.dumps(config), encoding="utf-8")
        os.chmod(CONFIG_PATH, 0o600)
        print(json.dumps({"result": "PASS", "auth_url": config["auth_url"], "rest_url": config["rest_url"],
                          "database": database, "ports_loopback_only": True,
                          "config_file": str(CONFIG_PATH), "auth_users": 0, "storage_objects": 0}))
    except Exception as exc:
        print(f"RUNTIME_START_ERROR:{exc}", file=os.sys.stderr)
        for name in (auth_name, rest_name):
            logs = subprocess.run(["docker", "logs", "--tail", "20", name], capture_output=True, text=True)
            if logs.stdout or logs.stderr:
                text = logs.stdout + logs.stderr
                text = re.sub(r"(postgres(?:ql)?://[^:/@]+:)[^@]+(@)", r"\1[redacted]\2", text)
                print(f"{name}_LOGS:\n{text[-3000:]}", file=os.sys.stderr)
            subprocess.run(["docker", "rm", "-f", name], capture_output=True)
        CONFIG_PATH.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=os.sys.stderr)
        raise SystemExit(1)
