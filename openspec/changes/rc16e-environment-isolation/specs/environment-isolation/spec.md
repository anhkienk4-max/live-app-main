## ADDED Requirements

### Requirement: Strict target identity
The shared validator SHALL parse URLs with the standard URL parser and reject
non-HTTP(S), remote HTTP, credentials, paths, queries, fragments, nondefault remote
ports, encoded/disguised hosts and unknown project references/custom domains.
Only known Production/Staging identities and exact loopback hosts are recognized.
Custom domains SHALL require a reviewed mapping to verified project ownership.
Root trailing slashes SHALL normalize to the origin. Loopback identity SHALL
include the origin/port, so different local databases cannot silently agree.

### Requirement: Deployment authorization
Local development/build/runtime SHALL reject Production on either effective URL.
NODE_ENV=production SHALL NOT authorize a Production target. Vercel deployment
identity SHALL require VERCEL=1 and known VERCEL_ENV; contradictory optional
VERCEL_TARGET_ENV or development NODE_ENV SHALL fail closed. Preview SHALL require
Staging, matching public/server identities, public and server credentials and no
mock mode. Authorized Production SHALL require the known Production identity and
matching targets. Unknown deployment labels SHALL NOT become Production.

### Requirement: Runtime protection
Privileged and server public clients SHALL validate immediately before creation,
independently of package scripts. A nonempty SUPABASE_URL override SHALL be checked;
absent/empty override SHALL use the public URL, while whitespace SHALL fail.
Validation and client construction SHALL consume the same environment snapshot.
Runtime privileged clients SHALL require server-only credentials. No credential,
raw URL or caught parser error SHALL be logged. No per-request identity network
probe SHALL be introduced. Matching URLs SHALL NOT be asserted as key alignment.

### Requirement: Offline exceptions
Explicit credential-free mock development SHALL remain supported. Mock development
SHALL NOT permit server database access. Credential-free builds SHALL be allowed
only for purpose=build, CI=true, local mode, absent deployment metadata and absent
Supabase URLs/keys. The exception SHALL NOT apply to runtime or partially configured
projects. Process guards SHALL load Next environment files using the corresponding
development/production precedence before validation.

### Requirement: Security regression delivery
CI SHALL trigger for guard, client/helper, package, test and specification changes,
and run environment/auth tests alongside existing Payroll/PostgreSQL gates. C10
resolution SHALL mean verified code protection, not cloud isolation or UAT success.
Repository Git deployment configuration SHALL disable automatic deployment only
for feat/rc16-payroll-workforce-backend; other branches/settings SHALL stay unchanged.
