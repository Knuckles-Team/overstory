// spec: OVERSTORY-API-R012
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listFleetServices } from '../fleet'

const meta = { registry_digest: 'digest', api_version: 'v1' }
const session = { authenticated: true, csrf_token: 'csrf-secret' }

afterEach(() => vi.unstubAllGlobals())

describe('Arbora fleet status', () => {
  it('lists the fleet child names reported by fleet.status, sorted', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { value: { children: { 'gitlab-api': {}, 'github-agent': {} }, session: null } },
          meta,
        }),
      })
    vi.stubGlobal('fetch', fetcher)
    await expect(listFleetServices()).resolves.toEqual(['github-agent', 'gitlab-api'])
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/ops/fleet.status')
  })

  it('refuses a status result with no children map', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, result: { value: {} }, meta }) })
    vi.stubGlobal('fetch', fetcher)
    await expect(listFleetServices()).rejects.toThrow('API shape violation')
  })
})
