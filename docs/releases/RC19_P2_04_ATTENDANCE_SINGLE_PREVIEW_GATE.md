# RC19 P2-04 | Member check-in / reviewer evidence | release gate

**Scope:** Ops source branch `integration/rc19-one-preview-release-20261023`, not yet Production-approved.

## What is already implemented
- PostgreSQL immutable event journal `public.self_attendance_events` and authenticated-only RPCs `self_attendance_record`, `get_my_self_attendance`.
- Canonical staging migration `20261022185140_rc19_p2_04_member_attendance_event_journal.sql` (migration ledger version `20261022185140`).
- Self-attendance panel in Shift Detail, visible only with `NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE=true` AND a staffed registration for the current actor.
- Existing Workforce GET for Admin/Leader may read this **independent, unapproved** journal only with server-side flag `FEATURE_SELF_ATTENDANCE_REVIEW=true`. This flag defaults **OFF** to keep existing Production GET functioning before the new database migration.
- Attendance review evidence in `PayrollAttendanceLink` shown only if response `attendance_review_enabled===true`; false does not imply zero employee check-ins.

## Unchangeable separation
`check_in/check_out` → **pending verification raw events**; not a direct `workforce_actual_segments` write, not an approved Actual Segment, not an auto deduction, not a Payroll line. Approved Actual Segments and reviewed rate cards remain Payroll sources of truth. The manager must separately verify evidence and record/review an actual segment using existing authenticated Admin/Leader workflow; the same user must not approve their own segment.

## Staging QA already completed
- Member-assigned user: check-out-before-check-in DENIED; check-in created; identical request UUID idempotently replayed; new UUID duplicate rejected; check-out created.
- Mutation of journal row denied by trigger; different actor cannot replay another actor's request or view another actor's raw history.
- All test writes to shifts/events **inside a transaction rolled back**; independently verified journal count 0 afterward.
- Database RLS on, anon/authenticated direct-table SELECT off; RPC EXECUTE only authenticated.
- Security Advisor intentionally reports RLS-without-policy and externally callable SEC-DEF RPC. Mandatory manual security sign-off required; do not waive solely because the staging SQL tests passed.

## Combined Preview UAT, before Production migration/release
1. Obtain a single approved combined Preview of the final candidate SHA. No per-module Preview. Confirm staging project/URL, secret boundaries, flags and source SHA.
2. Turn on `NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE=true`, `FEATURE_SELF_ATTENDANCE_REVIEW=true`, and existing `FEATURE_ACTUAL_STAFFING=true` **only in the staging-backed combined Preview**. Never send `service_role`/server secrets to `NEXT_PUBLIC_*`.
3. Browser UAT with authenticated Member Host, Member Support/Tech, Leader and Admin: ownership checks, SSO/session identity changes, hard reload/replay, invalid/locked/overnight shift, assignments surrendered via swap, duplicate submissions and errors.
4. Leader view: confirm raw app timestamp differs from operations-group check-in evidence and reviewed Actual Segment. Validate missing evidence states; false flag must hide entire raw panel, never display a fabricated `0 check-ins` claim.
5. Exercise manual reconciliation: separate reviewer, expected-version on Actual Segment, proper audit and no automatic Payroll line/penalty; verify locked Payroll cannot be silently recalculated.
6. Before Production: verify real R0 Member Identity #71, approval scope and screenshot regressions; run migrations in audited order, verify grants and role-bound RPCs; gate release on full CI and authenticated UAT sign-off.

## Rollback
- Disable `FEATURE_SELF_ATTENDANCE_REVIEW` to immediately stop extra Workforce journal queries; keep existing Workforce API behavior.
- Disable `NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE` and rebuild/redeploy only through authorized Production release control to hide Member attendance UI.
- Never remove/modify immutable events as a rollback. Do not delete audit trails or reverse Payroll adjustments without separate reviewed procedure.
- Capture release SHA, domain alias, Vercel deployment ID, schema version and incident note.


## RC19 P2-04B | Mandatory Google Drive photo at check-in (source prepared; NOT Preview UAT approved)

**Owner sequencing (2026-10-23): complete all RC19 source corrections first, then perform QC on the one already approved consolidated Preview. No new Preview build or Production promotion during repairs.**

### Existing Drive structure, read only verified
- Connected Drive discovery found the operator's `CHECK IN/OUT` parent with existing `HOST` and `TRỢ` subfolders and `THÁNG 10 - 2026` beneath each. This is a **metadata observation from the operator's Drive session**; it does NOT prove that the Next.js Vercel provider service identity can write to it.
- `lib/utils/attendancePhotoNaming.ts` preserves those folder labels: `CHECK IN/OUT/{HOST|TRỢ|KỸ THUẬT}/THÁNG M - YYYY/`. The `KỸ THUẬT` folder would be created only after provider authorization; do not create it from connected personal Drive as a surrogate for the app.
- Filename includes `YYYYMMDD_BRAND_PLATFORM_PHONG_ROOM_HHMM-HHMM_ROLE_STAFF_CA_SHIFT_CHECKIN_UTCSTAMP_UUID8.ext`. Shift ID, live room (`studio`), staff, platform, brand, date and planned live window are taken from **server-side authenticated DB preflight**, never client-supplied form names. The rulebook requires check-in/outfit evidence but does not provide an unambiguous *filename* specification. Treat this format as the proposed canonical convention until operator confirms any separate room instruction.
- Root is configured only through `GOOGLE_DRIVE_ATTENDANCE_FOLDER_ID` (private server env), which must refer to the operator-approved `CHECK IN/OUT` folder. Provider credentials and write permissions MUST be validated with the runtime service identity before the flag can be enabled. No path in source hardcodes a user's personal Drive ID.

### Security and data flow
1. Member's assigned shift details show date, start/end time (including overnight ranges), brand, platform, studio/live room and title. Check-in UI requires an actual image selection with camera capture option; content is limited to verified JPEG/PNG/WebP, 4 MB max. The server rejects cross-origin POST, unauthenticated identities, role/shift mismatch, invalid file magic, unsupported types, and excessive repeated attempts.
2. With `FEATURE_SELF_ATTENDANCE_PHOTO=true` and correctly configured private Drive provider, `POST /api/workforce/self-attendance-photo` calls the authenticated `get_self_attendance_photo_context` preflight. This RPC repeats shift eligibility, assignment and approved-swap surrender guards. Provider uploads only to the exact attendance root's role/month subfolders, with a contextual sanitized file name; no raw image bytes are ever sent to Supabase.
3. The server then inserts only SHA-256, provider ID/parent, file metadata and an immutable shift-context snapshot into `self_attendance_photo_evidence`, using a **server-only admin client**. Direct authenticated/anon table reads/writes are revoked and RLS enabled. A new SQL trigger on immutable `self_attendance_events` prevents any fresh `check_in` from being recorded without evidence whose request UUID, staff, shift and role match. Check-out still uses the existing timestamped RPC. Both remain `pending_verification`.
4. The same request ID is preserved in the browser for retries. Existing evidence is SHA-256 and exact-parent verified against the Drive object before retrying the original scoped RPC, avoiding duplicate uploads on network retry. If upload succeeds but the RPC rejects a changed assignment/window, the private metadata and provider object are held for an operator-reviewed recovery; they are **not** silently counted as a completed check-in. No auto Payroll line/penalty.
5. The image is viewed only through `GET /api/workforce/self-attendance-photo?event_id=...` with owner or Shift-RLS-scoped Admin/Leader access. The app never emits the raw provider file ID or a public `drive.google.com` image URL to Member. Immutable journal history exposes only `photo_available` boolean. The private viewer validates actual byte count, file magic and SHA-256 on each read, sending `Cache-Control: no-store`.

### Staging migration and gates
- Canonical source `supabase/migrations/20261023144000_rc19_p2_04b_drive_photo_checkin.sql`. Applied **Staging only** under managed ledger alias `rc19_p2_04b_staging_drive_photo_checkin_from_20261023144000`. No `db push`, no Production SQL.
- Immediately after migration: photo table exists with RLS ON, direct authenticated SELECT/INSERT denied, evidence metadata count 0, raw event count 0, **1 check-in proof trigger + 1 immutability trigger enabled**, anon preflight EXECUTE denied, authenticated preflight EXECUTE allowed.
- **NOT YET FEATURE-QC PASS:** `FEATURE_SELF_ATTENDANCE_PHOTO` remains unset/OFF; runtime app Drive OAuth/service principal/Shared Drive ACL is unverified. Old RC19 Preview remains pinned to `ae0fe7d0`, without these source changes. Do not enable the flag on that old bundle or claim photo uploads are live.
- Before final single-preview QC: finish remaining RC19 #71–#79/#84 source issues, confirm app identity can write to approved attendance Drive folder without widening parent ACL, review staff image consent/retention, verify hidden files and privacy boundaries, test actual Host/Support/Technical photo check-in/out, double requests, outages, reassignments, overnight sessions, image integrity, Manager review and zero automated Payroll effects. Ensure all CI gates for the **final source SHA** pass before any further deployment decision. No silently created second Preview.


### Recovery and production-safe verification follow-up

- After-reload check-in recovery added to source: `recoverSelfAttendancePhotoCheckIn()`, the camera-panel action **Khôi phục check-in đã gửi ảnh**, and server `recover_only=true`. Server accepts *no image bytes* on the recovery path, looks up an existing immutable proof belonging to **current authenticated business user + shift + role**, checks any conflicting request UUID, verifies exact Drive parent/name/byte length, content MIME magic and SHA-256, then uses the **original committed request UUID** for the existing scoped `self_attendance_record` RPC. If no prior proof exists: `ATTENDANCE_PHOTO_RECOVERY_UNAVAILABLE` (404). No borrowed provider file IDs or client-supplied staff IDs.
- This protects interrupted check-ins without silently uploading a second image; it does **not** waive the assignment/time-window guards on the actual check-in RPC. If the operator changed a shift after a successful upload, the proof stays pending for reviewed reconciliation, not automatically counted as completed work.
- Staging **transaction-only proof-gate smoke**: raw check-in without a matching photo **DENIED**; matching request UUID/worker/shift/role proof enables raw event insert; proof UPDATE **DENIED** by immutable trigger; duplicate proof for same staff/shift/role **DENIED** by unique constraint. The complete test used `BEGIN ... ROLLBACK`; no mock photo metadata, raw attendance events or provider object persisted.
- Source-level regression added to existing `tests/rc19-self-attendance-contract.test.ts` for recover-only payload, actor-scoped proof lookup, original request UUID, Drive integrity, and UX action. The canonical manifest was not expanded.
- Runtime healthCheck now requires **root_readable=true AND root_can_add_children=true**; `false` and unknown/`null` write capabilities both fail closed before folder creation or image upload. This does not infer write access from merely discovering the folder in the connected user's Drive account.
- Vercel environment inventory shows **no RC19 Preview-scoped Drive service identity**; an unrelated legacy branch has a separate OAuth refresh-token setting, **not** authorization to copy credentials or write this private attendance folder. The new photo flags stay `false` until the runtime provider identity and folder ACL are explicitly validated. Folder configuration alone does not establish upload availability.
- As requested by the owner, **finish all RC19 code fixes before QC**. The existing single Preview is still pinned to prior SHA `ae0fe7d0` and **does not include these attendance-photo changes**. Source/CI advancement must not silently create a second Preview or promote Production.



### Google Drive root provenance: My Drive, not Shared Drive

Read-only Google Drive metadata inspection of the operator-approved existing `CHECK IN/OUT` folder (`GOOGLE_DRIVE_ATTENDANCE_FOLDER_ID`), **using the owner's connected Google Drive**, returned `mimeType=application/vnd.google-apps.folder` and **no Shared Drive `driveId`**. Consequently this existing parent belongs to a regular **My Drive** folder tree. This observation says nothing about the app's independent Vercel runtime identity.

Current source `createGoogleDriveFileProvider.healthCheck()` deliberately fails if `authMode==='service_account' && !file.driveId`. Therefore **service-account mode is incompatible with the approved, unmoved parent folder under current provider design**; trying to grant a service account access to a personal folder cannot bypass this source safeguard. Keep existing root and all subfolders intact. An authorized, least-privileged *OAuth* identity with access to that existing root is the recommended deployment route, and requires explicit approved credential connection/configuration, refresh-token management and revoked-token failure tests. **Do not reuse existing credentials from an unrelated legacy Preview branch without explicit authorization**.

An Admin-only, no-write runtime provider preflight was added:
`GET /api/workforce/self-attendance-photo/preflight`, callable via a button in `Payroll → Chấm công`. It checks active Admin business role, rate limits, calls provider `healthCheck()`, and returns only readiness booleans and enabled state. It cannot upload files, create folders or expose the raw Drive ID or keys. This enables verifying actual runtime OAuth/ACL without altering private folders or writing employee photos. While credentials are unconfigured, the feature flags remain OFF and preflight reports not ready; do not claim a successful live upload.

**Owner gate:** Existing My Drive folder remains preserved. No migration/rename/move/deletion of that folder, no Preview redeploy and no Production write in this change.
