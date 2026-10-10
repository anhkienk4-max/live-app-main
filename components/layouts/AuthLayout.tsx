'use client'

import * as React from 'react'
import { useTranslation } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'

export function AuthLayout({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  const {t} = useTranslation()
  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-white">
      {/* Visual / Brand Side (Hidden on Mobile) */}
      <div className="relative hidden w-full lg:flex lg:w-1/2 flex-col justify-between bg-zinc-950 p-10 text-white overflow-hidden border-r border-zinc-800">
        {/* Subtle decorative background pattern */}
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[length:16px_16px]" />
        
        <div className="relative z-10 flex items-center gap-2 font-semibold tracking-tight text-xl">
          <div className="flex size-8 items-center justify-center rounded-lg bg-blue-600">
            <svg className="size-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          LiveStream Ops
        </div>

        <div className="relative z-10 max-w-md rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"><h2 className="text-lg font-semibold">{t('operationsCenter')}</h2><p className="mt-2 text-sm leading-relaxed text-zinc-400">{t('loginSubtitle')}</p><ul className="mt-5 space-y-3 text-sm text-zinc-300"><li>{t('calendar')}</li><li>{t('staffing')}</li><li>{t('liveMonitor')} · {t('reports')}</li></ul></div>
        <div className="relative z-10 max-w-md border-t border-zinc-800 pt-6">
          <blockquote className="space-y-2">
            <p className="text-lg text-zinc-300">
              &quot;The command center for live operational excellence. Streamlined, real-time, and resilient.&quot;
            </p>
            <footer className="text-sm text-zinc-500">LiveStream Ops</footer>
          </blockquote>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center p-6 sm:p-10 lg:p-12">
        <PageShell archetype="auth" className="w-full max-w-md flex flex-col space-y-6">
          <div className="flex flex-col space-y-2 text-left">
            <div className="lg:hidden mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-blue-600 shadow-md">
              <svg className="size-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="grid gap-6">
            {children}
          </div>
        </PageShell>
      </div>
    </div>
  )
}
