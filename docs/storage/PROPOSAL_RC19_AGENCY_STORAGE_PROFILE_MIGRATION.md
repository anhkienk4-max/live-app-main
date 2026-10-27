# ĐỀ XUẤT MIGRATION: BỔ SUNG PROFILE CHO STORAGE ROUTE AGENCY (RC19 STO-01)

- **Trạng thái:** PENDING OWNER REVIEW (CORRECTION REQUIRED)
- **Mã Task:** RC19 STO-01 (Issue #97)
- **Target Environment:** Supabase Production (`egdjnpmoasarrttvhgds`)
- **Tác giả:** Antigravity Agent
- **Ngày:** 2026-10-27

---

## 1. TỔNG QUAN VẤN ĐỀ

Trong quá trình chuẩn bị kích hoạt 21 Storage Routes cho Production theo cấu hình `config/storage-v1-production-routes.proposed.json`, kiểm tra read-only đã xác nhận:

1. CSDL Production hiện có **0 active routes**.
2. **12 Brands** đề xuất đều tồn tại trên Production CSDL.
3. **Check Constraint hiện tại** trên `public.brands` và `public.operational_storage_routes` (từ migration `20261011091925_rc15_storage_route_prerequisites.sql`) chỉ cho phép 7 profile:
   ```sql
   CHECK (storage_profile IN (
     'LEGACY_CATEGORY_PERIOD',
     'LEGACY_PLATFORM_CATEGORY_PERIOD',
     'LEGACY_PERIOD_CATEGORY',
     'LEGACY_SUBBRAND_PERIOD_CATEGORY',
     'LEGACY_SUBBRAND_CATEGORY_PERIOD',
     'CANONICAL_V1',
     'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
   ))
   ```
4. **Xung đột Schema:** Trong số 21 route đề xuất, có **7/21 routes** (các route thuộc nguồn thực thi `agency` của ASTROMAN, CUREL, Female, KATE, OPELLA, Pepsico, X-men) sử dụng profile:
   ```
   TEMP_AGENCY_BRAND_PERIOD_CATEGORY
   ```
   Profile này đã được khai báo trong TypeScript resolver (`lib/files/operationalStoragePlacementResolver.ts`), nhưng **chưa từng có trong CHECK constraint của CSDL Production**.
5. Nếu chạy script seed trực tiếp trên Production, PostgreSQL sẽ báo lỗi vi phạm CHECK constraint (`check constraint violation`) và abort transaction.

---

## 2. PHÂN LOẠI 21 STORAGE ROUTES

| Nhóm | Số lượng | Danh sách Routes | Trạng thái Schema Production |
|---|---|---|---|
| **A. Canonical V1 (Internal AI)** | 3 | ASM AI Livestream, Female AI livestream, Male AI livestream | **HỢP LỆ (SCHEMA_VALID)** |
| **B. Legacy Category-Period (Internal)** | 8 | Mars Snacking, ASTROMAN, Female, X-men, CUREL, OPELLA (Shopee Live), OPELLA (TikTok Shop), Pepsico | **HỢP LỆ (SCHEMA_VALID)** |
| **C. Legacy Period-Category (Internal & Agency Mars)** | 3 | Mars Snacking (`agency`), KATE (`internal`), KAO (`internal`) | **HỢP LỆ (SCHEMA_VALID)** |
| **D. Agency Shared Root (`TEMP_AGENCY_BRAND_PERIOD_CATEGORY`)** | 7 | ASTROMAN (`agency`), CUREL (`agency`), Female (`agency`), KATE (`agency`), OPELLA (`agency`), Pepsico (`agency`), X-men (`agency`) | **BỊ CHẶN (BLOCKED_CHECK_CONSTRAINT)** |

**Tổng cộng:** 14 routes hợp lệ với schema hiện tại, 7 routes bị chặn do thiếu schema support.

---

## 3. PHÂN TÍCH CẤU TRÚC FOLDER VẬT LÝ VÀ NGUY CƠ

### 3.1. Tại sao không thể tự ý đổi profile của 7 route Agency sang `LEGACY_PERIOD_CATEGORY`?
- Cả 7 route Agency này đều dùng chung `base_folder_id = '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC'` (đây là thư mục gốc Agency).
- Logic của `TEMP_AGENCY_BRAND_PERIOD_CATEGORY`:
  ```
  [Brand] / [Period] / [Category]
  Ví dụ: ASTROMAN / THÁNG 10.2026 / DASHBOARD
  ```
- Nếu tự ý chuyển sang `LEGACY_PERIOD_CATEGORY`:
  ```
  [Period] / [Category]
  Ví dụ: THÁNG 10.2026 / DASHBOARD
  ```
  Khi đó, vì cả 7 brand đều dùng chung `base_folder_id`, file của tất cả các brand sẽ bị ghi đè/trộn lẫn vào cùng một thư mục `THÁNG 10.2026`, gây **mất cách ly dữ liệu giữa các Brand**.
- Để dùng `LEGACY_PERIOD_CATEGORY`, hệ thống bắt buộc phải có `base_folder_id` riêng cho từng Brand trên Google Drive (ví dụ: folder ASTROMAN trong Agency root, folder CUREL trong Agency root, v.v.).

### 3.2. Sai lệch cấu trúc giữa `CANONICAL_V1` và Bàn giao
- Mã nguồn `CANONICAL_V1` hiện tạo cấu trúc:
  ```
  Brand / Platform / Period / Category
  ```
- Tài liệu bàn giao ghi nhận cấu trúc:
  ```
  Brand / Year / Month / Platform / Category
  ```
  (Cấu trúc này tương ứng với `EXISTING_BRAND_YEAR_PERIOD_PLATFORM` khi `base_folder_id` là Brand folder).
- **Quy tắc an toàn:** Tuyệt đối không tự ý sửa đổi logic `CANONICAL_V1` hoặc tự ý di chuyển/đổi tên file trên Google Drive khi chưa có quyết định phê duyệt chính thức từ Owner.

---

## 4. CÁC PHƯƠNG ÁN XỬ LÝ (CHO OWNER PHÊ DUYỆT)

### Phương án 1 (Khuyến nghị): Mở rộng CHECK Constraint cho Schema Production
Áp dụng một migration chuyển tiếp duy nhất, bổ sung `'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'` vào CHECK constraint của bảng `operational_storage_routes` (và `brands` nếu cần).

**SQL Migration đề xuất (chờ phê duyệt):**
```sql
-- Migration: Add TEMP_AGENCY_BRAND_PERIOD_CATEGORY to operational_storage_routes check constraint
ALTER TABLE public.operational_storage_routes
  DROP CONSTRAINT IF EXISTS operational_storage_routes_storage_profile_check;

ALTER TABLE public.operational_storage_routes
  ADD CONSTRAINT operational_storage_routes_storage_profile_check
  CHECK (storage_profile IN (
    'LEGACY_CATEGORY_PERIOD',
    'LEGACY_PLATFORM_CATEGORY_PERIOD',
    'LEGACY_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_CATEGORY_PERIOD',
    'CANONICAL_V1',
    'EXISTING_BRAND_YEAR_PERIOD_PLATFORM',
    'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'
  ));
```
- **Ưu điểm:** Khớp 100% với logic code hiện có trong `operationalStoragePlacementResolver.ts`, không làm thay đổi đường dẫn lưu trữ đã thống nhất, cho phép kích hoạt trọn vẹn 21 routes.
- **Rủi ro:** Cần review và phê duyệt migration trước khi chạy trên Production.

### Phương án 2: Chuẩn bị 7 Thư mục vật lý riêng cho từng Brand Agency
Giữ nguyên schema hiện tại. Owner / Admin cung cấp ID thư mục Google Drive thực tế cho từng Brand bên dưới Agency root (`1MXerAY2WdViTsVCO8G92vOepS-6BxYBC`), và cấu hình 7 route này bằng profile `LEGACY_PERIOD_CATEGORY`.
- **Ưu điểm:** Không cần thay đổi schema/migration trên Production CSDL.
- **Nhược điểm:** Cần thao tác thủ công tạo và lấy ID của 7 folder trên Google Drive.

---

## 5. KẾT LUẬN & KIẾN NGHỊ

1. **Giữ nguyên trạng Production:** Không áp dụng script seed cũ, không nới constraint hoặc chạy migration khi chưa có quyết định của Owner.
2. **Kích hoạt an toàn giai đoạn 1 (tùy chọn):** Nếu cần đưa 14 routes hợp lệ vào hoạt động trước, có thể sử dụng script seed có cơ chế preflight kiểm tra khắt khe, chỉ seed 14 routes hợp lệ và bỏ qua 7 routes agency cho đến khi có migration.
3. **Trạng thái:** `CORRECTION REQUIRED` — Chờ Owner review và lựa chọn Phương án 1 hoặc Phương án 2.
