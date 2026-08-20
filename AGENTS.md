<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:session-recovery-protocol -->
# SESSION RECOVERY / WRITE SAFETY

A resumed, compacted, or continued session carries stale context. Never treat a session summary TODO as proof that a task is current.

## Pre-flight Check — BEFORE ANY CODE/MIGRATION/DB WRITE

Before any write operation (code, migration, staging, commit, push, deployment, DB mutation), verify live repository state:

```bash
git status --short
git branch -vv
git log -5 --oneline --decorate
git rev-parse HEAD
git rev-parse origin/main
```

If target is a Supabase environment, also resolve explicitly as LOCAL / STAGING / PRODUCTION. Never infer target from old session context.

## Precedence Order (highest wins)

1. **Live Git / Remote repository state** — current HEAD, origin/main, staged index
2. **PROJECT_STATE.md** — verified checkpoint
3. **Long-term memory files** — `.agents/memory/`
4. **Resumed session summary / TODO** — stale by definition

A resumed-session TODO is NEVER sufficient evidence that a task is still current or unapplied.

## Before Remote-Affecting Operations — Explicit Verification

State explicitly:
- CURRENT TASK:
- CURRENT BRANCH:
- HEAD:
- ORIGIN/MAIN:
- TARGET ENVIRONMENT:
- EXPECTED CHANGE:
- FILES/DB OBJECTS AFFECTED:

If session context conflicts with live Git or PROJECT_STATE.md: STOP. Report `STALE SESSION CONTEXT`. Do not continue the old TODO automatically.

## Git Safety (non-negotiable)

- **Never** `git add .` or `git add -A`
- **Never** `git reset`, `git clean`, `git restore .` on unrelated files
- **Never** force push (`git push --force`)
- Use selective file/hunk staging only
- Verify state after every remote-affecting operation

## DB Safety (non-negotiable)

- **Never** run migrations on an unverified target environment
- Resolve target (LOCAL/STAGING/PRODUCTION) explicitly before any `supabase db push`, `db apply`, or raw SQL
- Never expose `service_role` in `NEXT_PUBLIC_*` variables
- No silent Supabase → mock fallback in production

## Resume Protocol

After `/continue`, resume, or auto-compaction:
1. Read `AGENTS.md`, `PROJECT_STATE.md`
2. Run `git status`, `git rev-parse HEAD`, `git rev-parse origin/main`
3. Compare live state against session summary
4. Report conflicts before proceeding with any prior TODO
<!-- END:session-recovery-protocol -->
