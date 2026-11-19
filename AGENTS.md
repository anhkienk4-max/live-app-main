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

## Owner Rule — Recover Without Repeating Blockers (2026-11-19)

This supplements, but NEVER bypasses, the mandatory stale-session STOP and write-safety checks.

1. **STOP the stale plan, not all progress forever.** When live Git differs from a resumed checkpoint, report `STALE SESSION CONTEXT`, discard the stale assumptions, reread the current Owner task and authoritative files, and establish a new explicit preflight. Once that is verified, resume permitted, independent work without waiting for the obsolete SHA to reappear. Never silently execute the old TODO.
2. **Live Git wins over generated metadata.** `project-memory/current-state.json`, `PROJECT_STATE.md`, and session notes may contain an older branch/HEAD due to projection or commit timing. Report the mismatch. Do not overwrite canonical business rules or manually fake the recorded HEAD to clear the warning. Update derived memory using the documented validation/sync workflow at a verified, conflict-free checkpoint. Stale metadata alone must not prevent read-only investigation.
3. **Dirty worktree is a scope boundary, not an automatic global deadlock.** Inventory changed/untracked paths, inspect their diffs and recent commits, identify file ownership, and preserve every WIP byte. Do not touch an unowned/conflicting file, stage it, stash it, reset it, or silently commit it. Continue read-only work and tasks demonstrably independent of those paths; block only overlapping writes or unsafe executions until ownership is resolved.
4. **No empty-database migration proof.** A CLI dry-run or empty/disposable PG database does NOT prove Production migration readiness. The rehearsal must use a verified Production-compatible baseline (schema, dependencies, roles/ACL/default ACL, triggers/event triggers, RLS and existing ledger), record actual execution/rollback/retry evidence, and label missing proof accurately. Fix specific export/connectivity errors (for example, check IPv4/direct versus pooler routing) rather than repeatedly retrying an already-failed method or declaring an empty baseline sufficient.
5. **Do the repair, then verify it.** For each blocker, identify a root cause, the smallest permitted corrective action, an accountable existing agent, and objective acceptance evidence. Do not invent new audit lanes, worktrees, projects, Preview or Staging deployments, or repeat already-passing tests just to produce another `BLOCKED` report. Distinguish missing access/Owner authorization from a code defect; never fabricate PASS.
6. **Owner Production-only deployment policy remains in force.** The deployment target is the existing Production app and database. Offline tests and isolated local PostgreSQL rehearsal are allowed, but are not Production UAT and must not be promoted or deployed as extra environments. No Production SQL writes, migration, ACL changes, merge, or deployment without the existing release gates and specific authorization.
7. **Existing ownership:** Codex owns independent migration-parity/proof work; Gemini/Antigravity owns the current Attendance ACL, Drive G11, backup/recovery and migration-runner source patch. Coordinate before changing any shared file. New remote commits change the candidate SHA; recheck live HEAD/CI and do not treat old-SHA evidence as proof of new code.

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

## Project Memory V1 Protocol

Project memory is shared by Gemini, Codex Antigravity, Codex VS Code, Codex CLI, and OpenCode.
Machine-readable records under `project-memory/` are canonical. Session context, chat history,
and generated Markdown are projections or navigation aids and are never the source of truth.

### Before Task

- Verify live Git state: status, branch, recent log, `HEAD`, and `origin/main`.
- Read the relevant records under `project-memory/` before making decisions.
- Resolve conflicts in favor of live Git, then canonical project-memory JSON, then generated views.

### After Task

- Run the relevant tests and record objective evidence.
- Run `npm run memory:validate` and inspect the generated projection.
- Run `npm run memory:sync` when objective repository facts changed.
- Update canonical memory records only for verified facts or explicitly decided business rules.
- Validate that no business decision was invented or changed by automation.
