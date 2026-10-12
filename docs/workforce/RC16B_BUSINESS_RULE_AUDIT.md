# RC1.6B backend business-rule and Workforce review

Starting SHA: 2aeac4e97b0f6ce726356ef49701999ccdb31be2.
PR #25 is Draft, based on Storage PR #24, which is also Draft. Both remote
states and the starting CI success were verified through GitHub on 2026-10-11.
No frontend, Production data/schema, Drive writes, merge or deployment is authorized.

## Business rules checked against source

| Rule | Source behavior and scope |
| --- | --- |
| Overnight | Zoned actual timestamps determine elapsed minutes across midnight. Rate and payroll period use shifts.date (business date), not the UTC/end date. Existing pure test and new PG rate-boundary assertion cover this. |
| Multiple Hosts | Separate segments/staff IDs per host; attendance does not enforce one Host per shift. PG fixture verifies multiple approved Hosts. |
| Mid-shift replacement | Explicit coverage_kind=replacement and independently reviewed actual segment; no automatic truncation or inference from planned assignment. PG replacement assertion added. |
| Support across split Hosts | Pay segment once; staff-wide approved attendance overlap rejection applies across roles and shift IDs. New PG split-support rejection and global segment uniqueness protect payroll. |
| Late/no-show | First approved segment start drives lateness relative to explicit grace policy; no-show requires reviewed explicit evidence. Missing evidence is UNKNOWN, not no-show. Conflicting worked/no-show is rejected. |
| Overlapping planned shifts | Payroll uses actual evidence; same staff's approved worked intervals cannot overlap. This does not prove planned assignment overlap was prevented in all scheduling paths; schedule enforcement is outside this patch. |
| Actual vs payable | Original actual/rate snapshot cannot be retargeted during correction. Payable <= actual, OT <= payable, integer minute bounds. No paid-break rule is invented. |
| OT/adjustment | Integer VND, integer basis points, one final half-up rounding. Signed adjustment needs approved evidence reason; nonnegative bounded net. Server and PG validate independently. |
| Rates/effective dates | Staff-specific approved scope outranks role default. Approved cards and reviewed attendance are immutable. **Fixed:** direct PG insertion previously accepted a role default despite an applicable staff-specific rate; new INSERT guard enforces the API preference. Future effective rates do not rewrite prior line snapshots. |
| Period boundaries | 93-day maximum and shift business-date inclusion; no splitting of a single overnight segment between periods. Global segment reservation protects overlapping periods. |
| Duplicate payment | Unique(segment_id) remains unchanged, including voided lines. Unique(period_id,segment_id) remains. No delete/unvoid/reissue path. |
| Independent review | Existing creator/self-review and reviewer/self-confirm restrictions preserved. **Added:** correction/void authors also cannot Review their period. Need another authorized reviewer; no Leader salary access or invented Finance role. |
| Locked payroll | Every correction/void checks the locked period in one transaction. Existing Locked-period guards remain. New concurrent Review test verifies waiting correction fails atomically. |
| Finalized evidence/rate edits | Approved/rejected attendance and all approved rate cards remain immutable. New PG assertions verify finalized evidence/card changes fail. |
| CSV | Locked only; no voided evidence in payment CSV, signed adjustment remains numeric, text fields remain formula-neutralized. API regression covers corrected amounts and omitted voided line. |

Other confirmed fixes: the foundation line trigger omitted DELETE even though
its function had a DELETE rejection; RC1.6B adds a DELETE trigger and tests it.
Direct unaudited Draft UPDATE is now rejected. All-void Review is rejected,
preventing the existing empty-period deadlock in the new void workflow. Monetary
DB bounds now match the existing server's 1e12 VND guard.

## Workforce gaps and evidence limits

The supplied V1.2 Notion page
https://app.notion.com/p/39f5449511e6802aa645c1cf49ed1d0f could not be fetched in
this environment. The findings below are verified source observations against
the requested K1/K2/Timeline/Hours scope; full roadmap parity is **unverified**.

- Attendance coverage, explicit UNKNOWN/no-show, punctuality, known reliability,
  role/month filtering, own-data authorization and weighted team KPIs exist.
- The leaderboard requires complete attendance, an explicit minimum workload
  sample, and verified punctuality. Its deterministic tie-break uses worked
  shifts/minutes. It is not a normalized productivity score or fairness proof.
- Monthly summaries exist, but no multi-month trend endpoint exists.
- There is no shift-completion KPI using a planned end timestamp. An approved
  worked segment establishes observed work, not completion of the full shift.
- Extra/cover/replacement evidence outside planned staffing is excluded from
  planned attendance denominators. Team overview exposes unmatched segment
  count; the individual endpoint queries only its planned shifts. These
  scopes do not report all unassigned actual workload. Reconciliation and a
  separately specified actual-workload response are needed before claiming
  full workforce coverage; no denominator policy was invented in this patch.
- Actual Staffing API reads one shift's evidence; a cross-shift staff timeline
  API is not implemented. Gemini must not infer a completed timeline contract.
- GMV/Hour and Orders/Hour remain null until verified session/staff attribution.
- Missing lateness policy fails with 409; missing leaderboard policy leaves
  leaderboard unconfigured. No environment values were changed.

No Workforce KPI behavior or Gemini UI was changed; these gaps are recorded
for a subsequent explicitly scoped iteration.

## Migration ledger and release boundary

- Git: existing foundation remains unchanged; new additive migration follows
  it by version, so prior development application is not silently rewritten.
- Isolated PostgreSQL 16: bootstrap and original CI integrity SQL are retained
  in fixtures, then the new migration/correction/concurrency suite is applied.
  Local test container has network=none and no published ports; only synthetic
  users, attendance and rates are created.
- Preview/UAT: target identity and ledger have not been verified or modified.
- Production egdjnpmoasarrttvhgds: no connection, migration, operational mutation
  or provider operation performed. The user-reported absence of RC1.6 migration
  in Production is not independently re-queried in this task.

## Local verification evidence

- `pnpm exec tsc --noEmit --incremental false`: PASS.
- `node --import ./tests/typescript-alias-loader.mjs --test tests/rc16-*.test.ts`:
  **25/25 PASS**, including 7 added tests; existing tests preserved.
- Isolated PostgreSQL 16: original CI integrity fixture preserved verbatim and
  PASS; **49 new SQL assertions PASS**; **5 concurrent/rollback scenarios PASS**.
  Run locally with `node tests/rc16-payroll-postgres.integration.mjs --container rc16b-payroll-test`.
- `pnpm run build`: PASS with blank Supabase variables, database routing mode
  and no Production credentials.
- Focused ESLint: zero errors, 12 pre-existing unused mock-argument warnings.
  Full-repository lint was not run for this backend patch.
- `git diff --check`: PASS. Workflow YAML and exact preservation of the former
  inline PostgreSQL integrity SQL: PASS.
- `npm run memory:sync` and `npm run memory:validate`: PASS; synchronized only
  objective repository identity/inventory, keeping existing business decisions.

Final GitHub SHA/run evidence is reported after push in the completion handoff;
local results alone do not establish remote CI or UAT success.

## Next integration/UAT step

Keep PR #25 Draft and dependent on #24. Integrate Gemini against the updated
contract in an isolated branch, prove the Preview/UAT project and applied ledger,
then separately authorize/apply the two RC1.6 migrations there. Use synthetic
data and two independently authorized Admins to test actual review, payroll
preparation, correction/retry/conflict, void, Review/Confirm/Ready/Lock and CSV.
Include concurrent correction/Review, unknown attendance, multiple Hosts and
split-support cases. Confirm explicit rate/OT/grace policies first. Storage
physical provider UAT remains a separate gate. Request Production migration,
merge and release approval only after integration and UAT evidence exist.
