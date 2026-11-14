# C12/G12 Audit History query contract

Codex owns `get_audit_history_page` and its authenticated PostgREST client method. Gemini G12 owns wiring the Audit History UI to `auditService.getAuditHistoryPage`; do not call the legacy numeric `getAuditLogs` path from the main list after the UI change.

## Request

```ts
auditService.getAuditHistoryPage({
  user: currentUser,                 // verified app identity for local/mock mode; SQL authorization uses the signed-in Supabase session
  cursor: nextCursor ?? null,
  pageSize: 20,                       // only 10, 20, or 50
  sort: 'newest',                     // newest or oldest
  filters: { from, to, actor, brand_id, role, module, action, status, source, entity_type, entity_id, query },
  signal: abortController.signal,
})
```

The first page defaults to the current Ho Chi Minh date and the prior 29 days. A supplied date interval is inclusive in Ho Chi Minh time and cannot exceed 366 calendar days. Filter arrays are limited to 50 string values. `brand_id` accepts one or more persisted Brand IDs and matches IDs present in an event's `before_data`, `after_data`, or `metadata`; it is a search filter, not an authorization claim, and never changes RLS. Legacy events without a persisted Brand ID do not match a Brand filter. The server rejects unknown filters, overlong text, invalid page sizes and malformed cursor pairs. The UI must clear its cursor and request a new first page when filters, sort, page size or authenticated identity change; cancel superseded requests.

## Response

```ts
{
  items: AuditLog[],
  actors: Array<{ id: string; name: string }>, // distinct actors represented on this page only
  nextCursor: { created_at: string; id: string; snapshot_at: string } | null,
  hasMore: boolean,
  pageSize: 10 | 20 | 50,
  range: { from: string; to: string },
}
```

There is deliberately no exact `total`: exact count scans the whole RLS-visible log relation and was part of the timeout. Render next/previous cursor navigation, not a page count or “last page” control. The cursor uses stable `(created_at,id)` ordering and a first-page snapshot time; pages are bounded to `pageSize + 1` candidate rows. Refresh to see events created after that snapshot. Filtered actor options are page-local; accumulate them only within the current filter/sort/identity session.

## Authority and errors

The RPC is `SECURITY INVOKER`, `search_path=''`, and executable only by `authenticated`. It reads `public.audit_logs` under the existing RLS policy. Admin sees the current Admin-authorized set, Leaders see only modules admitted by `audit.view_team`, and Members receive no audit rows under the current policy. The RPC does not accept actor identity, permission claims or Brand claims. Before/after values, action, actor, reason and entity fields are returned unchanged from the stored event; the function does not mutate audit data or reviews.

Map SQLSTATE `42501` to permission denial, `22023` to a filter/cursor validation message, `57014` to a retryable bounded-query failure, and network/5xx failures to an error state with explicit retry. Do not show stale rows after an identity change or denial. Detail reads and Admin review writes continue through their existing RLS/RPC paths.

## Current UI integration gate

The C12 commit does not edit Gemini-owned `AuditHistory.tsx`. Until G12 switches the main list to this method, the live UI still uses numeric offset pagination, `count=exact`, and the full actor-directory RPC. The backend contract and migration are ready for review, but the production timeout is not considered closed until the exact integrated UI/API SHA is exercised by authenticated Admin and Leader reads.
