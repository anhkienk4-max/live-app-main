# BRAND-01 #99 source audit

## Verified source context

- Feature branch: `feat/rc19-brand-campaign-sku-hub`
- Base: `origin/integration/rc19-final-rbac` at `158d239a5c09118cff8349e8d3cbbe1dd2854e20`
- Base ancestry includes the STO-02 source candidate `9c3265c05a111e1e89dbccc6dc5b42f7b47b7c6d` and integrated Core `a6cc73c4425f7ae489bdb3db62912d858ee3c04a`.
- RBAC-02 is not in this base lineage. It is not used for BRAND-01 authorization; no dynamic permission family is claimed.
- STO-02 remains a review-only proposal; no Production schema change is represented by this branch.

## Existing canonical model

| Domain | Existing model/UI/API/RLS | Gap / classification |
|---|---|---|
| Brand | `public.brands`; `BrandList`, `BrandDetailDialog`, `BrandFormDialog`; `brandService`; authenticated active-user read and Admin writes, with soft archive | Actual model exists. Its guidance/claim arrays have no per-entry provenance, approval version, or effective date. |
| Platform | `public.platforms`; `PlatformList`; existing master-data service and RLS | Canonical model exists; do not create a duplicate platform catalog. |
| Campaign | `public.campaigns` with required scalar `brand_id` and `platform_ids`; `CampaignList`; Admin CRUD and scoped Leader operational update trigger | Existing schema confirms one Brand per campaign. Campaign-to-product/SKU relationships are missing. |
| Product | No canonical product table or Admin product workflow found | Missing model/workflow. Current `brands.key_products` is descriptive text-array data, not an entity catalog. |
| SKU/Variant | No canonical SKU/variant table found | Missing model/workflow. STO-02 `sku_key` is a descriptive scope string, not a product FK. |
| Resource | STO-02 `storage_resources`, `storage_resource_scopes`, grants and audit; API `/api/storage-resources` | Reuse existing metadata registry. A scope is descriptive and does not grant registry/provider access. |
| Marketing knowledge | Existing Brand text fields and campaign notes/URLs | No approval/source/version model; existing text cannot be presented as verified official claims without provenance. |

## Authorization evidence and limits

- `private.current_business_user_is_active()` and `private.is_admin()` are the database authorities used by master-data RLS.
- Brand, platform and campaign SELECT policies expose active, non-archived records to all active authenticated business users. No Brand membership/scope table was found in the verified schema/source.
- Current supported policy is therefore the existing shared catalog read boundary plus Admin-only new catalog writes. This does **not** provide a finer per-Brand Leader/Member boundary.
- Product resource links must be filtered by both product catalog access and STO-02 resource RLS. Linking by Brand/Campaign/SKU cannot grant access to the resource or provider.
- Attendance resources are excluded from the Brand/Campaign/Product catalog and must remain owner-only in STO-02.

## Required target design

1. Add a review-only proposal for products, many-to-many Brand/product and product/platform identifiers, SKUs, campaign/SKU participation, append-only sourced knowledge versions/reviews, resource references and Admin-only audit.
2. Keep existing Brand, Platform and Campaign tables authoritative. Do not migrate existing `key_products` values into fictional Product rows.
3. Use a separate campaign-scheme record tied to a Campaign and optional SKU; never store time-bounded vouchers/gifts/prices as permanent Product facts.
4. Any review-approved knowledge item must have source provenance and effective dates; only approved/current versions are visible to non-Admins. Missing or pending values remain explicit.
5. Use the existing STO-02 resource ID and resource visibility policy; do not copy files into Supabase or modify Drive/OneDrive ACLs.

## Production observation

Production browser reproduction was not performed in this source-only task. No authenticated Admin/Leader/Member session or authorized Production read-only capture is available here. Production state is UNVERIFIED; no Production data was read or changed.

## ADMIN-02 #105 dependency note

Admin #105 should compose existing Brand/Campaign/Platform/Staff/Settings screens and add links into the Product/SKU and STO-02 registry views. It should not add another master-data service. Dependencies are BRAND-01 source contract, STO-02 schema approval/integration, and separately verified API/RLS for each editable domain. RBAC-02 is stacked on RBAC-01 and remains its own review-only feature; no unverified dynamic permissions are consumed by this design.

## BRAND-01 implementation and local verification

- Product/SKU records and Brand/Campaign relationships are proposed as new catalog tables; existing Brand, Campaign, Platform and STO-02 resource records remain canonical. Resource links reference existing STO-02 IDs and do not create folders or copy binary data.
- `/brand-catalog` and `/api/brand-catalog` provide catalog search/filter, Brand/Campaign detail, Product/SKU and platform identifier workflows, sourced knowledge and campaign schemes, existing-resource linking, scoped read grants, and Admin audit/review controls. API and PostgreSQL policies enforce Admin writes and explicit expiring Brand read scopes; attaching a resource does not grant provider access. Attendance resources are excluded from this workflow.
- All BRAND-01 SQL remains in `supabase/proposals`, not `supabase/migrations`. No schema, provider ACL, feature flag or Production data was changed.
- Local evidence after the navigation regression correction: TypeScript PASS; ESLint PASS (29 existing warnings, 0 errors); repository regression 2,109 PASS / 0 FAIL / 3 opt-in Staging tests skipped; BRAND-01 Playwright 3/3 PASS with before/after screenshots at 390, 768 and 1440 px; guarded credential-free build PASS.
- The three regression skips require isolated Staging credentials and are unrelated to BRAND-01. PostgreSQL 17 has not run locally because no disposable PG17 server is configured; the destructive harness refuses any other target. Exact-SHA CI is required to close that gate.
- First exact-SHA CI on `ae76a29e9b85ab8fd31ea373982f2f18b7740eee` reached PostgreSQL Server 17.11 and failed because two index statements were joined by a literal `\n`. The proposal now uses a real newline; rerun PG17 and all downstream gates on the next exact SHA before declaring completion.
- These checks use mock-auth browser fixtures and local code. They are not signed-session UAT, STO-02 provider integration, or Production evidence.
