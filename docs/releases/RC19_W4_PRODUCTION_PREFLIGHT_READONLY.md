# RC19 W4 Production preflight: read-only evidence

Observed 2026-11-27 UTC using Vercel metadata tools. No Production database
connection, environment-variable values, deployment, export, or write was used.

## Observed deployment metadata

| Check | Evidence | Result |
|---|---|---|
| Vercel project | `livestream-ops-demo` (`prj_YSrsxfYK7skM17D3KtiXUGeim2kr`) | Project metadata resolved. |
| Domain binding | `ops5729.top`; Vercel returned `verified: true` and the same project ID. | Domain is verified on the expected Vercel project. |
| Current domain alias | Lookup by `ops5729.top` resolved to deployment `dpl_GHPSqMNBQ1yMVwGGGkZn1ygd8N3E`, with `ops5729.top` listed as an alias. | Alias points to a `READY`, `production` deployment. |
| Deployment URL | `livestream-ops-demo-1e41x0k44-livestream2.vercel.app` | Vercel metadata identity only. |
| Deployment source | Deployment metadata returned `source: cli`; `meta` was empty. Requesting Git source details returned no `gitSource` or commit SHA. | Actual deployed Git SHA **BLOCKED / UNKNOWN**. The latest `main` SHA is not a substitute. |
| Supabase runtime binding | No decrypted Vercel environment values or live app endpoint were queried. | Production app-to-database identity **NOT VERIFIED**. Project identity alone would not establish the active database binding. |

## Release and recovery gates

| Gate | Current evidence | Status / next action |
|---|---|---|
| Deployed application SHA | Vercel deployment metadata omitted a Git SHA; the repository's admin-only `/api/internal/release-provenance` returns sanitized build SHA and deployment ID, but it was not called without an authenticated Admin session. | BLOCKED. Owner-authorized Admin should capture the endpoint response and reconcile its deployment ID with Vercel metadata. |
| Effective Supabase binding | No approved runtime identity result tying the running app to a Production Supabase project was available. | BLOCKED. Obtain sanitized project-ref/runtime identity from an authorized production diagnostic; do not expose or copy secret values. |
| Backup freshness and retention | Current provider snapshot timing, retention and independent recovery evidence were not available through the permitted read-only metadata. Historical owner-reported recovery remains scoped historical evidence. | BLOCKED. Gemini/Antigravity owns backup/recovery source work; Owner/provider operator must supply current freshness, retention, escrow and isolated restore proof. |
| Migration compatibility | No Production schema, migration ledger, ACL/default ACL, trigger, RLS or Auth catalog was queried. | BLOCKED. Keep exact SQL review and Production-compatible isolated rehearsal separate from fresh-stack acceptance. No Production SQL. |
| Application rollback target | The current alias deployment ID is known, but its Git SHA and schema compatibility are not. | BLOCKED. Establish exact prior application SHA, required environment configuration and compatibility with the selected database migration state. |
| Database recovery / forward repair | No verified Production-compatible restore baseline or migration rollback/forward-repair evidence was available. | BLOCKED. Lane 01/Gemini to provide runner and migration evidence; Owner to authorize any Production change separately. |
| Production smoke and UAT | No authenticated business requests or DB readback were executed. | NOT RUN. Requires Owner GO after release gates and authorized real production actors. |
| Post-release monitoring | No release was performed. | PENDING. Capture service health/error and rollback readiness only after an approved release. |

The Vercel project/domain/deployment metadata does not establish Production
readiness or the deployed source SHA. Production remains **HOLD / NO-GO**. These
observations do not change any Phase 07 checklist status.
