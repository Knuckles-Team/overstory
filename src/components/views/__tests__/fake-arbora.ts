import { vi } from 'vitest'
import { servedMeta } from '@/lib/arbora-api/__tests__/served-fixtures'

/**
 * A stateful in-process stand-in for arbora's ops endpoint that answers with
 * the recorded served shapes. It is keyed by the session tenant so a journey
 * can prove that a second tenant sees nothing of the first. It replaces the
 * network, not arbora's contract: every body is validated by the real client.
 */
export type OpHandler = (params: Record<string, unknown>, tenant: string) => unknown

export function installFakeArbora(handlers: Record<string, OpHandler>, tenant = 'tenant-a') {
  const calls: { op: string; params: Record<string, unknown>; tenant: string }[] = []
  let current = tenant
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/session'))
        return Promise.resolve(Response.json({ authenticated: true, csrf_token: 'session-csrf', tenant: current }))
      const op = url.replace('/api/v1/ops/', '')
      const params = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
      calls.push({ op, params, tenant: current })
      const handler = handlers[op]
      if (!handler) throw new Error(`unhandled operation ${op}`)
      return Promise.resolve(Response.json({ ok: true, result: handler(params, current), meta: servedMeta }))
    }),
  )
  return {
    calls,
    signInAs(next: string) {
      current = next
    },
  }
}
