# H4 IMMUTABLE MIGRATION AUDIT & RESTORATION REPORT

**Target Migration:** `supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql`  
**Target Environments:** Staging (`amagnzebmmuqiptmrjmc`) & Production (`egdjnpmoasarrttvhgds`)  
**Status:** RESTORED BYTE-FOR-BYTE TO APPLIED HISTORICAL STATE  

---

## 1. VIOLATION AUDIT IN COMMIT `dfa4140`

In commit `dfa4140`, the historical migration `20261011092015_rc15_shift_rpc_compatibility.sql` was edited in-place:
```diff
-  if md5(pg_get_functiondef('public.create_shift(jsonb)'::regprocedure)) <> '2133950d90a0610b76d4b6623abf4621' then
-    raise exception 'RC15_SHIFT_RPC_DEFINITION_DRIFT: p_data jsonb';
-  end if;
+  if not exists (
+    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
+    where n.nspname = 'public' and p.proname = 'create_shift'
+      and pg_get_function_arguments(p.oid) like 'p_data jsonb%'
+  ) then
+    raise exception 'RC15_SHIFT_RPC_DEFINITION_DRIFT: create_shift(p_data jsonb) not found';
+  end if;
```

### Why this violated release safety:
1. Migration `20261011092015_rc15_shift_rpc_compatibility.sql` has **already been applied to Production**.
2. Modifying an applied migration breaks:
   - Database migration ledger integrity (`supabase_migrations.schema_migrations` MD5 / checksum).
   - Replay safety and environment convergence.
   - The strict **Immutable Migration Policy** non-negotiable rule.

---

## 2. BYTE-FOR-BYTE RESTORATION

Executed restoration command:
```bash
git checkout origin/fix/rc14-data-report-export-fidelity -- supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql
```

### Verification:
```bash
git diff origin/fix/rc14-data-report-export-fidelity -- supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql
# Output: (empty - 0 differences)
```
The restored file matches the RC15 Production-applied migration byte-for-byte:
- Exact MD5 hashes:
  - `public.create_shift(jsonb)`: `2133950d90a0610b76d4b6623abf4621`
  - `public.update_shift(text,jsonb,boolean)`: `6737e74fb449e7745b3847b3f95ec0a0`
  - `public.update_shift(text,jsonb,boolean,integer)`: `c7b743aa97b19c678ff6f84d6c9b8a2c`
- Preserved row locking, optimistic concurrency (`p_expected_version`), and `execution_source` allowlist constraints.

---

## 3. FORWARD-ONLY COMPATIBILITY PROTOCOL

If future environments require relaxing or enhancing RPC compatibility:
1. **Never** edit historical files.
2. A new forward-only migration must be authored with an ascending timestamp (e.g. `20261012...`).
3. Zero database write operations were performed on Production or Staging during Phase H.4.
