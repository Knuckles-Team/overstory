// spec: OVERSTORY-API-R012
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchRetrieval } from '../retrieval'

const meta = { registry_digest: 'digest', api_version: 'v1' }
const session = { authenticated: true, csrf_token: 'csrf-secret' }

afterEach(() => vi.unstubAllGlobals())

describe('Arbora retrieval search', () => {
  it('sends the query to retrieval.search and returns the hits', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { value: { tenant: 't', hits: [{ ref: 'r1', text: 'one', tokens: 2 }] } },
          meta,
        }),
      })
    vi.stubGlobal('fetch', fetcher)
    await expect(searchRetrieval('fans')).resolves.toEqual([{ ref: 'r1', text: 'one', tokens: 2 }])
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/v1/ops/retrieval.search')
    expect(JSON.parse(String(init.body))).toEqual({ query: 'fans' })
  })

  it('refuses a result without hits', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, result: { value: {} }, meta }) })
    vi.stubGlobal('fetch', fetcher)
    await expect(searchRetrieval('fans')).rejects.toThrow('API shape violation')
  })
})
