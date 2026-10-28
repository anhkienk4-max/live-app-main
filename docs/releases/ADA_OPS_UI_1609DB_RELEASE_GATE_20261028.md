# ADA OPS UI candidate based on latest live code

As of 2026-10-28 23:30 ICT, `ops5729.top` serves Vercel CLI deployment `dpl_12GW7ZnV1gw2KmQpXmJtHFBAbKbA`, created 2026-10-28 15:58 UTC. Its navigation, header, sidebar and app shell content hashes match Git commit `1609db684de290e2a49f4c790f8ecdf3d1e9e461`.

Previous draft PR #136 was based on the older RC19 commit `1b96f38a`. Promoting it would roll back six newer commits (22 files) including role-filtered navigation, swaps, staffing and attendance fixes. **Do not merge/promote PR #136 as-is.**

This candidate forks `1609db684de290e2a49f4c790f8ecdf3d1e9e461` and cherry-picks only reviewed PWA presentation components, keeping the latest filtered role navigation in BottomNav/Header/Sidebar. Migrations, RLS, server services, auth sessions, and all other production source are untouched.

The Vercel source manifest records 678 source file hashes from a **truncated** API tree. The CI verifier compares them against immutable Git baseline; it cannot claim full provenance of omitted files. Unknown or mismatched tracked source is a NO-GO.

## Remaining release gate
1. CI provenance + UI boundary, TypeScript, ESLint, Next.js build, mock Login and mobile/desktop screens PASS.
2. Create isolated Preview with explicitly Staging-only Supabase variables for this branch. Never use fallback Production credentials.
3. Authenticate with three dedicated Staging accounts (Admin/Leader/Member) to validate navigation/RLS-sensitive views. Read-only first; no payroll mutation.
4. Prepare production-equivalent staging build without mapping `ops5729.top`, verify essential workflow parity and rollback.
5. Recheck live Production deployment ID immediately before any promote. If it moved, the candidate must be re-based and retested again.
6. Promote the exact tested Production build only after release approval. Keep GitHub `main` unchanged until the canonical source alignment is established.

Status: DRAFT / NOT GO-LIVE.
