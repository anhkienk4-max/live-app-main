# RC1.6F — Immutable Preview isolation acceptance protocol

**C02 BLOCKED.** Không có candidate RC16 được owner chỉ định và kiểm chứng.
Checklist này không authorize deploy/env updates/key retrieval. Không tạo
diagnostics endpoint mới; không decrypt/copy/log tokens, khóa hoặc URLs có userinfo.

| Gate | Evidence phải lưu ở vùng bảo vệ | Fail / owner |
| --- | --- | --- |
|I01 Source|Approved Gemini branch/full SHA/PR;backend/Storage SHA;clean integration commit;exact-SHA CI PASS|Unknownsource=>STOP;release owner |
|I02 Deployment|GET immutable deployment ID/URL READY;project prj_YSrsxfYK7skM17D3KtiXUGeim2kr,team team_MBreE5MCbrZjyyBHnsaI5mc5;repo,branch,full SHA,Preview target;protected access qua login được duyệt|Không dùng alias/latest timestamp thay exact SHA;operator |
|I03 Effective public target|Browser bundle/network request origin mapped to approved amagnzebmmuqiptmrjmc;public config snapshot của chính build;mock vàswitcher disabled|Không chỉ env key/name hoặc currentproject env;operator |
|I04 Effective privileged target|Build/runtime server override-or-fallback snapshot validated by RC16Eguard;sanitized ref only;deployed code exactSHA;noProdURL/unknown customdomain|Không infer server target từ browser;operator |
|I05 Credential ownership|Owner verifies credential provenance/revision binding to Staging in provider control plane without revealing key. Secure operator-approved read-only probe from exact protected runtime must authenticate privileged credential against verified Staging origin and read only preapproved catalog/identity;sanitize boolean/status/ref only;public credential separately verified|JWT unsigned claim/URLmatch/success of anonymous public read không proofservice-role. Không có secure read-only probe/provenance=>BLOCKED;securityoperator |
|I06 Auth/RBAC|A/B independently authorized active Admin mapping/login;Leader/Member401/403 salary denial including cache/network;Member own performance only;no bypass of reviewer independence|Counts alone insufficient;owner |
|I07 Policies|Approved grace/minimumsamples/rate/OT/break/late values or explicit unavailable behavior;no invented default|HR/Finance |
|I08 Provider routing|Provider/account/tenant/test root and exact DB route key for approved synthetic brand/platform/source;prove noProductionroot/account/token routing;role access/read-only provider metadata proof before upload|Environment marker alone insufficient;Storageowner |
|I09 Migration/fixture authorization|Verified ledger/schema/RPC plan and separately approved apply;namespace/run/retention/account approvals recorded|No authorization=>no mutation;DBowner |

Credential probe phải được security/performance review trước khi triển khai,
không thêm network call mỗi request. RC16F không triển khai/chạy probe và không
đọc credential. Với opaque Supabase keys, provenance control-plane cùng successful
privileged-only read trên verified target mới là evidence alignment; key không
thuộc target phải fail, không silent fallback/mock. Probe không được trả config
hay dùng endpoint unauthenticated. Việc triển khai/chạy cần task riêng.

Sau I01–I09: pin immutable URL trong evidence, dùng authorized login giữ SSO,
chạy37 cases [checklist](RC16C_SYNTHETIC_UAT_CHECKLIST.md), ghi response/screenshot
đã redact, actoralias/versions/UUID/audit/CSVhash. Cloud writes chỉ sau approval
riêng. Không dùng protected URL bypass hoặc disable protection. Kết quả PASS
trên fixtures SQL local không đóng I02–I09/C02.
