## Why
Production compat routes cover only Mars. Live storage names currently overwrite display names and retries depend on filenames rather than content.

## What Changes
- Add temporary Agency brand/period/category placement, exact historical period/category labels and uppercase dash fallback.
- Supply a proposed 21-route config covering the 20 observed Production Brand/source combinations; do not apply it.
- Separate live display/storage names and enforce report/category/full-digest idempotency with additive columns and an RPC update.
- Preserve existing Mars routes, legacy reads/deletes, authorization, and unsupported-route fail-closed behavior.

## Impact
A local migration must be reviewed/applied in a separately authorized checkpoint before deploying new live upload code. No Production configuration, data, or Drive writes are part of this change.
