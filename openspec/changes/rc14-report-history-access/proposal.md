## Why
Calendar drops the selected shift identity and report form initialization can substitute a recent shift for a historical target outside the bounded work queue.

## What Changes
- Use /reports?shiftId=<id> for links that know the report's shift.
- Resolve the exact shift/report through existing authenticated services, independently of the recent-30 queue.
- Open the appropriate form/detail, enforce existing permissions, reject unavailable targets and lock explicit form targets.
- Consume the query on close without resetting unrelated page state.

## Boundaries
No schema, storage/provider, Production configuration or data changes. The operational queue remains bounded at 30.

## Navigation Audit

| Entry point | Before | After |
| --- | --- | --- |
| Calendar Day Sessions desktop | Full reload to /reports; shift lost | Router push to /reports?shiftId=<encoded shift.id> |
| Calendar Day Sessions mobile | Full reload to /reports; shift lost | Same exact deep link as desktop |
| Reports recent work queue | Exact report/shift selected in place | Preserved; queue remains capped at 30 |
| Reports paginated report cards | Exact report selected; form could substitute first candidate | Exact report shift merged into form options; explicit target locked |
| Reports report-specific attention | Generic /reports | Exact shift deep link |
| Data Quality report recovery | Generic /reports despite known report.shift_id | Exact shift deep link, retained by recovery action |
| Live Session report actions | Exact report lookup by shift.id; in-place detail or new form with only that shift | Preserved; identity already retained |
| Dashboard quick actions, role navigation, aggregate report attention | Generic workspace link with no selected shift | Preserved |
| Audit entity links | Generic workspace link keyed by report entity ID | Preserved; no existing reportId deep-link convention |

No existing reportId query convention was found. Historical draft/detail/new-report targets use the existing RLS-backed services; no browser-wide shift fetch is added.
