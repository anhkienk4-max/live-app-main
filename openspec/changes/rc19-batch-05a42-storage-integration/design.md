# Design

## Source integration

Use the fetched Gemini branch head `6b82dae4e08976ad59c87f7fafda2a0188f919d4` as a separate merge parent on the local integration branch. Keep Gemini's five-file change intact. Storage changes apply as a follow-up integration commit; no push, PR edit, merge to `main`, or deployment occurs here.

## Registry and routing

Treat the 93 original folders as baseline and the 55 Owner-created HR/Attendance/Payroll folders as additional physical records (148 total). Seed only the additional records, with exact ID/path/parent, `restricted_pending_app_acl_verification`, and `active=false`. Conflicts at an existing path must fail the post-check rather than silently rewriting a folder. Preserve dynamic folders as on-demand children of approved domain roots. The nine report groups use real shift, Brand, Platform and period IDs; domains without an approved category/subtype route remain partial.

## Security policy

Data sensitivity, provider ACL verification, application authorization, operation permission and resource scope are independent predicates. Sensitive categories require every registered ancestor to be `restricted_verified`; pending ACL classes never authorize writes. Drive write capability is checked on the exact target folder. Private reads stream through authenticated backend handlers after scope checks, provider-parent validation and checksum verification. Non-Admin Brand/period scopes fail closed until a trusted Leader mapping exists.

## Excel source integrity

The source workbook remains attached to an owned Excel import batch, independently of shift `execution_source`. The API verifies Drive object ID, exact parent, byte count and SHA-256 before marking the receipt verified and before Import confirmation or shift writes. Database triggers serialize receipt mutation against batch confirmation, preserve confirmed batch identity and receipt references, and reject missing/unverified receipts. A database status alone is not proof that Drive bytes exist; provider readback remains an application boundary.

## Verification limits

The local PGlite 17 fixture validates the ordered migrations and trigger contract. It does not reproduce Production schema history, Drive OAuth identity, inherited ACLs, or cross-session PostgreSQL locking. Those remain deployment gates.
