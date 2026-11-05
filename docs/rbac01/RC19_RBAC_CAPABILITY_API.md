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

With `FEATURE_RBAC_DYNAMIC_ENFORCEMENT=true`, the API obtains the complete signed-user decision set from `rbac_permission_decisions()`. It reports the same allow/source/reason/expiry/effective timestamp consumed by `requirePermission()`. Missing, duplicate, malformed, identity-mismatched, incomplete, or failed DB decisions return `503 RBAC_CAPABILITIES_UNAVAILABLE`; no static fallback is used. When the flag is off, the legacy matrix remains the default, with the isolated audit compatibility path available only under its separate flag. All feature and database runtime gates default off.

Errors: `401 AUTHENTICATION_REQUIRED`, `403 PERMISSION_DENIED` for an unmapped business identity, or `503 RBAC_CAPABILITIES_UNAVAILABLE`.

## Role-default review

`GET /api/role-defaults` returns the catalog, current legacy matrix, feature state, and at most the versions exposed by the database RPC.

`POST /api/role-defaults` accepts propose, approve, activate, revoke, and rollback actions when its Admin mutation flag is enabled. SQL enforces version checks and independent approval. Proposal `allow` decisions cannot exceed the legacy permission for the target role. Only permissions with an unlocked catalog entry are mutable; hard Finance/Admin/bootstrap permissions stay locked.

```json
{ "action": "propose", "role": "leader", "decisions": { "audit.view_team": "deny" }, "comment": "Reason" }
```

```json
{ "action": "rollback", "versionId": 12 }
```

## Account overrides

`GET /api/rbac/account-overrides` returns entries plus a typed `permissionCatalog` with explicit `grantable` state only when the server feature flag is enabled. The default-off API returns `404 RBAC02_DISABLED`. Mutation validation is a `z.enum` generated from the finite grantable tuple; unsupported permissions, including Payroll and Admin capabilities, are rejected before RPC.

`POST /api/rbac/account-overrides` accepts:

```json
{ "action": "set", "targetId": "business-user-id", "permission": "reports.submit", "decision": "allow", "reason": "Restore scoped report submission", "expiresAt": null, "expectedVersion": 0 }
```

```json
{ "action": "reset", "targetId": "business-user-id", "permission": "reports.submit", "reason": "Return to role policy", "expectedVersion": 1 }
```

Errors include `400 RBAC02_INPUT_INVALID`, `404 RBAC02_DISABLED`, `409 RBAC02_UPDATE_REJECTED`, and `503 RBAC02_SCHEMA_UNAVAILABLE` / `RBAC02_UNAVAILABLE`. Account Allow is supported only for the finite catalog in `lib/rbac/accountOverrideCatalog.ts` and only for its configured roles; it may restore a permission after role Deny, but it does not bypass business scope. Report export and unscoped workforce overview remain locked pending an authoritative server/RPC scope contract.
