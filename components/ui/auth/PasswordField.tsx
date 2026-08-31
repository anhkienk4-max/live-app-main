'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  labelToggleShow?: string
  labelToggleHide?: string
  error?: boolean
}

export function PasswordField({
  labelToggleShow = 'Show password',
  labelToggleHide = 'Hide password',
  error,
  className,
  ...props
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = React.useState(false)

  return (
    <div className="relative">
      <Input
        type={showPassword ? 'text' : 'password'}
        aria-invalid={error}
        className={`h-11 pr-11 ${className || ''}`}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1.5 size-8 text-muted-foreground hover:text-foreground"
        aria-label={showPassword ? labelToggleHide : labelToggleShow}
        onClick={() => setShowPassword((prev) => !prev)}
      >
        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  )
}
