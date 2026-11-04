# ĐỀ XUẤT MIGRATION: BỔ SUNG PROFILE CHO STORAGE ROUTE AGENCY (RC19 STO-01)

- **Trạng thái:** PENDING OWNER REVIEW (READ-ONLY PROPOSAL — CHƯA ÁP DỤNG PRODUCTION)
- **Mã Task:** RC19 STO-01 (Issue #97)
- **Target Environment:** Supabase Production (`egdjnpmoasarrttvhgds`)
- **Tác giả:** Antigravity Agent
- **Ngày:** 2026-10-27

---

## 1. TỔNG QUAN VẤN ĐỀ

Trong bộ đề xuất 21 Storage Routes, seed kích hoạt release này chỉ bao gồm 13 route nội bộ. Tám route Agency đều bị loại khỏi activation seed, gồm một route Mars Snacking hiện hợp lệ với schema nhưng deferred theo policy và bảy route dùng profile Agency cần migration review-only. Không chạy seed Production khi physical root chưa đạt security gate.

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
4. **Agency routes bị loại khỏi activation seed:** Có 8 route thuộc `agency`; một route Mars Snacking dùng profile schema-valid nhưng vẫn deferred theo release policy. Bảy route còn lại sử dụng profile cần proposal migration:
   ```
   TEMP_AGENCY_BRAND_PERIOD_CATEGORY
   ```
   Profile này đã được cài đặt đầy đủ logic định tuyến trong TypeScript resolver (`lib/files/operationalStoragePlacementResolver.ts`), nhưng **chưa có trong CHECK constraint của CSDL Production**.
5. Nếu chạy script seed trực tiếp trên Production, PostgreSQL sẽ báo lỗi `violates check constraint "operational_storage_routes_storage_profile_check"` và rollback toàn bộ transaction.

---

## 2. PHÂN LOẠI 21 STORAGE ROUTES VÀ SCOPE ACTIVATION

| Nhóm | Số lượng | Danh sách Routes | Base Folder ID | Trạng thái Schema Production |
|---|---|---|---|---|
| **A. Canonical V1 (Internal AI)** | 3 | ASM AI Livestream, Female AI livestream, Male AI livestream | `1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm` (Root) | **HỢP LỆ (SCHEMA_VALID — Sẵn sàng seed)** |
| **B. Legacy Category-Period (Internal)** | 8 | Mars Snacking, ASTROMAN, Female, X-men, CUREL, OPELLA (Shopee Live), OPELLA (TikTok Shop), Pepsico | Từng Brand có base folder ID riêng | **HỢP LỆ (SCHEMA_VALID — Sẵn sàng seed)** |
| **C1. Legacy Period-Category (Internal)** | 2 | KATE, KAO | Từng Brand có base folder ID riêng | **HỢP LỆ VỀ SCHEMA; physical root gate riêng** |
| **C2. Legacy Period-Category (Mars Agency)** | 1 | Mars Snacking (`agency`) | Agency base folder hiện hữu | **SCHEMA_VALID NHƯNG EXCLUDED / DEFERRED** |
| **D. Quarantined Agency (`TEMP_AGENCY_BRAND_PERIOD_CATEGORY`)** | 7 | ASTROMAN (`agency`), CUREL (`agency`), Female (`agency`), KATE (`agency`), OPELLA (`agency`), Pepsico (`agency`), X-men (`agency`) | `1MXerAY2WdViTsVCO8G92vOepS-6BxYBC` (Dùng chung Agency Root) | **ĐANG CÁCH LY (QUARANTINED — Chờ Owner duyệt Migration)** |

**Tổng kết:**
- Activation candidate chứa **13/21 route nội bộ**; không thêm route thứ 14 khi chưa có mapping nghiệp vụ xác thực.
- **8/21 Agency routes** đều excluded khỏi activation: một Mars Agency route schema-valid nhưng deferred theo policy; bảy route khác vẫn chờ proposal migration.
- Seed contract PASS không chứng minh physical folder ACL, runtime identity hoặc quyền ghi an toàn.

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

-- Lock safety: Fast fail if table lock cannot be acquired within 2s
SET LOCAL lock_timeout = '2s';

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
-- Safety: Fails closed if ANY record (active, inactive, or soft-deleted) uses the new profile
-- ==============================================================================

BEGIN;

-- Lock safety: Fast fail if table lock cannot be acquired within 2s
SET LOCAL lock_timeout = '2s';

-- 1. Safety check: ensure NO records whatsoever (active, inactive, or soft-deleted) use TEMP_AGENCY_BRAND_PERIOD_CATEGORY
-- Reason: PostgreSQL ALTER TABLE ... ADD CONSTRAINT performs a sequential table scan validating every row.
-- Any existing row with this profile will violate the reverted check constraint and cause the statement to abort.
DO $rollback_preflight$
DECLARE
  v_agency_routes_count integer;
  v_agency_brands_count integer;
BEGIN
  SELECT count(*) INTO v_agency_routes_count
  FROM public.operational_storage_routes
  WHERE storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY';

  IF v_agency_routes_count > 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL-CLOSED: % route record(s) (including inactive rows) still contain storage_profile = ''TEMP_AGENCY_BRAND_PERIOD_CATEGORY''. Any existing row with this profile will violate the reverted check constraint. Delete or reassign these routes before rolling back.', v_agency_routes_count;
  END IF;

  SELECT count(*) INTO v_agency_brands_count
  FROM public.brands
  WHERE storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY';

  IF v_agency_brands_count > 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAIL-CLOSED: % brand record(s) (including soft-deleted rows) still contain storage_profile = ''TEMP_AGENCY_BRAND_PERIOD_CATEGORY''. Any existing brand with this profile will violate the reverted check constraint. Update or clear brand storage_profile before rolling back.', v_agency_brands_count;
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

### 4.2. Đánh giá Tác động Khóa (Lock Impact) & Khả năng Rollback

1. **Lock Impact Analysis:**
   - Cả hai lệnh `ALTER TABLE public.brands ADD CONSTRAINT` và `ALTER TABLE public.operational_storage_routes ADD CONSTRAINT` yêu cầu khóa **`ACCESS EXCLUSIVE`** trên hai bảng này trong quá trình xác thực constraint.
   - Khi có khóa `ACCESS EXCLUSIVE`, mọi câu lệnh `SELECT`, `INSERT`, `UPDATE`, `DELETE` trên bảng đều bị chặn chờ.
   - **Biện pháp phòng ngừa:**
     - Thiết lập `SET LOCAL lock_timeout = '2s';` ngay đầu transaction. Nếu không thể lấy khóa trong vòng 2 giây (do có transaction khác đang giữ lock), lệnh sẽ lập tức báo lỗi và rollback, không xếp hàng dài làm treo connection pooler.
     - Dung lượng bảng `brands` (~12-50 dòng) và `operational_storage_routes` (~0-50 dòng) rất nhỏ, thời gian table scan chỉ mất < 5ms. Do đó, thời gian giữ lock thực tế < 10ms.

2. **Rollback Feasibility (Khả thi phục hồi):**
   - **Hành vi Table Scan của PostgreSQL:** Khi thêm lại constraint cũ (7 profiles), PostgreSQL bắt buộc phải quét **toàn bộ dữ liệu** của bảng.
   - Nếu tồn tại bất kỳ bản ghi nào có `storage_profile = 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY'` (dù là bản ghi `active = false` hoặc brand bị `deleted_at IS NOT NULL`), PostgreSQL sẽ báo lỗi `violates check constraint` và rollback toàn bộ.
   - Preflight của script rollback đã được thiết kế **fail-closed trên toàn bộ bảng** (không lọc theo `active = true` hay `deleted_at IS NULL`), buộc người vận hành phải dọn sạch hoặc chuyển đổi toàn bộ bản ghi trước khi thu hồi constraint.

3. **Migration Versioning:**
   - Forward migration: `scripts/storage/proposal-rc19-agency-storage-profile.sql` (Canonical Version: `20261028000000_rc19_agency_storage_profile.sql`).
   - Rollback migration: `scripts/storage/proposal-rc19-agency-storage-profile-rollback.sql` (Canonical Version: `20261028000000_rc19_agency_storage_profile_rollback.sql`).

---

## 5. KẾ HOẠCH BÀN GIAO & PHÊ DUYỆT (RELEASE GATE)

1. **Giai đoạn 1 (Hiện tại):**
   - Candidate seed đã được thu hẹp còn 13 internal routes; các test PG17 phải xác nhận 13/13 internal, 0 Agency, mapping root/base, approver, rollback và idempotency.
- Tất cả 13 physical mappings hiện vẫn cần remap sang Owner-approved private operational root trước activation; existing shared/archive folders không được đổi tên, di chuyển hoặc xóa.
   - Giữ nguyên trạng Production: Không chạy migration, không seed dữ liệu, không đổi biến môi trường Vercel.
2. **Giai đoạn 2 (Sau khi Owner duyệt Proposal):**
   - Chỉ sau khi Owner phê duyệt riêng migration Agency mới đánh giá các route Agency trong release riêng. Migration Agency không phải dependency cho seed 13 internal routes.
   - Seed 13 internal routes từ candidate đã review; không seed bất kỳ Agency route nào trong release này.
   - Chuyển biến môi trường Vercel `OPERATIONAL_STORAGE_ROUTING_MODE` từ `compat` sang `database`.
   - Tiến hành UAT luồng upload/xem file trên `https://ops5729.top/storage`.
