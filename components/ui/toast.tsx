'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastProps = {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'success'
  onClose: () => void
}

export function Toast({ title, description, variant = 'default', onClose }: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-md rounded-lg border shadow-lg',
        variant === 'destructive' && 'border-red-200 bg-red-50',
        variant === 'success' && 'border-green-200 bg-green-50',
        variant === 'default' && 'border-gray-200 bg-white'
      )}
    >
      <div className="flex-1 p-4">
        {title && (
          <p className={cn(
            'text-sm font-semibold',
            variant === 'destructive' && 'text-red-900',
            variant === 'success' && 'text-green-900',
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
            variant === 'default' && 'text-gray-600'
          )}>
            {description}
          </p>
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
      <div className="fixed bottom-0 right-0 z-50 p-4 space-y-2 pointer-events-none">
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