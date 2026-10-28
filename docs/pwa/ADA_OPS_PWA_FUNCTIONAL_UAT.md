# ADA OPS PWA RC19 | Functional Staging UAT handover

Current approved mobile UI base: \`feat/ada-ops-pwa-v1\` at commit \`2a3933c6dd4ed6bf30fe9a1f6f281fc66e2e20bf\` (2026-10-28). The new functional suite runs manually and must be pinned to the specific Preview SHA; update both the selected Preview and expected SHA if code changes.

## Evidence state
- **PASS**: UI mock CI and responsive snapshots; verified Vercel Preview builds.
- **PENDING**: Real Staging Admin, Leader, Member authenticated execution (never infer from mock).
- **BLOCKED if capabilities OFF**: Payroll and Workforce full business views.
- **NOT TESTED BY READ-ONLY SUITE**: Actual creation, approval, rate modification, report submission, upload, salary lock or correction. These require explicit seeded Staging fixtures, reviewer separation, and written confirmation before any mutation.

## Credentials and execution
Use dedicated disposable Staging identities with Admin / Leader / Member roles, stored in the operator's private environment or approved secret store. Never commit passwords, paste them into chat, print them, or upload auth-state/screenshots.

Verify the exact Preview deployment SHA in Vercel before executing. Set:
- \`E2E_BASE_URL=https://livestream-ops-demo-<verified-deployment>.vercel.app\`
- \`PWA_UAT_EXPECTED_SHA=<full-40-char-verified-commit-sha>\`
- \`E2E_ADMIN_EMAIL\`, \`E2E_ADMIN_PASSWORD\`
- \`E2E_LEADER_EMAIL\`, \`E2E_LEADER_PASSWORD\`
- \`E2E_MEMBER_EMAIL\`, \`E2E_MEMBER_PASSWORD\`
- \`NEXT_PUBLIC_USE_MOCK_DATA=false\`

Run from project root:
\`\`\`bash
pnpm exec playwright test --config=playwright.pwa-functional.uat.config.ts
node scripts/validate-pwa-functional-uat.mjs test-results/pwa-functional-staging.json
\`\`\`
The report is local-only and MUST NOT be uploaded to a public artifact store. If the runner is Windows PowerShell, set variables via your local secret injection method before running these commands.

## Read-only functional matrix
| Case | Admin | Leader | Member | Expected evidence |
| --- | --- | --- | --- | --- |
| Dashboard 390px + 412px | ✓ | ✓ | ✓ | Real role, correct shortcuts, no viewport overflow |
| Calendar open + my shifts | ✓ | ✓ | ✓ | Both lists loaded, no mutation |
| Staffing registration review | Review | Review | Open only | Member cannot see reviewer workspace |
| Staff management | Add visible | Add absent | Add absent | Admin-only control |
| Reports | Read | Read | Read | Actual ReportsList filters + created section |
| Payroll | Admin rate tabs if enabled | 403 or self payslip | 403 or self payslip | Capability OFF = BLOCKED; errors != OFF |
| Workforce | Team if enabled | Team if enabled | Own only | Capability OFF = BLOCKED |

PASS means a real authenticated browser observed the expected UI, not that underlying RLS and all business actions were independently certified. Verify database RLS and reviewer-independence separately, with an audited test identity.

## Release gate
No Production promotion or merge until all three-role read-only checks have passed with **zero skipped tests**, Payroll/Workforce are exercised with the intended flags, seed-data mutation UAT is approved and recorded, and the owner signs off on the exact release SHA.
