/** Offline host allowlist for the explicit, read-only RC19 Production UAT. */
export const RC19_PRODUCTION_ORIGIN = 'https://ops5729.top'
export const RC19_PRODUCTION_SUPABASE_REF = 'egdjnpmoasarrttvhgds'
const allowedExternalResourceHosts = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])

export type Rc19ProductionUatHostRejection = 'UNAUTHORIZED_APP_HOST' | 'UNAUTHORIZED_SUPABASE_PROJECT' | 'UNAUTHORIZED_EXTERNAL_HOST' | null

export function classifyRc19ProductionUatHost(requestUrl: URL): Rc19ProductionUatHostRejection {
  const hostname = requestUrl.hostname.toLowerCase()
  if (hostname.endsWith('.supabase.co')) {
    return requestUrl.origin === `https://${RC19_PRODUCTION_SUPABASE_REF}.supabase.co` ? null : 'UNAUTHORIZED_SUPABASE_PROJECT'
  }
  if (hostname === 'ops5729.top' || hostname.endsWith('.ops5729.top') || hostname.endsWith('.vercel.app')) {
    return requestUrl.origin === RC19_PRODUCTION_ORIGIN ? null : 'UNAUTHORIZED_APP_HOST'
  }
  return requestUrl.protocol === 'https:'
    && requestUrl.port === ''
    && allowedExternalResourceHosts.has(hostname)
    && requestUrl.origin === `https://${hostname}`
    ? null
    : 'UNAUTHORIZED_EXTERNAL_HOST'
}
