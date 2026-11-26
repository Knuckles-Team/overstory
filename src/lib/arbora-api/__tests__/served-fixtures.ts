/**
 * Recorded served envelopes for operations that answer with a result or with
 * `UNAVAILABLE` (the engine behind them is not pinned yet). The shapes follow
 * the pinned operation schema and arbora's refusal envelope.
 */
export const servedMeta = { registry_digest: 'registry-digest', api_version: 'v1' }

export function servedOk(result: unknown): { status: number; body: unknown } {
  return { status: 200, body: { ok: true, result, meta: servedMeta } }
}

export function servedRefusal(
  code: string,
  status: number,
  details: Record<string, unknown> = {},
): { status: number; body: unknown } {
  return {
    status,
    body: {
      ok: false,
      error: { code, source: 'arbora', message: code, retryable: status === 503, details },
      meta: servedMeta,
    },
  }
}

export function servedUnavailable(reason = 'engine result malformed'): { status: number; body: unknown } {
  return servedRefusal('UNAVAILABLE', 503, { reason })
}

/** Stub `fetch`: the browser session first, then one queued reply per operation call. */
export function stubServed(replies: { status: number; body: unknown }[], tenant = 'tenant-a') {
  const queue = [...replies]
  const calls: { url: string; body: unknown }[] = []
  const fetcher = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/auth/session'))
      return Promise.resolve(Response.json({ authenticated: true, csrf_token: 'session-csrf', tenant }))
    const next = queue.shift()
    if (!next) throw new Error('no more stubbed operation replies')
    calls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
    return Promise.resolve(Response.json(next.body, { status: next.status }))
  }
  return { fetcher, calls }
}
