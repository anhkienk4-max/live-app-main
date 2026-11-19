#!/usr/bin/env python3
"""Compare the disposable 05A source with its native PG17 restored copy."""
import hashlib
import json
import subprocess

DATABASES = [
    ("source", "/home/anhkienk4/.local/share/rc19-c511-native", "55439", "rc19_sto01_migrations_disposable"),
    ("restore", "/home/anhkienk4/.local/share/rc19-c511-native", "55439", "rc19_restore_w4_native_20261117"),
]
SCHEMAS = ["public", "private", "storage"]

CATALOG_SQL = {
    "columns": """select table_schema,table_name,column_name,ordinal_position,column_default,is_nullable,data_type,udt_schema,udt_name,is_identity,identity_generation from information_schema.columns where table_schema=any(array['public','private','storage']) order by table_schema,table_name,ordinal_position""",
    "constraints": """select n.nspname schema_name,t.relname table_name,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname=any(array['public','private','storage']) order by n.nspname,t.relname,c.conname""",
    "indexes": """select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname=any(array['public','private','storage']) order by schemaname,tablename,indexname""",
    "policies": """select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname=any(array['public','private','storage']) order by schemaname,tablename,policyname""",
    "triggers": """select n.nspname schema_name,t.relname table_name,g.tgname,pg_get_triggerdef(g.oid) definition from pg_trigger g join pg_class t on t.oid=g.tgrelid join pg_namespace n on n.oid=t.relnamespace where not g.tgisinternal and n.nspname=any(array['public','private','storage']) order by n.nspname,t.relname,g.tgname""",
    "functions": """select n.nspname schema_name,p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=any(array['public','private','storage']) and p.prokind='f' order by n.nspname,p.proname,arguments""",
    "schema_owners_acl": """select n.nspname,pg_get_userbyid(n.nspowner) owner,coalesce(n.nspacl::text,'(default)') acl from pg_namespace n where n.nspname=any(array['public','private','storage']) order by n.nspname""",
    "relation_owners_acl": """select n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) owner,coalesce(c.relacl::text,'(default)') acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any(array['public','private','storage']) and c.relkind in ('r','p','v','m','S','f') order by n.nspname,c.relname,c.relkind""",
    "function_owners_acl": """select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_userbyid(p.proowner) owner,coalesce(p.proacl::text,'(default)') acl,p.prosecdef security_definer,coalesce(p.proconfig::text,'(default)') config from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=any(array['public','private','storage']) and p.prokind='f' order by n.nspname,p.proname,arguments""",
    "database_owner_acl": """select d.datname,pg_get_userbyid(d.datdba) owner,coalesce(d.datacl::text,'(default)') acl from pg_database d where d.datname=current_database()""",
    "role_membership": """select member.rolname member,role.rolname granted_role,m.admin_option from pg_auth_members m join pg_roles member on member.oid=m.member join pg_roles role on role.oid=m.roleid where member.rolname not like 'pg_%' and role.rolname not like 'pg_%' order by member.rolname,role.rolname""",
}

def query(spec, sql):
    _, host, port, db = spec
    out = subprocess.check_output([
        "psql", "-X", "-qAt", "-h", host, "-p", port, "-U", "postgres", "-d", db,
        "-c", "select coalesce(json_agg(q),'[]'::json)::text from (" + sql + ") q",
    ], text=True).strip()
    return json.loads(out or "[]")

def main():
    results = {}
    for spec in DATABASES:
        label, *_ = spec
        item = {"identity": query(spec, "select current_database() database,current_user session_user,current_setting('server_version_num') version,coalesce(shobj_description(d.oid,'pg_database'),'') marker from pg_database d where d.datname=current_database()")[0]}
        tables = query(spec, "select n.nspname schema_name,c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and not c.relispartition and n.nspname=any(array['public','private','storage']) order by n.nspname,c.relname")
        rows = []
        for table in tables:
            name = '"' + table['schema_name'].replace('"','""') + '"."' + table['table_name'].replace('"','""') + '"'
            rows.append({**table, **query(spec, f"select count(*)::text row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) checksum from {name} t")[0]})
        item["table_rows"] = rows
        item["catalogs"] = {}
        item["catalog_sha256"] = {}
        for name, sql in CATALOG_SQL.items():
            records = query(spec, sql)
            item["catalogs"][name] = records
            item["catalog_sha256"][name] = hashlib.sha256(json.dumps(records, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        results[label] = item
    source, restored = results["source"], results["restore"]
    differences = {"identity_marker_expected_to_differ": [source["identity"]["marker"], restored["identity"]["marker"]]}
    for key in ("table_rows", "catalogs"):
        differences[key] = {}
        names = source[key].keys() | restored[key].keys() if key == "catalogs" else {"all_tables": None}
        for name in names:
            left = source[key] if key == "table_rows" else source[key][name]
            right = restored[key] if key == "table_rows" else restored[key][name]
            if left != right:
                differences[key][name] = {"source_count": len(left), "restore_count": len(right)}
    owner_acl_names = ("schema_owners_acl", "relation_owners_acl", "function_owners_acl")
    database_owner_acl_match = (
        source["catalogs"]["database_owner_acl"][0]["owner"] == restored["catalogs"]["database_owner_acl"][0]["owner"]
        and source["catalogs"]["database_owner_acl"][0]["acl"] == restored["catalogs"]["database_owner_acl"][0]["acl"]
    )
    report = {"source": {"identity": source["identity"], "tables": len(source["table_rows"]), "catalog_sha256": source["catalog_sha256"]},
              "restore": {"identity": restored["identity"], "tables": len(restored["table_rows"]), "catalog_sha256": restored["catalog_sha256"]},
              "exact_row_fingerprints_match": source["table_rows"] == restored["table_rows"],
              "exact_catalogs_match": source["catalogs"] == restored["catalogs"],
              "schema_relation_function_owner_acl_match": all(source["catalogs"][key] == restored["catalogs"][key] for key in owner_acl_names),
              "database_owner_acl_semantic_match": database_owner_acl_match,
              "cluster_role_membership_match": source["catalogs"]["role_membership"] == restored["catalogs"]["role_membership"],
              "differences": differences}
    print(json.dumps(report, indent=2, sort_keys=True))

if __name__ == "__main__":
    main()
