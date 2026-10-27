'use client'

import * as React from 'react'
import { useTranslation } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
import { AdaBrand } from '@/components/branding/AdaBrand'

export function AuthLayout({ children, title, subtitle, variant = 'default' }: { children: React.ReactNode; title: string; subtitle: string; variant?: 'default' | 'login' }) {
  const { t } = useTranslation()

  if (variant === 'login') return (
    <div data-testid="ada-reference-login" className="ada-login-reference relative isolate flex min-h-dvh flex-col overflow-hidden bg-white">
      <svg className="ada-login-reference__top" viewBox="0 0 390 170" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="ada-login-top-gradient" x1="0" y1="0" x2="1" y2="0.8"><stop offset="0%" stopColor="#0874F6"/><stop offset="54%" stopColor="#1F5EE8"/><stop offset="100%" stopColor="#9E66ED"/></linearGradient></defs>
        <path d="M0 0 H390 V48 C314 62 282 124 182 91 C100 64 56 87 0 109 Z" fill="url(#ada-login-top-gradient)"/>
        <path d="M0 0 H390 V33 C285 24 240 71 155 63 C68 55 37 78 0 85 Z" fill="#6BC4FF" opacity=".26"/>
      </svg>
      <svg className="ada-login-reference__bottom" viewBox="0 0 390 170" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="ada-login-bottom-gradient" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0%" stopColor="#2A6CF0"/><stop offset="60%" stopColor="#8AB9FF"/><stop offset="100%" stopColor="#A28CF4"/></linearGradient></defs>
        <path d="M0 90 C96 50 132 133 229 69 C300 21 358 68 390 92 V170 H0 Z" fill="#E0EAFF"/>
        <path d="M0 125 C78 45 168 113 226 105 C311 93 340 120 390 91 V170 H0 Z" fill="url(#ada-login-bottom-gradient)" opacity=".83"/>
        <path d="M0 165 C115 85 188 166 290 126 C340 106 358 135 390 140 V170 H0 Z" fill="#F7FAFF" opacity=".76"/>
      </svg>
      <main className="relative z-10 mx-auto flex w-full max-w-[432px] flex-1 flex-col px-6 pb-8 pt-[clamp(110px,16dvh,146px)] sm:px-9">
        <div className="flex flex-col items-center">
          <AdaBrand className="ada-login-reference__logo" />
          <p className="mt-3 text-center text-[9px] font-bold tracking-[.24em] text-[#122155]">
            ADA GLOBAL · LIVESTREAM OPERATIONS
          </p>
        </div>
        <section className="mt-[clamp(22px,3.4dvh,34px)] w-full">
          <h1 className="text-center text-[23px] font-extrabold tracking-tight text-[#07183B]">{title}</h1>
          <p className="mt-2 text-center text-sm text-slate-500">{subtitle}</p>
          <div className="mt-4">{children}</div>
        </section>
      </main>
    </div>
  )

  return (
    <div className="ada-auth flex min-h-dvh flex-col overflow-x-hidden bg-[#F8FAFF] md:flex-row">
      <section className="ada-auth__hero relative flex min-h-[245px] flex-col items-center justify-center overflow-hidden px-6 pb-14 pt-9 text-white sm:min-h-[275px] md:min-h-dvh md:w-[47%] md:shrink-0 md:items-start md:justify-between md:px-7 md:py-10 lg:w-[52%] lg:px-12 xl:px-16">
        <div className="ada-auth__wave ada-auth__wave--first" aria-hidden="true" />
        <div className="ada-auth__wave ada-auth__wave--second" aria-hidden="true" />
        <div className="relative z-10 flex flex-col items-center md:items-start">
          <AdaBrand inverse className="ada-auth__brand" />
          <p className="mt-4 text-center text-[10px] font-bold tracking-[.18em] text-blue-100 md:text-left">
            ADA GLOBAL · LIVESTREAM OPERATIONS
          </p>
        </div>
        <div className="relative z-10 hidden max-w-lg md:block">
          <h2 className="text-[clamp(1.5rem,2.8vw,2.5rem)] font-bold leading-tight tracking-tight">{t('operationsCenter')}</h2>
          <p className="mt-3 max-w-md text-base leading-relaxed text-blue-100">{t('loginSubtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-2 text-sm">
            {[t('calendar'), t('staffing'), t('reports')].map(label => (
              <span key={label} className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-white">{label}</span>
            ))}
          </div>
        </div>
        <p className="relative z-10 hidden text-[11px] font-medium tracking-[.15em] text-blue-100 md:block">
          ADA GLOBAL · LIVESTREAM OPERATIONS
        </p>
      </section>

      <section className="ada-auth__form flex w-full flex-1 items-start justify-center px-4 pb-8 sm:px-7 md:min-h-dvh md:min-w-0 md:items-center md:px-4 md:py-8 lg:px-9 xl:px-12">
        <PageShell archetype="auth" className="ada-auth__card relative z-10 -mt-10 flex w-full max-w-md flex-col space-y-6 rounded-[24px] border border-slate-100 bg-white px-6 py-8 shadow-[0_20px_55px_rgba(7,24,59,.09)] sm:px-8 md:mt-0 md:px-7 md:py-9 lg:px-9 lg:py-11">
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
