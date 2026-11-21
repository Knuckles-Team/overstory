import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendGraphEdit } from '@/lib/graph-edit'
import { encodeMsgpack } from '@/lib/msgpack-lite'

const meta = { registry_digest: 'digest', api_version: 'v1' }

function stubOps(handler: (op: string, body: Record<string, unknown>) => { status: number; body: unknown }) {
  const fetcher = vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/auth/session')
      return { ok: true, status: 200, json: async () => ({ authenticated: true, csrf_token: 't' }) }
    const op = path.replace('/api/v1/ops/', '')
    const reply = handler(op, JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body }
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
const ok = (result: unknown) => ({ status: 200, body: { ok: true, result, meta } })
const fail = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { ok: false, error: { code, source: 'engine', message: 'x', retryable: false, details }, meta },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendGraphEdit', () => {
  // spec: OVERSTORY-APPS-R030.2
  it('test_send_returns_engine_verdict', async () => {
    const calls: [string, Record<string, unknown>][] = []
    stubOps((op, body) => {
      calls.push([op, body])
      return ok({})
    })
    const added = await sendGraphEdit({ kind: 'add', labels: ['Concept'], properties: { name: 'a' } })
    expect(added).toMatchObject({ verdict: 'applied' })
    expect(added.id).toMatch(/^node_/)
    const removed = await sendGraphEdit({ kind: 'delete', id: 'n1' })
    expect(removed).toEqual({ verdict: 'applied', reason: '', id: 'n1' })
    expect(calls.map(([op]) => op)).toEqual(['eg.graph.AddNode', 'eg.graph.RemoveNode'])
    expect(calls[0][1]).toEqual({
      node_id: added.id,
      properties_msgpack: encodeMsgpack({ name: 'a', labels: ['Concept'] }),
    })
    expect(calls[1][1]).toEqual({ node_id: 'n1' })
  })

  it('returns the engine refusal, not a local decision', async () => {
    stubOps(() => fail(403, 'ACCESS_DENIED', { message: 'node:write is required' }))
    const result = await sendGraphEdit({ kind: 'delete', id: 'n1' })
    expect(result.verdict).toBe('refused')
    expect(result.reason).toBe('ACCESS_DENIED: node:write is required')
  })

  it('reads not available when the operation is absent or unreachable, and never guesses an update', async () => {
    stubOps(() => fail(404, 'UNKNOWN_OP'))
    expect(await sendGraphEdit({ kind: 'delete', id: 'n1' })).toEqual({
      verdict: 'unavailable',
      reason: 'not available',
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    expect((await sendGraphEdit({ kind: 'delete', id: 'n1' })).verdict).toBe('unavailable')
  })
})

describe('sendGraphEdit update', () => {
  it('uses the typed compare-and-set of node fields', async () => {
    const calls: [string, Record<string, unknown>][] = []
    stubOps((op, body) => {
      calls.push([op, body])
      return ok(true)
    })
    const result = await sendGraphEdit({ kind: 'update', id: 'n1', properties: { a: 1 }, expected: { a: 0 } })
    expect(result).toEqual({ verdict: 'applied', reason: '', id: 'n1' })
    expect(calls).toEqual([
      [
        'eg.graph.CompareAndSetNodeFields',
        { node_id: 'n1', conditions_msgpack: encodeMsgpack({ a: 0 }), updates_msgpack: encodeMsgpack({ a: 1 }) },
      ],
    ])
  })

  it('reports a conflict when the engine finds the expected values changed', async () => {
    stubOps(() => ok(false))
    const result = await sendGraphEdit({ kind: 'update', id: 'n1', properties: { a: 1 }, expected: { a: 0 } })
    expect(result.verdict).toBe('refused')
    expect(result.reason).toMatch(/^CONFLICT/)
  })
})

describe('encodeMsgpack', () => {
  it('encodes maps, strings, arrays and numbers as MessagePack', () => {
    expect(encodeMsgpack({ a: 1 })).toEqual([0x81, 0xa1, 0x61, 0x01])
    expect(encodeMsgpack(['x', null, true, -1])).toEqual([0x94, 0xa1, 0x78, 0xc0, 0xc3, 0xff])
    expect(encodeMsgpack(1.5)).toEqual([0xcb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0])
  })
})
