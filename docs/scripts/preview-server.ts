import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildMarkdownRelativePath, isAssetPath, preferredMarkdown } from '../src/server/markdown-negotiation.ts'

/**
 * Netlify Dev only runs edge functions when it proxies to a user-provided
 * origin. The Netlify adapter also disables `astro preview`
 * (https://github.com/withastro/astro/issues/13180), so we spin up this tiny
 * Node server to serve `dist/` with the right markdown MIME type. That lets the
 * edge handler run locally during docs preview, mirroring production.
 */

interface PreviewOptions {
  readonly port: number | undefined
  readonly host: string | undefined
}

const parseArgs = (argv: string[]): PreviewOptions => {
  let port: number | undefined
  let host: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg == null) continue

    if (arg === '--port' || arg === '-p') {
      const value = argv[index + 1]
      if (value !== undefined) {
        port = Number.parseInt(value, 10)
        index += 1
      }
      continue
    }
    if (arg.startsWith('--port=') === true) {
      port = Number.parseInt(arg.split('=')[1] ?? '', 10)
      continue
    }

    if (arg === '--host') {
      host = argv[index + 1]
      index += 1
      continue
    }
    if (arg.startsWith('--host=') === true) {
      host = arg.split('=')[1]
    }
  }

  return { port: Number.isNaN(port ?? Number.NaN) === true ? undefined : port, host }
}

const ensureWithinDist = (distDir: string, relativePath: string): string | undefined => {
  const normalized = normalize(relativePath)
  const absolutePath = join(distDir, normalized)
  if (absolutePath.startsWith(distDir) === false) {
    return undefined
  }
  return absolutePath
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    const stats = await stat(path)
    return stats.isFile()
  } catch (_error) {
    return false
  }
}

const directoryExists = async (path: string): Promise<boolean> => {
  try {
    const stats = await stat(path)
    return stats.isDirectory()
  } catch (_error) {
    return false
  }
}

const resolveStaticRelative = async (distDir: string, pathname: string): Promise<string | undefined> => {
  const decoded = decodeURIComponent(pathname)
  const stripped = decoded.replace(/^\/+/, '')
  const candidates = new Set<string>()

  if (stripped === '') {
    candidates.add('index.html')
  } else {
    candidates.add(stripped)
    if (stripped.endsWith('/') === true) {
      candidates.add(`${stripped}index.html`)
    } else {
      const withIndex = `${stripped}/index.html`
      const withHtml = stripped.endsWith('.html') === true ? stripped : `${stripped}.html`
      candidates.add(withIndex)
      candidates.add(withHtml)
    }
  }

  for (const candidate of candidates) {
    const absolutePath = ensureWithinDist(distDir, candidate)
    if (absolutePath !== undefined && (await fileExists(absolutePath)) === true) {
      return candidate
    }
  }
  return undefined
}

type PreviewFile = {
  readonly absolutePath: string
  readonly headers: Record<string, string>
}

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const createMarkdownFile = async (distDir: string, url: URL): Promise<PreviewFile | undefined> => {
  const relativeMarkdownPath = buildMarkdownRelativePath(url)
  const absolutePath = ensureWithinDist(distDir, relativeMarkdownPath)
  if (absolutePath === undefined) {
    return undefined
  }
  if ((await fileExists(absolutePath)) === false) {
    return undefined
  }

  return {
    absolutePath,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
    },
  }
}

const createStaticFile = async (distDir: string, relativePath: string): Promise<PreviewFile | undefined> => {
  const absolutePath = ensureWithinDist(distDir, relativePath)
  if (absolutePath === undefined) {
    return undefined
  }
  if ((await fileExists(absolutePath)) === false) {
    return undefined
  }

  const contentType = contentTypes[extname(absolutePath)]

  return {
    absolutePath,
    headers: contentType === undefined ? {} : { 'Content-Type': contentType },
  }
}

const writeFileResponse = (response: ServerResponse, file: PreviewFile, isHeadRequest: boolean): void => {
  response.writeHead(200, file.headers)
  if (isHeadRequest === true) {
    response.end()
    return
  }

  createReadStream(file.absolutePath)
    .on('error', (error) => {
      console.error('Preview server failed to stream file:', error)
      if (response.headersSent === false) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      }
      response.end('Internal Server Error')
    })
    .pipe(response)
}

const docsRoot = fileURLToPath(new URL('..', import.meta.url))

const startServer = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2))
  const distDir = join(docsRoot, 'dist')
  if ((await directoryExists(distDir)) === false) {
    console.error(
      'Docs dist folder not found. Run `vp run -w docs:build` first or pass `--build` to the preview command.',
    )
    process.exit(1)
  }

  const port = args.port ?? Number.parseInt(process.env.PORT ?? '8888', 10)
  const host = args.host ?? '127.0.0.1'

  const server = createServer((request, response) => {
    void (async () => {
      try {
        const method = request.method?.toUpperCase() ?? 'GET'
        const isHeadRequest = method === 'HEAD'
        if (method !== 'GET' && isHeadRequest === false) {
          response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
          response.end('Method Not Allowed')
          return
        }

        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${String(port)}`}`)
        const acceptHeader = Array.isArray(request.headers.accept)
          ? request.headers.accept.join(',')
          : (request.headers.accept ?? null)
        if (isAssetPath(url.pathname) === false && preferredMarkdown(acceptHeader) === true) {
          const markdownFile = await createMarkdownFile(distDir, url)
          if (markdownFile !== undefined) {
            writeFileResponse(response, markdownFile, isHeadRequest)
            return
          }
        }

        const staticPath = await resolveStaticRelative(distDir, url.pathname)
        if (staticPath !== undefined) {
          const staticFile = await createStaticFile(distDir, staticPath)
          if (staticFile !== undefined) {
            writeFileResponse(response, staticFile, isHeadRequest)
            return
          }
        }

        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Not Found')
      } catch (error) {
        console.error('Preview server encountered an unexpected error:', error)
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Internal Server Error')
      }
    })()
  })

  server.listen(port, host)

  const address = await new Promise<NonNullable<ReturnType<typeof server.address>>>((resolve) => {
    server.once('listening', () => {
      resolve(server.address()!)
    })
  })
  const resolvedPort = typeof address === 'string' ? port : address.port
  const previewUrl = `http://${host}:${String(resolvedPort)}`
  console.log(`Docs preview running at ${previewUrl}`)
  console.log('Press Ctrl+C to stop the server.')

  await new Promise<void>((resolve, reject) => {
    server.once('close', resolve)
    server.once('error', reject)
  })
}

await startServer()
