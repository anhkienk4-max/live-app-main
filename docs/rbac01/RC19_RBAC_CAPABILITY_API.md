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
      "source": "legacy_default",
      "reason": "No approved role override; the legacy role matrix applies.",
      "locked": true,
      "accountOverrideGrantable": false
    }
  ]
}
```

The API resolves every catalog entry through the shared server permission resolver. It reports `legacy_default`, `hard_restriction`, and the resolver explanation for static decisions. `accountOverrideGrantable` is derived from an explicit catalog; at this SHA only `audit.view_team` has paired RPC/RLS support. For Leaders, `audit.view_team` is read from the signed-user `rbac01_effective_permission` RPC when `FEATURE_RBAC01B_AUDIT_TEAM_ENFORCEMENT=true`. The current RPC returns only a boolean, so its `database` source explanation explicitly does not claim whether a role version, account decision, expiry, or revocation produced it. RPC failure returns `503 RBAC_CAPABILITIES_UNAVAILABLE`; the route does not use a cached result.

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

`GET /api/rbac/account-overrides` returns entries plus a typed `permissionCatalog` with explicit `grantable` state only when the server feature flag and reviewed database gate are available. The default-off API returns `404 RBAC02_DISABLED`. Mutation validation is a `z.enum` generated from the finite grantable tuple; unsupported permissions, including Payroll and Admin capabilities, are rejected before RPC.

`POST /api/rbac/account-overrides` accepts:

```json
{ "action": "set", "targetId": "business-user-id", "permission": "audit.view_team", "decision": "deny", "reason": "Reason for change", "expiresAt": null, "expectedVersion": 0 }
```

```json
{ "action": "reset", "targetId": "business-user-id", "permission": "audit.view_team", "reason": "Return to role default", "expectedVersion": 1 }
```

Errors include `400 RBAC02_INPUT_INVALID`, `404 RBAC02_DISABLED`, `409 RBAC02_UPDATE_REJECTED`, and `503 RBAC02_SCHEMA_UNAVAILABLE` / `RBAC02_UNAVAILABLE`. Current support is deliberately limited to the reviewed audit-team permission; the API does not grant permissions for other modules.
