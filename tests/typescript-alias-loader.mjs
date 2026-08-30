import { existsSync, readFileSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const projectRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')

function resolve(specifier, context, nextResolve) {
  // `server-only` is a Next.js build-time boundary. Node contract tests run
  // outside React Server Components, so resolve its documented empty marker.
  if (specifier === 'server-only') {
    const empty = resolvePath(projectRoot, 'node_modules/server-only/empty.js')
    if (existsSync(empty)) return { url: pathToFileURL(empty).href, shortCircuit: true }
  }
  // Node ESM requires explicit .js for next/server subpath in this Next version.
  if (specifier === 'next/server') {
    const serverJs = resolvePath(projectRoot, 'node_modules/next/server.js')
    if (existsSync(serverJs)) return { url: pathToFileURL(serverJs).href, shortCircuit: true }
  }
  let candidate
  if (specifier.startsWith('@/')) {
    candidate = resolvePath(projectRoot, specifier.slice(2))
  } else if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL?.startsWith('file:')
  ) {
    candidate = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
  }

  if (candidate) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    for (const extension of ['.ts', '.tsx', '.js', '.mjs']) {
      if (existsSync(`${candidate}${extension}`)) {
        return { url: pathToFileURL(`${candidate}${extension}`).href, shortCircuit: true }
      }
      const indexCandidate = resolvePath(candidate, `index${extension}`)
      if (existsSync(indexCandidate)) {
        return { url: pathToFileURL(indexCandidate).href, shortCircuit: true }
      }
    }
  }

  return nextResolve(specifier, context)
}

function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /\.(?:ts|tsx)$/.test(url)) {
    const filename = fileURLToPath(url)
    const source = readFileSync(filename, 'utf8')
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    })
    return { format: 'module', source: transpiled.outputText, shortCircuit: true }
  }
  return nextLoad(url, context)
}

registerHooks({ resolve, load })
