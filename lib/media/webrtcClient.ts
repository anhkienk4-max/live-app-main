/**
 * WebRTC WHIP / WHEP client for ADA Monitor real-time livestream sharing (#189).
 * Implements IETF WebRTC HTTP Ingestion Protocol (WHIP) and WebRTC HTTP Egress Protocol (WHEP)
 * compatible with MediaMTX and modern WebRTC media servers.
 */

export interface WhipPublishOptions {
  stream: MediaStream
  whipUrl: string
  token: string
  iceServers?: RTCIceServer[]
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
  signal?: AbortSignal
}

export interface WhipPublisherHandle {
  pc: RTCPeerConnection
  locationUrl: string
  connectionState: RTCPeerConnectionState
  stop: () => Promise<void>
}

export interface WhepSubscribeOptions {
  whepUrl: string
  token: string
  iceServers?: RTCIceServer[]
  onTrack: (track: MediaStreamTrack, stream: MediaStream) => void
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
  signal?: AbortSignal
}

export interface WhepSubscriberHandle {
  pc: RTCPeerConnection
  locationUrl: string
  connectionState: RTCPeerConnectionState
  stop: () => Promise<void>
}

export function isWebRtcSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection !== 'undefined'
}

/**
 * Initiates an actual WebRTC WHIP publication to the media gateway.
 * Publishes both video and audio tracks (if present).
 */
export async function publishWhipSession(options: WhipPublishOptions): Promise<WhipPublisherHandle> {
  if (!isWebRtcSupported()) {
    throw new Error('WEBRTC_UNSUPPORTED')
  }

  const iceServers = options.iceServers ?? [
    { urls: 'stun:stun.l.google.com:19302' },
  ]

  const pc = new RTCPeerConnection({ iceServers })

  // Attach all tracks from the captured MediaStream (video + optional tab audio)
  options.stream.getTracks().forEach(track => {
    pc.addTrack(track, options.stream)
  })

  // Create WebRTC Offer
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  // Wait for ICE gathering to complete or timeout after 1500ms
  if (pc.iceGatheringState !== 'complete') {
    await new Promise<void>(resolve => {
      const onIce = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', onIce)
          resolve()
        }
      }
      pc.addEventListener('icegatheringstatechange', onIce)
      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', onIce)
        resolve()
      }, 1500)
    })
  }

  const sdpOffer = pc.localDescription?.sdp
  if (!sdpOffer) {
    pc.close()
    throw new Error('SDP_OFFER_FAILED')
  }

  // Send WHIP HTTP POST to MediaMTX
  const response = await fetch(options.whipUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sdp',
      Authorization: `Bearer ${options.token}`,
    },
    body: sdpOffer,
    signal: options.signal,
  })

  if (response.status === 409) {
    pc.close()
    throw new Error('DUPLICATE_ACTIVE_PUBLISHER')
  }
  if (response.status === 401 || response.status === 403) {
    pc.close()
    throw new Error('MEDIA_PERMISSION_DENIED')
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    pc.close()
    throw new Error(`WHIP_OFFER_FAILED: ${response.status} ${text}`)
  }

  const locationHeader = response.headers.get('location')
  const locationUrl = locationHeader
    ? new URL(locationHeader, options.whipUrl).href
    : options.whipUrl

  const answerSdp = await response.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

  pc.onconnectionstatechange = () => {
    options.onConnectionStateChange?.(pc.connectionState)
  }

  let stopped = false
  return {
    pc,
    locationUrl,
    get connectionState() {
      return pc.connectionState
    },
    async stop() {
      if (stopped) return
      stopped = true
      try {
        await fetch(locationUrl, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${options.token}`,
          },
        }).catch(() => undefined)
      } finally {
        pc.close()
      }
    },
  }
}

/**
 * Initiates an actual WebRTC WHEP subscription from the media gateway.
 * Subscribes to video and audio tracks with sub-second latency.
 */
export async function subscribeWhepSession(options: WhepSubscribeOptions): Promise<WhepSubscriberHandle> {
  if (!isWebRtcSupported()) {
    throw new Error('WEBRTC_UNSUPPORTED')
  }

  const iceServers = options.iceServers ?? [
    { urls: 'stun:stun.l.google.com:19302' },
  ]

  const pc = new RTCPeerConnection({ iceServers })

  // Request video and audio tracks
  pc.addTransceiver('video', { direction: 'recvonly' })
  pc.addTransceiver('audio', { direction: 'recvonly' })

  pc.ontrack = event => {
    const stream = event.streams[0] ?? new MediaStream([event.track])
    options.onTrack(event.track, stream)
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  if (pc.iceGatheringState !== 'complete') {
    await new Promise<void>(resolve => {
      const onIce = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', onIce)
          resolve()
        }
      }
      pc.addEventListener('icegatheringstatechange', onIce)
      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', onIce)
        resolve()
      }, 1500)
    })
  }

  const sdpOffer = pc.localDescription?.sdp
  if (!sdpOffer) {
    pc.close()
    throw new Error('SDP_OFFER_FAILED')
  }

  // Send WHEP HTTP POST to MediaMTX
  const response = await fetch(options.whepUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sdp',
      Authorization: `Bearer ${options.token}`,
    },
    body: sdpOffer,
    signal: options.signal,
  })

  if (response.status === 404) {
    pc.close()
    throw new Error('MEDIA_SESSION_NOT_ACTIVE')
  }
  if (response.status === 401 || response.status === 403) {
    pc.close()
    throw new Error('MEDIA_VIEWER_DENIED')
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    pc.close()
    throw new Error(`WHEP_OFFER_FAILED: ${response.status} ${text}`)
  }

  const locationHeader = response.headers.get('location')
  const locationUrl = locationHeader
    ? new URL(locationHeader, options.whepUrl).href
    : options.whepUrl

  const answerSdp = await response.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

  pc.onconnectionstatechange = () => {
    options.onConnectionStateChange?.(pc.connectionState)
  }

  let stopped = false
  return {
    pc,
    locationUrl,
    get connectionState() {
      return pc.connectionState
    },
    async stop() {
      if (stopped) return
      stopped = true
      try {
        await fetch(locationUrl, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${options.token}`,
          },
        }).catch(() => undefined)
      } finally {
        pc.close()
      }
    },
  }
}

/**
 * Generates an RFC-compliant synthetic WebRTC SDP offer string with video and audio m-lines.
 * Useful for automated Node.js protocol verification without a headless browser window.
 */
export function generateSyntheticSdpOffer(options: {
  sessionId?: string
  ufrag?: string
  pwd?: string
  includeAudio?: boolean
} = {}): string {
  const sessId = options.sessionId ?? '1234567890123456'
  const ufrag = options.ufrag ?? 'ada_ufrag_01'
  const pwd = options.pwd ?? 'ada_pwd_01234567890123456'
  const audio = options.includeAudio ?? true

  const lines = [
    'v=0',
    `o=- ${sessId} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    'a=group:BUNDLE 0' + (audio ? ' 1' : ''),
    'a=msid-semantic: WMS *',
    // Video m-line
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'c=IN IP4 0.0.0.0',
    'a=rtcp:9 IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    'a=ice-options:trickle',
    'a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF',
    'a=setup:actpass',
    'a=mid:0',
    'a=sendonly',
    'a=rtcp-mux',
    'a=rtpmap:96 H264/90000',
    'a=fmtp:96 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
  ]

  if (audio) {
    lines.push(
      // Audio m-line
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'c=IN IP4 0.0.0.0',
      'a=rtcp:9 IN IP4 0.0.0.0',
      `a=ice-ufrag:${ufrag}`,
      `a=ice-pwd:${pwd}`,
      'a=ice-options:trickle',
      'a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF',
      'a=setup:actpass',
      'a=mid:1',
      'a=sendonly',
      'a=rtcp-mux',
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=10;useinbandfec=1',
    )
  }

  return lines.join('\r\n') + '\r\n'
}
