'use client'

import * as React from 'react'

export interface ADASplashProps {
  message?: string
  progress?: number
  ariaLabel?: string
  className?: string
}

export function ADASplashCandidate({
  message,
  progress,
  ariaLabel = 'Đang tải hệ thống ADA OPS Livestream',
  className = '',
}: ADASplashProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={`min-h-screen w-full relative flex items-center justify-center overflow-hidden font-sans select-none bg-white ${className}`}
      style={{
        background: 'radial-gradient(circle at 50% 50%, #ffffff 0%, #f4f8fd 55%, #e3effa 100%)',
      }}
    >
      {/* 1. Corner Light Wave Ribbons */}
      <div
        className="absolute -top-[20%] -left-[15%] w-[850px] h-[700px] rounded-[48%] pointer-events-none -rotate-[10deg] blur-[2px]"
        style={{
          background: 'linear-gradient(135deg, rgba(191, 219, 254, 0.45) 0%, rgba(224, 242, 254, 0.15) 60%, transparent 80%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute -top-[10%] -left-[10%] w-[750px] h-[500px] rounded-full border-b-2 border-blue-300/45 blur-[1px] pointer-events-none -rotate-[18deg]"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-[25%] -right-[15%] w-[950px] h-[750px] rounded-[46%] pointer-events-none -rotate-[8deg] blur-[2px]"
        style={{
          background: 'linear-gradient(315deg, rgba(186, 230, 253, 0.45) 0%, rgba(219, 234, 254, 0.15) 55%, transparent 75%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-[10%] -right-[8%] w-[800px] h-[550px] rounded-full border-t-2 border-blue-300/45 blur-[1px] pointer-events-none -rotate-[15deg]"
        aria-hidden="true"
      />

      {/* 2. Central Massive Orbital System (~80% Viewport Height) */}
      <div className="relative w-[700px] h-[700px] flex items-center justify-center max-w-[90vw] max-h-[90vw]">
        {/* Outer Orbital Ring with Low-Power GPU-accelerated Rotation */}
        <div
          className="absolute w-[680px] h-[680px] rounded-full border border-blue-200/65 pointer-events-none will-change-transform animate-[spin_40s_linear_infinite] motion-reduce:animate-none"
          aria-hidden="true"
        >
          {/* Luminous Glowing Arcs */}
          <div
            className="absolute inset-0 rounded-full border-[2.5px] border-transparent border-t-sky-400 border-r-sky-400 rotate-[20deg]"
            style={{ filter: 'drop-shadow(0 0 10px #38bdf8)' }}
          />
          <div
            className="absolute inset-0 rounded-full border-[2.5px] border-transparent border-b-sky-400 border-l-sky-400 rotate-[15deg]"
            style={{ filter: 'drop-shadow(0 0 10px #38bdf8)' }}
          />

          {/* 3D Cyan Glowing Spheres positioned along the orbit */}
          {/* Top-Right (~55 deg) */}
          <div
            className="absolute w-8.5 h-8.5 rounded-full -top-1 right-28 shadow-lg"
            style={{
              background: 'radial-gradient(circle at 35% 35%, #67e8f9 0%, #06b6d4 40%, #0284c7 80%, #0369a1 100%)',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.75), 0 4px 10px rgba(2, 132, 199, 0.4)',
            }}
          />

          {/* Bottom-Left (~220 deg) */}
          <div
            className="absolute w-8.5 h-8.5 rounded-full -bottom-1 left-24 shadow-lg"
            style={{
              background: 'radial-gradient(circle at 35% 35%, #67e8f9 0%, #06b6d4 40%, #0284c7 80%, #0369a1 100%)',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.75), 0 4px 10px rgba(2, 132, 199, 0.4)',
            }}
          />

          {/* Medium Top-Left Sphere */}
          <div
            className="absolute w-5 h-5 rounded-full top-36 -left-1"
            style={{
              background: 'radial-gradient(circle at 35% 35%, #7dd3fc 0%, #38bdf8 50%, #0284c7 100%)',
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.6)',
            }}
          />

          {/* Medium Bottom-Right Sphere */}
          <div
            className="absolute w-4.5 h-4.5 rounded-full bottom-36 -right-1"
            style={{
              background: 'radial-gradient(circle at 35% 35%, #7dd3fc 0%, #38bdf8 50%, #0284c7 100%)',
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.6)',
            }}
          />

          {/* Medium Top Sphere */}
          <div
            className="absolute w-4 h-4 rounded-full -top-1.5 left-1/2 -translate-x-1/2"
            style={{
              background: 'radial-gradient(circle at 35% 35%, #bae6fd 0%, #38bdf8 60%, #0284c7 100%)',
              boxShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
            }}
          />
        </div>

        {/* Inner Orbital Ring */}
        <div
          className="absolute w-[520px] h-[520px] rounded-full border border-blue-200/70 pointer-events-none"
          aria-hidden="true"
        />

        {/* Neomorphic Center Embossed Circle */}
        <div
          className="absolute w-[480px] h-[480px] rounded-full border border-white/90 flex items-center justify-center z-10"
          style={{
            background: 'radial-gradient(circle at 45% 40%, #ffffff 0%, #f9fbfe 60%, #e8f2fc 100%)',
            boxShadow:
              '0 20px 50px rgba(37, 99, 235, 0.12), 0 4px 14px rgba(0, 0, 0, 0.04), inset 0 2px 6px rgba(255, 255, 255, 0.9), inset 0 -4px 10px rgba(219, 234, 254, 0.5)',
          }}
        >
          {/* Recessed Inner Circle */}
          <div
            className="w-[340px] h-[340px] rounded-full flex items-center justify-center"
            style={{
              background: 'radial-gradient(circle at 50% 50%, #ffffff 0%, #f4f8fe 80%, #ebf4fd 100%)',
              boxShadow: 'inset 0 2px 8px rgba(37, 99, 235, 0.06)',
            }}
          >
            {/* Center Logo Lockup (ada | ada OPS LIVESTREAM) */}
            <div className="flex items-center gap-4 z-20">
              <div className="w-23 h-23 rounded-3xl bg-[#0d2144] flex items-center justify-center text-white font-extrabold text-4xl tracking-tighter shadow-xl">
                ada
              </div>
              <div className="w-0.5 h-16 bg-[#0d2144]/35" />
              <div className="flex flex-col text-left">
                <div className="text-[42px] font-black text-[#0d2144] leading-none flex items-baseline gap-2">
                  ada <span className="text-[26px] font-black tracking-wide">OPS</span>
                </div>
                <div className="text-[15px] font-extrabold text-[#0d2144] tracking-[5.5px] mt-1.5 uppercase">
                  LIVESTREAM
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Optional Loading Indicator / Progress Text */}
      {(message || progress !== undefined) && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-30">
          {message && <div className="text-xs font-semibold text-slate-600">{message}</div>}
          {progress !== undefined && (
            <div className="w-48 h-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
