# RC19 G12 / C12 Audit History handoff

Status: **READY FOR FRONTEND REVIEW; authenticated integration remains unverified.**

Branch: `gemini/rc19-g12-audit-history`

Base: G10 `a81ee933034129613cec74024274eb20b717731b`

## Implemented

- Audit History uses the C12 keyset page service instead of loading a count and offset-paged history. Cursor, snapshot, page size, sort, and supported scope filters are sent to the server.
- Date, actor, Brand, role, module, action, persisted status, source, and entity-name search filters are URL-addressable. The current cursor trail is held in session storage by identity and filter scope so browser Back/Forward and refresh can restore the page context without putting the full trail in the URL.
- Superseded requests are aborted and sequence-guarded; identity changes, authorization errors, timeouts, invalid cursors, missing C12 RPC, and retry states do not leave stale audit rows visible.
- The page labels only the events on the current page; it does not imply an exact count. Actor choices are accumulated from pages in the current identity/filter scope, not fetched as an unbounded directory.
- The existing permission preflight, RLS boundary, and authorized before/after detail rendering remain authoritative. Table rows support keyboard activation. The route is wrapped in Suspense for Next 16 search-param rendering.

## C12 contract

The adapter calls `get_audit_history_page` with a bounded page size, stable cursor/snapshot and server-supported filters, and accepts a page of events, next cursor, range metadata and `has_more`. It does not issue an exact-count query. Missing RPC responses are surfaced as an explicit integration error.

The endpoint/migration is not included in this G12 branch. C12 must be integrated and deployed to the target environment before authenticated reads can pass. C12's current contract supports entity-name search (not arbitrary description/code search), persisted success/failed status (not warning/retryable), and Brand scoping as a filter only; RLS remains the authorization boundary. The endpoint does not provide an exact total. Confirm the deployed RPC's parameter/result shape against the adapter before integration.

## Verification

- Focused Node audit/RBAC tests: **15 passed**.
- Return-context/navigation regressions: **6 passed**.
- G12 mock Playwright: **2 passed**. Admin filter/page/detail and Back/Forward journey ran at 390px, 768px and 1440px; Member denied and Leader restricted fixtures passed.
- TypeScript: **passed**.
- Full ESLint: **passed, 0 errors / 36 warnings** (warnings are in existing unrelated files).
- Credential-free production build: **passed** using the existing `ENV_SUPABASE_CONFIG_REQUIRED` guard's `credential_free_build` mode with `CI=true`.
- `memory:validate`: **failed** because `project-memory/current-state.json` has a stale `repository.head`; validator lists broad pre-existing unrelated G1–G11 paths. Canonical memory was not regenerated or changed.
- Playwright screenshots are retained under `test-results/rc19-g12-audit-history-G12-8e037-ry-at-mobile-tablet-desktop/` for 390px, 768px and 1440px. They are local evidence and are not committed.

## Not verified / integration blockers

- No authenticated C12 RPC, database/RLS, expired-session, foreign-Brand denial, slow-server timeout recovery, or cross-session acceptance was available in this mock-only run.
- Stable keyset pagination under concurrent audit inserts depends on the integrated C12 snapshot/cursor implementation; this UI run cannot prove database consistency.
- Full G1–G11 regression suites were not run. Focused audit, RBAC, navigation and return-context tests passed.
- READY FOR FRONTEND REVIEW does not mean authenticated API/database acceptance or FULL FUNCTIONAL PASS.
