import * as React from 'react'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-zinc-50">
      {/* Visual / Brand Side (Hidden on Mobile) */}
      <div className="relative hidden w-full lg:flex lg:w-1/2 flex-col justify-between bg-zinc-950 p-12 text-zinc-50">
        <div className="relative z-10 flex items-center gap-3 font-semibold tracking-tight text-xl">
          <div className="flex size-10 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
            <svg className="size-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          LiveStream Ops
        </div>

        <div className="relative z-10 max-w-md">
          <blockquote className="space-y-4">
            <p className="text-xl leading-relaxed text-zinc-300 font-medium">
              "The command center for live operational excellence. Streamlined, real-time, and resilient."
            </p>
            <footer className="text-sm font-medium text-zinc-500 uppercase tracking-wider">LiveStream Ops System V1.1</footer>
          </blockquote>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center p-6 sm:p-8 lg:p-12 bg-white lg:bg-zinc-50">
        <div className="w-full max-w-[400px]">
          {children}
        </div>
      </div>
    </div>
  )
}
