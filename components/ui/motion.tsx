'use client'

import * as React from 'react'
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type HTMLMotionProps,
  type Transition,
} from 'motion/react'

export { motion, AnimatePresence }

export const defaultTransition: Transition = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
}

export function FadeIn({
  children,
  className,
  delay = 0,
  ...props
}: HTMLMotionProps<'div'> & { delay?: number }) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -8 }}
      transition={{ ...defaultTransition, delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export function SlideUp({
  children,
  className,
  delay = 0,
  ...props
}: HTMLMotionProps<'div'> & { delay?: number }) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
      transition={{ ...defaultTransition, delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.05,
  ...props
}: HTMLMotionProps<'div'> & { staggerDelay?: number }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      exit="hidden"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
  ...props
}: HTMLMotionProps<'div'>) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
        show: { opacity: 1, y: 0, transition: defaultTransition },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function LivePulseDot({ className }: { className?: string }) {
  return (
    <span className={`relative flex h-2.5 w-2.5 ${className ?? ''}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  )
}

export function AnimatedNumber({
  value,
  formatter = (v) => v.toLocaleString(),
  className,
}: {
  value: number
  formatter?: (val: number) => string
  className?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const [displayValue, setDisplayValue] = React.useState(value)
  const prevValueRef = React.useRef(value)

  React.useEffect(() => {
    if (shouldReduceMotion) return
    const startVal = prevValueRef.current
    const targetVal = value
    prevValueRef.current = value
    if (startVal === targetVal) return

    let startTimestamp: number | null = null
    const duration = 600

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startVal + (targetVal - startVal) * easeProgress)
      setDisplayValue(current)
      if (progress < 1) {
        requestAnimationFrame(step)
      }
    }
    const frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, shouldReduceMotion])

  if (shouldReduceMotion) {
    return <span className={className}>{formatter(value)}</span>
  }

  return <span className={className}>{formatter(displayValue)}</span>
}
