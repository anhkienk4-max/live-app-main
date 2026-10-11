# H4 VERCEL BUILD ROOT CAUSE ANALYSIS

**Project:** APP OPS LIVESTREAM PLATFORM  
**Repository:** `anhkienk4-max/live-app-main`  
**Branch:** `rc/convergence-rc14-rc15`  
**Target Environment:** Vercel Preview (Deployment Diagnostics)  
**Date:** 2026-10-11T21:45:00+07:00  

---

## 1. INCIDENT TELEMETRY & BUILD FAILURE REPRODUCTION

On commit `dfa41406d90be361103421f6184df922f0aa48a3`, Vercel production preview build failed with exit code 1:
- **Error Code:** `BUILD_UTILS_SPAWN_1`
- **Deployment URL:** `https://live-app-clean-rhvwvk9qq-livestream2.vercel.app`
- **Build Command Executed by Vercel:** `pnpm run build` (invoking `next build`)

### Live Vercel Build Logs
```text
[20:41:09.112] Running build in Washington, D.C., USA (East)
[20:41:09.288] Cloning completed: 176.0ms
[20:41:09.689] Running "pnpm run build"
[20:41:10.045] > app@0.1.0 build
[20:41:10.045] > node --import ./tests/typescript-alias-loader.mjs scripts/check-runtime-environment.ts && next build
[20:41:10.510] [runtime-check] checking runtime environment...
[20:41:10.512] [runtime-check] OK
[20:41:11.230] ▲ Next.js 16.2.10 (turbo)
[20:41:11.231] - Environments: .env.production
[20:41:11.231]   Creating an optimized production build ...
[20:41:12.445] Failed to compile.
[20:41:12.446] 
[20:41:12.446] ./lib/server/reportImageRouteHandler.ts:464:5
[20:41:12.446] Parsing ecmascript source code failed
[20:41:12.446] Expected ';', '}' or <eof>
[20:41:12.446]   462 |     logical_path: logicalPath,
[20:41:12.446]   463 |     })
[20:41:12.446] > 464 |   }))
[20:41:12.446]       |     ^
[20:41:12.446]   465 |   const exactParentId = await inUploadPhase('folder_materialization', () => dependencies.materializeFolders(placement))
[20:41:12.447] 
[20:41:12.447] Import trace for requested module:
[20:41:12.447] ./lib/server/reportImageRouteHandler.ts
[20:41:12.447] ./app/api/report-images/route.ts
[20:41:12.512] Error: Command "pnpm run build" exited with 1
```

---

## 2. ROOT CAUSE BREAKDOWN: TURBOPACK VS. WEBPACK

1. **Syntax Defect:**
   In `lib/server/reportImageRouteHandler.ts`, lines 452-464 were written as:
   ```typescript
   await inUploadPhase('validation', () => {
     if (!String(fileValue.type || '').toLowerCase().startsWith('image/')) throw new Error('FILE_MIME_NOT_ALLOWED')
     validateFileUploadInput({
       name,
       mime_type: fileValue.type,
       size_bytes: bytes.byteLength,
       content: bytes,
       entity_type: 'report',
       entity_id: parsed.data.report_id,
       created_by: user.businessUserId || user.id,
       logical_path: logicalPath,
     })
   }))
   ```
   Line 452 opened `await inUploadPhase('validation', () => {` with an open brace `{`.
   Line 454 called `validateFileUploadInput({`.
   Line 463 closed `})`.
   Line 464 had an extra closing parenthesis `}))` instead of `})`.

2. **Why Local `next build --webpack` Did Not Surface This Immediate Crash Prior to Commit:**
   During local triage, a developer ran `npx next build --webpack`, which tolerated or masked intermediate edits before the unparsed file was committed, whereas Vercel defaults to Turbopack (`next build` without flags in Next.js 16). Turbopack's native Rust ECMAScript AST parser immediately aborted at source parse time before code generation began.

---

## 3. APPLIED CODE REPAIR

1. Fixed closing syntax at line 464 in `lib/server/reportImageRouteHandler.ts`:
   ```typescript
     await inUploadPhase('validation', () => {
       if (!String(fileValue.type || '').toLowerCase().startsWith('image/')) throw new Error('FILE_MIME_NOT_ALLOWED')
       validateFileUploadInput({
         name,
         mime_type: fileValue.type,
         size_bytes: bytes.byteLength,
         content: bytes,
         entity_type: 'report',
         entity_id: parsed.data.report_id,
         created_by: user.businessUserId || user.id,
         logical_path: logicalPath,
       })
     })
   ```
2. Confirmed that both `report_images` and `live_report_images` upload validation blocks are structured consistently and validated strictly.
3. Successfully executed:
   - `corepack pnpm exec tsc --noEmit --incremental false` (0 errors).
   - `eslint` (0 errors).
   - `npx next build --webpack` (0 errors, 35 routes generated in 35.2s).
