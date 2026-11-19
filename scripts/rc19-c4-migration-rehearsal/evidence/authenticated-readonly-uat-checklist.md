# Owner browser UAT checklist — staged C4 deployment

Deployment reported READY: `dpl_52bJg9T1ErjZVmk3ngGFKRwFksEU`. Keep `ops5729.top` on the previous deployment. Authenticate normally through Vercel SSO in Edge; do not export cookies/tokens. This checklist is read-only.

For each step record local time, route, HTTP main-document status/redirect, visible loading state, screenshot, sanitized console errors, and relevant API request path/status. Do not include names, report contents, payroll values, cookies, tokens, request bodies, or private URLs in notes/screenshots.

1. `/` — Owner already reported Admin Dashboard with real data after SSO. Capture a new screenshot only if the Admin authorizes. Wait for authoritative dashboard data or a visible error/retry state; record whether skeleton is still present and whether brand marks resolve.
2. `/calendar` — Verify authenticated route and month/list content. Do not create, edit, approve, or delete. Record API failures separately from an empty period.
3. `/staffing?tab=registration` — Verify registration review read-only. Do not approve/deny.
4. `/reports` — Verify report list and read-only details. Do not change status or export sensitive data.
5. `/workforce` — Verify authorized scope only. Stop if it shows data outside the account’s assigned Brand/team.
6. `/payroll` — Open only if existing Admin account has read authority; inspect no more than page shell. Do not approve/pay/export. Stop if any route load triggers a mutating RPC.
7. Permission-denied route/action — Capture only a sanitized denial state; do not use forged IDs or attempt unauthorized API calls against Production.

Defects already identified for UX hotfix tracking: loading overlay releases by timer rather than route-owned readiness; Dashboard progressive skeleton can appear after overlay dismissal; brand logo presentation uses initial-letter placeholders instead of each Brand's persisted `logo_url`. These remain separate UI issues. C2 now passes isolated PG17 reconciliation tests; Production SQL remains blocked by nine existing but unledgered relations without complete captured definitions/ACLs, missing Production backup/restore evidence, and unverified old-runtime/Drive/UAT gates.

Owner-reported visual evidence is partial: authenticated Admin Dashboard displayed real data. Codex did not instrument that Edge session. Terminal GETs were unauthenticated and redirected to Vercel SSO; this does not imply app auth failure. Remaining routes and role matrix are NOT VERIFIED until the Owner records them above.

## 2026-11-06 evidence status

- Owner-reported: Edge SSO succeeded and Admin Dashboard displayed real data. Codex did not instrument or capture the Owner's browser session, so this is partial visual evidence only.
- The staged Production-target deployment remains a Production-data surface. Keep all actions read-only and stop if any route triggers a mutation. Source search found no current C4 application call to `refresh_automatic_shift_statuses`; historical browser POST behavior is documented in `docs/global-stabilization/CONSOLIDATED_BACKLOG.md`. Do not press action buttons or invoke mutation APIs.
- `/calendar`, `/staffing?tab=registration`, `/reports`, `/workforce`, `/payroll`, and permission-denied behavior remain NOT VERIFIED by authenticated browser evidence.
- Frozen C4 defects are recorded above. Local uncommitted branch `codex/rc19-c4-ux-hotfix` contains a candidate readiness/logo correction, but it is not deployed and has no authenticated screenshot evidence.
- For each manual route, record only status/redirect, visible loading/terminal error state, sanitized console error, request method/path/status, and screenshot with sensitive data excluded. Do not capture names, payroll, report contents, cookies, tokens, or private URLs.
