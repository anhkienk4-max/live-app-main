# Account Permission Overrides

## Requirements

- The server shall default this feature to disabled and return no account data or write access when disabled.
- Only an active persisted Admin may list, set, or reset overrides.
- The database shall derive the actor from the signed auth subject and reject forged or missing identities, inactive actors, self-edits, unsupported permissions, inactive/non-Leader targets, stale versions, and invalid expiry/reason values.
- An override shall be append-only and record the target, permission, decision, version, server timestamp, actor, reason, and optional expiry.
- Reset and expiry shall fall back to the effective role baseline without deleting audit history.
- Deny shall win over an account allow; role hard boundaries and role-default deny shall not be overridden.
- Only `audit.view_team` is supported. Other permission catalog entries shall remain unavailable to this API and SQL contract.
