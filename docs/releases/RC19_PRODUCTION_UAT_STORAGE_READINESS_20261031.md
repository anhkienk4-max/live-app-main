# RC19 Production UAT and Storage Readiness

**Scope:** Lane 2 source and read-only UAT preparation. Production mutations and release remain Lane 1 responsibilities.

## Verified Production identity

- Vercel project: `livestream2/livestream-ops`, project ID `prj_YSrsxfYK7skM17D3KtiXUGeim2kr`.
- Current deployment observed: `dpl_897SJFFmdrqd64yWxZDF7DW6fK4X`, READY, alias `ops5729.top`.
- Current deployment Git SHA observed: `e8ac8dc30d4d177437ca97315bda84b163fbc4db`.
- Supabase Production project: `egdjnpmoasarrttvhgds`; 85 migrations recorded at inspection.
- Production environment metadata was inspected for names and scopes only. No values were read into evidence or changed.
- The app/deployment target and Supabase production target must be reverified by Lane 1 immediately before release.

## Safeguarded Production browser mode

`playwright.production-uat.config.ts` requires all of:

- `RC19_UAT_MODE=production`
- `PRODUCTION_UAT_BASE_URL=https://ops5729.top`
- `PRODUCTION_UAT_SUPABASE_PROJECT_REF=egdjnpmoasarrttvhgds`
- `PRODUCTION_UAT_EXPECTED_SHA=<exact deployed 40-character Git SHA>`

The browser allows only the exact Production app origin and pinned Production Supabase origin; other application, Vercel and Supabase hosts are blocked. External requests are denied except static Google Fonts. Business writes are blocked; only Supabase session login/refresh/logout and the existing read-only `get_report_revisions` RPC are allowed.

The Admin-only diagnostics endpoint reports matching public/server project references, a Production-mode readiness boolean, and a validated deployment commit SHA. It does not return URL or secret values and keeps `Cache-Control: no-store`. The UAT smoke compares the reported deployment SHA to the exact SHA supplied by the release operator.

The current harness checks login/session, role identity, diagnostics access, a unique zero-result Reports filter, report filter UI, and responsive widths. It **does not** certify the full Calendar, Registration, Staffing, PASS/SWAP, Storage, Attendance, Payroll, Workforce, Brand or Admin workflows. It does not download Production report rows or create fixtures. Passing this smoke is partial role evidence, not complete Production UAT.

## Storage and privacy status

- Keep the Owner-accepted `anyone:writer` permission on `LIVESTREAM REPORT` unchanged. No confidential Attendance, HR, Payroll or employee evidence belongs there.
- Production currently has zero operational storage routes in the inspected database metadata. Do not activate routes from this Lane 2 branch.
- The prior isolated seed-preflight tests are not actual PostgreSQL 17 or Production route activation evidence. Actual provider identity and synthetic app-adapter upload/readback remain not verified here.
- Private Attendance storage remains a separate authorization/root gate; no Production ACL or file changed.
- Preserve the 201 historical shifts.

## Release handoff

Lane 1 must finish Auth/application restore and independent key verification, review/apply only approved migrations, verify the rollback target, deploy the final integrated SHA once, then run the complete authenticated Admin/Leader/Member Production ledger. Lane 2 did not deploy, migrate, alter flags, write files, change Drive permissions or run authenticated Production UAT.
