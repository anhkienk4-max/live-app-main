# RC1.6F isolated migration rehearsal

Keep product/UI/Payroll behavior unchanged. Reuse the existing integrity runner
on PostgreSQL16/17 and Node22/24. Require network-isolated, port-free Docker or
disposable GitHub CI and an initially empty database before fixture writes.
Add deterministic synthetic fixture reconciliation and legacy RC13A/RC15 DDL
compatibility assertions. Document verified cloud differences and an approval
package; cloud migrations/deployments/seeding remain unauthorized.
