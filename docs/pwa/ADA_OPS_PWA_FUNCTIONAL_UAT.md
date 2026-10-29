# ADA OPS PWA | Read-only 3-role Staging UAT

**Reviewed UI Preview**: https://livestream-ops-demo-2x9hddzmk-livestream2.vercel.app
**Exact deployed app SHA**: `0e1c82cf0c60a73be6916029b457732f8960b9ee`.
**CI**: https://github.com/anhkienk4-max/live-app-main/actions/runs/40831992753 (SUCCESS, Core-based candidate).
**Protected Preview**: Vercel Authentication is enabled. This app's Staging Preview is not public; do not disable its protection.

## Release evidence
- CI and Vercel build READY are verified on the above Core-based application SHA. These are **mock/browser UI and build checks**.
- Admin/Leader/Member actual authenticated Staging UAT: **PENDING** until executed with dedicated accounts.
- The current ChatGPT Vercel connector receives HTTP 403 for protected page content; it cannot authenticate on behalf of the three users.
- Payroll and Workforce with flags/capabilities OFF are **BLOCKED**, not PASS. Tests with skipped/failed cases cause the separate release evidence validator to return NO-GO.
- No mutation tests are included: registration approval, shift changes, payroll calculations, uploads and report submission require separately approved seeded Staging fixtures.

## Windows execution
Open PowerShell in the repository root on the **release/rc19-ui-on-live-1609db-20261028** branch. Ensure Node.js and pnpm dependencies are installed. Run:

```powershell
& ".\scripts\run-pwa-functional-uat.ps1" -PreviewUrl "https://livestream-ops-demo-2x9hddzmk-livestream2.vercel.app" -ExpectedSha "0e1c82cf0c60a73be6916029b457732f8960b9ee" -WithVercelBypass
```

The runner prompts for the **Vercel Automation Bypass secret**, and then for dedicated Admin, Leader and Member Staging emails and hidden passwords. Never paste these secrets into ChatGPT, commit them, or use Production identities.

The Vercel bypass secret must be provisioned by an authorized operator through Vercel Project Settings → Deployment Protection → Automation Bypass. **Do not disable Vercel Authentication.** The Playwright request interceptor sends the bypass header only to the exact Preview origin, not to other websites. The script removes/restores the process-scoped values when finished. Without the bypass credential, the test will fail safely at the login form.

Tests use read-only page navigation and UI inspections, no business writes. The JSON report stays in `test-results/pwa-functional-staging.json` locally; it must not be uploaded to a public artifact store. Screenshots, video and browser traces are disabled for authenticated tests.

## Test cases
| Scope | Admin | Leader | Member |
| --- | --- | --- | --- |
| Mobile Dashboard at 390px and 412px | Role-specific | Role-specific | Role-specific |
| Calendar available shifts and my shifts | Read | Read | Read |
| Staffing registration reviewer workspace | Allowed | Allowed | Forbidden |
| Staff management | Admin controls | Read-only | Read-only |
| Reports | Read/filter UI | Read/filter UI | Read/filter UI |
| Payroll | Admin tabs if capability ON | Payslip/403 | Payslip/403 |
| Workforce | Team capability | Team capability | Own capability |

**NO-GO until all read-only tests pass with no skips**, and separately documented write-action/RLS tests and Production staged-build verification are complete. Exact CLI Production source parity is still partial; two generated Project Memory files differ in the Vercel snapshot. Current Production must be rechecked before any alias reassignment.
