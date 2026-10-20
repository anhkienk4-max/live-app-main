/**
 * Live links are user-supplied. Only verified TikTok/Shopee HTTPS destinations
 * may be linked or embedded. A valid link does NOT prove the session is live.
 */
export type LivePlatform = 'TikTok' | 'Shopee'
export type VerifiedLiveLink = { href: string; platform: LivePlatform }

const TIKTOK_HOSTS = new Set([
  'tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com',
  'vt.tiktok.com', 'live.tiktok.com',
])
const SHOPEE_HOSTS = new Set([
  'shopee.vn', 'www.shopee.vn', 'live.shopee.vn', 's.shopee.vn',
  'shopee.com', 'www.shopee.com', 'live.shopee.com',
])

export function verifyLiveStreamLink(raw: string | null | undefined): VerifiedLiveLink | null {
  if (!raw || raw.length > 2048 || raw.trim() !== raw || /[\u0000-\u001f\u007f]/.test(raw)) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const hostname = url.hostname.toLowerCase()
    const platform = TIKTOK_HOSTS.has(hostname) ? 'TikTok' : SHOPEE_HOSTS.has(hostname) ? 'Shopee' : null
    if (!platform) return null
    return { href: url.href, platform }
  } catch {
    return null
  }
}
