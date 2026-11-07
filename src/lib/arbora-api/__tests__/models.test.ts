// spec: OVERSTORY-API-R012.8
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listModels } from '../models'

const meta = { registry_digest: 'digest', api_version: 'v1' }
const session = { authenticated: true, csrf_token: 'csrf-secret' }

afterEach(() => vi.unstubAllGlobals())

describe('Arbora models.list adapter', () => {
  it('non-admin session lists chat models through models.list', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { value: { kind: 'chat', models: [{ id: 'm1', provider: 'p' }] } },
          meta,
        }),
      })
    vi.stubGlobal('fetch', fetcher)
    const rows = await listModels('chat')
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/v1/ops/models.list')
    expect(JSON.parse(String(init.body))).toEqual({ kind: 'chat' })
    expect(rows).toEqual([{ id: 'm1', provider: 'p' }])
  })

  it('asks for embedding models by kind', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { value: { kind: 'embedding', models: [] } }, meta }),
      })
    vi.stubGlobal('fetch', fetcher)
    expect(await listModels('embedding')).toEqual([])
    expect(JSON.parse(String((fetcher.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({
      kind: 'embedding',
    })
  })
})
