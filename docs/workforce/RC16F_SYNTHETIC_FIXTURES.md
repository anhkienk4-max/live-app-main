# RC1.6F — Synthetic fixture manifest

Definitions: [JSON](../../tests/fixtures/rc16f_synthetic_uat.json);
executable assertions: [SQL](../../tests/fixtures/rc16f_synthetic_uat.sql).
Chỉ chạy qua runner được guard, không seed Staging. Namespace mỗi run là
`RC16F_<container_name>` hoặc `RC16F_ci-<GITHUB_RUN_ID>-<PGmajor>`.

| Fixture | Expected evidence/state | Monetary outcome VND | Retention |
| --- | --- | --- | --- |
|H1|Host90min overnight, independent approval; correction v1→v2, exact retry replay|175000 initial; payable60/OT30 gross125000,adjustment-1000,net124000|Retain attendance/rate/line/audit |
|H2|Second Host first45min; terminal void v2, segment permanently reserved|75000 evidence retained,0 in active total|Retain void evidence |
|H3|Replacement00:15→01:00,45min, adjacent to H2|75000|Retain |
|S1|One Support23:30→01:00 through both Host segments, one line|150000/90min, không nhân theo số Host|Retain |
|LATE|Actual23:35→00:30,55min; planned23:30 in E2E definition|91667; punctuality depends on approved grace|Retain |
|EXTRA/COVER|Extra technical30min/coverHost30min, unmatched planned warning|50000 each|Retain |
|NOSHOW|Explicit independent approved no_show, null times, no payroll|0|Retain evidence |
|UNKNOWN|Staff with no segment; UNKNOWN, never inferred no_show|null/no payroll|Retain absence evidence |
|P|09-02→09-30 includes overnight business date09-30; A correction/void,B Review,A Confirm/Ready/Lock|6active lines,540667;6audit rows including2changes+4transitions|Locked immutable |

All money is synthetic, not real pay policy. Old alias `finance-1` is an Admin,
not an unapproved Finance role. SQL creates no Auth accounts. A/B auth mapping,
L/M login, planned registrations and complete Shift lifecycle require separate
authorization/preparation; minimal SQL fixture does not implement them.

## Mapping37 E2E cases

| Cases | Reusable fixture/automated evidence | Browser/cloud status |
| --- | --- | --- |
|A01–A06|Existing auth/Actual tests, attendance permissions/immutability;A/B aliases|NOT RUN |
|A07–A09|H1/H2/H3/S1/NOSHOW/UNKNOWN and existing overlap/adjacent tests|NOT RUN |
|P01–P05|Existing rate/date/default/specific/discovery/duplicate regressions|NOT RUN |
|P06–P12|H1 receipt;49B assertions+5race/rollback scenarios|NOT RUN |
|P13–P20|H2 void;empty/allvoid/review/lock/immutability/replay regression;P chain|NOT RUN |
|P21|Existing CSV API test checks signed adjustment/formula protection/void; SQL total540667|NOT RUN; no Preview download |
|W01–W05|Performance tests plus UNKNOWN/NOSHOW/late definitions; config requires policy approval|NOT RUN; trends/GMV/orders unavailable |
|S01–S02|Provider/root/route/retention definitions only|BLOCKED physical provider |

Negative variants reuse existing regression fixtures: overlapping S1 rejected,
adjacent allowed; empty/allvoid periods reject Review; overlapping period rejects
any reused segment including void; draft/rejected/scheduled evidence never payable;
effective rate cannot rewrite snapshot. JSON is the golden happy path, not proof
all37browser cases ran. Unit assertions independently reconcile durations, rounding,
totals and37caseIDs.

Every future UAT case must record run/IDs, expected state/money, actoralias,
immutable deployment/SHA, redacted response/screenshot, versions/UUID/audit and
CSVhash. Never log keys. Disposable container can be stopped after evidence;
approved cloud evidence/audit must be retained, no destructive row cleanup.
