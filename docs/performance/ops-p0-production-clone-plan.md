# OPS P0 — Production-equivalent UAT clone authorization and cost gate

Status: **PREPARED / NEW SUPABASE BRANCH NOT CREATED / NO PRODUCTION WRITES**

## User authorization

On 2026-10-18 the project owner explicitly authorized cloning from Production
to replace missing benchmark coverage. Authorization to clone is not an
agreement to a newly quoted recurring infrastructure cost. Do not create a
charge-bearing branch until the owner explicitly accepts the actual cost.

Production project: `egdjnpmoasarrttvhgds` (Seoul, PG17).
Existing (drifted) Staging: `amagnzebmmuqiptmrjmc` (Seoul, PG17).
Both are in organization `bctekbtrucnrbtgpnfhc`, whose API-reported plan
at this check is **Free**.

The Supabase `create_branch` request for branch
`ops-p0-prod-schema-uat-20261018` was rejected because this organization
requires a **cost confirmation ID**; no branch was provisioned.
Supabase `get_cost(type=branch)` quoted **USD 0.01344 per hour**.
That is USD 0.32256 for 24 hours or USD 9.6768 for 30 continuous days,
**excluding additional usage, taxes, plan upgrade or other charges**.
Official Supabase documentation currently describes production-schema
branching as a Pro-plan feature. Verify actual prerequisites and complete
the interactive billing consent if a Pro upgrade is requested. A branch
typically does **not** contain any Production rows.

## Explicitly prohibited

- No writes, test seeds, triggers, or migration history edits on Production.
- No unredacted copy of Production Auth users, staff identities, payroll,
  personal information, report metrics, credentials, API keys, storage
  provider OAuth tokens, or live file pointers into a test environment.
- No overwrite, reset or drop of the existing staging project.
- No branch merge/rebase to Production as part of benchmark.
- No sending passwords/connection strings/JWTs to CI artifacts, PR comments
  or performance reports.
- A clone branch must have outbound notifications/webhooks and scheduled
  jobs disabled until test credentials and fake data are configured.

## Safe provision-and-validate sequence (after quoted cost acceptance)

1. Create the preview branch from the **Production** Supabase project. Record
   its unique `project_ref`, and verify it is not either known project ID.
   Add an explicit branch-name and project-ref guard to all SQL clients.
2. Run `scripts/performance/ops-p0-schema-deep-fingerprint.sql` on
   Production and branch as SELECT-only queries. Compare all eight app-object
   categories (relations, columns, constraints, indexes, policies,
   functions+privileges, triggers, grants).
3. Run `scripts/performance/ops-p0-shift-rpc-parity.sql` and
   `scripts/performance/ops-p0-schema-shape.sql` against both to confirm
   the critical RPC signatures and eight table shapes match.
   **Never** equate a matching schema with matching data or auth config.
4. Create synthetic/fake users, brands and staff from scratch; seed
   1k/5k/10k/100k fake shifts and registrations with realistic temporal and
   status distributions. Ensure all Auth test users have throwaway emails
   and are barred from real messages or webhook delivery.
5. Establish real JWT-based Admin/Leader/Member/disabled test sessions.
   Verify fail-closed access, payroll boundaries, archived shifts and
   private report access. Synthetic `rc16k.actor` alone is inadequate.
6. Run **alternating** baseline-vs-candidate RLS measurements under the
   same data cardinalities, 10+ iterations per combination, with order
   randomization and warmed/cold cache recorded.
7. Load-test 1/10/50/100 simultaneous readers under realistic request
   behavior, and mixed approved/registration updates on a *separate*
   synthetic dataset with optimistic concurrency checks.
   Collect p50/p95/p99 latency, throughput, error rate, connections,
   CPU, query plans and query count per page.
8. No merge until full regression, independent security review,
   performance benefit under load, rollback procedure and reviewer approval.
9. Delete the disposable branch after evidence collection to stop recurring
   branch usage charges. Only the owner can authorize any continuing spend.

## Schema-only baseline (read-only audit, 2026-10-18)

Fingerprint: `scripts/performance/ops-p0-schema-deep-fingerprint.sql`.
These counts refer only to `public` and `private` app schemas.

| Catalog object | Production | Existing Staging | Digest parity |
| --- | ---: | ---: | --- |
| Relations | 29 | 22 | DIFFERENT |
| Columns | 544 | 439 | DIFFERENT |
| Constraints | 279 | 203 | DIFFERENT |
| Indexes | 122 | 100 | DIFFERENT |
| Functions | 178 | 154 | DIFFERENT |
| Non-internal triggers | 51 | 45 | DIFFERENT |
| RLS policies | 30 | 30 | MATCH |
| Relation grants | 29 | 22 | DIFFERENT |

Matching RLS policy fingerprints do **not** compensate for missing RPCs,
triggers, tables or payroll schema in existing Staging.

## Current non-billable fallback

Continue working with the already configured, isolated PostgreSQL 16/17
GitHub Actions fixture containing fake shifts. It verifies correctness and
provides preliminary SQL timing evidence **without claiming a Production
clone exists**. Real full-schema and real-JWT UAT stay blocked until a
production-equivalent preview project is available.
