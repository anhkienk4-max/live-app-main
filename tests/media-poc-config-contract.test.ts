import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const mediaConfig = readFileSync('infra/media-poc/mediamtx.yml', 'utf8')
const compose = readFileSync('infra/media-poc/compose.yaml', 'utf8')
const nginx = readFileSync('infra/media-poc/nginx-hls.conf.example', 'utf8')

test('MediaMTX PoC uses JWT with no unauthenticated publish/read exclusions', () => {
  assert.match(mediaConfig, /^authMethod:\s*jwt\s*$/m)
  assert.match(mediaConfig, /^authJWTJWKS:\s*https:\/\//m)
  assert.match(mediaConfig, /^authJWTIssuer:\s*https:\/\//m)
  assert.match(mediaConfig, /^authJWTAudience:\s*ada-media-monitor\s*$/m)
  assert.match(mediaConfig, /^authJWTExclude:\s*\[\]\s*$/m)
  assert.doesNotMatch(mediaConfig, /^authInternalUsers:/m)
})

test('MediaMTX PoC enforces RTMPS and keeps HLS private behind reverse proxy', () => {
  assert.match(mediaConfig, /^rtmpEncryption:\s*strict\s*$/m)
  assert.match(mediaConfig, /^rtmpsAddress:\s*:1936\s*$/m)
  assert.match(mediaConfig, /^hls:\s*true\s*$/m)
  assert.match(mediaConfig, /^hlsEncryption:\s*false\s*$/m)
  assert.match(mediaConfig, /^hlsAllowOrigins:\s*\["https:\/\/ops5729\.top"\]\s*$/m)
  assert.match(compose, /"127\.0\.0\.1:8888:8888\/tcp"/)
  assert.doesNotMatch(compose, /["']8888:8888/)
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:8888;/)
  assert.match(nginx, /proxy_set_header Authorization \$http_authorization;/)
  assert.match(nginx, /proxy_cache off;/)
})

test('MediaMTX PoC does not record media or expose remote control/protocol ports', () => {
  assert.match(mediaConfig, /^\s*record:\s*false\s*$/m)
  assert.match(mediaConfig, /^hlsDirectory:\s*""\s*$/m)
  for (const key of ['api','metrics','pprof','webrtc','rtsp','srt','moq','playback']) {
    assert.match(mediaConfig, new RegExp('^'+key+':\\s*false\\s*$', 'm'))
  }
  assert.match(mediaConfig, /^paths:\s*\n\s+studio_poc_01:\s*\n\s+source:\s*publisher/m)
  assert.doesNotMatch(mediaConfig, /^\s*all_others:/m)
  assert.doesNotMatch(compose, /"9997:9997|"8889:8889|"8189:8189/)
})
