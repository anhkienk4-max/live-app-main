# Report Inbox paging requirements

## Requirements

### Requirement: Server-side report obligation paging
The system MUST filter reportable, non-deleted and non-archived shifts and their non-final report state before calculating total and returning a stable bounded page.

### Requirement: Member queue authorization
The system MUST include a Member's shift only when the active Member is directly assigned or has an approved/manually-assigned registration, or when the Member submitted that shift's report and existing shift RLS still makes the shift visible. Open-registration and pending-only relationships MUST NOT grant queue visibility by themselves.

### Requirement: Elevated queue scope
The system MUST preserve the existing Admin and Leader reviewer scope, subject to active-user and row-level security checks.

### Requirement: Read-only access
The page operation MUST NOT mutate shifts, reports, or audit state, and MUST remain subject to caller RLS.
