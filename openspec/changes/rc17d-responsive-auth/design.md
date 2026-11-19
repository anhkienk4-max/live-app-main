## Context

Baseline is main 7f5efbfec23db84ad1d74024b08a591523aa4217. CalendarView still wraps MonthView in min-width 760px. Existing ListView, ShiftCard, staffing resolver and registration actions own workflow semantics. role-ux includes group data but all shell surfaces render flat lists. AuthLayout uses a black half-screen; Google handler is mock-only. The existing Before User Created hook blocks new Google identities and dashboard validates active business identity.

## Goals / Non-Goals

Goals: fulfill the behavior specs using existing services, identity boundaries and UI primitives. Avoid a second staffing or permission model. No schema, provider settings, business role policy or Production changes.

## Decisions

- Reuse Base UI Dialog as the sheet surface for navigation and filters, preserving its focus/Escape behavior. Keep a shared history-aware open state for Back dismissal.
- Mobile month uses a compact native date selector without shift cards inside cells; selected day reuses DayView with full cards and existing registration actions. Desktop MonthView is unchanged. URL date remains the selected date.
- Put canonical group metadata in navCatalogue; retain role selection order, permission and workforce filtering. Share grouping and primary-slot selection functions.
- Query public Auth settings to decide Google availability; initialize OAuth via the existing browser client (PKCE). Callback uses existing verified-user and business mapping checks and a hardened local redirect helper. No creation/upsert/role grant.
- Add isolated local browser coverage for all routes/roles/widths and explicit authenticated UAT blockers when a connected session is unavailable. Local fixture captures are never Production proof.

## Risks / Trade-offs

- Production browser integration has no available browser -> retain NOT_VERIFIED authenticated UAT and NO-GO.
- Connected Vercel team lists no projects -> served-SHA and deployment checks require authoritative access, never infer them from main.
- OAuth provider settings do not prove Google Console credentials/redirect allowlist -> record the exact checked fields and remaining blockers.

## Migration Plan

Deliver a branch PR with CI and evidence. Production merge/deploy/provider changes remain outside this execution. Revert the application PR if approved release causes regressions; no database rollback is required.
