## Decisions
Use the existing pure placement resolver and strict static route parser. Exact overrides preserve significant historical spaces; no fuzzy search or folder renaming is introduced. KATE and KAO have verified per-month category casing, so an optional folder_label_overrides map preserves their existing trees.

Live file_name remains the sanitized original. storage_file_name carries the date/category/full-SHA256 provider name; storage_idempotency_key is category:sha256. A non-null partial unique index and the existing report row lock serialize retries before count, cover, or revision effects. Legacy rows have null new fields; read/delete projections remain compatible. The optional provider-column RPC wrapper must preserve the first object's identity on retry. The route deletes only a redundant returned upload reference, never the persisted winner.

Metadata category edits update the key prefix with a trigger, preserving its digest. A conflicting category change fails the unique constraint. RLS and existing permissions remain unchanged; RPC authorization runs before an existing row is returned.

Proposed config is not loaded by runtime and is not a second live configuration source. Current coverage evidence is an aggregate read-only Production snapshot (671 shifts, 28 platform combinations, 20 Brand/source combinations). Later usage must be validated again before config cutover.

## Verification
Focused placement, compatibility, provider, route and UI tests; local SQL contract checks plus actual SQL execution against isolated in-memory PostgreSQL with authorization helper stubs; full regression, typecheck, build and diff audit. Migration is not applied remotely in this checkpoint.

Mars Agency remains exactly unchanged. Mars Internal retains its base/category order and historical dashboard paths; exact period overrides also preserve its live category labels. All Internal legacy routes use uppercase dash fallback for periods without overrides.

Evidence: focused suites 197 PASS; full regression 1316 PASS / 0 FAIL / 4 SKIP; typecheck/build/diff PASS. Production usage recheck remained 20 Brand/source combinations, 28 platform combinations, 671 shifts. Migration SQL execution passed on compat and provider-column schemas, including repeat application, legacy NULL rows, retry/uniqueness, category edits, grants, and provider winner identity. In-memory PostgreSQL serializes requests on one connection; application race cleanup is separately exercised with concurrent mocked uploads. No remote migration or runtime storage mutation was performed.
