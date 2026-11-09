# RC19 C5.11 persisted staffing workflow

## Summary

Persist imported staffing segments and allow authenticated members to register for a specific segment while retaining the existing parent-shift registration, attendance, actual-review, and payroll contracts.

## Motivation

The schedule parser already recognizes multiline time/staffing cells, but the import path persists only a parent shift. Registrations are parent-shift scoped, so sequential staffing segments cannot be authorized or capacity checked independently. Attendance events and payroll actuals are intentionally separate; a reviewer must convert verified work times into an actual segment before payroll can use them.

## Scope

- Add a forward-only migration for planned segments and segment registration.
- Persist parsed segment definitions atomically with shift import.
- Enforce segment capacity in PostgreSQL and retain existing shift-level behavior for rows without a segment.
- Prove the existing Attendance → reviewed actual minutes → Payroll flow on local Auth/PostgREST/PostgreSQL 17 with synthetic accounts.

## Non-goals

- Production or hosted database changes, Drive I/O, automatic attendance approval, or automatic payroll approval.
- Replacing the existing actual-segment or payroll models.
