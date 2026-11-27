# RC19 W4 hosted application acceptance harness

## Exact source and trigger contract

The reusable workflow is `.github/workflows/rc19-w4-hosted-application-acceptance.yml`.
It checks out the exact `harness_sha`, reads the reviewed application allowlist from
that harness checkout, and checks out the exact application SHA. The caller must
pin its `uses:` reference and `harness_sha` input to the same full SHA. Updating an
allowlist only in a caller branch cannot authorize a candidate against an older
harness checkout.

The branch caller is push-triggered only on
`integration/rc19-w4-codex02`, and only when
`.github/rc19-w4-acceptance-ready.json` changes. It validates the marker's fixed
application SHA against the caller branch allowlist, requires the v2 reviewed
entrypoint, and validates the fixed harness SHA against its reusable-workflow pin
before it starts any Supabase runtime. The marker is absent until Lane 01 supplies
a reviewed candidate and the caller/harness pins have been updated together.
The current allowlist at `87a077955f309e5daaaf4c8dd229df2ae586053a` is stale for
full application acceptance and must not be used to claim a business acceptance
pass.

The caller requests browser UAT. The harness requires it to report
`ran=true` and `passed=true`. No Production/Staging access, secret, deploy action,
or remote Supabase link is provided.

## Disposable runtime

The runner installs the application's frozen pnpm lockfile, starts a run-unique
Supabase CLI 3.4.0 stack from the exact application checkout, applies only that
checkout's canonical migrations with seeding disabled, and cold-starts the stack.
It confirms GoTrue and PostgREST point to the unique database container, writes and
reads a run marker, and confirms the local runtime is PostgreSQL 17.12. Runtime
credentials and synthetic passwords are masked and retained only in job-local
environment files.

The harness records sanitized exact-runtime evidence: migration filename and
SHA-256 for every SQL file, ordered migration receipts from the disposable ledger,
PostgreSQL version, GoTrue/PostgREST image IDs, Auth catalog table names, extension
versions, and sanitized Auth/PostgREST database identities. It compares ordered
local migration versions with executed receipts. This is fresh-stack evidence; it
does not establish historical upgrade acceptance or Production readiness.

Next.js must pass the candidate's production build and start against the same
disposable runtime. Readiness requires HTTP 200 from the login route on loopback.
The server process runs while the acceptance entrypoint performs authenticated
browser work. The service-role key is passed only as server-side `SUPABASE_SECRET_KEY`;
it is never placed in a `NEXT_PUBLIC_*` variable. Mock mode is explicitly false.

## Per-case report contract v2

The proposed Lane 01 output schema is `rc19-w4-application-acceptance/v2`. Lane 01
owns fixture creation, business behavior and persisted readback; Antigravity owns
frontend interaction and the original L01–L15 browser/media mapping. Codex 02
implements the outer runtime, SHA and report gates. The per-case report contract
must be confirmed with those lanes before a candidate is allowlisted or acceptance
is run.

The entrypoint writes one JSON object to stdout and no secrets, JWTs, actual user
IDs, raw database rows, screenshots, or Playwright traces. It must include:

- Real disposable Supabase Auth login and canonical `business_users` mapping for
  synthetic Admin, authorized Leader and Member actors, plus the other required
  scoped/revoked actors in the agreed test inventory.
- `database_binding.runtime_marker_match=true` and
  `database_binding.application_target_match=true`, verified through application
  requests and persisted readback against the same run marker.
- `next_app.ready=true`, authenticated browser evidence, and `browser_uat` with
  `ran=true`, `passed=true`, and a positive interaction count for this caller.
- A nonempty `business_cases` list with unique `case_id`, `area`, original source
  case IDs, actor role/sanitized scope key, expected authorization and result,
  actual HTTP status or RPC code, persisted database readback, negative
  authorization result, browser interaction evidence where relevant, and
  `status="passed"`.
- Coverage of all required business areas: calendar/shift creation, registration,
  segmented staffing, attendance segment boundaries, import/staffing updates,
  PASS/Swap, atomic replacement, operational notes, workforce reporting, temporal
  payroll, report revision snapshots, External Summary, Storage authorization and
  upload/readback, Live Monitoring authorization, and Brand/Agency boundaries.
- Original Delta D cases D01–D11 and Live Monitoring cases L01–L15 mapped by ID.
  Their acceptance steps and evidence scope remain owned by the source lanes. The
  harness pins the original L meanings from issue #189: L01 saved-link/readback and
  stale-write; L02 consent and actual video; L03 A→B→A continuity; L04 Reports
  navigation; L05/L06 independent Admin/Leader frames; L07 Member scope; L08 direct
  unauthorized denial; L09 viewer reconnect; L10 concurrent-room isolation; L11
  publisher stop/resource release; L12 interruption and consent-required restart;
  L13 expiry/revocation/logout/termination; L14 privacy/no recording/audio; L15
  Live/Reports/Calendar/Shift/OBS regression and measured resource/latency/egress.
  Each sanitized case must include a `source_criteria` entry with the exact L ID and
  criterion slug; an ID-only alias cannot satisfy this mapping. Lane 01 and
  Antigravity still need to confirm the report schema and D01–D11 source mappings.

The reusable workflow rejects v1's generic RBAC/RLS/API booleans. It validates the
v2 per-case structure, required business areas, D/L source case IDs, database
readback and negative authorization outcomes, and authenticated browser result.
Only the sanitized allowlisted fields are retained in the 14-day artifact; raw
entrypoint output stays in the ephemeral runner workspace.

## Lane agreement and rollout sequence

1. Lane 01 and Antigravity confirm the `business_cases` schema, actor/scope labels,
   mapping to D01–D11 and L01–L15, and the browser evidence fields.
2. Lane 01 implements that contract in the reviewed acceptance entrypoint; no
   Codex 02 replacement fixture or frontend implementation is substituted.
3. Codex 02 reviews the application SHA, updates the allowlist in a new harness
   commit, and records the new full harness SHA.
4. The caller is updated to pin that exact harness SHA and the reviewed application
   SHA; only then is the acceptance-ready marker added to trigger the run.
5. Any change to the app SHA, harness, workflow, contract or required cases invalidates
   affected exact-SHA results. Production remains HOLD until the independent release
   gates and Owner GO.
