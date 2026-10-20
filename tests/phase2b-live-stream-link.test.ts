import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { verifyLiveStreamLink } from '../lib/utils/liveStreamLink.ts'

test('official TikTok/Shopee live links are safe to open and identify source', () => {
  for (const [url,platform] of [
    ['https://www.tiktok.com/@brand/live','TikTok'],
    ['https://vt.tiktok.com/ZSHARE/','TikTok'],
    ['https://vm.tiktok.com/ZSHARE/','TikTok'],
    ['https://live.shopee.vn/share?from=live&session=123','Shopee'],
    ['https://shopee.vn/m/live','Shopee'],
    ['https://s.shopee.vn/ABcDef','Shopee'],
  ] as const) {
    const result = verifyLiveStreamLink(url)
    assert.equal(result?.href,url)
    assert.equal(result?.platform,platform)
  }
})

test('rejects invalid, injected, non-HTTPS and untrusted livestream destinations', () => {
  for (const url of [
    null,undefined,'', ' https://www.tiktok.com/@brand/live',
    'javascript:alert(1)','http://www.tiktok.com/@brand/live',
    'https://tiktok.com.evil.example/@brand/live',
    'https://evil.tiktok.com/@brand/live',
    'https://tiktok.com@attacker.example',
    'https://user:pass@tiktok.com/@brand/live',
    'https://tiktok.com:8443/@brand/live',
    'https://localhost/',
    'https://live.shopee.vn.evil.example/live',
    'https://shopee.vn@evil.example/live',
    'data:text/html,%3Cscript%3E',
    'https://www.tiktok.com/@brand/live\n',
    'x'.repeat(2100),
  ]) assert.equal(verifyLiveStreamLink(url),null,`should reject ${String(url).slice(0,80)}`)
})

test('link captured via editable shift form, rendered per shift in monitor with external fallback', () => {
  const form=readFileSync('components/features/shifts/ShiftFormDialog.tsx','utf8')
  const consoleCode=readFileSync('components/features/live/LiveOperationsConsole.tsx','utf8')
  const panel=readFileSync('components/features/live/LiveStreamPanel.tsx','utf8')
  assert.match(form,/data-testid="shift-live-link-input"/)
  assert.match(form,/live_link: formData\.live_link\.trim\(\)/)
  assert.match(form,/verifyLiveStreamLink\(formData\.live_link\.trim\(\)\)/)
  assert.match(consoleCode,/<LiveStreamPanel key=/)
  assert.match(panel,/data-testid="live-stream-panel"/)
  assert.match(panel,/data-testid="monitor-live-link-input"/)
  assert.match(panel,/data-testid="save-monitor-live-link"/)
  assert.match(panel,/shiftService\.update\(shift\.id, \{ live_link: value, version: shift\.version \}\)/)
  const modal=readFileSync('components/features/live/LiveSessionModal.tsx','utf8')
  assert.match(modal,/onStreamLinkSaved=\{saved => onUpdate\(saved\)\}/)
  assert.match(panel,/data-testid="open-official-live"/)
  assert.match(panel,/rel="noopener noreferrer"/)
  assert.match(panel,/data-testid="open-live-side-window"/)
  assert.match(panel,/data-testid="live-embed-unavailable"/)
  assert.match(panel,/window\.open\(link\.href, '_blank'/)
  assert.doesNotMatch(panel, /<iframe|src=\{link\.href\}/)
  assert.doesNotMatch(panel, /toggle-live-preview|Thử xem trong Monitor/)
  assert.doesNotMatch(panel, /dangerouslySetInnerHTML/)
})

test('live polling does not reload static directories and pauses while document is hidden', () => {
  const source=readFileSync('components/features/live/LiveMonitoringDashboard.tsx','utf8')
  const start=source.indexOf('  const loadData = React.useCallback')
  const end=source.indexOf('  React.useEffect(() => {\n    const frame',start)
  assert.ok(start>0&&end>start)
  const polling=source.slice(start,end)
  assert.match(polling,/shiftService\.getLivePage\(/)
  assert.match(polling,/controller\.signal/)
  assert.doesNotMatch(polling,/brandService\.getAll|platformService\.getAll|campaignService\.getAll|userService\.getAll|getOperationalReferences/)
  assert.match(source,/getOperationalReferences\(currentUser\)/)
  assert.match(source,/document\.visibilityState!=='visible'/)
  assert.match(source,/document\.addEventListener\('visibilitychange',resume\)/)
  assert.match(source,/window\.addEventListener\('focus',resume\)/)
  assert.match(source,/liveController\.current\?\.abort\(\)/)
  assert.match(source,/invalidatePageCache\(\)/)
})
