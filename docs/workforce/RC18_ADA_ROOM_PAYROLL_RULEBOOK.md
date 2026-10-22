# RC1.8 Payroll — ADA live room rules (effective 22 Oct 2026)

Source: user-provided PDF `NỘI QUY PHÒNG LIVE ADA 10'2026.pdf`, 4 pages, issued 21 Oct 2026, effective 22 Oct 2026.

This change is an **Admin-only, read-only case proposal calculator** within Payroll > Nội quy & Case vi phạm.

## Hard boundaries
- No penalties, bonuses, or disciplinary action are persisted or applied automatically.
- No change to the Payroll period/line endpoints, CSV, period lock, payroll rate or Supabase schema.
- Calculations never interpret an hourly rate or payroll line gross as the contract's per-shift fee. An explicit evidenced shift fee is required for percentages.
- Login and `payroll` capability remain enforced by existing page.
- Historic shifts before 22 Oct 2026 are not evaluated under this version.
- Only Host and Trợ (support) are covered. Kỹ thuật follows ADA's distinct internal rules.
- Existing Workforce punctuality grace period (10 minutes) is **not** the room-rule check-in deadline. The rulebook's group message timestamp (Host T-15, support T-30) is the sole timestamp evidence specified by this policy.
- Missing group check-in is **not** silently counted as on-time; it is a separate evidence case.
- Rewards to reporters require verification of first valid reporter and final reviewed case amount; the proposed amount is min(50%, VND 70,000).
- Personal-work case replaces the common-rule 100k and conduct 30% **for the same incident**; the UI evaluates one event and cannot double-count the same incident.
- Daily versus Campaign, precise 5/15/30-minute boundaries, cancellation 3h/24h/7d, campaign authorized-pass 24h and recurrence 3/5 infractions are covered by unit tests.

## Legal approval blocker
The PDF calls for monetary fines and deductions from monthly remuneration. Vietnam Labor Code 2019 Article 127 forbids monetary fines and punitive wage deductions as employee disciplinary measures. Article 102 narrowly regulates deduction for proven damage to employer assets, including a statutory percentage cap. Independent counsel/payroll approval and contract classification (employee vs independently contracted service provider) are required before any real financial consequence. This module shows **proposals** only, not legal or payment authority.

## Workflow after this phase
1. Capture source group check-in/out messages, outfit photo, report/dashboard/visibility and Drive evidence with provenance (private access, no fabricated timestamps).
2. Create a confidential incident ledger with reporter privacy, respondent response, monthly ordinal computation per verified incident ID, versioned policy snapshot and auditable SLA (report <=24h, team feedback within 3 working days), and no PII in shared logs.
3. Independent admin review, objections and legal clearance. Do not auto-compute payouts on incomplete proof, no-show ambiguities or force majeure before 48-hour document checks.
4. Only after a lawful authorized financial decision, hand off to the existing Payroll `adjustment_reason` workflow with independent approval, idempotency and locked-period safeguards.

## Validation
- `node --import ./tests/typescript-alias-loader.mjs --test tests/rc18-payroll-ada-rulebook.test.ts`
- `pnpm exec tsc --noEmit --incremental false`
- `pnpm exec eslint app/'(dashboard)'/payroll/page.tsx components/features/payroll/PayrollRoomRules.tsx lib/workforce/adaRoomRulebook.ts tests/rc18-payroll-ada-rulebook.test.ts`
- `node scripts/run-final-regression.mjs`
- Credential-free CI production-equivalent build.
- Authenticated Preview UAT and complete Employee/Contractor legality review remain release gates.

Status **Draft / Production NO-GO** until Preview UAT, finance/legal clearance, original source approval and reconciled Production baseline.
