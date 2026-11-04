## 1. Data model and security

- [x] 1.1 Add additive metadata, scope-link, explicit-grant, and audit tables with RLS and attendance constraints.
- [x] 1.2 Add PostgreSQL 17 coverage for visibility, grants, duplicate URLs/IDs, attendance scope, audit, and route non-interference.

## 2. Admin workspace and API

- [x] 2.1 Add Admin-only write APIs and RLS-backed scoped resource reads.
- [x] 2.2 Add the Storage Resources workspace with filtering, duplicate feedback, verification state, and safe CRUD.
- [x] 2.3 Verify canonical URLs through fixed provider APIs by ID only; do not mutate provider objects.

## 3. Verification and handover

- [ ] 3.1 Run focused, PostgreSQL 17, regression, Playwright mock, TypeScript, ESLint, and guarded build checks.
- [ ] 3.2 Prepare stacked Draft PR and record exact commit/CI evidence; keep Production hold.
