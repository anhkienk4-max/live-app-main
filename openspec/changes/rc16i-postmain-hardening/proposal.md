# RC16I post-main minimal hardening

Baseline is main d166bd74eb77692a7609cc6c9f3e510053da5edf. Preserve the prior dirty merge in its own worktree and a hash-verified local backup. Port only verified missing behavior, retaining main's auth identity, UI containment, integer inputs, typed messages, storage compatibility, SQL/RLS and runtime environment guards.

- Filter navigation and the Actual Staffing tab using server capabilities after RBAC. Malformed capabilities fail closed.
- Clear mounted Workforce/Payroll consumers on authentication, permission or feature-disabled errors, abort in-flight capabilities, and retain exact 401/403/503 messages. Recheck on focus/visibility without discarding an in-flight same-identity mutation intent.
- Preserve the exact correction/void UUID and payload on uncertain retry, including modal reopen. Reject edited retries until explicit current-state/audit reconciliation. On 409 close the stale editor, reload authoritative state, and require a new deliberate action.
- Add audit-author self-review restrictions in UI to mirror the database. No role/approval policy changes.
- Ignore obsolete reads after filters, periods or shift identities change. Consume the backend's `performance` field, preserve UNKNOWN, and display complete audit snapshots.
- Download unchanged server CSV bytes through authenticated no-store requests and propagate auth failures to workspace gates. No client salary calculation.

Non-goals: rebuild modules, additional discovery features, new providers/gates, historical migration replay, SQL/RLS changes, deployment, feature activation or cloud writes. Operator reports RC15 compatibility/RC16/RC16B applied; obsolete pre-release migration plans must not be executed.

Acceptance: existing full regression inventory plus targeted tests, Node22/24 typecheck/build, PG16/17 isolated integrity/concurrency, full lint, existing and new desktop/mobile Playwright after final edits, memory validation, exact-SHA CI. Draft PR targets main and the new branch has Git auto-deploy explicitly disabled.
