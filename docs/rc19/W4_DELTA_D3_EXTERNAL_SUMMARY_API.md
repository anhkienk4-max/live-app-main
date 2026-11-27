# W4 D3 External Operational Summary API V1

Status: Codex backend implementation checkpoint; authenticated PG17 acceptance is pending.

## Endpoint

`GET|POST /api/reports/external-operational-summary`

The endpoint is same-origin only, requires an authenticated Admin, Leader, or Member session, and uses `Cache-Control: no-store`. Database RPCs enforce report scope, active actor status, reviewer permission, CAS, and idempotency. The endpoint never accesses private tables directly.

## Read current workflow

`GET ?report_id=<report-id>` returns the caller-authorized summary workflow state. A missing summary is represented as `summary: null`. The GET RPC restricts reads to the report submitter/mutator or a report-scoped Admin/Leader.

## Save, submit, and review

```json
{
  "action": "save_draft",
  "reportId": "<report-id>",
  "summaryId": null,
  "content": "Operational summary approved for external sharing.",
  "expectedVersion": 0,
  "reason": null,
  "idempotencyKey": "<uuid>"
}
```

Actions are `save_draft`, `submit`, `approve`, `reject`, and `request_correction`. After first save, callers send the returned `summaryId` and `version` as `summaryId` and `expectedVersion`. `reject` and `request_correction` require a review reason. Current authorization is checked before receipt replay.

Successful POST returns both the immutable transaction receipt and a fresh RPC readback. A lost response can be retried with the same idempotency key and identical payload; a changed payload is a conflict. The client must not display success unless both receipt and readback match.

## Revision and external projection behavior

- Only the `approved` current summary is included in future external projections.
- Approval creates a report revision through the existing `private.record_report_revision` function. The same transaction captures the summary text/version, approval actor/time and report revision ID in a private immutable source snapshot; the external projection receives only the approved text and version.
- Requesting correction after approval creates a new report revision whose external projection omits the summary. Earlier revisions remain unchanged.
- Draft, submitted, rejected, and correction-requested content is never included in an external projection.
- Historical revisions are not backfilled from current workflow state.
- Manual recap, raw notes, incident IDs/reasons, evidence references, personnel identity, and arbitrary report JSON are excluded from external projection.

## Stable response/error contract

| HTTP | Codes | Client behavior |
| --- | --- | --- |
| 400 | `REPORT_EXTERNAL_SUMMARY_QUERY_INVALID`, `REPORT_EXTERNAL_SUMMARY_REQUEST_INVALID`, `REPORT_EXTERNAL_SUMMARY_CONTENT_INVALID` | Correct request; do not retry unchanged. |
| 401 | `AUTHENTICATION_REQUIRED` | Reauthenticate. |
| 403 | `REPORT_EXTERNAL_SUMMARY_FORBIDDEN`, `REPORT_EXTERNAL_SUMMARY_MUTATION_FORBIDDEN`, `REPORT_EXTERNAL_SUMMARY_REVIEW_FORBIDDEN`, `REPORT_EXTERNAL_SUMMARY_REPLAY_FORBIDDEN`, `REPORT_EXTERNAL_SUMMARY_ORIGIN_INVALID` | Keep content hidden and mutation disabled. |
| 404 | `REPORT_NOT_FOUND` | Do not reconstruct content from live sources. |
| 409 | `REPORT_EXTERNAL_SUMMARY_VERSION_CONFLICT`, `REPORT_EXTERNAL_SUMMARY_STATE_CONFLICT`, `REPORT_EXTERNAL_SUMMARY_IDEMPOTENCY_CONFLICT`, `REPORT_CONFIRMED` | Reload authoritative state and ask for review/reconfirmation. |
| 502 | `REPORT_EXTERNAL_SUMMARY_READBACK_INVALID` | Treat as data/protocol integrity failure. |
| 503 | `REPORT_EXTERNAL_SUMMARY_UNAVAILABLE`, `REPORT_EXTERNAL_SUMMARY_READBACK_REQUIRED` | Do not show success; retry/reconcile using the same idempotency key. |

## Acceptance boundary

The additive migration and handler have not been applied to a canonical PostgreSQL 17.6/17.11 baseline in this checkpoint. Source-level/API unit tests are not authenticated database acceptance. Agency membership enforcement, HR source mapping, and broad integration across Staffing, Import, Attendance, Payroll, Media, and Storage remain separate backend gates.
