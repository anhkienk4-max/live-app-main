# Design

Reference promises are shared for one authenticated identity/permission with a short TTL; failed reads are evicted. Operational reads stay bounded at 10/20/50 and are aborted on navigation. A render-time identity boundary remounts the workspace. Regions retain their toolbar during refresh; searches settle before requests. URL state remains authoritative.

Week overlap clusters open paged details, rather than packing unlimited narrow cards. Day uses compact cards and projects overnight continuation into each visible date. Planned schedule remains unchanged.

Amendments insert a new draft segment referencing immutable source evidence, with expected-version checks, UUID idempotency, independent review and atomic before/after audit. Active evidence excludes a source only after its amendment is approved. Payroll consumers use active evidence, while corrections of segments already in payroll fail closed.

The export registry defines labels, groups, permissions, transformations and column order. The server resolves permission before reads, uses the existing authenticated bounded list RPC and verifies total/count/unique IDs. XLSX has separate schedule, registration and actual evidence sheets; CSV is flat. Formula-looking text is escaped. Sensitive columns require permission; no salary columns are registered.
