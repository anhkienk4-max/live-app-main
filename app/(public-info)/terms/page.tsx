import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | LiveStream Ops',
  description: 'Terms of Service for LiveStream Ops.',
}

export default function TermsPage() {
  return (
    <article className="max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Terms</p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Terms of Service</h1>
        <p className="text-sm text-slate-500">Effective date: October 7, 2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">1. Authorized use</h2>
        <p className="leading-7 text-slate-600">
          LiveStream Ops is an internal operations management application. You may use the service only if you are authorized
          by the organization operating the application and only for legitimate livestream operations and related business
          workflows.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">2. Account responsibility</h2>
        <p className="leading-7 text-slate-600">
          Users are responsible for protecting their account credentials, following assigned access permissions, and ensuring
          that information entered or uploaded to the service is appropriate for the authorized operational purpose.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">3. Acceptable use</h2>
        <p className="leading-7 text-slate-600">
          You must not attempt to bypass access controls, interfere with service operation, access information outside your
          authorization, upload unlawful content, or use connected services in a manner that violates applicable law or the
          terms of the relevant third-party provider.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">4. Connected services</h2>
        <p className="leading-7 text-slate-600">
          LiveStream Ops may integrate with third-party services such as Google Drive. Those services remain subject to their
          own terms, policies, availability, and permission models. Some application functions may be unavailable when a
          required connected service is unavailable or its authorization is revoked.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">5. Operational data</h2>
        <p className="leading-7 text-slate-600">
          Users must handle operational records, reports, and files according to organizational policies and applicable data
          retention or confidentiality requirements. Permissions granted through the application do not override those
          obligations.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">6. Availability and changes</h2>
        <p className="leading-7 text-slate-600">
          The service may be updated, maintained, suspended, or modified as operational needs change. Features that depend on
          external providers may also change based on those providers&apos; services and policies.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">7. Questions</h2>
        <p className="leading-7 text-slate-600">
          Questions about these terms or access to LiveStream Ops should be directed to the administrator or support contact
          identified on the application&apos;s Google OAuth consent screen.
        </p>
      </section>
    </article>
  )
}
