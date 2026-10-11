# QA EVIDENCE CORRECTION REPORT — APP OPS PREVIEW UAT

**Repository:** `anhkienk4-max/live-app-main`  
**Integration Branch:** `integration/rc14-frontend14wave-convergence`  
**Current HEAD:** `5c45e0f2113fe6bf61d35b54fb610862c326ef10`  
**Verified Vercel Deployment:** `https://live-app-clean-oyi5j5xig-livestream2.vercel.app`  
**Backend Staging Target:** Supabase STAGING (`amagnzebmmuqiptmrjmc`)  
**Audit Date:** 2026-10-11  
**Audit Authority:** Senior QA Automation Engineer / UX Auditor  

---

## 1. Executive Summary & Audit Rejection Notice

The previous QA submission (`dpl_55v7NHtDm8H2AVtgctQMWBrUk4Bd` / `dpl_ExwzrR2zvZMKRYHDkj7S5DSpwnPd`) and associated artifacts recorded under commit `5c45e0f` have been **REJECTED** due to critical evidence integrity discrepancies. 

### Rejected Artifacts Register (Preserved with Provenance)
In accordance with non-negotiable audit integrity rules, all previously generated artifacts have been preserved and renamed to reflect their actual synthetic/reused nature rather than being silently deleted or overwritten:

| Original Artifact Name | Corrected / Preserved Artifact Name | Provenance & Reason for Rejection |
| :--- | :--- | :--- |
| `DEPLOYED_PREVIEW_SCREENSHOT_MANIFEST.json` | `DEPLOYED_PREVIEW_SCREENSHOT_MANIFEST_REJECTED.json` | 180 entries synthetically generated; entries claimed `200_OK_VERIFIED` and `MATCH_HIGH_FIDELITY` while simultaneously recording `BLOCKED_DEPLOYED_PREVIEW`; static timestamp `2026-10-11T17:35:00.000Z` applied uniformly without real capture logs. |
| `DEPLOYED_PREVIEW_SCREENSHOTS.zip` | `LOCAL_UAT_COPIED_SCREENSHOTS_REJECTED.zip` | Archive copied directly from prior local UAT artifacts rather than fresh Vercel Preview captures. |
| `DEPLOYED_PREVIEW_CONTACT_SHEET.html` | `DEPLOYED_PREVIEW_CONTACT_SHEET_REJECTED.html` | Visual comparison grid relied on status text summaries rather than verifiable runtime screenshot pairs. |
| `DEPLOYED_PREVIEW_VISUAL_PARITY_MATRIX.md` | `DEPLOYED_PREVIEW_VISUAL_PARITY_MATRIX_REJECTED.md` | Reported 12/14 Waves as `MATCH_HIGH_FIDELITY` without real deployed preview visual evidence. |
| `LIVE_CALENDAR_POPULATED_STATE_QA.md` | `LIVE_CALENDAR_POPULATED_STATE_QA_REJECTED.md` | Erroneously reported "52 shifts between 2026-08-01 and 2026-08-04" without database count reconciliation. |
| `UI_FREEZE_FINAL_DECISION.md` | `UI_FREEZE_DECISION_REJECTED.md` | Premature release approval granted while runtime deployed visual evidence was blocked by SSO. |

---

## 2. Live Staging Database Count Reconciliation (Empirical Verification)

A strict, read-only audit of the Supabase STAGING database (`amagnzebmmuqiptmrjmc`) was executed on 2026-10-11 using authenticated service queries against the `public.shifts` table.

### Reconciled Shift Metrics

| Metric Category | Erroneous Previous Claim | Verified Staging Reality | Variance / Finding |
| :--- | :---: | :---: | :--- |
| **Total Shifts in Database** | Unspecified | **78** | Baseline database total |
| **Active Shifts (Not Soft-deleted)** | 52 | **69** | `deleted_at IS NULL` |
| **Soft-deleted Shifts** | 0 | **9** | `deleted_at IS NOT NULL` |
| **August 2026 Total (All)** | 52 | **56** | All shifts in `date LIKE '2026-08%'` |
| **August 2026 Active Only** | 52 | **51** | August shifts with `deleted_at IS NULL` |
| **01–04 August 2026 Total** | 52 | **5** | All shifts dated between 2026-08-01 and 2026-08-04 |
| **01–04 August 2026 Active** | 52 | **5** | 100% active in this date window |
| **October 2026 Total** | 0 | **15** | All shifts in `date LIKE '2026-10%'` |
| **October 2026 Active** | 0 | **11** | 4 soft-deleted in October 2026 |
| **11 October 2026 (Current Date)** | 0 | **0** | Empty state confirmed for today |

### Granular Date Breakdown

- **August 2026 (56 total / 51 active):**
  - `2026-08-01`: 2 shifts (2 active)
  - `2026-08-03`: 2 shifts (2 active)
  - `2026-08-04`: 1 shift (1 active)
  - *Subtotal 01–04 August 2026:* **5 shifts** (Previous claim of 52 was invalid by 47 shifts)
  - `2026-08-05`: 2 shifts (2 active)
  - `2026-08-06`: 2 shifts (2 active)
  - `2026-08-07`: 3 shifts (3 active)
  - `2026-08-08`: 1 shift (1 active)
  - `2026-08-13`: 1 shift (1 active)
  - `2026-08-14`: 3 shifts (3 active)
  - `2026-08-15`: 3 shifts (3 active)
  - `2026-08-20`: 4 shifts (3 active, 1 soft-deleted)
  - `2026-08-21`: 3 shifts (2 active, 1 soft-deleted)
  - `2026-08-22`: 3 shifts (3 active)
  - `2026-08-23`: 1 shift (0 active, 1 soft-deleted)
  - `2026-08-24`: 5 shifts (5 active)
  - `2026-08-25`: 3 shifts (3 active)
  - `2026-08-26`: 3 shifts (3 active)
  - `2026-08-27`: 3 shifts (3 active)
  - `2026-08-28`: 2 shifts (2 active)
  - `2026-08-29`: 2 shifts (2 active)
  - `2026-08-30`: 3 shifts (3 active)
  - `2026-08-31`: 4 shifts (2 active, 2 soft-deleted)

- **October 2026 (15 total / 11 active):**
  - `2026-10-03`: 3 shifts
  - `2026-10-06`: 1 shift
  - `2026-10-08`: 1 shift
  - `2026-10-09`: 1 shift
  - `2026-10-10`: 2 shifts
  - `2026-10-15`: 1 shift
  - `2026-10-16`: 1 shift
  - `2026-10-20`: 2 shifts
  - `2026-10-23`: 2 shifts
  - `2026-10-28`: 1 shift
  - `2026-10-11`: 0 shifts (Today's Empty State)

---

## 3. Strict Evidence Integrity Protocol (Phase 1 Mandates)

Moving forward, the following strict validation gates are enforced across all automation and reporting scripts:

1. **No Artificial PASS / MATCH:**
   - Any test case lacking an authentic, verified screenshot captured directly from the Vercel Preview runtime (`https://live-app-clean-oyi5j5xig-livestream2.vercel.app`) must be marked `UNVERIFIED` or `BLOCKED_SSO`.
   - Never classify a wave or route as `MATCH_HIGH_FIDELITY` without side-by-side comparison between Reference Mock and Runtime Deployed PNG.

2. **Automated Manifest Gate:**
   - Every entry in `REAL_PREVIEW_SCREENSHOT_MANIFEST.json` marked `PASS` or `MATCH` must:
     a) Have a physical PNG file existing on disk.
     b) Possess a valid SHA-256 hash computed directly from the file bytes.
     c) Possess an authentic ISO timestamp from the browser execution clock (no static constant strings).
     d) Link to the exact Git commit SHA (`5c45e0f` or deployment SHA `5c45e0f`) and deployment URL.

3. **Status Classification Taxonomy:**
   - `SOURCE_CODE_REVIEWED`: Verified at the TypeScript/React code level.
   - `DEPLOYED_RUNTIME_VERIFIED`: Deployed on Vercel Preview, loaded via authenticated browser, HTTP 200, hydrated.
   - `VISUAL_PARITY_VERIFIED`: Side-by-side image comparison matches Hi-Fi reference mock.
   - `BLOCKED_SSO`: Preview URL intercepted by Vercel Authentication / SSO gate.
   - `BLOCKED_DATA`: Missing domain data/fixtures on STAGING to populate the state.
   - `UNVERIFIED`: Not yet executed or captured on the target runtime.
   - *Status codes must remain discrete and NEVER collapsed into a generic PASS.*

---

## 4. Phase 2 Transition Plan

The automated evidence correction is now active. All corrupted and synthetic deliverables have been archived under `_REJECTED` identifiers. 

The next immediate phase is **Phase 2 — Authenticated Vercel Browser Profile**:
- Launch a dedicated Chrome instance using an isolated QA profile (`qa_browser_profile`).
- Hand over to the Operator to authenticate directly against Vercel SSO.
- Verify session persistence and preview reachability before launching the automated capture suite.
