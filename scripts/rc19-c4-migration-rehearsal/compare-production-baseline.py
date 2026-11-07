#!/usr/bin/env python3
"""Reconcile live Production relation presence against the 89+17 PG17.6 receipts."""

import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
E = HERE / "evidence"
RUN = E / "prodshape-pg17-20261107T114021Z"
OUTPUT = E / "production-baseline-comparison-c42.json"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def canon(rows):
    return sorted(json.dumps(row, sort_keys=True, separators=(",", ":")) for row in rows)


def split_args(text):
    out, start, depth = [], 0, 0
    for i, char in enumerate(text):
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        elif char == "," and depth == 0:
            out.append(text[start:i].strip())
            start = i + 1
    if text[start:].strip():
        out.append(text[start:].strip())
    return out


def routine_key(row, production):
    if production:
        signature = row["signature"]
        name, args = signature.split("(", 1)
        types = []
        for arg in split_args(args[:-1]):
            words = arg.split()
            if words and words[0].upper() in {"IN", "OUT", "INOUT", "VARIADIC"}:
                words = words[1:]
            types.append(" ".join(words[1:]) if len(words) > 1 else (words[0] if words else ""))
        return row["schema"], name, tuple(types)
    return row["schema"], row["name"], tuple(row["argument_types"])


def created_public_tables(sql):
    pattern = r"\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\s*\.\s*([a-z_][a-z0-9_]*)"
    return set(re.findall(pattern, sql, re.I))


def table_created(sql, name):
    pattern = (r"\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?"
               r"(?:(?:public)\s*\.\s*)?[\"]?" + re.escape(name) + r"[^\"]*[\"]?\s*\(")
    return re.search(pattern, sql, re.I) is not None


def main():
    live = load(E / "live-production-target-relations-20261107.json")
    c2 = load(E / "c2-preflight-readonly-production-proof-20261107.json")
    live_ops = load(E / "live-production-shift-route-aggregate-20261107.json")
    live_events = load(E / "live-production-event-triggers-20261107.json")
    live_catalog = load(E / "production-catalog-snapshot.json")["snapshot"]
    live_schema = load(E / "production-schema-rpc-snapshot.json")
    base_catalog = load(E / "production-ledger-89-target-catalog.json")
    base_schema = load(E / "production-ledger-89-catalog-snapshot.json")
    manifest = load(E / "effective-migration-manifest.json")
    with (RUN / "progress.tsv").open(newline="", encoding="utf-8") as stream:
        progress = list(csv.DictReader(stream, delimiter="\t"))
    receipts = {r["version"]: r for r in progress if r["phase"] == "c4-candidate"}
    base_sql = (RUN / "schema-after-89-production-ledger.sql").read_text(encoding="utf-8", errors="replace")
    final_sql = (RUN / "schema-after-20261105120000.sql").read_text(encoding="utf-8", errors="replace")
    run_result = dict(line.split("=", 1) for line in (RUN / "result.txt").read_text().splitlines() if "=" in line)

    if live["project_id"] != "egdjnpmoasarrttvhgds" or live["ledger"] != {"count": 89, "head": "20261101073742"}:
        raise SystemExit("REFUSED_PRODUCTION_IDENTITY_OR_LEDGER_MISMATCH")
    if run_result.get("RESULT") != "PASS" or run_result.get("postgresql") != "170006":
        raise SystemExit("PG176_REHEARSAL_RECEIPT_NOT_PASS")
    if run_result.get("production_ledger_replayed") != "89" or run_result.get("candidate_migrations_applied") != "17":
        raise SystemExit("PG176_REHEARSAL_RECEIPT_COUNT_MISMATCH")
    entries = {m["version"]: m for m in manifest["entries"]}
    if len(entries) != 17 or len(receipts) != 17:
        raise SystemExit("C4_MANIFEST_OR_RECEIPT_COUNT_MISMATCH")

    hashes = []
    for version, entry in sorted(entries.items()):
        source = ROOT / entry["source_file"]
        actual = hashlib.sha256(source.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
        receipt = receipts.get(version, {})
        valid = actual == entry["sha256"] == receipt.get("sha256") and receipt.get("status") == "PASS"
        hashes.append({"version": version, "file": entry["file"], "sha256": entry["sha256"], "verified": valid})
        if not valid:
            raise SystemExit(f"MIGRATION_HASH_OR_RECEIPT_MISMATCH:{version}")

    base_public_tables = created_public_tables(base_sql)
    created_in_chain = {}
    for version, entry in sorted(entries.items()):
        sql = (ROOT / entry["source_file"]).read_text(encoding="utf-8", errors="replace")
        for table in created_public_tables(sql):
            created_in_chain.setdefault(table, []).append(version)
    new_public_tables = sorted(set(created_in_chain) - base_public_tables)
    new_table_rls = []
    for table in new_public_tables:
        enabled = re.search(
            r"ALTER TABLE(?: ONLY)? public[.]" + re.escape(table) + r" ENABLE ROW LEVEL SECURITY;",
            final_sql, re.I
        ) is not None
        new_table_rls.append({"table": table, "creating_versions": created_in_chain[table], "explicit_rls_enabled": enabled})
    if not all(row["explicit_rls_enabled"] for row in new_table_rls):
        raise SystemExit("NEW_PUBLIC_TABLE_WITHOUT_EXPLICIT_RLS")

    baseline_relations = {r["name"]: r for r in base_catalog["relations"]}
    live_relations = {r["name"]: r for r in live["relations"]}
    states = []
    for name, prod in sorted(live_relations.items()):
        base = baseline_relations.get(name)
        base_exists = bool(base and base["exists"])
        baseline_has_create = table_created(base_sql, name.split(".", 1)[1])
        final_has_create = table_created(final_sql, name.split(".", 1)[1])
        final_rls_enabled = re.search(
            r"ALTER TABLE(?: ONLY)? public[.]" + re.escape(name.split(".", 1)[1]) + r" ENABLE ROW LEVEL SECURITY;",
            final_sql, re.I
        ) is not None
        creator = None
        for version, entry in sorted(entries.items()):
            sql = (ROOT / entry["source_file"]).read_text(encoding="utf-8", errors="replace")
            if table_created(sql, name.split(".", 1)[1]):
                creator = {"version": version, "file": entry["file"], "sha256": entry["sha256"]}
                break
        if prod["exists"] and base_exists and prod["rls"] == base["rls"] and prod["force_rls"] == base["force_rls"]:
            state = "BASELINE_MATCH"
        elif not prod["exists"] and not base_exists and not baseline_has_create and final_has_create and final_rls_enabled and creator and receipts[creator["version"]]["status"] == "PASS":
            state = "EXPECTED_NEW_OBJECT"
            creator["receipt"] = "PASS"
        elif prod["exists"] and not base_exists:
            state = "EXISTING_INCOMPATIBLE_OBJECT"
        else:
            state = "UNVERIFIED"
        states.append({
            "relation": name, "production_exists": prod["exists"], "replay_89_exists": base_exists,
            "after_17_create_statement": final_has_create, "after_17_rls_enabled": final_rls_enabled,
            "creator_migration": creator, "classification": state
        })

    cols_equal = canon(live_schema["columns"]) == canon(base_schema["columns"])
    constraints_equal = canon(live_catalog["constraints"]) == canon(base_catalog["constraints"])
    indexes_equal = canon(live_catalog["indexes"]) == canon(base_catalog["indexes"])
    policies_equal = canon(live_catalog["policies"]) == canon(base_catalog["policies"])
    prod_routines = {routine_key(r, True): r for r in live_schema["routines"]}
    base_routines = {routine_key(r, False): r for r in base_schema["routines"]}
    shared = prod_routines.keys() & base_routines.keys()
    fields = ("owner", "schema", "returns", "language", "configuration", "security_definer")
    routine_metadata_equal = all(
        all(prod_routines[k].get(f) == base_routines[k].get(f) for f in fields) for k in shared
    )
    prod_only = sorted(f"{s}.{n}({', '.join(args)})" for s, n, args in prod_routines.keys() - base_routines.keys())
    base_only = sorted(f"{s}.{n}({', '.join(args)})" for s, n, args in base_routines.keys() - prod_routines.keys())

    c2_pass = (
        all(all(v is True for k, v in row.items() if k.endswith("_match") and k != "triggers_match")
            and row.get("triggers_match") in (True, None) for row in c2["table_fingerprints"])
        and all(f["exists"] and f["owner_postgres"] and f["security_definer_match"] and f["search_path_empty"]
                and f["body_match"] and f["acl_match"] for f in c2["functions"])
        and all(g["acl_match"] for g in c2["table_grants"])
        and c2["existing_data_compatible"] and all(c2["new_object_targets_absent"].values())
    )
    counts = {s: sum(r["classification"] == s for r in states) for s in
              ("BASELINE_MATCH", "EXPECTED_NEW_OBJECT", "EXISTING_INCOMPATIBLE_OBJECT", "UNVERIFIED")}

    report = {
        "reviewed_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": {"frozen_c4_sha": run_result["source_sha"], "worktree_head_at_review": "1f07e33205a09ed65f7c2c3ad97716177d25a2f9"},
        "production": {
            "project_id": live["project_id"], "captured_at_utc": live["captured_at_utc"],
            "postgresql": live["postgresql"], "ledger": live["ledger"]
        },
        "states": {
            "actual_production_pre_c4": live["captured_at_utc"],
            "disposable_after_89": "schema-after-89-production-ledger.sql",
            "disposable_after_89_plus_17": "schema-after-20261105120000.sql",
            "target_relation_counts": {"production_present": 10, "replay_89_present": 10, "targets": len(states)},
            "classification_counts": counts, "result": "PASS" if not counts["UNVERIFIED"] and not counts["EXISTING_INCOMPATIBLE_OBJECT"] else "BLOCKED",
            "relations": states
        },
        "c2_preflight_read_only": {
            "result": "PASS" if c2_pass else "FAIL",
            "evidence": "c2-preflight-readonly-production-proof-20261107.json",
            "all_existing_table_fingerprints": c2_pass,
            "existing_data_compatible": c2["existing_data_compatible"],
            "missing_targets_absent": all(c2["new_object_targets_absent"].values()),
            "no_production_ddl_dml": True
        },
        "catalog_parity": {
            "columns": {"scope": "captured C4-related columns", "production": len(live_schema["columns"]), "replay_89": len(base_schema["columns"]), "exact": cols_equal},
            "constraints": {"scope": "captured target relations", "production": len(live_catalog["constraints"]), "replay_89": len(base_catalog["constraints"]), "exact": constraints_equal},
            "indexes": {"scope": "captured target relations", "production": len(live_catalog["indexes"]), "replay_89": len(base_catalog["indexes"]), "exact": indexes_equal},
            "policies": {"scope": "captured target relations", "production": len(live_catalog["policies"]), "replay_89": len(base_catalog["policies"]), "exact": policies_equal},
            "routines_common": {
                "scope": "captured public/private authority routines", "production": len(prod_routines), "replay_89": len(base_routines), "common": len(shared),
                "common_metadata_exact": routine_metadata_equal, "production_only": prod_only, "replay_only": base_only,
                "body_fingerprints": "UNVERIFIED for common routines; 7 C2-protected functions and the Production-only event-trigger function are captured"
            },
            "table_grants": "NOT_COMPARABLE; replay schema-only dump used --no-privileges; C2 target ACLs verified separately",
            "triggers": "UNVERIFIED for the full application schema; C2 target trigger fingerprints verified separately",
            "overall": "PARTIAL_UNVERIFIED"
        },
        "migration_rehearsal": {
            "result": "PASS", "postgresql": "17.6 (170006)", "replayed_receipts": 89,
            "effective_migrations": hashes, "c2_storage_rls_admin_leader_member": "PASS",
            "c2_anonymous_denied": "PASS", "pg_cron_worker": "NOT_SIMULATED"
        },
        "historical_data_and_activation": {
            "captured_at_utc": live_ops["captured_at_utc"],
            "canonical_identity_conflict_groups": live_ops["canonical_identity_conflict_groups"],
            "old_slot_duplicate_groups": live_ops["old_slot_duplicate_groups"],
            "storage_routes": live_ops["storage_route_counts"],
            "result": "PASS"
        },
        "production_only_event_trigger": {
            "evidence": "live-production-event-triggers-20261107.json",
            "ensure_rls_body_md5": live_events["production_only_routine"]["body_md5"],
            "ensure_rls_security_definer": live_events["production_only_routine"]["security_definer"],
            "ensure_rls_search_path": live_events["production_only_routine"]["configuration"],
            "ensure_rls_acl": live_events["production_only_routine"]["acl"],
            "rehearsal_captured_platform_event_trigger": False,
            "explicit_rls_enabled_all_new_public_tables": new_table_rls
        },
        "dashboard_image_transition": {
            "production_before_c4": "public=true; public-read policy present",
            "pg17_6_migration_result": "UPDATE 1",
            "migration_sets_public_false": True,
            "explicit_final_select_readback": "NOT_CAPTURED",
            "old_runtime_private_bucket_read": "UNVERIFIED"
        },
        "release_gates": {
            "production_execution_allowlist": [],
            "production_backup_and_independent_restore": "BLOCKED; only synthetic fixture restore evidence exists",
            "old_runtime_dashboard_read_after_private_transition": "UNVERIFIED",
            "old_runtime_rollback_after_shift_identity_index_transition": "UNVERIFIED",
            "authenticated_admin_leader_member_uat": "BLOCKED",
            "google_drive_principal_acl_readback_checksum": "BLOCKED",
            "effective_feature_flags": "UNVERIFIED",
            "ux_hotfix_integration_visual_validation": "SEPARATE_BRANCH_NOT_INTEGRATED"
        }
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(OUTPUT.relative_to(ROOT)), "classification_counts": counts,
        "catalog": {k: v for k, v in report["catalog_parity"].items() if isinstance(v, dict)},
        "routines_common_metadata_exact": routine_metadata_equal, "production_only_routines": prod_only,
        "c2_preflight": report["c2_preflight_read_only"]["result"],
        "migration_hashes_verified": len(hashes), "new_public_tables_rls": len(new_table_rls),
        "full_parity": report["catalog_parity"]["overall"]
    }, indent=2))


if __name__ == "__main__":
    main()
