# GL-03 Validation Evidence

Base: `origin/main` at `73b1999ea07cbc227d1bd4052088cc6c6f4cc8e5`

Branch: `chore/project-memory-v1`

Worktree: `C:\Users\KienNguyen\Downloads\T5 ADA\code\live-app-project-memory`

- `npm run memory:sync`: PASS; derived 31 routes, 96 test files, and 41 migrations.
- `npm run memory:validate`: PASS; all 9 canonical JSON records and generated projections are consistent.
- `npm run memory:report`: PASS; 13 modules, 4 defects, and 7 canonical business rules reported.
- `npm run type-check`: PASS.
- `eslint` on new memory scripts: PASS.
- `npm run lint`: FAIL_BASELINE; 150 errors and 123 warnings exist across the base application/test tree. The only new tooling lint finding was corrected; no runtime source was changed to mask baseline findings.
- `npm run build`: PASS; Next.js compiled and generated 26 static pages.
- `git diff --check`: PASS.
