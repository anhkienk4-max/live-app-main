# ADA OPS P0.8 — Report image authorization HTTP-handler mapping

Status: **patch on isolated UAT branch; CI on head required**.
No Production deployment, Supabase mutation, new cost or external file I/O.

## Verified problem and fix

On existing Staging, P0.7 confirmed a Member could previously pass two
`SECURITY DEFINER` image-delete preflight RPCs when ownership fields
were NULL. That database issue was corrected on Staging with the existing
Production definitions. The authorization RPCs now reject with SQLSTATE
`42501`.

The HTTP handler `lib/server/reportImageRouteHandler.ts` previously
classified **every** PostgREST RPC error as an unexpected provider failure
(`502 REPORT_IMAGE_DELETE_FAILED`), even when a legitimate 42501
ownership denial occurred. Provider deletion was not reached, but the
client was given incorrect failure semantics.

The P0.8 patch maps **only** an error from the
`authorize_report_image_delete` or
`authorize_live_report_image_delete` preflight where
`error.code === '42501'` to the existing sanitized
`AuthorizationError(403, PERMISSION_DENIED)` response.
All non-42501 failures still fail closed with the original
generic 502 response. The external provider delete and metadata
deletion paths are unchanged. No authority is inferred from
untrusted headers; the database remains the source of ownership.

## Automated regression

Expanded existing
`tests/rc12-report-file-provider.test.ts` (already in full
release manifest) with two tests across both Report/Live
and Google Drive/OneDrive:

1. PostgREST 42501 → **403**, no-store, sanitized error code,
   **no provider deletion, metadata deletion or provider IDs leaked**.
2. Other RPC errors → generic **502**, no sensitive SQL/provider
   details exposed, **no provider or metadata deletion**.

These tests use injected fake database/provider adapters and
simulated server-user resolution. They are **not real signed JWTs,
not a live provider sandbox and not a deployed Preview HTTP test**.

## Outstanding release gates

Require CI of the exact P0.8 commit, real signed Staging Auth sessions,
Preview bound to Staging (not Production), provider sandbox integration,
Finance signoff and final Production authorization. P0.7 database tests
remain separate and were conducted in transaction ROLLBACK.
