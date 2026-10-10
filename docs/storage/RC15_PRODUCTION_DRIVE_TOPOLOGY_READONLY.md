# RC1.5 — Production Drive topology audit (READ-ONLY)

Status: **EVIDENCE / PARTIAL SAMPLE, NOT ROUTE APPROVAL**. Examined 2026-10-11 through authorized read-only Drive/Supabase metadata. No file uploaded, deleted, moved, renamed, or shared. Do **not** run migrations or seed routes based on this note.

## Baseline

- Vercel production domain `ops5729.top` still points to `main`, commit `31efea2d1a60583975e96773f68106d46ab7d8d9`.
- Supabase project is missing the RC1.5 `operational_storage_routes` and `operational_files` tables and `shifts.execution_source` / `brands.storage_profile` columns. RC1.5 migration chain remains staged on PR #24, not applied.
- The configured Drive root's metadata still exposes an `anyone:writer` grant, with `allowFileDiscovery=false`. The user deferred an ACL change, **not** approval to expose Finance/System Export documents. This remains a security hold for confidential file categories.
- 15 current brands in Supabase; 671 non-deleted shifts and 17 existing brand-platform pairs in earlier read-only audit. This does not indicate that every brand has a verified Drive folder or permission path.

## Representative observed shapes (not exhaustive)

| Folder topology | Representative observation | Release implication |
|---|---|---|
| Root → branded report group → platform → category | One consumer-health report group contains separate TikTok and Shopee branches, each with Dashboard and Visibility | Confirm which platform ID maps to each existing branch and use the correct legacy BASE folder |
| Root → branded report group → category → month | One snacking report group contains Dashboard and Visibility folders with historical month children | `LEGACY_CATEGORY_PERIOD` may apply, but month names differ and need reviewed exceptions |
| Root → brand group → subbrand → ... | One personal-care report group contains distinct product-line branches | Fail closed until an explicit subbrand key has been verified; no guessed mapping |
| Root → AI-live brand → platform → month | One AI livestream branch has a Shopee Live folder and month child | The base level/profile must be confirmed; do not claim CANONICAL_V1 automatically |
| Root → Agency group → brand → ... | Separate agency branch observed | Internal and Agency route approval must remain separate |

**Irregular historical period labels exist.** Example patterns: `Tháng 10 - 2026`, `Tháng 7-2026`, and custom P-period folders. A single `period_naming_style` cannot reproduce all historical names. RC1.5 now stores `period_label_overrides` and supports Admin-provided `YYYY-MM=<exact folder label>` exceptions.

## Safety boundaries and next evidence

1. The Admin preview at `/storage/setup` calculates **read-only paths** for existing Dashboard, Visual, DATA/REPORT, DATA/SOURCE and one V2 category; it checks root/base provider ancestry, but does **not verify that every proposed historical category/month folder exists**. A human operator must compare every visible path against actual Drive folders before approving a route.
2. The legacy V2 file namespace is distinct: `ADA_STORAGE_V2/<brand_id>/<platform_id>/<INTERNAL|AGENCY>/<period>/<category>`. This is name-based separation, **not** a security boundary while root has broad ACLs.
3. The two legacy subbrand profiles remain unsupported by the Admin route registration API until the source business object provides a verified subbrand key. Do not use a NULL/wildcard subbrand mapping.
4. No historical shift is automatically assigned `execution_source`. Admin classifies one verified shift at a time via actor-scoped RPC and optimistic version check.
5. Supabase migrations are ordered: nullable prerequisites + route table → guarded current Shift RPC patch → metadata-only operational file registry. This package has NOT been executed on Production.
6. Confirm route period/category names, one narrow UAT brand/platform/source/day, test fixtures, pre- and post- provider/DB counts, and cleanup instructions before the one consolidated physical UAT.
7. For Finance and System Exports, block confidential Production upload until a separate Drive ACL/policy review resolves the root's broad write permission. Never classify the code gate as a security or Production physical UAT PASS.

**Evidence scope:** verified top-level and representative child folder names only. No automatic exhaustive Drive crawl was run, no broad permissions were changed, and no actual V2 upload was tested.
