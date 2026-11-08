-- Disposable PG17.6 clone of the sanitized 89-receipt schema-only baseline.
CREATE DATABASE rc19_c5_3_final_20261109
  WITH TEMPLATE = rc19_c4_schema_base_20261107_pg176
       OWNER = postgres;
COMMENT ON DATABASE rc19_c5_3_final_20261109
  IS 'CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY';
