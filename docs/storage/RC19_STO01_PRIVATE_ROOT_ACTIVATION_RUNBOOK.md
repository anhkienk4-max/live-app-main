# RC19 STO-01 Existing Operational Root Activation Runbook

**Status: EXTERNAL APPROVAL REQUIRED — NOT READY FOR ACTIVATION**

This runbook is source-side preparation only. It does not create folders, change ACLs, seed routes, enable routing, or touch Production.

## Approved activation contract

- Activation seed: exactly 13 `execution_source='internal'` Google Drive routes and 0 Agency routes.
- Do not invent a fourteenth internal route. The schema-valid Mars Snacking Agency route is excluded; seven other Agency routes remain subject to their separately reviewed proposal.
- Use the existing Google Drive root `LIVESTREAM REPORT` and preserve its current Brand/Platform/Period mappings. Do not create a replacement root, rename or move folders, or alter archive contents or IDs.
- Period folders continue to resolve beneath each existing mapped route according to the existing storage placement contract; this source change does not change the route map.
- Attendance evidence remains on its separate private root and ACL boundary. It must never resolve under the operational root. Attendance remains OFF.
- Google Drive-only activation does not require OneDrive connectivity.

## Existing root and ACL risk

The existing `LIVESTREAM REPORT` parent chain currently inherits an `anyone:writer` permission. The Owner has accepted use of this existing root while ACL hardening is handled separately. No ACL has been changed by this work.

Treat that grant as a temporary content-integrity and unauthorized-write risk. It does not by itself establish anonymous read access. Until ACL hardening is completed, use the operational root only for synthetic or explicitly approved non-confidential operational materials. Do not store attendance evidence, HR or payroll data, personal data, contracts, credentials/secrets, or unpublished commercially sensitive reports/KPIs there.

The current source-side physical folder mapping is retained as previously verified. Production runtime identity, provider connection, and effective write capability have not been verified in this handoff; a human Drive connection is not evidence of runtime access. Therefore the root is selected, but activation remains blocked pending the checks below.

## 13-route mapping inventory

Physical IDs are omitted from this handoff. Preserve the existing mapped base folders and their parent relationships; year/month placement remains governed by the existing resolver. Do not remap routes as part of this runbook correction.

| Route | Brand | Platform | Provider | Physical target | ACL / writable | Status | Action |
|---|---|---|---|---|---|---|---|
| 1 | ASM AI Livestream | All | Google Drive | Existing canonical root | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Verify runtime principal and effective access |
| 2 | Female AI livestream | All | Google Drive | Existing canonical root | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Verify runtime principal and effective access |
| 3 | Male AI livestream | All | Google Drive | Existing canonical root | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Verify runtime principal and effective access |
| 4 | Mars Snacking | All | Google Drive | Existing internal Brand base | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Preserve mapping; verify runtime access |
| 5 | ASTROMAN | All | Google Drive | Existing Brand base | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Preserve mapping; verify runtime access |
| 6 | Female | All | Google Drive | Existing Brand base | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Preserve mapping; verify runtime access |
| 7 | X-men | All | Google Drive | Existing Brand base | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Preserve mapping; verify runtime access |
| 8 | CUREL | All | Google Drive | Existing Brand base | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Preserve mapping; verify runtime access |
| 9 | KATE | All | Google Drive | Existing Brand base | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Preserve mapping; verify runtime access |
| 10 | KAO | All | Google Drive | Existing Brand base | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Preserve mapping; verify runtime access |
| 11 | OPELLA | Shopee Live | Google Drive | Existing Platform base | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Preserve mapping; verify runtime access |
| 12 | OPELLA | TikTok Shop | Google Drive | Existing Platform base | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Preserve mapping; verify runtime access |
| 13 | Pepsico | All | Google Drive | Existing Brand base | Inherited `anyone:writer`; runtime write unverified | OWNER ACTION REQUIRED | Preserve mapping; verify runtime access |

The 13 rows above are internal routes only. Agency routes are not part of this activation candidate.

## Activation checklist

Complete and retain this evidence against the exact candidate SHA before any activation:

1. **Production runtime identity:** identify the effective service principal used by the deployed provider adapter through the approved secret-safe method. Record a non-secret principal fingerprint; do not infer it from a human connector session.
2. **Provider read/write capability:** verify the runtime principal can enumerate/read required route metadata and add a child under each mapped target. Any write probe must use a separately designated synthetic folder/artifact with explicit Owner authorization; do not upload to an operational or archive folder for testing.
3. **Routing mode:** record the effective `OPERATIONAL_STORAGE_ROUTING_MODE` and approved transition value. Do not change environment configuration as part of this preparation.
4. **Pre-seed snapshot:** capture the route-table schema/version and a protected snapshot of existing route keys, row state, and opaque route IDs; record existing route count. Keep sensitive IDs out of general reports.
5. **Approval and seed:** verify an active authorized Admin approver and retain the Owner-approved approval artifact. Execute only the exact approved 13-internal/0-Agency seed after runtime/provider checks and exact-SHA activation approval.
6. **Post-seed readback:** compare route keys and counts with the snapshot. Securely record the exact route IDs inserted by this run separately from pre-existing IDs; verify all 13 resolve to their preserved mapped targets and no Agency route was inserted.
7. **Rollback:** restore the prior routing mode and deactivate/delete only rows proven to have been inserted by this specific approved seed, using the reviewed recovery transaction. Never delete or move pre-existing route rows, physical folders, or archive files. Verify the post-rollback route counts against the snapshot.
8. **Final release review:** Owner reviews the exact source SHA, route manifest, protected physical-access evidence, approval artifact, readback, and rollback evidence before activation.

## Rollback and release boundary

No Production route query, seed, configuration change, provider write, or ACL change is performed by this runbook update. If activation is later approved, rollback must use the recorded pre-seed snapshot and affect only exact rows inserted by that release; preserve all prior mappings and physical data.

STO-02 remains a review-only schema proposal stacked on STO-01. The corrected seed retains the existing `operational_storage_routes` route columns and uniqueness contract and does not drop or overwrite approved route rows. Combined PostgreSQL 17 evidence must run on a disposable database using the exact corrected STO-01 seed and STO-02 proposal before declaring compatibility; do not infer this from separate, older gates.

## Readiness decision

The selected root and 13-route source mapping are ready for activation review. Activation itself is **not ready** until Production runtime identity and provider read/write capability are evidenced, the approved business approver artifact is verified, the exact route snapshot/readback/rollback plan is prepared, and the Owner approves activation for the exact SHA. Keep the inherited writer risk visible until the separate ACL-hardening work is complete.
