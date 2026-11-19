# RC19 C4 UX hotfix handoff

Base candidate: `240a0d51b49863167be252d94545ea7c5ab2ac9a`.
Branch: `codex/rc19-c4-ux-hotfix`; source changes remain uncommitted and local. The frozen C4 candidate and Production deployment were not modified.

## Local changes

- Route-owned `data-route-readiness` markers replace the global fetch monkeypatch and timer-based completion in the navigation transition. Pending, terminal error, ready, and timeout states are explicit and keyboard accessible.
- Dashboard, Calendar, Registration, Reports, Workforce, and attendance review surfaces report readiness from their data states.
- Brand lists and linked dashboard items use persisted `brand_id` / `logo_url` through a shared `BrandLogo`, with initials fallback on failed/missing URLs.
- Hotfix tests now assert route readiness and logo fallback behavior instead of the obsolete three-second timer behavior.

## Verification on this local worktree

- Focused test `tests/rc19-production-qa-hotfix.test.ts`: 7/7 PASS.
- `corepack pnpm type-check`: PASS.
- ESLint on touched files: PASS.
- Credential-free `CI=true` production build: PASS; 49/49 static pages generated. Next.js emitted a workspace-root inference warning because multiple `pnpm-workspace.yaml` files exist.
- `git diff --check`: PASS.

These are local source checks, not deployed or authenticated browser proof. Screenshot/browser checks at 390/768/1440 widths and route-specific loading behavior remain NOT RUN. In particular, query-only route changes and a blocked external `logo_url` need visual confirmation in the Owner's Edge session.

## ADA master asset

No approved ADA Global vector asset was available in the repository or retrievable from the official [ADA Brand Journey page](https://adaglobal.com/the-data-and-ai-experience-company/); its brand-asset link is gated behind Microsoft sign-in. No custom replacement mark was introduced. Final ADA identity still requires the Owner-provided or approved master vector asset.