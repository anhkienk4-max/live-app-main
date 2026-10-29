# RC19 STO-01 Private Operational Root Activation Runbook

**Status: EXTERNAL APPROVAL REQUIRED — NOT READY FOR ACTIVATION**

This runbook is source-side preparation only. It does not create folders, change ACLs, seed routes, enable routing, or touch Production.

## Approved activation contract

- Activation seed: exactly 13 `execution_source='internal'` Google Drive routes.
- Agency routes: 0 activated. One schema-valid Mars Snacking Agency route is deferred by policy; seven additional Agency routes require a separately approved profile migration.
- Attendance evidence: a distinct private root and separate ACL boundary. It is not a child of this operational root and the Attendance feature remains OFF.
- Google Drive-only activation does not require OneDrive connectivity.
- Existing `LIVESTREAM REPORT` root, archives, legacy route folders, and their file IDs remain untouched.

## Physical root status

The currently seeded tree inherits an `anyone:writer` permission from an ancestor. Treat every descendant under that permission chain as **UNSAFE for activation**. This is a content-integrity and unauthorized-write risk; it is not evidence that anonymous read is enabled. No ACL was changed.

No Owner-approved replacement root or verified production runtime identity access evidence is available in this handoff. Therefore no current route can be marked writable or safe.

## 13-route mapping inventory

The current seed’s brand/platform mappings are listed below for reconciliation. Physical IDs are intentionally omitted from this operational handoff. Every row currently points through the legacy shared root and remains unsafe until a newly approved private-root mapping is verified.

| Route | Brand | Platform | Provider | Physical target | ACL / writable | Status | Required action |
|---|---|---|---|---|---|---|---|
| 1 | ASM AI Livestream | All | Google Drive | Canonical root | Inherited public writer / runtime write unverified | UNSAFE | Create approved private-root mapping |
| 2 | Female AI livestream | All | Google Drive | Canonical root | Inherited public writer / runtime write unverified | UNSAFE | Create approved private-root mapping |
| 3 | Male AI livestream | All | Google Drive | Canonical root | Inherited public writer / runtime write unverified | UNSAFE | Create approved private-root mapping |
| 4 | Mars Snacking | All | Google Drive | Existing internal brand base | Inherited public writer / runtime write unverified | UNSAFE | Map a new private target; preserve old folder |
| 5 | ASTROMAN | All | Google Drive | Existing brand base | Inherited public writer / runtime write unverified | UNSAFE | Map a new private target; preserve old folder |
| 6 | Female | All | Google Drive | Existing brand base | Inherited public writer / runtime write unverified | UNSAFE | Map a new private target; preserve old folder |
| 7 | X-men | All | Google Drive | Existing brand base | Inherited public writer / runtime write unverified | UNSAFE | Map a new private target; preserve old folder |
| 8 | CUREL | All | Google Drive | Existing brand base | Inherited public writer / runtime write unverified | UNSAFE | Map a new private target; preserve old folder |
| 9 | KATE | All | Google Drive | Existing brand base | Inherited public writer / runtime write unverified | UNSAFE | Map a new private target; preserve old folder |
| 10 | KAO | All | Google Drive | Existing brand base | Inherited public writer / runtime write unverified | UNSAFE | Map a new private target; preserve old folder |
| 11 | OPELLA | Shopee Live | Google Drive | Existing platform base | Inherited public writer / runtime write unverified | UNSAFE | Map a new private target; preserve old folder |
| 12 | OPELLA | TikTok Shop | Google Drive | Existing platform base | Inherited public writer / runtime write unverified | UNSAFE | Map a new private target; preserve old folder |
| 13 | Pepsico | All | Google Drive | Existing brand base | Inherited public writer / runtime write unverified | UNSAFE | Map a new private target; preserve old folder |

## Owner approval and verification sequence

1. Owner designates a new Google Drive operational root with no `anyone:reader` or `anyone:writer` direct or inherited grants.
2. Owner confirms the root’s full parent chain, shared-drive restrictions, owner/control boundary, and that inherited access remains private.
3. The Production runtime identity is verified against the root and each target: it can enumerate/read required metadata and add a child file. Do not infer runtime identity from the connected human Drive account.
4. Owner approves a route-by-route mapping for these 13 internal routes. Keep existing archive and legacy folders unchanged. Produce a new seed candidate if root or base IDs change.
5. Verify that Attendance evidence uses its own separately approved private root and never resolves into a Brand operational route.
6. Run isolated PostgreSQL 17 preflight/seed assertions on the exact candidate: 13 total, 13 internal, 0 Agency, unique route key, approved root/base mapping, valid active Admin approver, rollback and idempotency.
7. Perform a synthetic provider read/write/readback test only after Owner authorizes a non-Production test folder. Verify checksum and delete only that explicitly designated synthetic artifact.
8. Confirm Google Drive provider readiness. OneDrive remains optional.
9. Owner reviews the exact source SHA, route manifest, physical ACL evidence, rollback plan, and signed role UAT before activation.

## Rollback and release boundary

- Current Production route table state remains as previously reported; this task performs no DB query or mutation.
- Do not run the seed while any route points to the currently unsafe shared-root chain.
- Roll back by restoring the prior routing configuration and route rows through an Owner-approved recovery plan. Do not delete/move historical files or routes as a substitute for restoring configuration.
- STO-02 remains a review-only schema proposal stacked on STO-01. The 13-route seed retains the existing `operational_storage_routes` columns and keys; no schema, RLS, grants, or approved route rows are modified by this source correction. Re-run STO-02 combined PG17 integration against this seed candidate before treating the stack as compatible.

## Evidence required to change status

Mark **READY FOR ACTIVATION** only when the replacement root, inherited ACL chain, Production runtime identity read/write capability, all 13 route mappings, Attendance isolation, exact-SHA PG17 suite, and independent Owner approval are recorded. Until then: **EXTERNAL APPROVAL REQUIRED**.
