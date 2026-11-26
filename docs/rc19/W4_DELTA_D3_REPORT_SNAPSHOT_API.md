# RC19 W4 D3 Report Revision Snapshot API V1

Status: backend implementation checkpoint; frontend handoff is review-only until the canonical disposable GoTrue/PostgreSQL runtime is available.

## Source and revision behavior

- Existing `create_report`, `update_report`, and report lifecycle RPCs remain compatible. Every new revision recorded by `private.record_report_revision` captures a private source snapshot in the same PostgreSQL transaction.
- A snapshot contains active saved operational notes in `draft`, `submitted`, `reviewed`, or `correction_requested` state, including stable note IDs and current versions. Rejected and soft-deleted notes are excluded.
- Canonical incidents for the report shift are stored once in a separate incident array with incident IDs and versions. Note rows retain their optional canonical incident reference; no incident is created by snapshot save.
- A later note edit or incident correction creates a different source state for a later report revision. It cannot update an earlier snapshot. Historical revisions created before this migration are not reconstructed from live sources; reads for those revisions return `REPORT_SNAPSHOT_NOT_FOUND`.
- The normal report revision continues to own metrics, image references and manual recap. Snapshot code does not overwrite those fields or change report storage routing.

## HTTP contract

### Read a live preview

`GET /api/reports/revision-snapshots?report_id=<id>&audience=internal`

Returns current saved-note and incident source versions for an authorized internal preview. Admins and Leaders with report-read and operational-note-read scope may read the internal source. Members cannot read the all-staff internal incident snapshot.

### Read a historical revision snapshot

`GET /api/reports/revision-snapshots?report_id=<id>&revision_version=<n>&audience=internal`

Returns the immutable sources captured for that report revision. Use `audience=external` to receive only the external-safe projection.

### Atomically save report and snapshot

`POST /api/reports/revision-snapshots`

```json
{
  "reportId": "<report-id>",
  "patch": { "revenue": 123 },
  "expectedVersion": 4,
  "reason": null,
  "event": "save",
  "idempotencyKey": "<uuid>"
}
```

The server calls `update_report_with_revision_snapshot_v1`. That façade invokes the existing CAS-protected `update_report`, verifies the resulting source snapshot exists, and inserts an actor-scoped idempotency receipt before returning. It returns the saved report, `revisionId`, `revisionVersion`, and `replayed`. Replaying the same key and payload returns the same receipt; reusing the key with a different payload returns HTTP 409 `REPORT_IDEMPOTENCY_CONFLICT`. A stale report version returns HTTP 409 `REPORT_VERSION_CONFLICT`. Authorization is checked again on replay.

The existing report APIs also receive the same transaction snapshot hook, so legacy callers do not create an unsnapshotted report revision. The versioned POST is the preferred frontend path where request idempotency is needed.

## Projection and privacy

- Internal snapshots live in a private schema table with no direct grants, RLS enabled, and an append-only mutation guard.
- Internal reads are server-authorized against the current actor, report scope, Brand scope, and operational-note scope.
- External projection is constructed in SQL from an allowlist of scalar report metrics. It excludes note content and IDs, canonical incident IDs, personnel identity, reasons, evidence references, arbitrary normalized/platform JSON, image URLs, and free-text recap.
- The existing manual recap is preserved in the normal report revision; it is not copied into the external projection because the current source model has no separate visibility classification for its free text.
- All responses use `Cache-Control: no-store`.

## Typed implementation

Types and runtime validation: `lib/types/reportRevisionSnapshot.ts`.

HTTP handler: `lib/server/reportRevisionSnapshotHandler.ts`.

Database implementation: migration `20261126051534_rc19_w4_d3_report_revision_snapshot.sql`.

## Frontend response and recovery contract

Successful GET responses use `{ "ok": true, "data": ... }`. An internal preview has `kind: "preview"`, `reportId`, `shiftId`, `currentVersion`, `audience: "internal"`, and `sourceSnapshot`. An external preview has the same envelope fields and `externalProjection` instead. Historical reads use `kind: "revision"`, `revisionId`, `revisionVersion`, `createdAt`, and the audience-specific payload.

Successful POST returns `{ "ok": true, "data": { "report": ..., "revisionId": "...", "revisionVersion": 5, "replayed": false } }`. The client must retain the returned revision ID/version and use `expectedVersion` from the authoritative report state on its next save. `replayed: true` is a confirmed prior save receipt, not a new revision.

| HTTP | Stable code / condition | Frontend behavior |
| --- | --- | --- |
| 400 | `REPORT_SNAPSHOT_QUERY_INVALID`, `REPORT_SNAPSHOT_SAVE_REQUEST_INVALID`, or validation code | Show field/query error; do not retry unchanged invalid input. |
| 401 | Missing/expired authenticated session from `requireRole` | Reauthenticate; do not fall back to an anonymous or mock write. |
| 403 | `REPORT_SNAPSHOT_FORBIDDEN` or `REPORT_SNAPSHOT_SAVE_FORBIDDEN` | Keep internal sources hidden and mutation disabled; show permission denial. |
| 404 | `REPORT_SNAPSHOT_NOT_FOUND` / `REPORT_NOT_FOUND` | Treat as unavailable report/revision; do not reconstruct old snapshots from live notes. |
| 409 | `REPORT_VERSION_CONFLICT`, `REPORT_IDEMPOTENCY_CONFLICT`, `REPORT_CONFIRMED`, or `REPORT_SOURCE_SCOPE_INVALID` | Refresh authorized report state and ask the user to review/reconfirm; do not silently resubmit with a new key. |
| 502 | `REPORT_SNAPSHOT_INVALID` / `REPORT_SNAPSHOT_SAVE_INVALID` | Treat as protocol/data-integrity failure; do not show success. |
| 503 | `REPORT_SNAPSHOT_UNAVAILABLE` / `REPORT_SNAPSHOT_SAVE_UNAVAILABLE` | Capability is unavailable (for example, the migration/RPC is not installed or the backend failed). Keep snapshot save/preview unavailable and offer retry after service recovery; never use a client-side fallback. |

Example external preview:

```json
{
  "ok": true,
  "data": {
    "kind": "preview",
    "reportId": "<report-id>",
    "shiftId": "<shift-id>",
    "currentVersion": 4,
    "audience": "external",
    "externalProjection": {
      "schemaVersion": 1,
      "reportId": "<report-id>",
      "revisionVersion": 4,
      "status": "draft",
      "metrics": { "revenue": 0, "orders": 0, "peakViewer": 0, "averageViewer": 0, "gmv": null, "viewers": null, "productClicks": null, "ctr": null, "cvr": null, "averageOrderValue": null, "liveDurationMinutes": null, "dashboardPlatform": "" }
    }
  }
}
```

## Visibility decision still required

Issue #190 requires external reports to include only an approved visibility-safe operational summary. The current report model stores `final_recap` as free-form JSON/text without an independently enforced visibility classification. The current external projection therefore includes only allowlisted scalar metrics and excludes recap and all note/incident detail. Before adding recap or operational summary to external output, the Owner must define which structured fields are externally visible and who may approve that classification. Internal notes, incident reasons, evidence references, and personnel details remain excluded.

## Acceptance boundary

The focused PGlite test executes the migration SQL and checks immutable revisions, source version links, safe projection, CAS/idempotency, and mutation denial. It is not proof of canonical migration replay, actual GoTrue sessions, full-schema RLS, browser integration, or Production parity. Those gates require Lane 02's new verified disposable runtime.
