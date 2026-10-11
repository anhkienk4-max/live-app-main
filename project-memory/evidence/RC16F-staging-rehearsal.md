# RC1.6F evidence — 2026-10-11

Starting ba9b13ffa9faef796927170cc1d300301ac03551; backend feature branch,
PR25 Draft based on Draft PR24. Origin/main31efea2 unchanged during preflight.

- Read-only provider project/ledger and catalog SELECTs: Staging/Production
  healthy, server17.6;61/60 ledger entries;no workforce tables;Staging78shifts/
  9reports and2active Admins;Production1active Admin. No account provisioning.
- Verified Staging RC15 gaps:5route fields absent,oldprofile checks/default,
  Production-only RPC digest guard incompatible. No historical SQL rewritten.
- Local PG16.15/PG17.11 PASS foundation+49B assertions+5race/rollback scenarios,
  new namespaced goldenfixture540667VND and2legacy compatibility scenarios.
- Node22.23.3/Node24.18.0 each97/97tests PASS (94existing+3new);typecheck/new
  focused lint PASS. Local builds on22/24, diff and memory validation PASS.
  Exact finalCI tracked independently in delivery report after push.
- CI retains22/16 and adds24/17 with pinnedpnpm/frozenlockfile/security/auth/build.
- No approved Gemini RC16 source;no exact immutable Preview candidate verified.
  Vercel read-only scopedCLI fallback, envmetadata decrypt=false only.
- C01/C02/C03 remain BLOCKED;C09 isolated rehearsal only,not cloud UAT.
- No cloud migrations/fixture writes/deployments/env changes/role changes/Drive I/O.
- Documentation-only approval package requires new forward-only reconciliation
  files/approvals before executable migration; no blind replay/ledger repair.
