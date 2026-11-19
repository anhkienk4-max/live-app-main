'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined = undefined

export function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient()
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()
  const { currentUser } = useCurrentUser()
  const permission = resolveSystemPermission(currentUser)
  const actorBoundaryRef = React.useRef<string | null>(null)

  // Critical Security: Actor/Role Cache Boundary Isolation
  // If the active actor ID or permission changes, purge all cached queries immediately.
  // This guarantees zero cross-actor data leakage across sign-in, sign-out, or role switches.
  React.useEffect(() => {
    const currentActorKey = currentUser?.id ? `${currentUser.id}:${permission}` : null
    if (actorBoundaryRef.current !== null && actorBoundaryRef.current !== currentActorKey) {
      queryClient.clear()
    }
    actorBoundaryRef.current = currentActorKey
  }, [currentUser?.id, permission, queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
