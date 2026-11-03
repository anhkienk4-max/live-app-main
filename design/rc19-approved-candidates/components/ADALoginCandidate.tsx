'use client'

import * as React from 'react'
import {
  Bell,
  Check,
  Eye,
  EyeOff,
  Globe,
  List,
  Lock,
  Mail,
  MessageSquare,
  Scissors,
  Sparkles,
} from 'lucide-react'

export interface ADALoginCardProps {
  email?: string
  setEmail?: (val: string) => void
  password?: string
  setPassword?: (val: string) => void
  onSubmit?: (e: React.FormEvent) => void
  isLoading?: boolean
  error?: string | null
  recoveryNotice?: string | null
  currentLanguage?: 'vi' | 'en'
  onToggleLanguage?: () => void
  onRequestAccess?: () => void
  onForgotPassword?: () => void
  onPwaClick?: () => void
  className?: string
}

export function ADALoginCandidate({
  email: controlledEmail,
  setEmail: setControlledEmail,
  password: controlledPassword,
  setPassword: setControlledPassword,
  onSubmit,
  isLoading = false,
  error = null,
  recoveryNotice = null,
  currentLanguage = 'vi',
  onToggleLanguage,
  onRequestAccess,
  onForgotPassword,
  onPwaClick,
  className = '',
}: ADALoginCardProps) {
  const [internalEmail, setInternalEmail] = React.useState('')
  const [internalPassword, setInternalPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)

  const emailValue = controlledEmail !== undefined ? controlledEmail : internalEmail
  const passwordValue = controlledPassword !== undefined ? controlledPassword : internalPassword

  const handleEmailChange = (val: string) => {
    if (setControlledEmail) setControlledEmail(val)
    else setInternalEmail(val)
  }

  const handlePasswordChange = (val: string) => {
    if (setControlledPassword) setControlledPassword(val)
    else setInternalPassword(val)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (onSubmit) onSubmit(e)
  }

  return (
    <div
      className={`min-h-screen w-full relative flex items-center justify-center p-4 overflow-hidden font-sans select-none ${className}`}
      style={{
        background: 'radial-gradient(ellipse at 15% 25%, #1d72fe 0%, #1055db 35%, #08389e 70%, #031e5c 100%)',
      }}
    >
      {/* 1. Luminous Sweeping Waves Background (Matching Reference) */}
      <div
        className="absolute -top-[25%] -left-[20%] w-[140%] h-[110%] pointer-events-none -rotate-[15deg]"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.38) 0%, rgba(96, 165, 250, 0.22) 30%, transparent 65%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-[35%] -right-[20%] w-[130%] h-[100%] pointer-events-none -rotate-[25deg]"
        style={{
          background: 'radial-gradient(ellipse at 70% 80%, rgba(56, 189, 248, 0.28) 0%, rgba(30, 64, 175, 0.35) 45%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute top-[8%] -left-[10%] w-[900px] h-[600px] rounded-full border-t-2 border-white/30 blur-[1px] pointer-events-none -rotate-[30deg]"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-[5%] -right-[10%] w-[1100px] h-[800px] rounded-full border-t-2 border-white/25 blur-[1px] pointer-events-none -rotate-[20deg]"
        aria-hidden="true"
      />

      {/* 2. Floating Action Pills on Far Right (Matching Windows Reference Frame) */}
      <div className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 flex-col gap-3.5 z-30" aria-label="System Quick Actions">
        <button
          type="button"
          aria-label="Thông báo"
          className="w-10 h-10 rounded-full bg-pink-50 text-pink-600 shadow-md flex items-center justify-center relative hover:scale-105 transition-transform"
        >
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center border-2 border-white">
            1
          </span>
        </button>
        <button
          type="button"
          aria-label="Danh sách"
          className="w-10 h-10 rounded-full bg-slate-900 text-white shadow-md flex items-center justify-center hover:scale-105 transition-transform"
        >
          <List className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          aria-label="Tính năng nâng cao"
          className="w-10 h-10 rounded-full bg-white text-blue-600 shadow-md flex items-center justify-center hover:scale-105 transition-transform"
        >
          <Sparkles className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          aria-label="Công cụ cắt dán"
          className="w-10 h-10 rounded-full bg-white text-slate-500 shadow-md flex items-center justify-center hover:scale-105 transition-transform"
        >
          <Scissors className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          aria-label="Trợ giúp & Hỗ trợ"
          className="w-10 h-10 rounded-full bg-white text-blue-600 shadow-md flex items-center justify-center hover:scale-105 transition-transform"
        >
          <MessageSquare className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* 3. Centered Frosted Glass Card - PROPORTIONALLY MATCHED TO REFERENCE */}
      <main className="w-full max-w-[470px] bg-white/90 backdrop-blur-2xl border border-white/95 rounded-[28px] p-8 sm:p-10 shadow-2xl relative z-20 flex flex-col items-center">
        {/* Official Brand Lockup */}
        <div className="flex items-center gap-3.5 mb-2.5">
          <div className="w-13 h-13 rounded-2xl bg-[#0d2144] flex items-center justify-center text-white font-extrabold text-2xl tracking-tighter shadow-md">
            ada
          </div>
          <div className="w-[1.5px] h-10 bg-[#0d2144]/30" />
          <div className="flex flex-col text-left">
            <div className="text-[22px] font-black text-[#0d2144] leading-none flex items-baseline gap-1">
              ada <span className="text-[14.5px] font-extrabold tracking-wide">OPS</span>
            </div>
            <div className="text-[9.5px] font-extrabold text-[#0d2144] tracking-[2.8px] mt-1 uppercase">
              LIVESTREAM
            </div>
          </div>
        </div>

        {/* Small Gradient Accent Underline */}
        <div
          className="w-12 h-1 rounded-full mb-5"
          style={{ background: 'linear-gradient(90deg, #1e40af 0%, #06b6d4 100%)' }}
        />

        {/* Heading */}
        <h1 className="text-2xl sm:text-[26px] font-extrabold text-slate-900 tracking-tight mb-5 text-center">
          Chào mừng trở lại!
        </h1>

        {/* Error Notice Banner */}
        {error && (
          <div
            role="alert"
            className="w-full mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center gap-2"
          >
            <span className="h-2 w-2 rounded-full bg-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Recovery Notice Banner */}
        {recoveryNotice && (
          <div
            role="status"
            className="w-full mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2"
          >
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{recoveryNotice}</span>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          {/* Email Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className="text-xs font-bold text-slate-800">
              Email
            </label>
            <div className="w-full h-11 px-3.5 rounded-lg bg-slate-100/90 border border-slate-300 flex items-center gap-2.5 focus-within:bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <Mail className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                id="login-email"
                type="email"
                required
                value={emailValue}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder="admin@adaglobal.com"
                autoComplete="username"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-xs font-bold text-slate-800">
                Mật khẩu
              </label>
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-[11.5px] font-semibold text-blue-600 hover:underline"
              >
                Quên mật khẩu?
              </button>
            </div>
            <div className="w-full h-11 px-3.5 rounded-lg bg-slate-100/90 border border-slate-300 flex items-center gap-2.5 focus-within:bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <Lock className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={passwordValue}
                onChange={(e) => handlePasswordChange(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="text-slate-400 hover:text-slate-600 p-0.5 focus-visible:outline-none"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 mt-1 rounded-lg text-white font-bold text-sm bg-gradient-to-b from-blue-700 to-blue-800 hover:from-blue-600 hover:to-blue-700 shadow-md shadow-blue-700/30 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isLoading ? (
              <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>

        {/* Card Footer Actions */}
        <div className="w-full mt-5 flex flex-col items-center gap-3 text-center">
          <div className="text-xs text-slate-600">
            Chưa có tài khoản?{' '}
            <button
              type="button"
              onClick={onRequestAccess}
              className="font-bold text-blue-700 hover:underline inline"
            >
              Yêu cầu truy cập
            </button>
          </div>

          <p className="text-[11px] text-slate-500 max-w-[360px] leading-relaxed">
            Đăng nhập Google chưa khả dụng. Vui lòng dùng email hoặc yêu cầu cấp tài khoản.
          </p>

          <button
            type="button"
            onClick={onPwaClick}
            className="w-full h-10 rounded-lg bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200 text-blue-800 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span className="w-3.5 h-3.5 rounded-xs border-2 border-blue-600 flex items-center justify-center text-[10px]"></span>
            <span>ADA OPS đã được cài trên máy</span>
          </button>

          <button
            type="button"
            onClick={onToggleLanguage}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium mt-1 cursor-pointer"
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{currentLanguage === 'vi' ? 'English' : 'Tiếng Việt'}</span>
          </button>
        </div>
      </main>
    </div>
  )
}
