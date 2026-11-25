import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const PORT = Number(process.env.SYNTHETIC_DRIVE_PORT || '18890')
const STORAGE_DIR = path.join(os.tmpdir(), 'rc19-synthetic-drive-storage')
fs.mkdirSync(STORAGE_DIR, { recursive: true })
const MANIFEST_PATH = path.join(STORAGE_DIR, 'synthetic-manifest.json')

const REGISTRY_PATH = path.resolve('docs/storage/ADA_OPS_FOLDER_REGISTRY_20261102.json')
const registryData = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))

const files = new Map()

function saveManifest() {
  try {
    const list = Array.from(files.values())
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(list, null, 2), 'utf8')
  } catch {}
}

function loadManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      const list = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
      for (const item of list) {
        files.set(item.id, item)
      }
    }
  } catch {}
}

loadManifest()

// 1. Initialize root & app root folders
files.set('1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', {
  id: '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
  name: 'ROOT',
  mimeType: 'application/vnd.google-apps.folder',
  parents: [],
  trashed: false,
  capabilities: { canAddChildren: true, canEdit: true },
})
files.set('1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh', {
  id: '1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh',
  name: '00_ADA_OPS_PLATFORM',
  mimeType: 'application/vnd.google-apps.folder',
  parents: ['1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm'],
  trashed: false,
  capabilities: { canAddChildren: true, canEdit: true },
})

// 2. Initialize all 148 registered folders
for (const folder of registryData.folders) {
  const name = folder.path.split('/').pop()
  files.set(folder.id, {
    id: folder.id,
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [folder.parent_id],
    trashed: false,
    capabilities: { canAddChildren: true, canEdit: true },
  })
}

function parseMultipart(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`)
  const parts = []
  let start = buffer.indexOf(boundaryBuffer)
  while (start !== -1) {
    start += boundaryBuffer.length
    if (buffer.slice(start, start + 2).toString() === '--') break
    if (buffer.slice(start, start + 2).toString() === '\r\n') start += 2
    const next = buffer.indexOf(boundaryBuffer, start)
    if (next === -1) break
    const part = buffer.slice(start, next - 2)
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
    if (headerEnd !== -1) {
      const headerStr = part.slice(0, headerEnd).toString()
      const body = part.slice(headerEnd + 4)
      parts.push({ header: headerStr, body })
    }
    start = next
  }
  return parts
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const pathname = parsedUrl.pathname
  const method = req.method

  // 1. Health check
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, provider: 'synthetic-google-drive', filesCount: files.size }))
  }

  // 2. GET /drive/v3/files (List files / folders)
  if (method === 'GET' && pathname === '/drive/v3/files') {
    const q = parsedUrl.searchParams.get('q') || ''
    let results = Array.from(files.values())

    // Parse simple parent query: `'<parentId>' in parents`
    const parentMatch = /'([^']+)' in parents/.exec(q)
    if (parentMatch) {
      const parentId = parentMatch[1]
      results = results.filter(f => f.parents && f.parents.includes(parentId))
    }

    // Parse simple name query: `name = '<name>'`
    const nameMatch = /name = '([^']+)'/.exec(q)
    if (nameMatch) {
      const name = nameMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
      results = results.filter(f => f.name === name)
    }

    if (q.includes("trashed = false")) {
      results = results.filter(f => !f.trashed)
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({
      kind: 'drive#fileList',
      files: results,
    }))
  }

  // 3. GET /drive/v3/files/:id/permissions (ACL check for attendance & sensitive storage)
  const permMatch = /^\/drive\/v3\/files\/([^/?]+)\/permissions/.exec(pathname)
  if (method === 'GET' && permMatch) {
    const fileId = permMatch[1]
    const file = files.get(fileId)
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: { code: 404, message: 'File not found' } }))
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({
      kind: 'drive#permissionList',
      permissions: [
        {
          id: 'synthetic-owner-perm',
          type: 'user',
          role: 'owner',
          emailAddress: 'ops-service@ada-ops.invalid',
          inheritedPermissionsDisabled: false,
        },
      ],
    }))
  }

  // 4. GET /drive/v3/files/:id (Metadata or Media)
  const getMatch = /^\/drive\/v3\/files\/([^/?]+)$/.exec(pathname)
  if (method === 'GET' && getMatch) {
    const fileId = getMatch[1]
    let file = files.get(fileId)
    if (!file && fs.existsSync(path.join(STORAGE_DIR, fileId))) {
      const stat = fs.statSync(path.join(STORAGE_DIR, fileId))
      file = {
        id: fileId,
        name: `${fileId}.jpg`,
        mimeType: 'image/jpeg',
        parents: ['1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh'],
        size: String(stat.size),
        trashed: false,
        capabilities: { canAddChildren: true, canEdit: true },
      }
      files.set(fileId, file)
      saveManifest()
    }
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: { code: 404, message: 'File not found' } }))
    }

    // Alt=media -> stream file bytes
    if (parsedUrl.searchParams.get('alt') === 'media') {
      const filePath = path.join(STORAGE_DIR, fileId)
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: { code: 404, message: 'File payload not found' } }))
      }
      const stat = fs.statSync(filePath)
      res.writeHead(200, {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Length': stat.size,
      })
      return fs.createReadStream(filePath).pipe(res)
    }

    // Metadata
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(file))
  }

  // 4. POST /drive/v3/files (Create folder or metadata) or POST /upload/drive/v3/files (Multipart Upload)
  if (method === 'POST' && (pathname === '/drive/v3/files' || pathname === '/upload/drive/v3/files')) {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const buffer = Buffer.concat(chunks)
      const contentType = req.headers['content-type'] || ''

      let metadata = {}
      let fileBytes = null

      if (contentType.includes('multipart/related')) {
        const boundaryMatch = /boundary=([^;]+)/.exec(contentType)
        if (boundaryMatch) {
          const boundary = boundaryMatch[1].trim()
          const parts = parseMultipart(buffer, boundary)
          if (parts[0]) {
            try { metadata = JSON.parse(parts[0].body.toString()) } catch {}
          }
          if (parts[1]) {
            fileBytes = parts[1].body
            const ctMatch = /content-type:\s*([^\r\n;]+)/i.exec(parts[1].header)
            if (ctMatch && !metadata.mimeType) {
              metadata.mimeType = ctMatch[1].trim()
            }
          }
        }
      } else {
        try { metadata = JSON.parse(buffer.toString()) } catch {}
      }

      const fileId = metadata.id || `synthetic-${crypto.randomUUID()}`
      const isFolder = metadata.mimeType === 'application/vnd.google-apps.folder'

      let size = 0
      let md5 = ''
      let sha256 = ''

      if (fileBytes && !isFolder) {
        size = fileBytes.length
        md5 = crypto.createHash('md5').update(fileBytes).digest('hex')
        sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex')
        fs.writeFileSync(path.join(STORAGE_DIR, fileId), fileBytes)
      }

      const record = {
        id: fileId,
        name: metadata.name || 'untitled',
        mimeType: metadata.mimeType || (isFolder ? 'application/vnd.google-apps.folder' : 'application/octet-stream'),
        parents: metadata.parents || [],
        size: isFolder ? undefined : String(size),
        md5Checksum: isFolder ? undefined : md5,
        checksum_sha256: isFolder ? undefined : sha256,
        trashed: false,
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
        capabilities: { canAddChildren: true, canEdit: true },
      }

      files.set(fileId, record)
      saveManifest()

      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify(record))
    })
    return
  }

  // 5. DELETE /drive/v3/files/:id
  const delMatch = /^\/drive\/v3\/files\/([^/?]+)/.exec(pathname)
  if (method === 'DELETE' && delMatch) {
    const fileId = delMatch[1]
    files.delete(fileId)
    saveManifest()
    const filePath = path.join(STORAGE_DIR, fileId)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    res.writeHead(204)
    return res.end()
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: { code: 404, message: 'Not found' } }))
})

server.on('error', err => {
  console.error('[SYNTHETIC-DRIVE:SERVER-ERR]', err)
})
process.on('uncaughtException', err => {
  console.error('[SYNTHETIC-DRIVE:UNCAUGHT]', err)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[SYNTHETIC-DRIVE] Listening on http://127.0.0.1:${PORT}`)
})
