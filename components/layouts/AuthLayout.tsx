'use client'

import * as React from 'react'
import { useTranslation } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
import { AdaBrand } from '@/components/branding/AdaBrand'

export function AuthLayout({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  const { t } = useTranslation()

  return (
    <div className="ada-auth flex min-h-dvh flex-col bg-[#F8FAFF] lg:flex-row">
      <section className="ada-auth__hero relative flex min-h-[230px] flex-col items-center justify-center overflow-hidden px-8 pt-10 pb-12 text-white lg:min-h-dvh lg:w-[52%] lg:items-start lg:justify-between lg:px-16 lg:py-14">
        <div className="ada-auth__wave ada-auth__wave--first" aria-hidden="true" />
        <div className="ada-auth__wave ada-auth__wave--second" aria-hidden="true" />
        <div className="relative z-10 flex flex-col items-center lg:items-start">
          <AdaBrand inverse className="ada-auth__brand" />
          <p className="mt-4 text-center text-[10px] font-bold tracking-[.22em] text-blue-100 lg:text-left">
            ADA GLOBAL · LIVESTREAM OPERATIONS
          </p>
        </div>
        <div className="relative z-10 hidden max-w-lg lg:block">
          <h2 className="text-4xl font-bold tracking-tight">{t('operationsCenter')}</h2>
          <p className="mt-3 max-w-md text-base leading-relaxed text-blue-100">{t('loginSubtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-2 text-sm">
            {[t('calendar'), t('staffing'), t('reports')].map(label => (
              <span key={label} className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-white">{label}</span>
            ))}
          </div>
        </div>
        <p className="relative z-10 hidden text-[11px] font-medium tracking-[.15em] text-blue-100 lg:block">
          ADA GLOBAL · LIVESTREAM OPERATIONS
        </p>
      </section>

      <section className="ada-auth__form flex w-full flex-1 items-start justify-center px-4 pb-10 lg:min-h-dvh lg:items-center lg:px-12 lg:py-12">
        <PageShell archetype="auth" className="ada-auth__card relative z-10 -mt-8 flex w-full max-w-md flex-col space-y-6 rounded-[24px] border border-slate-100 bg-white px-6 py-8 shadow-[0_20px_55px_rgba(7,24,59,.09)] sm:px-9 lg:mt-0 lg:px-10 lg:py-12">
          <div className="flex flex-col space-y-2 text-left">
            <h1 className="text-[25px] font-bold tracking-tight text-[#07183B]">{title}</h1>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="grid gap-6">{children}</div>
        </PageShell>
      </section>
    </div>
  )
}
