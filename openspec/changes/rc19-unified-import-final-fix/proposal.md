## Why

RC19 schedule imports can classify Agency rows incorrectly, discard explicit source conflicts, and lose unmapped source columns after the batch is confirmed. Imported operational fields must survive Shift persistence, detail editing, reload, and export.

## What Changes

- Map ADA to Internal and SNAP/Live AI to External while retaining explicit source conflicts as blocking validation errors.
- Let an Admin classify source columns as source-only, typed supplemental Shift data, or supported operational fields.
- Persist supplemental values on the Shift through an additive migration and existing authorized RPCs; display and edit them through the authenticated Shift detail flow and include authorized values in exports.
- Validate typed fields and reject incompatible legacy Agency/source rows for review without backfilling or applying a Production migration.

## Out of Scope

Production deployment, Production SQL, Drive I/O, Import lifecycle changes, and changes to segmented staffing or Payroll behavior.
