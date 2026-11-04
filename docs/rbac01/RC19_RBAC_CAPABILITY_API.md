# RC19 capability API contract for G5

All routes below use the signed Supabase session and return `Cache-Control: private, no-store, max-age=0`.

## Read effective capabilities

`GET /api/rbac/capabilities`

Success:

```json
{
  "ok": true,
  "role": "leader",
  "permissions": [
    {
      "permission": "reports.review",
      "module": "reports",
      "action": "approve",
      "allowed": true,
      "source": "legacy_matrix",
      "locked": true
    }
  ]
}
```

`source` is `database` only for `audit.view_team` when `FEATURE_RBAC01B_AUDIT_TEAM_ENFORCEMENT=true`; that permission is read from the signed-user `rbac01_effective_permission` RPC on every request. A failed RPC returns `503 RBAC_CAPABILITIES_UNAVAILABLE`; the route never falls back to a cached grant. Other permissions continue to use the legacy `permissionMatrix` until their API and RLS enforcement are attested.

Errors: `401 AUTHENTICATION_REQUIRED`, `403 PERMISSION_DENIED` for an unmapped business identity, or `503 RBAC_CAPABILITIES_UNAVAILABLE`.

## Role-default review

`GET /api/role-defaults` returns the catalog, current legacy matrix, feature state, and at most the versions exposed by the database RPC.

`POST /api/role-defaults` accepts one of:

```json
{ "action": "propose", "role": "leader", "decisions": { "audit.view_team": "deny" }, "comment": "Reason" }
```

```json
{ "action": "rollback", "versionId": 12 }
```

Approval currently returns `409 RBAC01_ENFORCEMENT_NOT_ATTESTED`; draft decisions do not alter effective permissions.

## Account overrides

`GET /api/rbac/account-overrides` returns `{ "ok": true, "entries": [], "supportedPermissions": ["audit.view_team"] }` only when the server feature flag and reviewed database gate are available. The default-off API returns `404 RBAC02_DISABLED`.

`POST /api/rbac/account-overrides` accepts:

```json
{ "action": "set", "targetId": "business-user-id", "permission": "audit.view_team", "decision": "deny", "reason": "Reason for change", "expiresAt": null, "expectedVersion": 0 }
```

```json
{ "action": "reset", "targetId": "business-user-id", "permission": "audit.view_team", "reason": "Return to role default", "expectedVersion": 1 }
```

Errors include `400 RBAC02_INPUT_INVALID`, `404 RBAC02_DISABLED`, `409 RBAC02_UPDATE_REJECTED`, and `503 RBAC02_SCHEMA_UNAVAILABLE` / `RBAC02_UNAVAILABLE`. Current support is deliberately limited to the reviewed audit-team permission; the API does not grant permissions for other modules.
