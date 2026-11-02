# ADA OPS / STORAGE ROUTING HANDOFF V1

Ngày: 2026-11-02. Đây là **configuration blueprint**, KHÔNG phải live routing đang được kích hoạt.

## 1. Storage contract đã chốt
- Google Drive là kho gốc chứa tất cả **file bytes**, tài liệu gốc, ảnh, video, workbook, BI exports, backups và structured snapshots.
- Supabase chỉ giữ file metadata, provider refs, khoá liên kết, phân quyền, checksum và transactional state tối thiểu để duy trì luồng ca/chấm công/payroll/KPI an toàn. Không lưu raw binary trong Supabase Storage.
- Source lịch/nhập liệu được lưu nguyên bản và có bản snapshot versioned trong Drive. Dữ liệu DB phục vụ truy vấn và nghiệp vụ thời gian thực; nếu buộc tất cả dữ liệu giao dịch đều chỉ ở Drive thì phải thiết kế lại database, không phải chỉ thay routing.
- Drive historical root `1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm`; new assets root `1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh`.
- Có 93 folder Drive đã được tạo/đọc lại. **Production operational_storage_routes hiện vẫn 0**.

## 2. Cây nghiệp vụ đã tạo
- `00_ADA_OPS_PLATFORM/01_SCHEDULE_IMPORT_EXPORT`  → `1rCczpADR3I3WSGfwnBjDlbtLCDhD_m_9`
- `00_ADA_OPS_PLATFORM/02_SHIFT_STAFFING`  → `1txzaulVB0BJMuAn-6lWzEDp5-bpJUwLx`
- `00_ADA_OPS_PLATFORM/03_LIVE_REPORTS`  → `19t3RguHpduM9GXBFquCRvUKU4MXmXgtA`
- `00_ADA_OPS_PLATFORM/04_MEDIA_ASSETS`  → `10aHHBbHG-7cbqtM61nm4Gn7bMYOJPmWc`
- `00_ADA_OPS_PLATFORM/05_BRAND_CATALOG`  → `1afOcAufbaf1Kv8q0CfGzUamohF62RWUz`
- `00_ADA_OPS_PLATFORM/06_ECOMMERCE_INGESTION`  → `1vAHGx-CZ8fpVp3afLORzA5P0ecGEHNOq`
- `00_ADA_OPS_PLATFORM/07_ANALYTICS_BI`  → `1coUaRS-LSXq2xfm3imclH663EpPrtbfo`
- `00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS`  → `1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN`
- `00_ADA_OPS_PLATFORM/09_SYSTEM_OPERATIONS`  → `11HNEzJTu5yiK2kQN4vy9TZqAMj7sl0YC`
- `00_ADA_OPS_PLATFORM/10_AI_AUTOMATION_KNOWLEDGE`  → `1ZAH0CTbYbBlYaRMshFmQBGNo3C5fLBvT`
- `00_ADA_OPS_PLATFORM/11_CONTRACTS_FINANCE_RESTRICTED`  → `1yKWTOb_fWcKG4OJgYG3Zp-E4yzfxC5vQ`
- `00_ADA_OPS_PLATFORM/12_ARCHIVE_IMPORT_LEGACY`  → `1bFSEPaeY0qCtno_KHfWBezsVBYq4Y1db`
- `00_ADA_OPS_PLATFORM/13_OPERATIONS_SUPPORT`  → `1vlVzyo4FE2S_PINVBXx9nDQT20zMNLVZ`

## 3. Mapping 15 category file code hiện có

| category code | Đích Drive được chốt | Quy tắc |
|---|---|---|
| `schedule_source` | `01_SCHEDULE_IMPORT_EXPORT/01_RAW_XLSX_CSV` | `batch_then_period` |
| `schedule_export` | `01_SCHEDULE_IMPORT_EXPORT/03_SCHEDULE_EXPORTS` | `brand_period_version` |
| `live_snapshot` | `03_LIVE_REPORTS` | `per_shift_then_08_METRICS_DATA_SNAPSHOTS` |
| `video_recording` | `04_MEDIA_ASSETS/07_VIDEO_OUTPUTS` | `brand_platform_date_shift` |
| `video_livecut` | `04_MEDIA_ASSETS/05_LIVECUT_TEASERS` | `brand_platform_campaign` |
| `production_asset` | `04_MEDIA_ASSETS/04_CAMPAIGN_ASSETS` | `brand_campaign` |
| `content_script` | `04_MEDIA_ASSETS/08_SCRIPT_BRIEFS` | `brand_campaign_version` |
| `content_brief` | `04_MEDIA_ASSETS/08_SCRIPT_BRIEFS` | `brand_campaign_version` |
| `campaign_document` | `04_MEDIA_ASSETS/04_CAMPAIGN_ASSETS` | `brand_campaign_version` |
| `staffing_document` | `02_SHIFT_STAFFING/05_STAFFING_EXPORTS` | `brand_period_version` |
| `acceptance_document` | `11_CONTRACTS_FINANCE_RESTRICTED/02_ACCEPTANCE_BBNT` | `vendor_period_version` |
| `payment_document` | `11_CONTRACTS_FINANCE_RESTRICTED/03_INVOICES_PAYMENTS` | `vendor_period_version` |
| `ai_output` | `10_AI_AUTOMATION_KNOWLEDGE/04_AGENT_OUTPUTS` | `agent_project_version` |
| `system_export` | `09_SYSTEM_OPERATIONS/05_DATA_EXPORT_BACKUPS` | `backup_version` |
| `sop_document` | `13_OPERATIONS_SUPPORT/02_STANDARD_OPERATING_PROCEDURES` | `team_doc_version` |

## 4. Report 1 parent live / 9 thư mục con

App PHẢI tạo subfolders thuộc ca thật; `00_SHIFT_FOLDER_TEMPLATE` chỉ để tham khảo, không đặt file thật trong mẫu.
`03_LIVE_REPORTS/<brand_id>/<platform_id>/<YYYY>/<MM>/<human_code>__<shift_uuid>/<category>`

- `kv_before` → `01_KV_BEFORE_LIVE`
- `kv_after` → `02_KV_AFTER_LIVE`
- `dashboard_summary` → `03_DASHBOARD_SUMMARY`
- `dashboard_30min` → `04_DASHBOARD_30MIN`
- `live_session_photo` → `05_LIVE_SESSION_PHOTOS`
- `other_evidence` → `06_OTHER_EVIDENCE`
- `final_report_insights` → `07_FINAL_REPORT_AND_INSIGHTS`
- `metrics_snapshot` → `08_METRICS_DATA_SNAPSHOTS`
- `file_manifest_checksums` → `09_FILE_MANIFEST_CHECKSUMS`

## 5. Production source gaps đã kiểm chứng
- `lib/files/operationalFileCatalog.ts`: 15 technical categories; chưa có mapping domain-first 13 thư mục.
- `lib/files/operationalStoragePlacementResolver.ts`: profile CANONICAL_V1 tạo Brand/Platform/period/... thay vì domain-first.
- `lib/server/operationalStorageRouteRepository.ts`: DB `operational_storage_routes` hiện 0 hàng; chỉ xét route theo brand/source/platform, chưa có domain-class category routing.
- `lib/server/operationalFileRouteHandler.ts`: shift cần `execution_source=internal|agency`. Production hiện 1,579/1,579 ca chưa xóa có NULL.
- `lib/files/operationalFileCatalog.ts`: upload direct tối đa 4 MiB; không đủ cho video.
- `lib/server/reportImageRouteHandler.ts` và `components/features/reports/LiveReportImageGallery.tsx`: 3 image types trong UI, Owner cần 6 nhóm minh chứng.
- Current PR #169 Draft: bảo vệ report/readback, migration chưa apply; app Drive identity chưa UAT thật.

## 6. Thứ tự công việc cần implement (một mini-batch storage duy nhất)
1. Mở các file blueprint và registry, test folderID/parent trên real Drive. Không xóa hay di chuyển folder cũ.
2. Nâng cấp routing engine thành `DOMAIN_CANONICAL_V2` hoặc route-domain table (cần review schema); đầu vào `file_category` + `brand_id` + `platform_id` + `parent_shift_id` + `YYYY/MM` + metadata subtype. Route tới folder ID thực đã duyệt, không tạo cây khác.
3. Bổ sung migration additive, idempotent, RLS/ACL; chưa apply Prod trong bước chuẩn bị.
4. Lưu toàn bộ file bytes/source snapshots Google Drive; DB chỉ chứa metadata và transaction state tối thiểu. Không gửi binary vào Supabase Storage.
5. Đảm bảo một live ca cha gắn một bộ Report và N staffing segments; export và KPI snapshot link theo parent shift.
6. Khi có session service identity, thử upload+readback file giả vào UAT folder `1ucgT3BkHtKOqDqkKY5i7Gd5s6akTPH1P`, đối chiếu SHA256 và folder metadata.
7. Hỗ trợ resumable upload cho file lớn; xử lý retry, partial upload, orphan reconciliation, idempotency, không fake success.
8. HR/Finance folder đã TẠO; nhưng do inherited anyone:writer cần tách private root/kiểm soát ACL trước dữ liệu thực. Không lấy lý do ACL để ngăn tạo folder hoặc thử file giả.
9. Kết hợp với Gemini Batch 01.1 fix execution_source và Agency, không backfill phỏng đoán.
10. Chạy full authenticated role UAT + Preview build; sau đó release coordinator mới cho Production migration/deploy.

## 7. Acceptance và nguồn mã
- Folder physical READY; application storage routing NOT READY; NO-GO for Production until evidence.
- Repo https://github.com/anhkienk4-max/live-app-main/pull/169 head `74ca678c66a09111ec5e9a0fcb7ab5e3504a18c1` at audit.
- Drive folder [ADA_OPS_PLATFORM](https://drive.google.com/drive/folders/1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh).
- Full machine-readable `ADA_OPS_STORAGE_ROUTING_BLUEPRINT_V1.json` includes all 93 real IDs.
- No code, Supabase migrations or Production deployment have been applied by this preparation.