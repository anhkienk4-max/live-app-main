'use client'
import { useCallback, useRef } from 'react'

export function useRequestSequence() {
  const sequence = useRef(0)
  const next = useCallback(() => ++sequence.current, [])
  const isCurrent = useCallback((request: number) => request === sequence.current, [])
  const invalidate = useCallback(() => { sequence.current++ }, [])
  return { next, isCurrent, invalidate }
}
