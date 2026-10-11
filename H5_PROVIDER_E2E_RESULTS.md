# H5 PHYSICAL PROVIDER E2E TEST REPORT

**Evidence ID:** `EVID-H5-PROV-BLOCKED-01`  
**Target Environments:** Google Drive API v3 & Microsoft OneDrive Graph API  
**Verified Git SHA:** `b864c8bb76ebbfc09033423394966268cab947ef`  
**Status:** **NOT_EXECUTED (BLOCKED — PENDING OPERATOR TEST CREDENTIALS)**  

---

## 1. EXECUTIVE SUMMARY & GATE CLASSIFICATION

Per APP OPS release rules:
- **Never mark a gate as PASS without real execution evidence.**
- **Contract & Unit Level:** **PASS** (100% passed in `tests/h4-storage-route-security.test.ts`, `tests/operational-storage-placement.test.ts`, and `tests/rc15-operational-file-storage.test.ts`).
- **Physical API Level:** **NOT_EXECUTED**. No live external Google Drive service accounts or OneDrive client secrets are configured in `.env.local` or repository secrets.
- **Production Guard:** Strict safety boundary prohibits using operational production Google Drive / OneDrive folders for test execution.

---

## 2. PRE-REQUISITES FOR UNBLOCKING PHYSICAL CLOUD E2E

Before executing physical cloud operations, the Operator must provide the following scoped test credentials in a safe test environment:

| Requirement | Description | Status |
| :--- | :--- | :---: |
| **Google Drive Test Root** | Dedicated test folder ID (e.g. `1aBcDeFg_TEST_ROOT_ONLY`) | **AWAITING OPERATOR** |
| **Google Service Account / OAuth** | Test OAuth client with Drive file scope | **AWAITING OPERATOR** |
| **OneDrive Test Root** | Dedicated OneDrive test drive item ID | **AWAITING OPERATOR** |
| **OneDrive Graph Client** | Test Azure App Registration credentials | **AWAITING OPERATOR** |
| **Database Seed Route** | Seeded test route with `active = true` pointing to test folder IDs | **AWAITING OPERATOR** |

---

## 3. READY-TO-EXECUTE PHYSICAL TEST CHECKLIST

When the Operator provisions the scoped test credentials, the following 8-step physical test suite is prepared to execute:

1. **Test File Upload:**
   - Upload sample binary payload (PNG image and XLSX document).
   - Verify physical cloud HTTP 200/201 response with valid file ID.
2. **Database Metadata Persistence:**
   - Verify row inserted into `public.operational_files` or `public.live_report_images`.
   - Verify `provider`, `external_file_id`, and `storage_file_name` columns match cloud response.
3. **Parent Folder Hierarchy Verification:**
   - Confirm file is placed inside `{Brand}/{Platform}/{Year-Month}/{Category}/` hierarchy.
   - Confirm folder creation is idempotent (re-uses existing folder if already created).
4. **File Retrieval & Download:**
   - Execute stream GET request via `fileStorageService.get()`.
   - Verify byte integrity (SHA-256 checksum of downloaded content matches original bytes).
5. **Soft-Delete & Cloud Cleanup:**
   - Execute delete flow.
   - Verify `authorize_live_report_image_delete` validates actor permission.
   - Verify cloud file is removed or moved to trash without orphaned DB records.
6. **Duplicate Retry & CAS:**
   - Simulate network retry with identical idempotency key.
   - Confirm original cloud file is kept and no duplicate cloud upload occurs.
7. **Cross-Brand Rejection:**
   - Attempt upload for Brand B using Brand A route.
   - Confirm resolver fails closed with `STORAGE_ROUTE_NOT_CONFIGURED`.
8. **Invalid Route Rejection:**
   - Attempt upload with unrecognized execution source.
   - Confirm resolver fails closed without cloud mutation.

---

## 4. GATE CONCLUSION

**Gate Result:** `NOT_EXECUTED` (Documented & Prepared).  
**Blocker:** Awaiting Operator test route approval and credential injection.  
**Production Risk:** Zero (No live production cloud objects created or modified).
