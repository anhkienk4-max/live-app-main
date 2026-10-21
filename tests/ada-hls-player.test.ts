import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
const player=readFileSync('components/features/live/AdaHlsPlayer.tsx','utf8')
const panel=readFileSync('components/features/live/LiveStreamPanel.tsx','utf8')
const pkg=JSON.parse(readFileSync('package.json','utf8'))
const lock=readFileSync('pnpm-lock.yaml','utf8')

test('gated OBS viewer appears only on LIVE shift without external iframe',()=>{
 assert.match(player,/NEXT_PUBLIC_MEDIA_PLAYER_UI_ENABLED==='true'/)
 assert.match(panel,/<AdaHlsPlayer key=\{shift.id/)
 assert.match(panel,/isLive=\{shift.status === 'live'\}/)
 assert.match(player,/if\(!gateEnabled\|\|!isLive\)return null/)
 assert.doesNotMatch(player,/<iframe/)
})
test('hls.js exact dependency is locked, lazily imported and signs every resource request',()=>{
 assert.equal(pkg.dependencies['hls.js'],'1.7.3')
 assert.match(lock,/hls\.js@1\.7\.3:/)
 assert.match(player,/const \{default:Hls\}=await import\('hls.js'\)/)
 assert.match(player,/xhrSetup:\(xhr,url\)=>/)
 assert.match(player,/mediaAuthorizationHeader\(url,grant\)/)
 assert.match(player,/xhr.setRequestHeader\('Authorization',bearer\)/)
})
test('JWTs stay in volatile ref, stop on revoked grant, no browser storage',()=>{
 assert.match(player,/JSON.stringify\(\{shiftId\}\)/)
 assert.match(player,/credentials:'same-origin'/)
 assert.match(player,/redirect:'error'/)
 assert.match(player,/previous&&fresh.mediaUrl!==previous.mediaUrl/)
 assert.match(player,/renew\(\)\.catch/)
 assert.match(player,/grantRef.current=null/)
 assert.match(player,/requestRef.current\?\.abort/)
 assert.doesNotMatch(player,/localStorage|sessionStorage|document.cookie/)
})
test('original TikTok/Shopee external viewer and local tab capture remain intact',()=>{
 assert.match(panel,/LiveTabCapture/)
 assert.match(panel,/open-official-live/)
 assert.match(panel,/open-live-side-window/)
})
