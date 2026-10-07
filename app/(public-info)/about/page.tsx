import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About | LiveStream Ops',
  description: 'Information about the LiveStream Ops internal operations management application.',
}

export default function AboutPage() {
  return (
    <article className="space-y-10">
      <section className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">About the application</p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">LiveStream Ops</h1>
        <p className="text-lg leading-8 text-slate-600">
          LiveStream Ops is an internal operations management application for authorized livestream teams.
          It supports scheduling, operational reporting, media asset handling, and related workflow coordination.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-950">Operations</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Manage livestream schedules, shifts, brands, platforms, and execution information in one operational workspace.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-950">Reporting</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Record livestream results and maintain report assets associated with authorized operational records.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-950">File storage</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use configured cloud storage, including Google Drive where enabled, to place and retrieve operational report files.
          </p>
        </div>
      </section>

      <section className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-slate-950">Access</h2>
        <p className="mt-3 leading-7 text-slate-600">
          The application is intended for authorized users. Access to protected operational data requires authentication and
          appropriate permissions.
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="font-medium text-blue-700 hover:text-blue-800">Read the Privacy Policy</Link>
          <Link href="/terms" className="font-medium text-blue-700 hover:text-blue-800">Read the Terms of Service</Link>
          <Link href="/login" className="font-medium text-blue-700 hover:text-blue-800">Sign in</Link>
        </div>
      </section>
    </article>
  )
}
