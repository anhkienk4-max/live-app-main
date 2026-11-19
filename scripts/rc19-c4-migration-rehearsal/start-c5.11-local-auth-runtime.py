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
import urllib.error
import urllib.request
import uuid
from pathlib import Path

DB_CONTAINER = os.environ.get("C511_DB_CONTAINER", "supabase_db_rc19-supabase-recovery")
AUTH_CONTAINER = os.environ.get("C511_AUTH_SOURCE_CONTAINER", "supabase_auth_rc19-supabase-recovery")
REST_CONTAINER = os.environ.get("C511_REST_SOURCE_CONTAINER", "supabase_rest_rc19-supabase-recovery")
MARKER = "CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY"
NETWORK = os.environ.get("C511_RUNTIME_NETWORK", "rc19-c511-" + uuid.uuid4().hex[:8])
AUTH_PORT = int(os.environ.get("C511_AUTH_PORT", "15543"))
REST_PORT = int(os.environ.get("C511_REST_PORT", "15542"))
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


def ensure_auth_schema_owner(database: str, username: str) -> None:
    identity = database_query(
        database,
        "select current_setting('server_version_num')||'|'||current_database()||'|'||"
        "coalesce(shobj_description(oid,'pg_database'),'')||'|'||"
        "(select count(*) from auth.users)||'|'||(select count(*) from storage.objects) "
        "from pg_database where datname=current_database()",
    ).split("|")
    if (len(identity) != 5 or identity[1] != database or MARKER not in identity[2]
            or not (170000 <= int(identity[0]) < 180000) or identity[3:] != ["0", "0"]):
        raise RuntimeError("REFUSED_AUTH_SCHEMA_SETUP_OUTSIDE_EMPTY_MARKED_PG17_DATABASE")
    auth_ownership = """
    do $setup$
    declare role_name text := __AUTH_ROLE_LITERAL__;
    declare r record;
    begin
      if not exists (select 1 from pg_roles where rolname=role_name and not rolsuper and not rolbypassrls) then
        raise exception 'REFUSED_GOTRUE_RUNTIME_ROLE_PRIVILEGED_OR_MISSING';
      end if;
      if exists (
        select 1 from pg_auth_members m join pg_roles granted on granted.oid=m.roleid
        join pg_roles member on member.oid=m.member
        where member.rolname=role_name and granted.rolname in ('supabase_auth_admin','service_role','postgres')
      ) then
        raise exception 'REFUSED_GOTRUE_RUNTIME_ROLE_HAS_PRIVILEGED_MEMBERSHIP';
      end if;
      execute format('alter schema auth owner to %I', role_name);
      for r in select c.relkind,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='auth' and c.relkind in ('r','p','v','m','S','f')
          and (c.relkind<>'S' or not exists(select 1 from pg_depend d
            where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype in ('a','i'))) loop
        execute format('alter %s %I.%I owner to %I',
          case r.relkind when 'S' then 'sequence' when 'v' then 'view' when 'm' then 'materialized view' else 'table' end,
          r.nspname,r.relname,role_name);
      end loop;
      for r in select p.prokind,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' loop
        execute format('alter %s %I.%I(%s) owner to %I',
          case r.prokind when 'p' then 'procedure' else 'function' end,r.nspname,r.proname,r.args,role_name);
      end loop;
      execute format('grant usage, create on schema auth to %I', role_name);
      execute format('grant all privileges on all tables in schema auth to %I', role_name);
      execute format('grant all privileges on all sequences in schema auth to %I', role_name);
      execute format('grant execute on all functions in schema auth to %I', role_name);
      execute format('alter role %I in database %I set search_path to auth', role_name, current_database());
    end
    $setup$;
    """
    auth_ownership = auth_ownership.replace("__AUTH_ROLE_LITERAL__", "'" + username.replace("'", "''") + "'")
    subprocess.run(
        ["docker", "exec", "-i", DB_CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1",
         "-U", "supabase_admin", "-d", database],
        input=auth_ownership, text=True, encoding="utf-8", capture_output=True, check=True,
    )
    verified = database_query(
        database,
        "select (n.nspowner=r.oid)||'|'||has_schema_privilege(r.rolname,'auth','USAGE')||'|'||"
        "has_schema_privilege(r.rolname,'auth','CREATE')||'|'||"
        "coalesce((select s.setconfig @> array['search_path=auth'] from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase "
        "where d.datname=current_database() and s.setrole=r.oid),false) "
        "from pg_roles r cross join pg_namespace n where r.rolname='" + username.replace("'", "''") + "' and n.nspname='auth'",
    )
    if verified != "true|true|true|true":
        raise RuntimeError("GOTRUE_RUNTIME_PRINCIPAL_SETUP_INCOMPLETE")


def restore_canonical_rbac_catalog(database: str) -> None:
    migration = ROOT / "supabase/migrations/20261104085945_rc19_rbac01_role_permission_enforcement.sql"
    match = re.search(
        r"INSERT INTO private\.rbac_permission_catalog\b.*?ON CONFLICT \(permission\) DO NOTHING;",
        migration.read_text(encoding="utf-8"), re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise RuntimeError("REFUSED_RBAC_PERMISSION_SEED_NOT_FOUND")
    subprocess.run(
        ["docker", "exec", "-i", DB_CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1",
         "-U", "postgres", "-d", database],
        input=match.group(0), text=True, encoding="utf-8", capture_output=True, check=True,
    )
    count = database_query(database, "select count(*) from private.rbac_permission_catalog")
    if not count.isdigit() or int(count) < 30:
        raise RuntimeError("RBAC_PERMISSION_CATALOG_INCOMPLETE:" + count)


def restore_postgrest_baseline_grants(database: str) -> None:
    identity = database_query(
        database,
        "select current_setting('server_version_num')||'|'||current_database()||'|'||"
        "coalesce(shobj_description(oid,'pg_database'),'')||'|'||"
        "(select count(*) from auth.users)||'|'||(select count(*) from storage.objects)||'|'||"
        "(select count(*) from public.business_users)||'|'||(select count(*) from public.shifts)||'|'||"
        "(select count(*) from public.shift_registrations)||'|'||(select count(*) from public.shift_staffing_segments)||'|'||"
        "(select count(*) from public.workforce_payroll_periods)||'|'||(select count(*) from public.workforce_payroll_lines) "
        "from pg_database where datname=current_database()",
    ).split("|")
    if (len(identity) != 11 or identity[1] != database or MARKER not in identity[2]
            or not (170000 <= int(identity[0]) < 180000) or identity[3:] != ["0"] * 8):
        raise RuntimeError("REFUSED_POSTGREST_GRANT_RESTORE_OUTSIDE_EMPTY_MARKED_PG17_DATABASE")
    grants = """
    grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
    grant usage on schema private to authenticated;
    grant all privileges on all tables in schema public to anon, authenticated, service_role;
    grant all privileges on all sequences in schema public to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
    """
    subprocess.run(
        ["docker", "exec", "-i", DB_CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1",
         "-U", "postgres", "-d", database],
        input=grants, text=True, encoding="utf-8", capture_output=True, check=True,
    )
    verified = database_query(database, "select has_table_privilege('service_role','public.business_users','insert')::text||'|'||has_table_privilege('service_role','public.system_settings','select')::text||'|'||has_schema_privilege('authenticated','private','usage')::text")
    if verified != "true|true|true":
        raise RuntimeError("POSTGREST_BASELINE_GRANTS_INCOMPLETE")


def local_uri(template: str, database: str, host: str) -> str:
    parsed = urllib.parse.urlsplit(template)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.username or not parsed.password:
        raise RuntimeError("LOCAL_DATABASE_URI_SHAPE_INVALID")
    auth = parsed.netloc.rsplit("@", 1)[0]
    netloc = f"{auth}@{host}:{parsed.port or 5432}"
    return urllib.parse.urlunsplit((parsed.scheme, netloc, "/" + database, parsed.query, parsed.fragment))


def available(port: int) -> bool:
    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) != 0


def run_container(name: str, image: str, env: dict[str, str], port: int, internal_port: int) -> None:
    fd, env_path = tempfile.mkstemp(prefix="c511-env-")
    try:
        if os.name != "nt":
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            for key, value in env.items():
                if "\n" in value or "\r" in value:
                    raise RuntimeError("LOCAL_ENV_VALUE_INVALID")
                stream.write(f"{key}={value}\n")
        result = subprocess.run(
            ["docker", "run", "-d", "--name", name, "--network", NETWORK,
             "-p", f"127.0.0.1:{port}:{internal_port}", "--env-file", env_path, image],
            capture_output=True, text=True, check=False,
        )
    finally:
        for attempt in range(5):
            try:
                Path(env_path).unlink(missing_ok=True)
                break
            except PermissionError:
                if attempt == 4:
                    raise RuntimeError("LOCAL_ENV_FILE_CLEANUP_FAILED")
                time.sleep(0.2)
    if result.returncode:
        detail = re.sub(r"(?i)(postgres(?:ql)?://[^:/@\s]+:)[^@\s]+@", r"\1[redacted]@", result.stderr or result.stdout)
        detail = re.sub(r"(?i)(password|secret|token|key)=\S+", r"\1=[redacted]", detail)
        raise RuntimeError(f"LOCAL_CONTAINER_START_FAILED:{name}:{detail[-1200:]}")


def ensure_isolated_network(database_container: str) -> None:
    exists = subprocess.run(["docker", "network", "inspect", NETWORK], capture_output=True, text=True)
    if exists.returncode:
        subprocess.run(["docker", "network", "create", NETWORK], check=True, capture_output=True, text=True)
    network = docker_json("network", "inspect", NETWORK)[0]
    attached = network.get("Containers", {})
    if any(item.get("Name") != database_container for item in attached.values()):
        raise RuntimeError("REFUSED_NON_ISOLATED_RUNTIME_NETWORK")
    if not any(item.get("Name") == database_container for item in attached.values()):
        subprocess.run(["docker", "network", "connect", "--alias", "c511-postgres", NETWORK, database_container],
                       check=True, capture_output=True, text=True)


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


def wait_postgrest(url: str, anon_key: str) -> None:
    deadline = time.time() + 45
    last = "unreachable"
    request = urllib.request.Request(
        url + "/business_users?select=id&limit=0",
        headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"},
    )
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                if response.status == 200:
                    return
                last = str(response.status)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")[:400]
            try:
                denial = json.loads(body)
            except json.JSONDecodeError:
                denial = {}
            if exc.code in (401, 403) and denial.get("code") == "42501" and "permission denied" in denial.get("message", ""):
                return
            last = f"{exc.code}:{body}"
        except Exception:
            time.sleep(1)
    raise RuntimeError(f"LOCAL_POSTGREST_API_UNHEALTHY:{last}")


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
    if len(parts) != 6 or parts[1] != database or MARKER not in parts[2]:
        raise RuntimeError("REFUSED_WRONG_LOCAL_DATABASE_IDENTITY")
    if not (170000 <= int(parts[0]) < 180000) or parts[3:5] != ["0", "0"]:
        raise RuntimeError("REFUSED_DATABASE_VERSION_OR_NONEMPTY_TEST_DATA")
    restore_postgrest_baseline_grants(database)
    restore_canonical_rbac_catalog(database)
    if not (1 <= AUTH_PORT <= 65535 and 1 <= REST_PORT <= 65535 and AUTH_PORT != REST_PORT):
        raise RuntimeError("REFUSED_INVALID_LOCAL_AUTH_REST_PORTS")
    if not available(AUTH_PORT) or not available(REST_PORT):
        raise RuntimeError("REFUSED_LOOPBACK_PORT_IN_USE")

    auth_source = inspect(AUTH_CONTAINER)
    rest_source = inspect(REST_CONTAINER)
    auth_source_env = container_env(AUTH_CONTAINER)
    rest_source_env = container_env(REST_CONTAINER)
    auth_db_user = urllib.parse.urlsplit(auth_source_env["GOTRUE_DB_DATABASE_URL"]).username
    if not auth_db_user:
        raise RuntimeError("LOCAL_AUTH_DB_USERNAME_MISSING")
    ensure_auth_schema_owner(database, urllib.parse.unquote(auth_db_user))
    ensure_isolated_network(DB_CONTAINER)
    auth_db_uri = local_uri(auth_source_env["GOTRUE_DB_DATABASE_URL"], database, "c511-postgres")
    rest_db_uri = local_uri(rest_source_env["PGRST_DB_URI"], database, "c511-postgres")
    # The disposable schema snapshot is much larger than an app query; avoid
    # PostgREST's inherited 3s anon-role timeout aborting schema-cache startup.
    options = urllib.parse.quote("-c statement_timeout=120s", safe="")
    rest_db_uri += ("&" if "?" in rest_db_uri else "?") + "options=" + options
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
    issued_at = int(time.time())
    base_claims = {"iss": "supabase", "aud": "authenticated", "iat": issued_at, "exp": issued_at + 3600}
    anon_key = sign(jwt_secret, {**base_claims, "role": "anon"})

    try:
        run_container(auth_name, auth_source["Config"]["Image"], auth_env, AUTH_PORT, 9999)
        run_container(rest_name, rest_source["Config"]["Image"], rest_env, REST_PORT, 3000)
        wait_health(f"http://127.0.0.1:{AUTH_PORT}/health")
        wait_postgrest(f"http://127.0.0.1:{REST_PORT}", anon_key)
        config = {
            "database": database,
            "database_container": DB_CONTAINER,
            "runtime_network": NETWORK,
            "auth_container": auth_name,
            "rest_container": rest_name,
            "auth_url": f"http://127.0.0.1:{AUTH_PORT}",
            "rest_url": f"http://127.0.0.1:{REST_PORT}",
            "auth_port": AUTH_PORT,
            "rest_port": REST_PORT,
            "local_jwt_secret": jwt_secret,
            "anon_key": anon_key,
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
