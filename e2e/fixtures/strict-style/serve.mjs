// Serve a built bundle under the host's real content security policy.
// The policy text is read from agent/overstory/server.py so the probe cannot
// drift from `SecurityHeadersMiddleware`; the per-document nonce is applied
// exactly as the middleware applies it (replace the placeholder, add the nonce
// to the inline-capable style directives, buffer and no-store each document).
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const dist = resolve(root, process.env.STRICT_STYLE_DIST ?? 'node_modules/.cache/strict-style-dist')
const port = Number(process.env.STRICT_STYLE_PORT ?? 5207)
const PLACEHOLDER = 'OVERSTORY_CSP_NONCE'

export function readDefaultPolicy(source) {
  const block = /_DEFAULT_CONTENT_SECURITY_POLICY = '; '\.join\(\s*\(([\s\S]*?)\n\s*\)\s*\)/.exec(source)
  if (!block) throw new Error('Default content security policy not found in server.py')
  const directives = []
  for (const line of block[1].split('\n')) {
    const text = line.trim()
    if (text.startsWith('#')) continue
    const match = /^(['"])(.*)\1,?$/.exec(text)
    if (match) directives.push(match[2])
  }
  if (directives.length === 0) throw new Error('Default content security policy is empty')
  return directives
}

export function withStyleNonce(directives, nonce) {
  return directives
    .map((directive) => {
      const name = directive.split(' ', 1)[0]
      const nonced = name === 'style-src' || name === 'style-src-elem'
      return nonced && !directive.includes("'unsafe-inline'") ? `${directive} 'nonce-${nonce}'` : directive
    })
    .join('; ')
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directives = readDefaultPolicy(readFileSync(join(root, 'agent/overstory/server.py'), 'utf8'))
  createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname))
    let file = join(dist, path)
    if (!file.startsWith(dist)) return void response.writeHead(403).end()
    const isAsset = existsSync(file) && statSync(file).isFile()
    if (!isAsset) file = join(dist, 'index.html')
    const headers = {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    }
    let body = readFileSync(file)
    let policy = directives.join('; ')
    if (file.endsWith('.html')) {
      const nonce = randomBytes(18).toString('base64url')
      body = Buffer.from(body.toString('utf8').replaceAll(PLACEHOLDER, nonce))
      policy = withStyleNonce(directives, nonce)
      headers['cache-control'] = 'no-store'
    }
    headers['content-security-policy'] = policy
    response.writeHead(200, headers).end(body)
  }).listen(port, '127.0.0.1')
}
