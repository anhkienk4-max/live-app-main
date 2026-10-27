# ĐỀ XUẤT MIGRATION: BỔ SUNG PROFILE CHO STORAGE ROUTE AGENCY (RC19 STO-01)

- **Trạng thái:** PENDING OWNER REVIEW (READ-ONLY PROPOSAL — CHƯA ÁP DỤNG PRODUCTION)
- **Mã Task:** RC19 STO-01 (Issue #97)
- **Target Environment:** Supabase Production (`egdjnpmoasarrttvhgds`)
- **Tác giả:** Antigravity Agent
- **Ngày:** 2026-10-27

---

## 1. TỔNG QUAN VẤN ĐỀ

Trong quá trình chuẩn bị kích hoạt 21 Storage Routes cho Production theo cấu hình `config/storage-v1-production-routes.proposed.json`, kiểm tra read-only đã xác nhận:

1. **CSDL Production hiện có 0 active routes** trong bảng `public.operational_storage_routes`.
2. **12 Brands** đề xuất đều đã tồn tại trong `public.brands`.
3. **Check Constraint hiện tại** trên `public.brands` và `public.operational_storage_routes` (từ migration `20261011091925_rc15_storage_route_prerequisites.sql` và reconciliation `20261013000000_rc16g_legacy_storage_routes.sql`) chỉ cho phép 7 profile:
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
4. **Xung đột Schema (Quarantine 7/21 Routes):** Trong 21 routes đề xuất, có **7 routes thuộc nguồn thực thi `agency`** sử dụng profile:
   ```
   TEMP_AGENCY_BRAND_PERIOD_CATEGORY
   ```
   Profile này đã được cài đặt đầy đủ logic định tuyến trong TypeScript resolver (`lib/files/operationalStoragePlacementResolver.ts`), nhưng **chưa có trong CHECK constraint của CSDL Production**.
5. Nếu chạy script seed trực tiếp trên Production, PostgreSQL sẽ báo lỗi `violates check constraint "operational_storage_routes_storage_profile_check"` và rollback toàn bộ transaction.

---

## 2. PHÂN LOẠI 21 STORAGE ROUTES

| Nhóm | Số lượng | Danh sách Routes | Base Folder ID | Trạng thái Schema Production |
|---|---|---|---|---|
| **A. Canonical V1 (Internal AI)** | 3 | ASM AI Livestream, Female AI livestream, Male AI livestream | `1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm` (Root) | **HỢP LỆ (SCHEMA_VALID — Sẵn sàng seed)** |
| **B. Legacy Category-Period (Internal)** | 8 | Mars Snacking, ASTROMAN, Female, X-men, CUREL, OPELLA (Shopee Live), OPELLA (TikTok Shop), Pepsico | Từng Brand có base folder ID riêng | **HỢP LỆ (SCHEMA_VALID — Sẵn sàng seed)** |
| **C. Legacy Period-Category (Internal & Mars Agency)** | 3 | Mars Snacking (`agency`), KATE (`internal`), KAO (`internal`) | Từng Brand có base folder ID riêng | **HỢP LỆ (SCHEMA_VALID — Sẵn sàng seed)** |
| **D. Quarantined Agency (`TEMP_AGENCY_BRAND_PERIOD_CATEGORY`)** | 7 | ASTROMAN (`agency`), CUREL (`agency`), Female (`agency`), KATE (`agency`), OPELLA (`agency`), Pepsico (`agency`), X-men (`agency`) | `1MXerAY2WdViTsVCO8G92vOepS-6BxYBC` (Dùng chung Agency Root) | **ĐANG CÁCH LY (QUARANTINED — Chờ Owner duyệt Migration)** |

**Tổng kết:**
- **14/21 routes** hoàn toàn hợp lệ với schema Production hiện tại.
- **7/21 routes** đang được cách ly an toàn, không bị ép kiểu làm hỏng dữ liệu.

---

## 3. PHÂN TÍCH RỦI RO DỮ LIỆU: TẠI SAO KHÔNG THỂ DÙNG `LEGACY_PERIOD_CATEGORY` CHO 7 AGENCY ROUTES?

### 3.1. Nguy cơ mất cô lập dữ liệu (Multi-Brand Collision)
- Cả 7 route Agency này đều dùng chung một thư mục gốc: `base_folder_id = '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC'`.
- Profile `TEMP_AGENCY_BRAND_PERIOD_CATEGORY` tạo cấu trúc đường dẫn:
  ```
  [Brand] / [Period] / [Category]
  Ví dụ: ASTROMAN / THÁNG 10.2026 / DASHBOARD
         CUREL / THÁNG 10.2026 / DASHBOARD
  ```
  Nhờ có segment `[Brand]`, mỗi brand có không gian thư mục riêng bên dưới Agency root.
- **Nếu tự ý chuyển 7 route này sang `LEGACY_PERIOD_CATEGORY`:**
  Cấu trúc đường dẫn sẽ trở thành:
  ```
  [Period] / [Category]
  Ví dụ: THÁNG 10.2026 / DASHBOARD
  ```
  Vì cả 7 brand cùng dùng chung một `base_folder_id`, file Dashboard/Báo cáo của **ASTROMAN, CUREL, Female, KATE, OPELLA, Pepsico, X-men** sẽ bị lưu chung vào cùng một thư mục `THÁNG 10.2026/DASHBOARD`. Điều này gây ra:
  1. **Lộ thông tin nội bộ giữa các Brand khác nhau**.
  2. **Ghi đè/xung đột file** khi các ca livestream của nhiều brand diễn ra cùng ngày/tháng.
  3. **Vi phạm nghiêm trọng quy chuẩn phân quyền và bảo mật dữ liệu**.

### 3.2. Sai lệch cấu trúc giữa `CANONICAL_V1` và Bàn giao
- Mã nguồn `CANONICAL_V1` hiện tạo cấu trúc: `Brand / Platform / Period / Category`.
- Bàn giao trước đó ghi nhận: `Brand / Year / Month / Platform / Category` (tương ứng với profile `EXISTING_BRAND_YEAR_PERIOD_PLATFORM`).
- **Quy tắc an toàn:** Không tự ý sửa logic `CANONICAL_V1` hoặc tự ý di chuyển thư mục Drive khi chưa có Owner phê duyệt.

---

## 4. PHƯƠNG ÁN MIGRATION ƯU TIÊN (CHO OWNER PHÊ DUYỆT)

### 4.1. Phương án 1 (Ưu tiên): Mở rộng CHECK Constraint cho Schema Production

Bổ sung profile `'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'` vào CHECK constraint của cả bảng `public.brands` và `public.operational_storage_routes`.

#### SQL Forward Migration Proposal (CHƯA ÁP DỤNG PRODUCTION):
```sql
-- ==============================================================================
-- PROPOSED MIGRATION: 20261028000000_rc19_agency_storage_profile.sql
-- Description: Add TEMP_AGENCY_BRAND_PERIOD_CATEGORY to storage_profile CHECK constraints
-- Target: Supabase Production (egdjnpmoasarrttvhgds)
-- Safety: Backward-compatible, non-breaking, preserves all existing constraints
-- ==============================================================================

BEGIN;

-- 1. Update public.brands constraint
ALTER TABLE public.brands
  DROP CONSTRAINT IF EXISTS brands_storage_profile_check;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_storage_profile_check
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

-- 2. Update public.operational_storage_routes constraint
ALTER TABLE public.operational_storage_routes
  DROP CONSTRAINT IF EXISTS operational_storage_routes_storage_profile_check,
  DROP CONSTRAINT IF EXISTS operational_storage_routes_profile_check;

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

COMMENT ON CONSTRAINT operational_storage_routes_storage_profile_check ON public.operational_storage_routes IS
  'Allowed storage routing profiles including agency shared root brand-segregated layout';

COMMIT;
```

#### SQL Rollback Migration Proposal:
```sql
-- ==============================================================================
-- PROPOSED ROLLBACK: 20261028000000_rc19_agency_storage_profile_rollback.sql
-- Description: Revert storage_profile CHECK constraints back to original 7 profiles
-- Target: Supabase Production (egdjnpmoasarrttvhgds)
-- Safety: Fails closed if any active route or brand currently uses the new profile
-- ==============================================================================

BEGIN;

-- 1. Safety check: ensure no active routes use TEMP_AGENCY_BRAND_PERIOD_CATEGORY
DO $rollback_preflight$
DECLARE
  v_active_agency_routes integer;
  v_active_agency_brands integer;
BEGIN
  SELECT count(*) INTO v_active_agency_routes
  FROM public.operational_storage_routes
  WHERE storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY' AND active = true;

  IF v_active_agency_routes > 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL-CLOSED: % active route(s) still use TEMP_AGENCY_BRAND_PERIOD_CATEGORY. Deactivate them first.', v_active_agency_routes;
  END IF;

  SELECT count(*) INTO v_active_agency_brands
  FROM public.brands
  WHERE storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY' AND deleted_at IS NULL;

  IF v_active_agency_brands > 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL-CLOSED: % brand(s) still use TEMP_AGENCY_BRAND_PERIOD_CATEGORY. Clear brand profile first.', v_active_agency_brands;
  END IF;
END
$rollback_preflight$;

-- 2. Revert public.operational_storage_routes constraint
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
    'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
  ));

-- 3. Revert public.brands constraint
ALTER TABLE public.brands
  DROP CONSTRAINT IF EXISTS brands_storage_profile_check;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_storage_profile_check
  CHECK (storage_profile IN (
    'LEGACY_CATEGORY_PERIOD',
    'LEGACY_PLATFORM_CATEGORY_PERIOD',
    'LEGACY_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_CATEGORY_PERIOD',
    'CANONICAL_V1',
    'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
  ));

COMMIT;
```

---

## 5. KẾ HOẠCH BÀN GIAO & PHÊ DUYỆT (RELEASE GATE)

1. **Giai đoạn 1 (Hiện tại):**
   - Đã kiểm tra và chứng minh 14 routes hợp lệ bằng preflight SQL có đầy đủ kiểm tra so sánh hợp đồng và phê duyệt.
   - Giữ nguyên trạng Production: Không chạy migration, không seed dữ liệu, không đổi biến môi trường Vercel.
2. **Giai đoạn 2 (Sau khi Owner duyệt Proposal):**
   - Áp dụng migration `20261028000000_rc19_agency_storage_profile.sql`.
   - Seed toàn bộ 21/21 routes (14 routes hợp lệ + 7 routes agency).
   - Chuyển biến môi trường Vercel `OPERATIONAL_STORAGE_ROUTING_MODE` từ `compat` sang `database`.
   - Tiến hành UAT luồng upload/xem file trên `https://ops5729.top/storage`.
