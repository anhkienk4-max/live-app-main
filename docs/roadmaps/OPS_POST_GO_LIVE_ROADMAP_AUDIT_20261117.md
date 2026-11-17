# Post-Go-Live Roadmap Audit Addendum — Review Only (2026-11-17)

> Status: PROPOSED; 112 task baseline remains unchanged. This is an audit of Notion W0–W10, not an implementation request.
> Baseline: [112 sequential tasks](OPS_POST_GO_LIVE_W0_W10_112_TASKS.md). [Notion](https://app.notion.com/p/41b5449511e68184a07ad66f248d8e81) | [RC19 #173](https://github.com/anhkienk4-max/live-app-main/issues/173) | [Draft PR #186](https://github.com/anhkienk4-max/live-app-main/pull/186).
> Exact unreleased local W4 code unavailable for full-code verification. Presence of a route/test does not prove FULL PASS.

## Executive result

Retain W0–W10 and PG-001..PG-112, but require dependency and operational corrections before declaring roadmap V1.1 final. All requirements below are review candidates (GAP-IDs), not new numbered PG tasks. Neither full-pass source nor production shall be changed by this audit.

## Gap register

| ID | Severity | Placement | Proposed correction | Existing task references |
|---|---|---|---|---|
| GAP-01 | P0 (pre-release) | R0/W0 | Minimum security, Postgres restore, real Drive ACL, monitoring and incident escalation must PASS before Go-live. W7 improves only. | PG-001/002/006, PG-076–079 |
| GAP-02 | P1 | W0 | FULL PASS freeze is not immutable: verified security incident, regulatory change, business-rule change or regression can reopen through controlled change review and independent QA. | PG-003/004/005 |
| GAP-03 | P1 | W1 before data sync | Google Sheets vs Ops DB: define authoritative source per Brand, tab, row/shift/segment ID; conflict/diff/rollback; default one-way import plus controlled export, not unapproved bidirectional writeback. | PG-007/008; PG-050–058 |
| GAP-04 | P1 | W1 before W3 | Room/Studio/Equipment/Platform channel registry and time-slot booking, resource conflicts, maintenance, emergency backup; physical room != platform store/account. | PG-008/010/031–033 |
| GAP-05 | P1 | W1–W3 | Full domain reconciliation Brand, Client, Platform Account, Product/SKU/variant, Campaign, Voucher, Scheme, Brand Asset/Claim and version; patch only missing catalog behaviors; check #166. | PG-009/031/039/050/060; #166 |
| GAP-06 | P1 | W5 before W6 | Revenue/order attribution: 1 session may have N staffing segments and overlapping Host/Trợ; no double counting GMV per person; distinguish observed, allocated and inferred metrics. | PG-027/028/056/060–067 |
| GAP-07 | P1 | R0/W0/W2 | Attendance photo privacy/retention, immutable server receipt, corrected effective times, legal/dispute hold, audited deletion/appeal. RC19 Attendance/Payroll mandatory gates remain pre-release. | PG-001/025/029/030/048/076/092 |
| GAP-08 | P1 | W0/W1 | Support and adoption: owners of incident/release/rollback, SOP for Host/Trợ/Leader, support queue, initial pilot feedback and no-API/no-Drive fallback. | PG-006/016/078/090 |
| GAP-09 | P1 | W5/W6 | Source grain, timezone, KPI formula version and snapshot period close; approved historical reports must not silently mutate when raw data/formula changes. | PG-042/052–058/060/061/071 |
| GAP-10 | P2 | W1/W5/W7 | Cost capacity: storage/photo growth, DB size, egress, backup, AI/OCR spend, queue/backpressure and measured performance budgets. | PG-017/051/078/079/081/093 |
| GAP-11 | P1 | W3 | Live Monitoring truthfulness: scheduled/started/live state separate; live KPI source, freshness, manual screenshot and provider-permission limitations displayed. | PG-031–035 |
| GAP-12 | P2 | W4–W6 | Exports need version, access scope, de-identification where required, review/final snapshot provenance; no unauthorized sharing. | PG-043/049/071 |
| GAP-13 | P1 | cross-wave | Task Definition of Done explicitly needs actual actor/UI/API/DB/provider/negative cases, retry, audit, approved performance threshold and exact SHA. Never route-200==FULL PASS. | PG-003–006 + all |
| GAP-14 | P2 optional | W8–W10 | Optional integrations gated on official API rights, privacy, license/cost, disconnect/rollback; separate AI Livestream Center stays outside core Ops app. | PG-083–112 |

## Dependency and duplicate review

1. Keep RC19 R0 before W0. PG-001 only verifies go-live; do not ship with SWAP, Payslip, RBAC, locked payroll, real Drive, restore, or critical import defects.
2. Bring minimum security/observability/restore/support to R0/W0; W7 is enhancement.
3. Resolve Google Sheets source authority before bidirectional sync; W5 Analytics ingestion is distinct from W1 schedule imports.
4. Room and channel resource registry plus Brand/SKU/Campaign/Scheme/Voucher domain must be audited before claiming complete W3 live operations or W5 matching.
5. Define session-to-staff attribution before host ranking and BI. Do not sum full session GMV once per Host/Trợ.
6. W3 report obligation PG-037 requires notification event contract PG-012/013, completed shift identity, and actual participant scope.
7. Manual/live screenshot KPI is not equivalent to real-time platform API data. Enforce provenance/freshness, offline and stale indications.
8. Metric snapshots, formula version and source lineage must be validated before W6 chart creation.
9. Overlap to audit SKIP/PATCH: PG-016/082 mobile, PG-017/081 performance, PG-015/075/089 dashboard, PG-047/097 Drive, PG-029/payroll RC19, PG-069/104 AI insight.
10. Freeze exceptions permitted only for approved verified defect/security/business/legal changes; baseline tests and diff reviewed.
11. Split W1–W7 by small coherent releases, preserve PG numbering; not every task must be new code.
12. Enterprise and AI APIs are optional and shall not hold V1; do not import unverified or unlicensed third-party code.

## Repo study shortlist (verified public GitHub repositories, not drop-in Live Ops replacements)

| Repo | Useful patterns | Constraints |
|---|---|---|
| [justindal/schedule-manager](https://github.com/justindal/schedule-manager) | Next.js+Supabase staffing, availability, multi-store | Small example, no verified license |
| [frappe/hrms](https://github.com/frappe/hrms) | Employee lifecycle, attendance, payroll, approval | GPL-3.0, study patterns before reuse |
| [kimai/kimai](https://github.com/kimai/kimai) | Time-tracking, check-in/out, rate, timesheets, invoice/export | AGPL-3.0, not a streaming app |
| [TimefoldAI/timefold-quickstarts](https://github.com/TimefoldAI/timefold-quickstarts) | Scheduling constraint model, skills, conflicts, fairness | Apache-2.0 quickstarts, Java solver not UI |
| [bluenviron/mediamtx](https://github.com/bluenviron/mediamtx) | Media routing/metrics/API/hook/stream playback | MIT; already relevant to current Ops, don't duplicate |
| [datarhei/restreamer](https://github.com/datarhei/restreamer) | Multistream admin UI, viewer/bandwidth monitoring | Apache-2.0; no staff or TTS/SHP metrics |
| [owncast/owncast](https://github.com/owncast/owncast) | Live chat, streaming dashboard and player | MIT; self-hosted stream provider not marketplace |
| [metabase/metabase](https://github.com/metabase/metabase) | BI, semantic models, dashboard permissions, export | AGPL open core and commercial separate; verify before embed |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | Automation patterns for legal provider connectors and retries | Sustainable Use License fair-code, not permissive OSS |
| [sophie-nguyenthuthuy/livestream-commerce-vn](https://github.com/sophie-nguyenthuthuy/livestream-commerce-vn) | VN live-commerce idea: per-minute metrics/AI scripts | Early-stage 0 stars/prelaunch, no production certification |
| [yuevthins/tiktok-live-analytics](https://github.com/yuevthins/tiktok-live-analytics) | TikTok live event/dashboard export UX patterns | Browser extension; verify platform ToS/privacy; no direct commercial API guarantee |

## Recommended release and wave gates

- **R0:** exact SHA, role + cross-Brand deny, real Drive readback, payroll lock/readback, PG17 restore, secure storage, P0=0, support/rollback owner.
- **W0:** freeze registry with conditional exceptions, feature-gap evidence matrix, ownership and data authorities.
- **W1:** clear Google Sheets ownership, safe import/export and diff, no unapproved bidirectional sync, notifications/realtime and mobile workflow evidence.
- **W2:** actor/reviewer evidence, actual seconds, replacement intervals, no double-paid overlap or automatic salary fines.
- **W3:** scheduled vs actually-live, room/resource conflict, KPI source/freshness and report obligation dedup.
- **W4:** immutable raw vs corrected OCR, report revision/approval, Drive folder/provider/ACL readback.
- **W5:** raw lineage, timezone/typed dates, dedup, authoritative session match, correction trace.
- **W6:** source-based metrics, attribution rules, versioned formulas and snapshot/export parity.
- **W7:** adversarial role tests, restore drill, observable cost and performance.
- **W8–W10:** owner-approved scope/permissions and opt-out, separate AI system.

## Decision boundary

This audit is kept separate from the adopted 112 tasks. After owner acceptance, map GAP items to existing PG task acceptance criteria or introduce new stable task IDs with a published migration table; do not silently renumber PG-001..PG-112.

**No code changes, migrations, actual payroll/data writes, merge, or production deployment.**
