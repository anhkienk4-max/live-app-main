'use client'

import type { ReactNode } from 'react'
import { CalendarDays, Radio, ShieldCheck, Video } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  const { t } = useTranslation()
  return <main className="flex min-h-dvh w-full min-w-0 items-start justify-center bg-slate-50 px-3 py-4 text-slate-900 sm:px-6 sm:py-6 lg:items-center lg:px-8 lg:py-8">
    <a href="#auth-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-blue-800 focus:shadow-lg">{title}</a>
    <div className="grid w-full min-w-0 max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
      <aside className="hidden min-w-0 flex-col justify-center gap-8 border-r border-blue-100 bg-gradient-to-br from-blue-50 via-slate-50 to-white p-8 xl:p-10 lg:flex" aria-label={t('operationsCenter')}>
        <div className="flex items-center gap-3 text-lg font-semibold text-[#082743]"><span className="rounded-xl bg-blue-600 p-2.5 text-white"><Video className="size-6" aria-hidden="true" /></span>LiveStream Ops</div>
        <div className="min-w-0 break-words"><h2 className="text-2xl font-semibold leading-snug text-[#082743]">{t('operationsCenter')}</h2><p className="mt-3 text-sm leading-relaxed text-slate-600">{t('loginSubtitle')}</p></div>
        <ul className="space-y-5 break-words text-sm text-slate-700">
          <li className="flex items-center gap-3"><CalendarDays className="size-5 shrink-0 text-blue-600" aria-hidden="true" />{t('calendar')} · {t('staffing')}</li>
          <li className="flex items-center gap-3"><Radio className="size-5 shrink-0 text-blue-600" aria-hidden="true" />{t('liveMonitor')} · {t('reports')}</li>
          <li className="flex items-center gap-3"><ShieldCheck className="size-5 shrink-0 text-blue-600" aria-hidden="true" />{t('systemPermissions')}</li>
        </ul>
      </aside>
      <section className="min-w-0 w-full px-4 py-6 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
        <PageShell archetype="auth" id="auth-content" tabIndex={-1} aria-labelledby="auth-title" className="min-w-0">
          <div className="mb-6 flex items-center gap-3 text-base font-semibold text-[#082743] lg:hidden"><span className="rounded-lg bg-blue-600 p-2 text-white"><Video className="size-5" aria-hidden="true" /></span>LiveStream Ops</div>
          <header className="mb-6 min-w-0 space-y-2 sm:mb-7"><h1 id="auth-title" className="break-words text-xl font-semibold tracking-tight text-[#082743] sm:text-2xl">{title}</h1><p className="break-words text-sm leading-relaxed text-slate-600">{subtitle}</p></header>
          <div className="grid min-w-0 gap-6">{children}</div>
        </PageShell>
      </section>
    </div>
  </main>
}
