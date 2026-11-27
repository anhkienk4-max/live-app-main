# RC19 W4 — FINAL BROWSER EVIDENCE HANDOFF

## 1. Overview & Handoff Coordinates

- **Branch**: `feat/rc19-w4-antigravity-frontend`
- **Application Scope**: Final Browser Evidence Integrity, Fixture Hardening, Context Isolation, and Acceptance Contract Closure
- **Target Integration Partner**: Codex 02 (`integration/rc19-w4-codex02`)
- **Master Denominator**: 66 checklist items across 8 phases (Issue #80: 33/66, Phase 03: 5/8)
- **Production Status**: **HOLD / NO-GO** (Deployment disabled via `vercel.json` non-deployment guard)

## 2. Evidence Integrity

1. **Observed Authentication & Mapping**:
   - Eliminated credential-presence inference (`synthetic_users.{role}.login` is no longer computed as `Boolean(env[role])`).
   - Dynamic runtime tracking records `login: true` and `canonical_business_user_mapping: true` only when GoTrue browser navigation submits credentials, redirects away from `/login`, and renders the authenticated application shell.
   - Authorization flags (`rbac`, `rls`, `application_api`) default to `false` and update only upon verified runtime checks (e.g., L08 route guard and direct 401/403 media rejection).

2. **Attested Application SHA & Database Marker**:
   - Resolves `ATTESTED_APPLICATION_SHA` / `RC19_W4_EXPECTED_APPLICATION_SHA` dynamically via `git rev-parse HEAD`.
   - Resolves `DISPOSABLE_DATABASE_MARKER` / `RC19_W4_RUNTIME_DATABASE_MARKER`, defaulting to `DISPOSABLE_PG17_RUNTIME_PENDING` in offline environments and `LIVE_GOTRUE_AUTHENTICATED` when credentials are supplied.

3. **Per-Case Tracking & Failure Capture**:
   - Implemented `test.afterEach` hook capturing `failed`, `timedOut`, and `interrupted` Playwright test outcomes directly into the per-case results map.
   - Atomic report writing via process-specific temporary file rename prevents cross-worker clobbering.

4. **Strict Schema V2 Conformance**:
   - Generated reports conform to `rc19-w4-application-acceptance/v2`.
   - Both `docs/handoffs/evidence/rc19-w4-acceptance-report.json` and `test-results/rc19-w4-acceptance-report.json` are emitted atomically.

## 3. Fixture Integrity & Context Isolation

1. **Shared Fixture Manifest**:
   - Manifest path: `tests/fixtures/rc19-w4-shared-fixtures.json`.
   - Loader helper `loadSharedFixtures()` supports `process.env.FIXTURE_MANIFEST_PATH`, file fallback, and environment overrides.
   - Defines canonical synthetic identities: `shiftA`, `shiftB`, `sourceRegistrationId`, `counterpartRegistrationId`, `sourceSegmentId`, `counterpartSegmentId`, `conflictCandidateId`, `clearCandidateId`, `reportId`, and `periodId`.

2. **Removal of Generic Fallback Selectors**:
   - Eliminated all loose CSS selectors (`tr`, `[role="group"] button`, `[data-testid^="calendar-event-"]`, `[data-testid="shift-card"]`).
   - Required exact fixture bindings:
     - `tr[data-shift-id="${SYNTHETIC_FIXTURES.shiftA}"]`
     - `[role="group"] button[data-candidate-id="${SYNTHETIC_FIXTURES.conflictCandidateId}"]`
     - `[role="group"] button[data-candidate-id="${SYNTHETIC_FIXTURES.clearCandidateId}"]`
     - `div[role="group"] button[data-shift-id="${SYNTHETIC_FIXTURES.shiftB}"]`
     - `[data-testid="counterpart-option-${SYNTHETIC_FIXTURES.counterpartRegistrationId}"]`
     - `[data-testid="calendar-event-${SYNTHETIC_FIXTURES.shiftA}"]`

3. **Isolated Authenticated Browser Contexts**:
   - Helper `withAuthenticatedRole(browser, role, fn)` instantiates a fresh browser context (`browser.newContext()`) for each test actor.
   - Admin, Leader, and Member sessions are strictly isolated, with guaranteed context destruction in `finally` blocks.

## 4. Acceptance Classification (Database Readback & Partial Coverage)

1. **Database-Dependent Case Classification**:
   - Cases requiring persisted database evidence (`D03`, `D07/D09`, `L01`, `L02/L03`, `ATT-01`, `PAY-01`, and `RESPONSIVE-OPERATIONAL`) are classified as partial coverage.
   - In offline/unhosted mode, these cases report honestly as `NOT RUN` (or `BLOCKED` under `REQUIRE_HOSTED_ACCEPTANCE=true`) with reason: `Awaiting execution against authenticated disposable hosted runtime with persisted readback.`.
   - In hosted mode, if `HOSTED_DB_READBACK_VERIFIED !== 'true'`, UI passes are recorded as `BLOCKED` with evidence scope `Hosted browser UI verified; persisted DB readback pending`. Only when `HOSTED_DB_READBACK_VERIFIED === 'true'` do they report `PASS`.

2. **Responsive Suite Separation**:
   - Suite A smoke test covers public `/login` (`RESPONSIVE-LOGIN`) across 4 viewports (320px, 390px, 768px, 1440px), asserting 0 horizontal scroll.
   - Operational workspace responsiveness (`RESPONSIVE-OPERATIONAL` for `/calendar`, `/swaps`, `/workforce`, `/reports`) is isolated under Suite B and requires an authenticated Member session to prevent false-PASS from login redirects.

## 5. Executable Entrypoint for Codex 02

To execute the test suite in the hosted runtime:
```bash
# Set synthetic GoTrue credentials and runtime environment
export E2E_ADMIN_EMAIL="..."
export E2E_ADMIN_PASSWORD="..."
export E2E_LEADER_EMAIL="..."
export E2E_LEADER_PASSWORD="..."
export E2E_MEMBER_EMAIL="..."
export E2E_MEMBER_PASSWORD="..."
export FIXTURE_MANIFEST_PATH="tests/fixtures/rc19-w4-shared-fixtures.json"
export HOSTED_DB_READBACK_VERIFIED="true" # Set when database assertions pass in backend harness

# Run Playwright acceptance
pnpm exec playwright test e2e/rc19-w4-browser-acceptance.spec.ts
```
