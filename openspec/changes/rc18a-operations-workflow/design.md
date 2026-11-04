## Existing contracts

- `public.shifts.status` and `status_mode` remain the authoritative lifecycle.
- Status writes continue through the existing version-checked RPCs and audit
  trail; browser time never performs a business transition.
- `workforce_actual_segments` remains the approved source consumed by Payroll.
- Approved segments are immutable and may not be edited in place.

## Freshness

One browser-side Realtime subscription observes only INSERT/UPDATE events on
`public.shifts` under the signed-in user's existing RLS. Event payloads are
ignored; receipt invalidates affected views and causes them to reload through
their existing authorized read paths. Hard DELETE events are excluded because
Realtime cannot RLS-filter them; the app's soft-delete lifecycle is an UPDATE.
Subscription reconnect is bounded and polling/focus refresh is the fallback
when Realtime is unavailable. No client cache is a source of truth.

## Attendance contract (not enabled until configuration gates are met)

- A user may create check-in/out only for their own active business identity and
  a current, non-deleted shift with a direct assignment or approved/manual
  registration.
- GPS is requested only on the explicit check-in/out action and only after
  consent. Coordinates are validated against an enabled configured location and
  are not persisted; retain only the verification outcome and minimal accuracy
  metadata required by an approved policy.
- A short-lived four-digit PIN is verified server-side using a non-reversible,
  server-keyed digest. Never persist or log the PIN. Attempt limits and expiry
  must be explicit configuration; missing configuration fails closed.
- Network/GPS exceptions use a separately permissioned, reasoned manual
  evidence path. They do not silently create a verified check-in.
- Corrections are append-only proposals with expected version, reason and
  evidence reference. A different authorized reviewer approves/rejects. An
  approval creates a new effective evidence version while preserving prior
  evidence; payroll references only the approved effective version.
- No continuous location tracking. Location retention is minimized; exact
  retention duration and consent copy require privacy-owner approval.
