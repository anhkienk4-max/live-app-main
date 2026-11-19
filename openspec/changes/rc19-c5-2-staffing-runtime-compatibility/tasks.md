# Tasks

- [x] Add forward-only staffing-candidate migration with authenticated actor, action permission, Brand scope, bounded result contract, and explicit grants.
- [x] Add positive/negative SQL contract and isolated PGlite behavioral coverage.
- [x] Run the focused staffing suite (5/5), TypeScript, full ESLint (0 errors), and credential-free production build with the supported `--webpack` mode on source commit `d39578f0f78d9e921fea2c7e06c705c829fbfdaa`.
- [ ] Re-run the default Turbopack build after replacing the worktree's external `node_modules` junction; the current attempt stops before compilation with `Symlink [project]/node_modules is invalid`.
- [ ] Run the final 18/19/new-migration sequence on the exact production-shaped PostgreSQL 17.6 harness; `NOT RUN` because that harness is unavailable and the remaining PG17.11 databases have incomplete/mismatched schemas.
- [x] Keep private-bucket activation blocked until Production runtime SHA attestation and compatibility-app rollout are verified; the live deployment Git SHA is not available from current Vercel metadata.
