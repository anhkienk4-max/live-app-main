import { isMediaPath } from '@/lib/media/mediaViewerPolicy'

export type PublishSessionGrant = {
  sessionId: string
  shiftId: string
  mediaPath: string
  mediaOrigin: string
  whipUrl: string
  whepUrl?: string
  hlsUrl?: string
  token: string
  expiresAt: string
}

export type ViewerSessionGrant = {
  sessionId: string
  shiftId: string
  mediaPath: string
  mediaOrigin: string
  whepUrl?: string
  hlsUrl?: string
  frameUrl?: string
  token: string
  expiresAt: string
  publisherBusinessUserId?: string
}

export function buildMediaActorHeaders(actorId?: string | null): Record<string, string> {
  if (
    process.env.NODE_ENV === 'development'
    && process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
    && actorId
  ) {
    return { 'x-ada-live-actor-id': actorId }
  }
  return {}
}

export async function requestPublishSessionStart(input: {
  shiftId: string
  forceHandover?: boolean
  actorId?: string | null
}): Promise<PublishSessionGrant> {
  const response = await fetch('/api/media/publisher-session', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      ...buildMediaActorHeaders(input.actorId),
    },
    body: JSON.stringify({
      action: 'start',
      shiftId: input.shiftId,
      forceHandover: Boolean(input.forceHandover),
    }),
  })
  const payload = (await response.json().catch(() => null)) as
    | ({ ok: true } & PublishSessionGrant)
    | { ok: false; error?: { code?: string; message?: string } }
    | null

  if (!response.ok || !payload || payload.ok !== true || !isMediaPath(payload.mediaPath)) {
    const code = payload && !payload.ok ? (payload.error?.code || 'MEDIA_PUBLISH_DENIED') : 'MEDIA_PUBLISH_UNAVAILABLE'
    throw new Error(code)
  }
  return payload
}

export async function requestPublishSessionHeartbeat(input: {
  shiftId: string
  sessionId: string
  actorId?: string | null
}): Promise<PublishSessionGrant> {
  const response = await fetch('/api/media/publisher-session', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      ...buildMediaActorHeaders(input.actorId),
    },
    body: JSON.stringify({
      action: 'heartbeat',
      shiftId: input.shiftId,
      sessionId: input.sessionId,
    }),
  })
  const payload = (await response.json().catch(() => null)) as
    | ({ ok: true } & PublishSessionGrant)
    | { ok: false; error?: { code?: string } }
    | null

  if (!response.ok || !payload || payload.ok !== true || !isMediaPath(payload.mediaPath)) {
    const code = payload && !payload.ok ? (payload.error?.code || 'MEDIA_PUBLISH_REVOKED') : 'MEDIA_PUBLISH_UNAVAILABLE'
    throw new Error(code)
  }
  return payload
}

export async function requestPublishSessionStop(input: {
  shiftId: string
  sessionId?: string
  actorId?: string | null
}): Promise<void> {
  await fetch('/api/media/publisher-session', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      ...buildMediaActorHeaders(input.actorId),
    },
    body: JSON.stringify({
      action: 'stop',
      shiftId: input.shiftId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    }),
  }).catch(() => undefined)
}

export async function pushGatewayVideoFrame(input: {
  grant: PublishSessionGrant
  seq: number
  width: number
  height: number
  dataUrl: string
  signal?: AbortSignal
}): Promise<{ ok: boolean; status: number; code?: string }> {
  const response = await fetch(input.grant.whipUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.grant.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: input.grant.sessionId,
      seq: input.seq,
      width: input.width,
      height: input.height,
      timestamp: Date.now(),
      dataUrl: input.dataUrl,
    }),
    signal: input.signal,
  })
  if (response.ok) return { ok: true, status: response.status }
  const payload = (await response.json().catch(() => null)) as { error?: { code?: string } } | null
  return { ok: false, status: response.status, code: payload?.error?.code }
}

export async function deleteGatewayStream(grant: PublishSessionGrant): Promise<void> {
  await fetch(grant.whipUrl, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${grant.token}`,
    },
  }).catch(() => undefined)
}

export async function fetchPublishSessionStatus(input: {
  shiftId: string
  actorId?: string | null
  signal?: AbortSignal
}): Promise<{ active: boolean; denied?: boolean }> {
  const response = await fetch(`/api/media/publisher-session?shiftId=${encodeURIComponent(input.shiftId)}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: buildMediaActorHeaders(input.actorId),
    signal: input.signal,
  })
  if (response.status === 401 || response.status === 403) {
    return { active: false, denied: true }
  }
  if (!response.ok) return { active: false }
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; active?: boolean } | null
  return { active: Boolean(payload?.ok && payload?.active) }
}

export async function requestViewerSessionGrant(input: {
  shiftId: string
  actorId?: string | null
  signal?: AbortSignal
}): Promise<{ active: boolean; grant?: ViewerSessionGrant; deniedCode?: string }> {
  const response = await fetch('/api/media/publisher-session', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      ...buildMediaActorHeaders(input.actorId),
    },
    body: JSON.stringify({
      action: 'viewer-grant',
      shiftId: input.shiftId,
    }),
    signal: input.signal,
  })

  if (response.status === 404) {
    return { active: false }
  }
  const payload = (await response.json().catch(() => null)) as
    | ({ ok: true } & ViewerSessionGrant)
    | { ok: false; error?: { code?: string } }
    | null

  if (!response.ok || !payload || payload.ok !== true) {
    const code = payload && !payload.ok ? payload.error?.code : 'MEDIA_VIEWER_DENIED'
    if (code === 'MEDIA_SESSION_NOT_ACTIVE') return { active: false }
    return { active: false, deniedCode: code }
  }

  return { active: true, grant: payload }
}

export async function fetchAuthorizedGatewayFrame(input: {
  grant: ViewerSessionGrant
  signal?: AbortSignal
}): Promise<
  | { kind: 'frame'; seq: number; width: number; height: number; timestamp: number; dataUrl: string }
  | { kind: 'ended' }
  | { kind: 'unauthorized'; status: number }
> {
  const frameUrl = input.grant.frameUrl || `${input.grant.mediaOrigin}/${input.grant.mediaPath}/frame`
  const response = await fetch(frameUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.grant.token}`,
    },
    cache: 'no-store',
    signal: input.signal,
  })
  if (response.status === 404) return { kind: 'ended' }
  if (response.status === 401 || response.status === 403) {
    return { kind: 'unauthorized', status: response.status }
  }
  if (!response.ok) return { kind: 'ended' }
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean
    seq?: number
    width?: number
    height?: number
    timestamp?: number
    dataUrl?: string
  } | null
  if (!payload?.ok || typeof payload.dataUrl !== 'string') {
    return { kind: 'ended' }
  }
  return {
    kind: 'frame',
    seq: payload.seq ?? 0,
    width: payload.width ?? 640,
    height: payload.height ?? 360,
    timestamp: payload.timestamp ?? Date.now(),
    dataUrl: payload.dataUrl,
  }
}

export async function syncMockShiftState(input: {
  shiftId: string
  status?: 'scheduled' | 'preparing' | 'live' | 'paused' | 'completed' | 'cancelled'
  liveLink?: string
  actorId?: string | null
}): Promise<{ syncedLiveLink?: string; syncedStatus?: string } | null> {
  if (
    process.env.NODE_ENV !== 'development'
    || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'true'
  ) {
    return null
  }
  const response = await fetch('/api/media/publisher-session', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      ...buildMediaActorHeaders(input.actorId),
    },
    body: JSON.stringify({
      action: 'sync-mock-shift',
      shiftId: input.shiftId,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.liveLink !== undefined ? { liveLink: input.liveLink } : {}),
    }),
  }).catch(() => null)
  if (!response?.ok) return null
  return (await response.json().catch(() => null)) as { syncedLiveLink?: string; syncedStatus?: string } | null
}

export async function readMockShiftOverlay(input: {
  shiftId: string
  actorId?: string | null
}): Promise<{ mockLiveLink?: string; mockStatus?: string } | null> {
  if (
    process.env.NODE_ENV !== 'development'
    || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'true'
  ) {
    return null
  }
  const response = await fetch(`/api/media/publisher-session?shiftId=${encodeURIComponent(input.shiftId)}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: buildMediaActorHeaders(input.actorId),
  }).catch(() => null)
  if (!response?.ok) return null
  const payload = (await response.json().catch(() => null)) as { mockLiveLink?: string; mockStatus?: string } | null
  return payload
}
