// spec: OVERSTORY-API-R012
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteMemory, writeMemory } from '../memory'

const meta = { registry_digest: 'digest', api_version: 'v1' }
const session = { authenticated: true, csrf_token: 'csrf-secret' }

afterEach(() => vi.unstubAllGlobals())

function stubOperation(result: unknown) {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => session })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, result, meta }) })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

describe('Arbora memory operations', () => {
  it('writes through memory.write with the key, value and an idempotency key', async () => {
    const fetcher = stubOperation({ value: { content: 'a' }, version: 1 })
    await writeMemory('mem_1', { content: 'a' })
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/v1/ops/memory.write')
    expect(JSON.parse(String(init.body))).toEqual({ key: 'mem_1', value: { content: 'a' } })
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy()
  })

  it('deletes through memory.delete', async () => {
    const fetcher = stubOperation({ deleted: true })
    await deleteMemory('mem_1')
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/v1/ops/memory.delete')
    expect(JSON.parse(String(init.body))).toEqual({ key: 'mem_1' })
  })
})
