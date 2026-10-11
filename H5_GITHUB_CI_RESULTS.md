# H5 GITHUB CI WORKFLOW EXECUTION REPORT

**Evidence ID:** `RUN-38151989497`  
**Job ID:** `114507156489`  
**Workflow Name:** `Release Candidate Convergence Gate`  
**Workflow File:** [`.github/workflows/rc-convergence-gate.yml`](file:///C:/Users/KienNguyen/Downloads/KIEN%20ADA%20code/OPS%20LIVESTREAM%20PLATFORM/live-app-integration-rc14/.github/workflows/rc-convergence-gate.yml)  
**Branch:** `rc/convergence-rc14-rc15`  
**Commit SHA:** `b864c8bb76ebbfc09033423394966268cab947ef`  
**Run URL:** [https://github.com/anhkienk4-max/live-app-main/actions/runs/38151989497](https://github.com/anhkienk4-max/live-app-main/actions/runs/38151989497)  
**Job URL:** [https://github.com/anhkienk4-max/live-app-main/actions/runs/38151989497/job/114507156489](https://github.com/anhkienk4-max/live-app-main/actions/runs/38151989497/job/114507156489)  
**Start Timestamp:** 2026-10-11T15:36:40Z  
**Completion Timestamp:** 2026-10-11T15:38:43Z  
**Total Duration:** 2 minutes 3 seconds  
**Final Status:** **`completed`**  
**Final Conclusion:** **`success`**  

---

## 1. GITHUB ACTIONS STEP EXECUTION LOG

| Step | Action / Command | Duration | Status | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Set up job** | Initialize GitHub-hosted runner (`ubuntu-latest`) | 4s | **SUCCESS** | PostgreSQL 16 service healthy. |
| **Checkout branch** | `actions/checkout@v4.2.2` | 2s | **SUCCESS** | Fetched commit `b864c8b`. |
| **Set up Node.js 22** | `actions/setup-node@v4.4.0` | 2s | **SUCCESS** | Node.js 22.x activated. |
| **Install pinned pnpm** | `corepack prepare pnpm@10.26.0 --activate` | 3s | **SUCCESS** | Pinned pnpm 10.26.0 active. |
| **Install dependencies** | `pnpm install --frozen-lockfile` | 14s | **SUCCESS** | Locked dependencies installed without regeneration. |
| **Database Contract Check** | Isolated PostgreSQL 16 migration suite | 5s | **SUCCESS** | Contracts A & C verified: `report_images.provider`, `live_report_images.provider`, `upsert_live_report_image_with_provider`, `authorize_live_report_image_delete`, `operational_files`, `operational_storage_routes`. |
| **Type Check** | `pnpm exec tsc --noEmit --incremental false` | 17s | **SUCCESS** | 0 type errors. |
| **Lint** | `pnpm run lint` | 15s | **SUCCESS** | 0 lint errors. |
| **Contract & Security Tests** | Node test runner on storage & placement suites | 8s | **SUCCESS** | All 8 H.4 storage route security cases + RC15 suites passed. |
| **Vercel-equivalent Build** | `pnpm run build` | 46s | **SUCCESS** | 35 production routes compiled and generated. |
| **Artifact & SHA Provenance** | Environment and SHA verification | 1s | **SUCCESS** | Branch and commit SHA recorded. |
| **Post / Cleanup** | Teardown runner and PostgreSQL container | 3s | **SUCCESS** | Clean teardown. |

---

## 2. CI PROVENANCE RECORD

```text
PROVENANCE: branch=rc/convergence-rc14-rc15 sha=b864c8bb76ebbfc09033423394966268cab947ef time=2026-10-11T15:38:40Z
```

---

## 3. RELEASE GATE CONCLUSION

- **GITHUB_CI_PASS:** **`PASS`**
- Verified directly via GitHub REST API (`GET /repos/anhkienk4-max/live-app-main/actions/runs/38151989497`).
- Zero build failures, zero typecheck errors, zero database contract failures.
