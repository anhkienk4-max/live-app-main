# Tasks

- [x] Record deployed-image endpoint evidence and identify the incompatible legacy runtime.
- [x] Archive original migration bytes and add a versioned expand replacement.
- [x] Add a separately versioned, fail-closed private contract migration outside automatic migrations.
- [ ] Replay all 20 active forward migrations on isolated PG17.6 schema-only baseline and verify legacy image state remains public.
- [ ] Verify the guarded contract fails without attestations and succeeds only with explicit attestations.
- [ ] Run C5.3 role assertions and compatibility checks on the exact source commit.
- [ ] Update the exact-SHA manifest and commit the local release package.
