## Why

Brand and Campaign records are canonical, but products, SKUs, campaign participation, and sourced marketing knowledge do not have an entity model. Teams currently lack a scoped catalog that can connect those records to existing STO-02 resources.

## What Changes

- Add Product, SKU/variant, Platform SKU identifiers, Campaign SKU participation, sourced knowledge versions, scheme records, typed STO-02 resource links, and Admin audit metadata.
- Add explicit Admin-managed per-account Brand read grants. Catalog scope does not change provider ACL or the shared canonical Brand/Campaign tables.
- Add Admin CRUD and scoped Leader/Member read APIs and workspace UI.
- Keep every new SQL file under proposals; do not apply Production SQL or activate the feature as part of this change.

## Impact

This is additive to canonical Brands, Campaigns, Platforms, and the STO-02 registry. It does not migrate brands.key_products, duplicate the platform catalog, store binaries in Supabase, modify operational_storage_routes, or change provider permissions.
