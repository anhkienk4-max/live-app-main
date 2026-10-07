import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | LiveStream Ops',
  description: 'Privacy Policy for LiveStream Ops.',
}

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Privacy</p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Privacy Policy</h1>
        <p className="text-sm text-slate-500">Effective date: October 7, 2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">1. Scope</h2>
        <p className="leading-7 text-slate-600">
          This Privacy Policy describes how LiveStream Ops handles information used to provide its internal livestream
          operations management functions. The application is intended for authorized users and is not designed as a
          consumer-facing public service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">2. Information processed</h2>
        <p className="leading-7 text-slate-600">
          LiveStream Ops may process account identifiers and authentication information, operational records such as brands,
          platforms, schedules, shifts and reports, and files or file metadata associated with operational reporting.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">3. Google Drive and Google API data</h2>
        <p className="leading-7 text-slate-600">
          When Google Drive integration is enabled, LiveStream Ops uses Google Drive access only to perform application
          functions requested or configured by authorized users and administrators, such as creating folders, storing report
          assets, locating files, reading file metadata, and deleting application-managed files where the workflow requires it.
        </p>
        <p className="leading-7 text-slate-600">
          Google user data is not sold, used for advertising, or used to build advertising profiles. LiveStream Ops does not
          use Google Drive content for unrelated purposes.
        </p>
        <p className="leading-7 text-slate-600">
          LiveStream Ops&apos; use and transfer to any other app of information received from Google APIs will adhere to the
          Google API Services User Data Policy, including the Limited Use requirements.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">4. Sharing</h2>
        <p className="leading-7 text-slate-600">
          Information is shared only as necessary to operate the service, including with infrastructure, database, hosting,
          and cloud-storage providers configured for the application, or when required by law. Operational data is not sold
          to third parties.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">5. Retention and deletion</h2>
        <p className="leading-7 text-slate-600">
          Operational records and files are retained according to the organization&apos;s operational requirements and configured
          storage workflows. Authorized administrators may delete records or application-managed files where supported by the
          service and applicable retention requirements.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">6. Security and access controls</h2>
        <p className="leading-7 text-slate-600">
          Access to protected areas of LiveStream Ops requires authentication. The application uses role and provider
          permissions to limit access to operational data and connected storage resources.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">7. Revoking Google access</h2>
        <p className="leading-7 text-slate-600">
          A Google account holder may revoke the application&apos;s Google account access through the security and third-party
          access controls provided by Google. Revoking access may prevent Google Drive storage functions from operating until
          authorization is restored.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">8. Changes and contact</h2>
        <p className="leading-7 text-slate-600">
          This policy may be updated when the application or its data practices change. Questions about the application or
          this policy should be directed to the administrator or support contact identified on the application&apos;s Google
          OAuth consent screen.
        </p>
      </section>
    </article>
  )
}
