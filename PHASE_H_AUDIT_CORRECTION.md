# PHASE H AUDIT CORRECTION — RC14 / RC15 RECONCILIATION

**Repository:** `anhkienk4-max/live-app-main`  
**Current Baseline Commit:** `306dc1242dcd7e8cfebd6afde01b23b438e9be68`  
**Integration Branch (RC14):** `integration/rc14-frontend14wave-convergence`  
**Actual RC15 Branch:** `fix/rc14-data-report-export-fidelity` (`e5879abeff7a1a4ffbf8222093047bb5882456dc`)  
**Erroneous Baseline Branch (Superseded):** `fix/report-storage-security` (`69abb03`)  
**Target Environments:**
- STAGING: `amagnzebmmuqiptmrjmc`
- PRODUCTION: `egdjnpmoasarrttvhgds` (STRICTLY READ-ONLY / ZERO WRITES)  
**Date:** 2026-10-11

---

## 1. Executive Correction: Retraction of Erroneous Phase H Conclusions

The previous Phase H audit (`PHASE_H_GO_LIVE_PREPARATION_AUDIT.md`) contained fundamental technical misjudgments that are hereby **formally retracted and corrected**:

### Correction 1: RC14 is NOT a Superset of RC15
- **Previous Erroneous Claim:** Phase H claimed that `integration/rc14-frontend14wave-convergence` was a "strict superset of RC15".
- **Root Cause of Error:** Phase H performed a diff against branch `fix/report-storage-security` (`69abb03`), an obsolete staging prototype created on 2026-09-13.
- **Actual Reality:** The genuine RC15 candidate branch is `fix/rc14-data-report-export-fidelity` (`e5879ab`). Both RC14 (76 commits) and RC15 (71 commits) diverged independently from common base commit `31efea2d1a60583975e96773f68106d46ab7d8d9` (`origin/main`).
- **Correction:** Neither branch is a superset of the other. RC14 contains the full 14-Wave Frontend interiors, dark operational shell, registration/staffing workspaces, and P0/P1 security/data patches. RC15 contains the comprehensive Storage Center V2 (`/storage`, `/storage/setup`), operational file catalog, Google Drive ancestry placement, and 4-sheet report export.

### Correction 2: Replay of Legacy RC12 / RC13A on Production is HALTED
- **Previous Erroneous Proposal:** Phase H proposed replaying `20260919074349_rc12_report_file_provider.sql` and `20260924000000_rc13a_execution_source_storage_routes.sql` directly on Production.
- **Root Cause of Error:** Phase H assumed Production had never received `shifts.execution_source`, `operational_storage_routes`, or shift RPC execution_source allowlists.
- **Actual Reality:** Production (`egdjnpmoasarrttvhgds`) **already received and executed** the modern, forward-only RC15 migrations on 2026-10-11:
  1. `20261011091925_rc15_storage_route_prerequisites`
  2. `20261011092015_rc15_shift_rpc_compatibility`
  3. `20261011092051_rc15_operational_files`
- **Catastrophic Risk of Old RC13A Replay:**
  - Old RC13A attempted to `alter table public.brands alter column storage_profile set default 'CANONICAL_V1'`. RC15 explicitly dropped all defaults to enforce human operator verification.
  - Old RC13A restricted `brands.storage_profile` to 6 profiles, completely omitting `'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'` (which is mandatory for ASM and Male AI Livestream Drive routes).
  - Old RC13A contained an unverified DDL overwrite of `create_shift` and `update_shift` that did not verify MD5 checksums and failed to revoke the vulnerable 3-parameter `update_shift` overload.
  - Replaying RC13A would downgrade Production RPCs and break existing RC15 schema constraints.

---

## 2. Actual Two-Branch Delta Summary

```
                      origin/main (31efea2)
                            /        \
                           /          \
   integration/rc14-frontend14wave   fix/rc14-data-report-export-fidelity
        (76 unique commits)                 (71 unique commits)
  - 14-Wave Hi-Fi Interiors          - Storage Center V2 (/storage, /storage/setup)
  - Dark Ops Shell Frame (#082743)   - 15 Operational File Categories
  - Shift Registration (/registration) - Google Drive Ancestry Validation
  - Staffing Workspace (/staffing)   - 4-Sheet Report Export Workbook
  - Shifts Workspace (/shifts)       - Schedule Source Auto-Archive
  - P0 Privacy Migration (20261008)  - RC15 Migrations (20261011091925/2015/2051)
  - P1 Revision Repair (20261008)    - Paginated Unclassified Shift Review
```

### Table: False Conclusions vs. Verified Facts

| Area | False Conclusion (Phase H) | Verified Technical Fact (Phase H.2) | Evidence / Source |
| :--- | :--- | :--- | :--- |
| **RC15 Identity** | `fix/report-storage-security` (`69abb03`) | `fix/rc14-data-report-export-fidelity` (`e5879ab`) | `git log --oneline 31efea2..e5879ab` (71 commits) |
| **Superset Status** | RC14 is a strict superset of RC15 | Neither is a superset; parallel sibling branches | 102 files unique to RC14; 28 files unique to RC15 |
| **Production Schema** | Production lacks `shifts.execution_source` | Production ALREADY HAS `shifts.execution_source` | Applied ledger `20261011091925` on `egdjnpmoasarrttvhgds` |
| **Storage Routes** | Table `operational_storage_routes` missing on PROD | Table ALREADY EXISTS on PROD with RC15 enhancements | Applied ledger `20261011091925` |
| **Operational Files** | Table `operational_files` not mentioned | Table ALREADY EXISTS on PROD with integrity guards | Applied ledger `20261011092051` |
| **Shift RPCs on PROD** | Cannot accept `execution_source` | RPCs ALREADY accept `execution_source in ('internal', 'agency')` | Applied ledger `20261011092015` |
| **RC13A Migration** | Must replay RC13A to Production | RC13A is DEPRECATED and MUST NOT be replayed | RC15 replaced RC13A with forward-only schema |
| **Brand Defaults** | Set default `'CANONICAL_V1'` | Strict rule: NO default on `storage_profile` | Migration `20261011091925` line 38 |
| **771 Shift Backfill** | Suggest bulk classifying historical shifts | Strict rule: NO bulk backfill; keep NULL until human review | Migration `20261011091925` comment line 86 |

---

## 3. Strict Operating Decisions for Phase H.2

1. **Production Freeze:** Zero write operations against Production database (`egdjnpmoasarrttvhgds`).
2. **Credential Immutability:** Preserve all credentials and passwords exactly as they are. No alterations to `auth.users`.
3. **No Automatic Merge:** RC14 and RC15 must not be merged automatically into `main` or into each other without complete reconciliation.
4. **Target Candidate Branch:** All convergence work must occur on a dedicated candidate branch (`rc/convergence-rc14-rc15`).
5. **SSO Gate Status:** Preview UAT remains truthfully held at `BLOCKED_SSO` until valid browser authentication is completed with actual screenshots.
