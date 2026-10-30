## Catalog model and authorization

- [x] 1.1 Add Product, Brand links, SKUs, Platform SKU IDs, Campaign/SKU participation, schemes, knowledge versions, approval events, resource links, and audit history in a review-only SQL proposal.
- [x] 1.2 Add explicit expiring/revocable Brand read grants with Admin-only mutation and scoped reads.
- [x] 1.3 Add constraints/triggers for active canonical references, cross-Brand Campaign SKU association, independent approval, append-only knowledge, and attendance/resource privacy.

## API and workspace

- [x] 2.1 Add server API with Admin write guards, validated business actor, bounded read/filter behavior, CAS updates, and explicit schema-not-installed error.
- [x] 2.2 Add catalog UI for Brand/Campaign details, Product/SKU workflows, Platform IDs, schemes, sourced knowledge, resource attachment, filters, and per-Brand access management.
- [x] 2.3 Add visible loading, empty, error/retry, unverified-resource, and no-scope states.

## Verification and handover

- [x] 3.1 Add API negative tests, disposable PostgreSQL 17 security/compatibility harness, and Playwright Admin/Leader/Member interaction tests.
- [ ] 3.2 Run PostgreSQL 17, full regression, TypeScript, ESLint, responsive screenshots, and guarded build on the final exact SHA.
- [ ] 3.3 Commit on Lane 2 branch, confirm Preview suppression, push, create Draft PR, and obtain exact-SHA CI.
- [x] 3.4 Prepare Admin #105 dependency note; do not implement #105 here.
