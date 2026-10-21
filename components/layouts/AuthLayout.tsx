'use client'

import type { ReactNode } from 'react'
import { CalendarDays, Radio, ShieldCheck, Video } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  const { t } = useTranslation()
  return <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
    <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-center gap-8 border-r border-blue-100 bg-gradient-to-br from-blue-50 via-slate-50 to-white p-10 lg:flex">
        <div className="flex items-center gap-3 text-lg font-semibold text-[#082743]"><span className="rounded-xl bg-blue-600 p-2.5 text-white"><Video className="size-6" aria-hidden="true" /></span>LiveStream Ops</div>
        <div><h2 className="text-2xl font-semibold leading-snug text-[#082743]">{t('operationsCenter')}</h2><p className="mt-3 text-sm leading-relaxed text-slate-600">{t('loginSubtitle')}</p></div>
        <ul className="space-y-5 text-sm text-slate-700">
          <li className="flex items-center gap-3"><CalendarDays className="size-5 shrink-0 text-blue-600" aria-hidden="true" />{t('calendar')} · {t('staffing')}</li>
          <li className="flex items-center gap-3"><Radio className="size-5 shrink-0 text-blue-600" aria-hidden="true" />{t('liveMonitor')} · {t('reports')}</li>
          <li className="flex items-center gap-3"><ShieldCheck className="size-5 shrink-0 text-blue-600" aria-hidden="true" />{t('systemPermissions')}</li>
        </ul>
      </aside>
      <section className="min-w-0 px-5 py-8 sm:p-10 lg:p-12">
        <PageShell archetype="auth" className="min-w-0">
          <div className="mb-6 flex items-center gap-3 text-base font-semibold text-[#082743] lg:hidden"><span className="rounded-lg bg-blue-600 p-2 text-white"><Video className="size-5" aria-hidden="true" /></span>LiveStream Ops</div>
          <header className="mb-7 space-y-2"><h1 className="text-2xl font-semibold tracking-tight text-[#082743]">{title}</h1><p className="text-sm leading-relaxed text-slate-600">{subtitle}</p></header>
          <div className="grid min-w-0 gap-6">{children}</div>
        </PageShell>
      </section>
    </div>
  </main>
}
