'use client'

import type { ReactNode } from 'react'
import { CalendarDays, Radio, ShieldCheck, Video } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
import { AdaBrand } from '@/components/branding/AdaBrand'

/**
 * U01: a readable, stable authentication layout across phone, tablet and desktop.
 * Shared by sign-in, account request, password recovery and reset. Authentication
 * and form validation are intentionally owned by the caller, not this shell.
 */
export function AuthLayout({ children, title, subtitle, variant = 'default' }: { children: ReactNode; title: string; subtitle: string; variant?: 'default' | 'login' }) {
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
    <main className="flex min-h-dvh w-full min-w-0 items-start justify-center bg-gradient-to-br from-[#eef4fb] via-[#f7f9fc] to-white px-3 py-4 text-slate-900 sm:px-6 sm:py-8 lg:items-center lg:px-8 lg:py-10 xl:items-start xl:py-[11dvh]">
      <a href="#auth-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-blue-800 focus:shadow-lg">{title}</a>

      <div data-testid="auth-layout-card" className="grid w-full min-w-0 max-w-[720px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_60px_-28px_rgba(8,39,67,0.22)] sm:rounded-3xl lg:max-w-none lg:w-[86vw] xl:min-h-[78dvh] xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
        <aside className="relative hidden min-w-0 flex-col justify-between overflow-hidden bg-[#082743] px-9 py-10 text-white xl:flex xl:px-12 xl:py-12" aria-label={t('operationsCenter')}>
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
          <PageShell archetype="auth" id="auth-content" tabIndex={-1} aria-labelledby="auth-title" className="min-w-0 w-full">
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
