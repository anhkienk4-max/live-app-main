'use client'

import * as React from 'react'
import { useTranslation } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
import { AdaBrand } from '@/components/branding/AdaBrand'

export function AuthLayout({ children, title, subtitle, variant = 'default' }: { children: React.ReactNode; title: string; subtitle: string; variant?: 'default' | 'login' }) {
  const { t } = useTranslation()

  if (variant === 'login') return (
    <div data-testid="ada-reference-login" className="ada-login-reference relative isolate flex min-h-dvh flex-col overflow-hidden bg-white">
      <svg className="ada-login-reference__top" viewBox="0 0 390 200" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="ada-login-top-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#075EF4" />
            <stop offset="55%" stopColor="#114EDC" />
            <stop offset="100%" stopColor="#8656F2" />
          </linearGradient>
        </defs>
        <path d="M0 0 H390 V76 C329 61 311 135 237 116 C150 89 128 163 0 119 Z" fill="url(#ada-login-top-gradient)" />
        <path d="M0 0 H390 V40 C311 40 254 94 176 82 C99 68 40 104 0 96 Z" fill="#6DC6FF" opacity=".32" />
        <path d="M296 0 H390 V58 C360 71 349 109 297 118 C338 70 340 38 296 0 Z" fill="#C6BBFF" opacity=".55" />
      </svg>

      <svg className="ada-login-reference__bottom" viewBox="0 0 390 200" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="ada-login-bottom-gradient" x1="0" y1="0" x2="1" y2=".72">
            <stop offset="0%" stopColor="#0756DF" />
            <stop offset="55%" stopColor="#3383F6" />
            <stop offset="100%" stopColor="#8260EF" />
          </linearGradient>
        </defs>
        <path d="M0 83 C100 22 158 146 274 56 C338 7 372 52 390 64 V200 H0 Z" fill="#E1EAFF" />
        <path d="M0 128 C102 41 192 156 291 111 C331 94 365 74 390 98 V200 H0 Z" fill="url(#ada-login-bottom-gradient)" />
        <path d="M0 168 C96 121 153 160 226 154 C291 147 339 129 390 146 V200 H0 Z" fill="#143C98" opacity=".42" />
      </svg>

      <main className="ada-login-reference__content relative z-10 mx-auto flex w-full flex-1 flex-col">
        <div className="ada-login-reference__identity flex flex-col items-center">
          <AdaBrand className="ada-login-reference__logo" />
        </div>
        <section className="ada-login-reference__form w-full">
          <h1 className="text-center font-extrabold tracking-tight text-[#07183B]">{title}</h1>
          <p className="sr-only">{subtitle}</p>
          <div className="ada-login-reference__fields">{children}</div>
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
