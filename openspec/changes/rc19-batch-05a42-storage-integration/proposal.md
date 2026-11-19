# RC19 Batch 05A.4.2: storage reconciliation and import integrity

## Why

Storage PR #171 is based on Gemini Batch 01.1, while Gemini Batch 01.2 adds Import integrity changes. The runtime manifest also needs to match the Owner's 148-folder Drive registry, keep unverified restricted folders inactive, and preserve safe Excel source confirmation.

## What changes

- Integrate the exact Gemini 01.2 source commit in a local integration branch without changing PR #171 or the Gemini branch.
- Reconcile all 148 static folder records and seed the 55 additional HR/Attendance/Payroll folders as inactive with pending ACL review.
- Preserve fail-closed sensitivity, Drive ACL, application permission, operation and resource-scope checks.
- Serialize Excel receipt changes against batch confirmation and require application-level Drive parent, bytes and SHA-256 readback.
- Fix repository-wide ESLint errors found in the Storage/Import integration baseline.

## Out of scope

Production or Preview deployment, remote migration application, route activation, authenticated runtime Drive E2E, Issue #104 account overrides, and unimplemented dynamic routes for domains without approved subtype semantics.
