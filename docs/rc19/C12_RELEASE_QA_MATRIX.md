# RC19 C12 independent release QA matrix

This is a status matrix, not evidence of a full-app pass. Earlier Antigravity “70/70” is not reused as release proof. No Production writes, migrations, deployment, or business-data changes were performed for C12.

| Task ID | Workflow | Actor | Source SHA | Environment | Expected | Actual | API/DB/UI evidence | Status |
|---|---|---|---|---|---|---|---|---|
| C12-AUDIT-ADMIN | Audit History list + filters + detail | Admin | C12 candidate | Production read-only + isolated PG17.11 | bounded pages under audit.view | Production legacy query timed out; new RPC returns bounded pages in local PG17.11 | Production SQLSTATE 57014 logs; synthetic PG17 role/RLS assertion PASS; UI still uses legacy API until G12 | PARTIAL |
| C12-AUDIT-LEADER | Team audit scope | Leader | C12 candidate | Isolated PG17.11 | only allowed modules, no foreign rows/count | synthetic RLS fixture returns only permitted modules, with no total count | `C12_PG17_KEYSET_RLS_PASS`; no authenticated live session used | PARTIAL |
| C12-AUDIT-MEMBER | Audit access | Member | C12 candidate | Isolated PG17.11 | denied/empty under existing RLS | synthetic Member receives an empty page, `has_more=false` | `C12_PG17_KEYSET_RLS_PASS`; no authenticated live session used | PARTIAL |
| C1/G1 | Startup/readiness/loading | Admin/Leader/Member | multiple | Production/staged | content ready, no stuck overlay | historical reports not accepted as proof | no current browser run | NOT TESTED |
| C2/G2 | Calendar correctness | Admin/Leader/Member | multiple | Production/staged | persisted shift/calendar correctness | no current browser run | separate C2 worktree preserved | NOT TESTED |
| C4/G4 | Staffing/PASS/Swap | Admin/Leader/Member | multiple | Production/staged | scoped transitions and persistence | no current browser run | separate C4 worktree preserved | NOT TESTED |
| C3/G3 | Shift editor | Admin/Leader/Member | multiple | Production/staged | authorized edit and audit trail | no current browser run | not assessed in C12 | NOT TESTED |
| Attendance | check-in/out/evidence | Admin/Leader/Member | multiple | Production/staged | actor-scope photo/evidence behavior | no current browser run | C5.11 artifact evidence is not substituted | NOT TESTED |
| Payroll | approval/payslip | Admin/Leader/Member | multiple | Production/staged | locked/payable state and privacy | no current browser run | C5.15 evidence not rerun or recertified | NOT TESTED |
| Reports | report/revision/export | Admin/Leader/Member | multiple | Production/staged | scoped report artifacts | no current browser run | no artifact E2E | NOT TESTED |
| Storage/Drive | upload/readback/access | Admin/Leader/Member | multiple | Production/staged | provider bytes, ACL and checksum | no current provider run | existing Operational File report not re-run | NOT TESTED |
| Workforce | performance/actuals | Admin/Leader/Member | multiple | Production/staged | authoritative scopes and totals | no current browser run | no authenticated matrix | NOT TESTED |
| RBAC | route/API/RLS matrix | Admin/Leader/Member | multiple | Production/staged | correct allow/deny by scope | static source and live policy snapshot only | policy: Admin audit.view; Leader audit.view_team restricted modules; Member has no audit SELECT | PARTIAL |
| Error recovery | timeout/retry/network | Admin/Leader/Member | C12 candidate | Production + PG17.11 | bounded request and cancellation contract | SQL timeout reproduced in Production logs; service propagates AbortSignal; page validation fails closed | production SQLSTATE 57014; focused C12 tests 3/3 pass; authenticated UI retry remains G12 | PARTIAL |
| Cross-module regression | all modules | all roles | exact integrated SHA required | Production/staged | no regression | not run | no exact integrated candidate | NOT TESTED |
| C12 quality gates | C12 service/RPC contract | local source | C12 candidate | local + isolated PG17.11 | source and DB contract gates pass | focused C12 4/4, C5.15 contract 5/5, TypeScript pass, ESLint 0 errors/31 existing warnings, credential-free production build exit 0 | `C12_PG17_PERFORMANCE_EVIDENCE.md`; build ran on final pre-commit source tree | PARTIAL |

## C12 regression triage

| Test | Result | Evidence and classification |
|---|---|---|
| C5.11 persisted E2E | BLOCKED before test setup | Direct invocation stops at `C511 local runtime environment required` because `C511_DATABASE` and the other isolated runtime inputs are absent. No credentials were searched for and no Production/Staging database was used. This is an environment prerequisite, not a source assertion failure. |
| C5.15 migration checksum | PASS after Windows line-ending normalization | All four C5.15 SQL Git-blob SHA-256 values match the release manifest exactly. The Windows checkout has CRLF worktree bytes while repository blobs are LF; the test now normalizes CRLF to LF before hashing and does not change expected hashes or SQL. |
| C5.15 OT SQL assertion | PASS after Windows line-ending normalization | The SQL assignment is present and matches after CRLF normalization. This was a test portability issue, not a changed overtime rule. The focused C5.15 migration contract suite passes 5/5. |

The C12 cursor/service suite passes 3/3. The PG17 evidence and measured query plans are recorded in `C12_PG17_PERFORMANCE_EVIDENCE.md`. C12 is still PARTIAL until G12 wires the UI and authenticated Admin/Leader runtime verification runs on one integrated SHA.

Release acceptance requires the integrated C1–C5/G1–G12 source SHA, migration checksum and PG17 results, authenticated three-role UI/API evidence, and provider-backed Drive evidence where applicable. C12 source tests alone are insufficient.
