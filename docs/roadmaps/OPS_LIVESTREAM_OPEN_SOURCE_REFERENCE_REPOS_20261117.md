# OPS Livestream — Verified GitHub reference repositories

> Research register updated 2026-11-17. **Read-only references; none is an approved application dependency.**
> Main plan: [V1.1 roadmap](OPS_POST_GO_LIVE_V1_1_122_TASKS.md) | [Audit](OPS_POST_GO_LIVE_ROADMAP_AUDIT_20261117.md).

## Adoption guardrails

1. Compare **UX/workflow patterns** first; never blindly merge repositories or replace FULL PASS code.
2. License is project-level information available at review, not legal authorization. Independently verify license files before source reuse, redistributing binaries, embedding, SaaS access, or forking.
3. For TikTok/Shopee, source code that captures stream events does **not** imply permission to access official commerce data or redistribute it.
4. Assess privacy, RBAC, integration failure modes, ongoing maintenance and cost before introducing new components.
5. All references are research candidates; they do not create more mandatory V1 work.

## Study catalog (11 repositories)

| Group | GitHub repository | Study focus | Mapping to Ops task | License note / risk |
|---|---|---|---|---|
| A — Nhân sự, lịch ca, chấm công và lương | [frappe/hrms](https://github.com/frappe/hrms) | Employee lifecycle; attendance; leave; payroll; approval chain | W2 PG-018/020/025/026/029; W8 PG-088 | GPL-3.0; Mature HRMS; reference designs, permissions and payroll lifecycle; do not paste GPL source into proprietary Ops without legal review. |
| A — Nhân sự, lịch ca, chấm công và lương | [kimai/kimai](https://github.com/kimai/kimai) | Timesheet, actual worked time, rates, audit, exports | W2 PG-027/029; W4 PG-043 | AGPL-3.0; Web timesheet system, not live staffing; look at human correction and reporting patterns. |
| A — Nhân sự, lịch ca, chấm công và lương | [TimefoldAI/timefold-quickstarts](https://github.com/TimefoldAI/timefold-quickstarts) | Shift scheduling constraints, availability, role coverage, fairness | W2 PG-021/024, W10 PG-105 | Apache-2.0; Quickstarts for planning engine, not production Host/Trợ UI; check commercial/runtime licensing separately. |
| A — Nhân sự, lịch ca, chấm công và lương | [justindal/schedule-manager](https://github.com/justindal/schedule-manager) | React/Next.js/Supabase shift/availability and multi-store UX | W1 PG-007/008/016, W2 PG-021 | Không xác minh; Small reference repo, not a full ADA production clone; review code and license before reuse. |
| B — Live Monitoring, Room, streaming media | [bluenviron/mediamtx](https://github.com/bluenviron/mediamtx) | RTMP/HLS/WebRTC media routing, recording, hooks, metrics | W3 PG-031/032/033, PG-119 | MIT; Ops already contains MediaMTX-related work: first audit existing component, avoid duplicate deployment. |
| B — Live Monitoring, Room, streaming media | [datarhei/restreamer](https://github.com/datarhei/restreamer) | Multistream management, REST, status, bandwidth/health dashboard | W3 PG-031/032/039; W7 PG-078 | Apache-2.0; Self-hosted stream system, not TikTok Shop/Shopee authorized KPI provider. |
| B — Live Monitoring, Room, streaming media | [owncast/owncast](https://github.com/owncast/owncast) | Live streaming UI, chat moderation, public viewer/player | W3 PG-032/033; W10 PG-109 | MIT; Streaming + chat reference, not attendance/payroll/marketplace commerce analytics. |
| C — BI và automation | [metabase/metabase](https://github.com/metabase/metabase) | Dashboard filters, semantic models/KPIs, drilldown, exports, embeds | W6 PG-060–071 | AGPL open-source + commercial editions; Useful after W5 passes; license/embedding model must be checked before adopting. |
| C — BI và automation | [n8n-io/n8n](https://github.com/n8n-io/n8n) | Connector orchestration, retry, triggers, notifications, audit-friendly workflow concepts | W1 PG-012/013; W9 PG-094–100 | Fair-code / Sustainable Use License; Not generic permissive OSS; avoid new infra until ROI, credentials and existing integration are reviewed. |
| D — Live commerce experimental references | [sophie-nguyenthuthuy/livestream-commerce-vn](https://github.com/sophie-nguyenthuthuy/livestream-commerce-vn) | VN social commerce idea; minute-bucket GMV/traffic dashboards and AI script | W5 PG-050–059; W6 PG-062–071; W10 PG-102 | README claims Apache-2.0; verify actual license file; Small/pre-launch repo with no independent API-rights assurance. Research idea/UI only; do not adopt as Production data collector. |
| D — Live commerce experimental references | [yuevthins/tiktok-live-analytics](https://github.com/yuevthins/tiktok-live-analytics) | TikTok event collection and dashboard UX; session history, export formats | W3 PG-119; W5 PG-050/051; W6 PG-064 | MIT; Browser extension. Potential platform ToS/privacy risk; not proof of authorized TikTok/Shopee official API access. |

## Recommended study order

1. **W1/W2:** Frappe HR, Kimai, Timefold; Next.js/Supabase small app for UI reference.
2. **W3:** MediaMTX current integration audit; optionally Restreamer and Owncast for UX patterns.
3. **W5/W6:** Metabase for KPI governance and BI, only after source and attribution rules pass.
4. **W9:** n8n as reference for retry/webhooks, not a reason to introduce another server.
5. **Experimental:** VN livestream commerce and TikTok live analytics for ideas only; explicitly reject assuming official API permission.

## Review template (when a task starts)

For each studied repo record: `PG-ID | repo | feature | verified date/commit | license checked | adopt pattern only/needs spike/not suitable | existing Ops counterpart | decision/evidence`.
