import Link from 'next/link'

export default function PublicInfoLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/about" className="font-semibold tracking-tight text-slate-950">
            LiveStream Ops
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600" aria-label="Public information">
            <Link href="/about" className="hover:text-slate-950">About</Link>
            <Link href="/privacy" className="hover:text-slate-950">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-950">Terms</Link>
            <Link href="/login" className="font-medium text-blue-700 hover:text-blue-800">Sign in</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>LiveStream Ops · Internal operations management application</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-slate-800">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-800">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
