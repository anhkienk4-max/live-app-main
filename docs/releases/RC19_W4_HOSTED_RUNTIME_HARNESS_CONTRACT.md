# RC19 W4 hosted application acceptance harness

The reusable workflow is `.github/workflows/rc19-w4-hosted-application-acceptance.yml`.
It receives two exact SHA values: a harness SHA and an application SHA. The
caller must pin its `uses:` reference to that same harness SHA; GitHub's run
record is authoritative for the called-workflow source revision. The workflow
checks out the supplied harness SHA and confirms it matches the passed value.
The application SHA must equal `.github/rc19-w4-reviewed-application.sha`; the
workflow will not fetch arbitrary refs. Updating that allowlist is a separate
reviewed release-engineering change after Lane 01 supplies its scoped
application candidate.

The runner installs the application's frozen pnpm lockfile, starts a new
Supabase CLI 3.4.0 stack from the exact application checkout, applies only that
checkout's canonical `supabase/migrations` through `supabase start`, with
seeding explicitly disabled, then cold-starts the stack. The database has a run-unique project
ID, ports, and marker. No Supabase access token, Production credential, or
remote project link is provided. Managed Auth schemas are not edited by the
harness. Auth migration receipts are written only by the pinned Supabase CLI
stack bootstrap; the workflow never creates receipts manually.

Lane 01 owns the fixture contract and acceptance behavior. Its reviewed
application candidate must provide
`scripts/rc19-w4-application-acceptance.mjs`. The script receives the
job-local Supabase URL, anon key, service-role key, database URL/marker, and
run-unique synthetic Admin/Leader/Member credentials through environment
variables. It must create real disposable Auth users, establish canonical
`business_users` mappings through the approved application fixture path, and
exercise the existing RBAC/RLS and application API behavior. It may run the
reviewed browser suite when `RC19_W4_RUN_BROWSER_UAT=true` and its prerequisites
are present. It must not print credentials, JWTs, user identifiers, or raw
database rows.

On success, the script writes one JSON object to stdout matching
`rc19-w4-application-acceptance/v1`:

```json
{
  "schema": "rc19-w4-application-acceptance/v1",
  "status": "passed",
  "synthetic_users": {
    "admin": {"login": true, "canonical_business_user_mapping": true},
    "leader": {"login": true, "canonical_business_user_mapping": true},
    "member": {"login": true, "canonical_business_user_mapping": true}
  },
  "authorization": {"rbac": true, "rls": true, "application_api": true},
  "browser_uat": {"ran": false, "passed": false}
}
```

When browser UAT is requested and passes, set both `ran` and `passed` to true.
The workflow validates this contract, stores only the sanitized booleans with
the exact SHAs and runtime image identities, and retains the artifact for 14
days. Raw test output remains ephemeral and is not uploaded.

The application candidate SHA allowlisted today is the reviewed W4 application
commit `87a077955f309e5daaaf4c8dd229df2ae586053a`, which includes Lane 01's
scoped typed incident correction. It does not yet contain the Lane 01
acceptance entrypoint. The reusable workflow therefore cannot report
Admin/Leader/Member or application acceptance until Lane 01 provides and
reviews that contract and the approved candidate SHA is updated.

This is a fresh-stack application rehearsal. It is not a historical database
upgrade rehearsal, an Official Restore result, or final release acceptance.
