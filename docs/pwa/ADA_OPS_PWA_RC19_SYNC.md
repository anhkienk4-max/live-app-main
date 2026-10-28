# ADA OPS PWA V1.0 — latest published RC19 sync

Source application: `feat/ops-full-app-upgrade-rc19` at `1b96f38a17768e96b92f23056efba4b61cc76f84`, rather than older `main`.
PWA history: `feat/ada-ops-pwa-v1` commit `fee03607d4bccd69607b02bd593b9570808d6561`.

This is a two-parent merge retaining both histories, using the entire RC19 source tree
as the runtime foundation, selectively reapplying PWA manifest, Android/iPhone icons,
splash, previously approved Login visual skin, mobile bottom navigation and Reports cards.
Do not replace the RC19 Google OAuth, callback, payroll, calendar or role authorization.

The live `ops5729.top` production deployment is a CLI deployment whose metadata
does not carry a Git SHA. Its bundled `project-memory/current-state.json` names
`feat/ops-full-app-upgrade-rc19` and a local commit `c0d4d0f9...` that was not
available on GitHub at inspection time. This sync is to the *latest published*
RC19 branch, not a claim of an exact byte-for-byte production clone.

Login screenshots run in local credential-free development mock; no access to
Production or Staging database. Mobile Calendar/Payroll/Profile modules are RC19
implementations and must be re-reviewed before claiming reference-board fidelity.
No merge to main, production deploy, database migration, or RBAC bypass.
