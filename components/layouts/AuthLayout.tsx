'use client'

import type { ReactNode } from 'react'
import { CalendarDays, Radio, ShieldCheck, Video } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'

/**
 * U01: a readable, stable authentication layout across phone, tablet and desktop.
 * Shared by sign-in, account request, password recovery and reset. Authentication
 * and form validation are intentionally owned by the caller, not this shell.
 */
export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  const { t } = useTranslation()

  return (
    <main className="flex min-h-dvh w-full min-w-0 items-start justify-center bg-gradient-to-br from-[#eef4fb] via-[#f7f9fc] to-white px-3 py-4 text-slate-900 sm:px-6 sm:py-8 lg:items-center lg:px-8 lg:py-10">
      <a href="#auth-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-blue-800 focus:shadow-lg">{title}</a>

      <div data-testid="auth-layout-card" className="grid w-full min-w-0 max-w-[720px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_60px_-28px_rgba(8,39,67,0.22)] sm:rounded-3xl lg:min-h-[620px] lg:max-w-[1180px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] xl:min-h-[680px] min-[1800px]:max-w-[min(86vw,1720px)] min-[1800px]:min-h-[min(78dvh,1200px)]">
        <aside className="relative hidden min-w-0 flex-col justify-between overflow-hidden bg-[#082743] px-9 py-10 text-white lg:flex xl:px-12 xl:py-12" aria-label={t('operationsCenter')}>
          <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 -left-20 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex items-center gap-3 text-base font-semibold tracking-tight">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-950/20">
              <Video className="size-6" aria-hidden="true" />
            </span>
            <span>LiveStream Ops</span>
          </div>

          <div className="relative max-w-md space-y-5">
            <div className="h-1 w-12 rounded-full bg-blue-400" aria-hidden="true" />
            <h2 className="max-w-[17ch] break-words text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">{t('operationsCenter')}</h2>
            <p className="max-w-sm break-words text-base leading-7 text-blue-100/90">{t('loginSubtitle')}</p>
          </div>

          <ul className="relative grid gap-4 text-sm text-blue-50/90">
            <li className="flex items-center gap-3"><CalendarDays className="size-5 shrink-0 text-sky-300" aria-hidden="true" /><span>{t('calendar')} · {t('staffing')}</span></li>
            <li className="flex items-center gap-3"><Radio className="size-5 shrink-0 text-sky-300" aria-hidden="true" /><span>{t('liveMonitor')} · {t('reports')}</span></li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-5 shrink-0 text-sky-300" aria-hidden="true" /><span>{t('systemPermissions')}</span></li>
          </ul>
        </aside>

        <section className="flex min-w-0 w-full items-center justify-center px-5 py-9 sm:px-10 sm:py-11 lg:px-12 lg:py-14 xl:px-16" data-testid="auth-form-panel">
          <PageShell archetype="auth" id="auth-content" tabIndex={-1} aria-labelledby="auth-title" className="min-w-0 w-full max-w-[460px] min-[1800px]:max-w-[700px]">
            <div className="mb-10 flex items-center gap-3 text-base font-semibold text-[#082743] lg:hidden">
              <span className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white"><Video className="size-5" aria-hidden="true" /></span>
              <span>LiveStream Ops</span>
            </div>
            <header className="mb-8 min-w-0 space-y-3">
              <h1 id="auth-title" className="break-words text-3xl font-semibold leading-tight tracking-tight text-[#082743] sm:text-[34px]">{title}</h1>
              <p className="break-words text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">{subtitle}</p>
            </header>
            <div className="grid min-w-0 gap-6">{children}</div>
          </PageShell>
        </section>
      </div>
    </main>
  )
}
