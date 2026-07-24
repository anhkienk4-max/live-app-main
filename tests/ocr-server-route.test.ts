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
  formData.set('image', new File([new Uint8Array([137, 80, 78, 71])], 'dashboard.png', {
    type: 'image/png',
  }))
  formData.set('platform', 'shopee_live')
  formData.set('crop', JSON.stringify({ left: 0.23, top: 0.18, width: 0.46, height: 0.42 }))
  return new Request('http://localhost/api/ocr', {
    method: 'POST',
    body: formData,
  })
}

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
  await assertServerFailure(await handler(multipartRequest()))
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
