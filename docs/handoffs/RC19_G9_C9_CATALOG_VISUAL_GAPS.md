# RC19 G9 / C9 catalog and visual contract handoff

Status: **PARTIAL**. No visual-slot writes or provider reads are introduced.

The existing `/api/brand-catalog` reads scoped Brand, Campaign, Product, SKU, platform mapping, knowledge and registry metadata. Admin product/SKU mutations already use server authorization and version checks. The current endpoint limits products to 100 without a total or cursor; the UI paginates the loaded result locally at 20 rows per page and labels the 100-row API limit. It cannot request later server pages. Knowledge is subject to existing source, review and effective-date policy. The Brand detail links to the catalog and scoped registry; its management actions use existing permission checks.

The endpoint returns registry metadata including `canonical_url`, but that URL can be a provider web page. Metadata verification does not establish that the URL is an authorized image byte stream. The response currently gathers SKU and campaign resource links internally but returns only `productLinksResult.data` as `resourceLinks`; complete SKU/campaign asset relationships require a C9 correction. No existing generic visual-slot configuration, authorized preview, slot version/history, or confirmed slot mutation contract was identified.

C9 must provide server-authorized, scoped and paginated catalog reads with stable totals/cursors; complete product, SKU and campaign resource relations; authorized media preview/read receipts; and explicit visual-slot read, version/history and confirmed mutation contracts. Slot permissions must be evaluated on the server and must not grant access to private Attendance assets. Existing Brand logos and registry links remain separate from any proposed slot configuration.

G9 removes the synthetic product packshot and does not treat a provider page URL as an image. The Product Gallery lists saved product resource metadata for Admins, allows selection of a metadata record, and keeps preview unavailable until an authorized media-read API exists. Its existing Admin resource-attach action remains a metadata link only. Non-Admin users do not receive product resource details from this UI. The App Visual Manager shows saved Brand logo URLs through the existing Brand logo component and links to existing Brand management; app-wide banner/avatar and slot history/configuration remain visibly unavailable. Campaign and SKU asset relations are called out as absent from the current API response. Attendance evidence is excluded from the Product Gallery. Admin audit controls use the existing effective permission resolver. Product selection uses browser history and grid cards accept keyboard activation.

Still needed: server pagination beyond the first 100 with a stable total/cursor, authorized image bytes/preview, campaign and SKU resource relations in read responses, versioned visual-slot configuration, app-wide banner/avatar contracts, and authenticated role/Brand/provider readback. Existing product and SKU data must not be filled with guessed variants, prices, images or claims. G8's provider browser remains gated on C8.

## Local verification

- BRAND-01 mock Playwright: 6 passed, including 320/390/768/1440 responsive checks, product pagination, Admin actions, Leader/Member resource hiding and no-Brand-access state.
- Focused catalog/API/storage tests: 9 passed, including the G8 provider-browser fail-closed guard.
- TypeScript: passed. Full ESLint: passed with 36 warnings and 0 errors. Credential-free production build (`CI=true pnpm build`): passed through the existing environment guard.
- `memory:validate`: failed with one stale canonical `current-state.json` repository HEAD error; prior and current logs are preserved under `output/playwright/g9-memory-validate*.txt`. Canonical memory was not regenerated.
- Screenshots: `output/playwright/g9-catalog-{320,390,768,1440}.png`, `output/playwright/g9-visual-manager-{320,390,768,1440}.png`, and `output/playwright/g9-product-gallery-390.png`.

Authenticated API/database/provider acceptance was not run. This frontend handoff is partial, not a full functional pass.
