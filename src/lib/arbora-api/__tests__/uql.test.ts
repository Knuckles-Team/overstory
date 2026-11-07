// spec: OVERSTORY-API-R012.3
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runUql, uqlRows } from '../uql'

const meta = { registry_digest: 'digest', api_version: 'v1' }
const session = { authenticated: true, csrf_token: 'csrf-secret' }

afterEach(() => vi.unstubAllGlobals())

describe('Arbora query.uql adapter', () => {
  it('sends UQL text and params to query.uql and projects rows', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { rows: [{ n: 1 }, 'skip'] }, meta }),
      })
    vi.stubGlobal('fetch', fetcher)
    const rows = await runUql('MATCH (n) RETURN n LIMIT 5', { a: 1 })
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/v1/ops/query.uql')
    expect(JSON.parse(String(init.body))).toEqual({ text: 'MATCH (n) RETURN n LIMIT 5', params: { a: 1 } })
    expect(rows).toEqual([{ n: 1 }])
  })

  it('projects arrays, keyed lists and single objects', () => {
    expect(uqlRows([{ a: 1 }])).toEqual([{ a: 1 }])
    expect(uqlRows({ hits: [{ a: 2 }] })).toEqual([{ a: 2 }])
    expect(uqlRows({ a: 3 })).toEqual([{ a: 3 }])
    expect(uqlRows(null)).toEqual([])
  })
})
