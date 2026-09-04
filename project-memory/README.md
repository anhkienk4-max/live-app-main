# Project Memory V1

This directory is the shared project-memory foundation for Gemini, Codex Antigravity, Codex VS Code, Codex CLI, and OpenCode.

The JSON records in this directory are canonical. `generated/` and `PROJECT_STATE.md` are human-readable projections. Chat history, session summaries, and local agent runtime files are not authoritative.

Business decisions, defects, permissions, and contracts are hand-authored. Automation may update only objectively derivable repository facts: Git `HEAD`, branch, test-file inventory, migration inventory, and route/source-file inventory.

## Records

- `current-state.json` records repository identity and derived inventories.
- `modules.json` records module maturity without treating implementation as completion.
- `business-rules.json` records explicit business invariants.
- `flows.json` records known operational flow boundaries.
- `ui-contracts.json` records route and surface contracts.
- `data-contracts.json` records domain entities and persistence contracts.
- `permissions.json` records the application permission matrix and authority boundary.
- `defects.json` records known defects and their explicitly supplied status.
- `release-gates.json` records verification gates and evidence requirements.
- `decisions/` stores durable architecture decisions.
- `evidence/` stores verification references, not secrets.
- `generated/` contains generated Markdown projections.

## Commands

```text
npm run memory:validate
npm run memory:sync
npm run memory:report
```

Run `memory:sync` after a task when objective repository facts have changed. It must not invent or alter business rules, defect status, permissions, or release decisions.

## Maturity

Use `IMPLEMENTED`, `UNIT_VERIFIED`, `INTEGRATION_VERIFIED`, `E2E_VERIFIED`, `UAT_VERIFIED`, and `RELEASED`. `IMPLEMENTED` is not `DONE`; a module must not be marked released without explicit evidence for the release gate.
