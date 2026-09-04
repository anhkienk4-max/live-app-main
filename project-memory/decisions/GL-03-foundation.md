# GL-03 Project Memory Foundation

## Context

Multiple coding agents need a shared project record, while the legacy `PROJECT_STATE.md` contains manually maintained facts that can drift from live Git.

## Decision

Use the JSON records in `project-memory/` as the canonical machine-readable system. Keep `PROJECT_STATE.md` as a generated pointer and publish `project-memory/generated/project-memory.md` as the human-readable projection. `memory:sync` may derive repository and inventory facts only; business rules, defects, permissions, and release decisions remain explicit records.

## Consequences

Agents must verify live Git and read relevant canonical records before work. A generated projection can be refreshed without rewriting business decisions. Existing application behavior remains outside the foundation scope.
