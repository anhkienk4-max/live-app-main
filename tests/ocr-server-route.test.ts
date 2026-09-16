import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createOcrPostHandler,
  type OcrServerDependencies,
} from '../lib/server/ocrRouteHandler.ts'

const serverFailure = {
  ok: false,
  error: {
    code: 'OCR_SERVER_FAILED',
    message: 'Server OCR unavailable; local browser OCR fallback was used.',
  },
}

function multipartRequest() {
  const formData = new FormData()
  formData.set('image', new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'dashboard.png', {
    type: 'image/png',
  }))
  formData.set('platform', 'shopee_live')
  formData.set('crop', JSON.stringify({ left: 0.23, top: 0.18, width: 0.46, height: 0.42 }))
  return new Request('http://localhost/api/ocr', {
    method: 'POST',
    body: formData,
  })
}

test('empty and unverified images are rejected before OCR dependencies load', async () => {
  let dependencyLoads = 0
  const handler = createOcrPostHandler({
    serverOcrEnabled: () => true,
    loadDependencies: async () => {
      dependencyLoads += 1
      throw new Error('must not load')
    },
  })

  const empty = new FormData()
  empty.set('image', new File([], 'empty.png', { type: 'image/png' }))
  empty.set('platform', 'shopee_live')
  const emptyResponse = await handler(new Request('http://localhost/api/ocr', { method: 'POST', body: empty }))
  assert.equal(emptyResponse.status, 422)
  assert.equal((await emptyResponse.json()).error.code, 'INVALID_IMAGE')

  const unverified = new FormData()
  unverified.set('image', new File([new Uint8Array([1, 2, 3])], 'fake.png', { type: 'image/png' }))
  unverified.set('platform', 'shopee_live')
  const unverifiedResponse = await handler(new Request('http://localhost/api/ocr', { method: 'POST', body: unverified }))
  assert.equal(unverifiedResponse.status, 422)
  assert.equal((await unverifiedResponse.json()).error.code, 'INVALID_IMAGE')

  const unsupported = new FormData()
  unsupported.set('image', new File([new Uint8Array([1])], 'image.gif', { type: 'image/gif' }))
  unsupported.set('platform', 'shopee_live')
  const unsupportedResponse = await handler(new Request('http://localhost/api/ocr', { method: 'POST', body: unsupported }))
  assert.equal(unsupportedResponse.status, 415)
  assert.equal((await unsupportedResponse.json()).error.code, 'UNSUPPORTED_FILE')

  const oversized = new FormData()
  oversized.set('image', new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))
  oversized.set('platform', 'shopee_live')
  const oversizedResponse = await handler(new Request('http://localhost/api/ocr', { method: 'POST', body: oversized }))
  assert.equal(oversizedResponse.status, 413)
  assert.equal((await oversizedResponse.json()).error.code, 'IMAGE_TOO_LARGE')
  assert.equal(dependencyLoads, 0)
})

async function assertServerFailure(response: Response) {
  assert.equal(response.status, 503)
  assert.match(response.headers.get('content-type') || '', /application\/json/)
  assert.doesNotMatch(response.headers.get('content-type') || '', /text\/html/)
  assert.deepEqual(await response.json(), serverFailure)
}

test('disabled Vercel server OCR returns JSON 503 without loading native dependencies', async () => {
  let dependencyLoads = 0
  const handler = createOcrPostHandler({
    serverOcrEnabled: () => false,
    loadDependencies: async () => {
      dependencyLoads += 1
      throw new Error('must not load')
    },
  })

  await assertServerFailure(await handler(multipartRequest()))
  assert.equal(dependencyLoads, 0)
})

test('OCR dependency loading failure is caught and returned as JSON', async () => {
  const handler = createOcrPostHandler({
    serverOcrEnabled: () => true,
    loadDependencies: async () => {
      throw new Error('simulated native module load failure')
    },
  })
  await assertServerFailure(await handler(multipartRequest()))
})

test('multipart formData parsing failure is caught and returned as JSON', async () => {
  const handler = createOcrPostHandler({
    serverOcrEnabled: () => true,
  })
  const request = {
    formData: async () => {
      throw new Error('simulated multipart failure')
    },
  } as unknown as Request
  await assertServerFailure(await handler(request))
})

test('image decode failure is caught and returned as JSON', async () => {
  const dependencies = {
    sharp: (() => ({
      metadata: async () => {
        throw new Error('simulated image decode failure')
      },
    })) as unknown as OcrServerDependencies['sharp'],
  } as OcrServerDependencies
  const handler = createOcrPostHandler({
    serverOcrEnabled: () => true,
    loadDependencies: async () => dependencies,
  })
  const response = await handler(multipartRequest())
  assert.equal(response.status, 422)
  assert.equal((await response.json()).error.code, 'INVALID_IMAGE')
})

test('worker initialization failure is caught and returned as JSON', async () => {
  const pipeline: Record<string, unknown> = {}
  for (const method of ['extract', 'resize', 'grayscale', 'normalize', 'sharpen', 'linear', 'threshold', 'png']) {
    pipeline[method] = () => pipeline
  }
  pipeline.metadata = async () => ({ width: 100, height: 100 })
  pipeline.toBuffer = async () => Buffer.from('processed-image')
  const sharp = (() => pipeline) as unknown as OcrServerDependencies['sharp']
  sharp.kernel = { lanczos3: 'lanczos3' } as typeof sharp.kernel

  const dependencies = {
    sharp,
    createWorker: async () => {
      throw new Error('simulated worker initialization failure')
    },
    OEM: { LSTM_ONLY: 1 },
    PSM: { SPARSE_TEXT: '11', SINGLE_LINE: '7' },
    englishData: { langPath: 'eng-model' },
    vietnameseData: { langPath: 'vie-model' },
    copyFile: async () => undefined,
    mkdir: async () => undefined,
    tmpdir: () => 'tmp',
    join: (...parts: string[]) => parts.join('/'),
  } as unknown as OcrServerDependencies
  const handler = createOcrPostHandler({
    serverOcrEnabled: () => true,
    loadDependencies: async () => dependencies,
  })
  await assertServerFailure(await handler(multipartRequest()))
})

test('empty OCR output is a controlled non-success response', async () => {
  const pipeline: Record<string, unknown> = {}
  for (const method of ['extract', 'resize', 'grayscale', 'normalize', 'sharpen', 'linear', 'threshold', 'png', 'negate']) {
    pipeline[method] = () => pipeline
  }
  pipeline.metadata = async () => ({ width: 100, height: 100 })
  pipeline.toBuffer = async () => Buffer.from('processed-image')
  const sharp = (() => pipeline) as unknown as OcrServerDependencies['sharp']
  sharp.kernel = { lanczos3: 'lanczos3' } as typeof sharp.kernel
  const worker = {
    setParameters: async () => undefined,
    recognize: async () => ({ data: { text: '', confidence: 0, blocks: [] } }),
    terminate: async () => undefined,
  }
  const dependencies = {
    sharp,
    createWorker: async () => worker,
    OEM: { LSTM_ONLY: 1 },
    PSM: { SPARSE_TEXT: '11', SINGLE_LINE: '7' },
    englishData: { langPath: 'eng-model' },
    vietnameseData: { langPath: 'vie-model' },
    copyFile: async () => undefined,
    mkdir: async () => undefined,
    tmpdir: () => 'tmp',
    join: (...parts: string[]) => parts.join('/'),
  } as unknown as OcrServerDependencies
  const handler = createOcrPostHandler({
    serverOcrEnabled: () => true,
    loadDependencies: async () => dependencies,
  })
  const response = await handler(multipartRequest())
  assert.equal(response.status, 422)
  assert.equal((await response.json()).error.code, 'OCR_NO_TEXT')
})

test('worker recognition timeout is returned as a controlled JSON error', async () => {
  const pipeline: Record<string, unknown> = {}
  for (const method of ['extract', 'resize', 'grayscale', 'normalize', 'sharpen', 'linear', 'threshold', 'png']) {
    pipeline[method] = () => pipeline
  }
  pipeline.metadata = async () => ({ width: 100, height: 100 })
  pipeline.toBuffer = async () => Buffer.from('processed-image')
  const sharp = (() => pipeline) as unknown as OcrServerDependencies['sharp']
  sharp.kernel = { lanczos3: 'lanczos3' } as typeof sharp.kernel
  let terminated = 0
  const worker = {
    setParameters: async () => undefined,
    recognize: async () => new Promise<never>(() => undefined),
    terminate: async () => { terminated += 1 },
  }
  const dependencies = {
    sharp,
    createWorker: async () => worker,
    OEM: { LSTM_ONLY: 1 },
    PSM: { SPARSE_TEXT: '11', SINGLE_LINE: '7' },
    englishData: { langPath: 'eng-model' },
    vietnameseData: { langPath: 'vie-model' },
    copyFile: async () => undefined,
    mkdir: async () => undefined,
    tmpdir: () => 'tmp',
    join: (...parts: string[]) => parts.join('/'),
  } as unknown as OcrServerDependencies
  const handler = createOcrPostHandler({
    serverOcrEnabled: () => true,
    loadDependencies: async () => dependencies,
    timeoutMs: 5,
  })
  const response = await handler(multipartRequest())
  assert.equal(response.status, 504)
  assert.equal((await response.json()).error.code, 'OCR_TIMEOUT')
  assert.equal(terminated, 1)
})
