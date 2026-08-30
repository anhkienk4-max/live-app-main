'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastProps = {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'success' | 'info'
  duration?: number
  action?: React.ReactNode
  onClose: () => void
}

export function Toast({ title, description, variant = 'default', duration, action, onClose }: ToastProps) {
  React.useEffect(() => {
    let t = duration
    if (!t) {
      if (variant === 'success') t = 5000
      else if (variant === 'info') t = 6000
      else if (variant === 'destructive') t = 8000
      else t = 5000
    }
    const timer = setTimeout(onClose, t)
    return () => clearTimeout(timer)
  }, [onClose, variant, duration])

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-md rounded-lg border shadow-lg',
        variant === 'destructive' && 'border-red-200 bg-red-50',
        variant === 'success' && 'border-green-200 bg-green-50',
        variant === 'info' && 'border-blue-200 bg-blue-50',
        variant === 'default' && 'border-gray-200 bg-white'
      )}
    >
      <div className="flex-1 p-4">
        {title && (
          <p className={cn(
            'text-sm font-semibold',
            variant === 'destructive' && 'text-red-900',
            variant === 'success' && 'text-green-900',
            variant === 'info' && 'text-blue-900',
            variant === 'default' && 'text-gray-900'
          )}>
            {title}
          </p>
        )}
        {description && (
          <p className={cn(
            'mt-1 text-sm',
            variant === 'destructive' && 'text-red-700',
            variant === 'success' && 'text-green-700',
            variant === 'info' && 'text-blue-700',
            variant === 'default' && 'text-gray-600'
          )}>
            {description}
          </p>
        )}
        {action && (
          <div className="mt-2 pointer-events-auto">
            {action}
          </div>
        )}
      </div>
      <button
        onClick={onClose}
        className="flex items-center justify-center px-4 hover:opacity-70"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

const ToastContext = React.createContext<{
  toast: (props: Omit<ToastProps, 'id' | 'onClose'>) => void
} | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastProps[]>([])

  const toast = React.useCallback((props: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { ...props, id, onClose: () => removeToast(id) }])
  }, [])

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-0 right-0 z-[9999] p-4 space-y-2 pointer-events-none">
        {toasts.map(t => (
          <Toast key={t.id} {...t} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}