import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isTrustedAccessUrl } from '@/lib/files/trustedAccessUrl'

test('RC19 U08 Security: isTrustedAccessUrl blocks data:, blob:, script injection and untrusted hosts', () => {
  // Rejects falsy or non-string
  assert.equal(isTrustedAccessUrl(''), false)
  assert.equal(isTrustedAccessUrl(null), false)
  assert.equal(isTrustedAccessUrl(undefined), false)

  // Rejects pseudo-protocols and script injection
  assert.equal(isTrustedAccessUrl('javascript:alert(1)'), false)
  assert.equal(isTrustedAccessUrl('vbscript:msgbox(1)'), false)
  assert.equal(isTrustedAccessUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), false)
  assert.equal(isTrustedAccessUrl('blob:https://drive.google.com/00000000-0000-0000-0000-000000000000'), false)
  assert.equal(isTrustedAccessUrl('file:///etc/passwd'), false)

  // Rejects unencrypted HTTP
  assert.equal(isTrustedAccessUrl('http://drive.google.com/file/d/123'), false)
  assert.equal(isTrustedAccessUrl('http://onedrive.live.com/file'), false)

  // Rejects raw IPs and localhost
  assert.equal(isTrustedAccessUrl('https://127.0.0.1/file.pdf'), false)
  assert.equal(isTrustedAccessUrl('https://localhost:3000/api/files'), false)
  assert.equal(isTrustedAccessUrl('https://192.168.1.100/secret.docx'), false)

  // Rejects untrusted arbitrary external domains
  assert.equal(isTrustedAccessUrl('https://evil-phishing.com/drive.google.com'), false)
  assert.equal(isTrustedAccessUrl('https://attacker.site/malware.exe'), false)
})

test('RC19 U08 Security: isTrustedAccessUrl accepts internal API routes and verified cloud providers', () => {
  // Accepts internal backend API routes
  assert.equal(isTrustedAccessUrl('/api/operational-files?file_id=123'), true)
  assert.equal(isTrustedAccessUrl('/api/operational-files/download?id=abc'), true)
  assert.equal(isTrustedAccessUrl('/api/report-artifacts?file_id=456'), true)

  // Accepts Google Drive domains
  assert.equal(isTrustedAccessUrl('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view'), true)
  assert.equal(isTrustedAccessUrl('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit', 'google_drive'), true)
  // But rejects Google Drive link when expecting OneDrive
  assert.equal(isTrustedAccessUrl('https://drive.google.com/file/d/123', 'onedrive'), false)

  // Accepts Microsoft OneDrive & SharePoint domains
  assert.equal(isTrustedAccessUrl('https://acme-my.sharepoint.com/:x:/r/personal/user/Documents/report.xlsx', 'onedrive'), true)
  assert.equal(isTrustedAccessUrl('https://onedrive.live.com/?id=root&cid=123', 'onedrive'), true)
  assert.equal(isTrustedAccessUrl('https://onedrive.com/view.aspx?id=123', 'onedrive'), true)
  assert.equal(isTrustedAccessUrl('https://1drv.ms/u/s!ApyZxyz', 'onedrive'), true)
  // But rejects OneDrive link when expecting Google Drive
  assert.equal(isTrustedAccessUrl('https://1drv.ms/u/s!ApyZxyz', 'google_drive'), false)

  // Accepts Supabase storage domain
  assert.equal(isTrustedAccessUrl('https://xyzproject.supabase.co/storage/v1/object/public/reports/file.csv'), true)
})

test('RC19 U08 Storage Route: Workspace differentiates system-wide routes from scope route verification', () => {
  const content = readFileSync('components/features/storage/OperationalFileWorkspace.tsx', 'utf8')

  // Verifies separation of system route count from scope route status
  assert.match(content, /Routes hệ thống:.*?route CSDL/i, 'Workspace must clearly label system-wide routes')
  assert.match(content, /Route scope:/i, 'Workspace must explicitly indicate scope route status')
  assert.match(content, /Chưa xác minh \(Fail-closed\)/i, 'Workspace must remain fail-closed when scope route is unverified')
  assert.match(content, /Chưa đủ ngữ cảnh/i, 'Workspace must indicate incomplete scope')

  // Verifies isTrustedAccessUrl is imported and used for download and folder links
  assert.match(content, /import.*isTrustedAccessUrl.*from '@\/lib\/files\/trustedAccessUrl'/, 'Workspace must import isTrustedAccessUrl')
  assert.match(content, /isTrustedAccessUrl\(item\.access_url, item\.provider\)/, 'Table view must guard access_url with isTrustedAccessUrl')
  assert.match(content, /isTrustedAccessUrl\(inspectItem\.access_url, inspectItem\.provider\)/, 'Modal inspect must guard access_url with isTrustedAccessUrl')
  assert.match(content, /isTrustedAccessUrl\(folderUrl, provider\)/, 'Attach modal must guard folderUrl with isTrustedAccessUrl')
})
