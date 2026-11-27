// spec: OVERSTORY-APPS-R054
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HostLogRefusal, readHostLogs, referenceHostLogs, refusalFor } from '@/lib/host-logs'

const record = {
  host_instance: 'host-1',
  sequence: 1,
  request: 'origin-request',
  timestamp: 1.5,
  severity: 'info',
  message: 'held-text',
}

function answer(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

afterEach(() => vi.unstubAllGlobals())

describe('host-logs client', () => {
  it('version_2_batch_and_refusals', async () => {
    expect(refusalFor(409, { detail: 'retention_gap' }).kind).toBe('retention_gap')
    expect(refusalFor(403, { detail: 'workspace_denied' }).kind).toBe('workspace_denied')
    expect(refusalFor(503, { detail: 'log_unavailable' }).kind).toBe('unavailable')
    expect(refusalFor(409, { detail: 'other' }).kind).toBe('unavailable')

    vi.stubGlobal('fetch', answer(200, { version: 2, records: [record], cursor: 'c1', gap: false }))
    const batch = await readHostLogs('secret', 'ref', null)
    expect(batch.records[0]).toEqual(record)

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
    const init = calls[0][1] as RequestInit
    expect(calls[0][0]).toBe('/host/logs/read')
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(init.body as string)).toEqual({ version: 2, log_ref: 'ref', cursor: null, limit: 128 })
  })

  it('rejects a record that lacks host metadata', async () => {
    const partial = { ...record, severity: undefined }
    vi.stubGlobal('fetch', answer(200, { version: 2, records: [partial], cursor: null, gap: false }))
    await expect(readHostLogs('secret', 'ref', null)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('a refusal carries no log content', async () => {
    vi.stubGlobal('fetch', answer(409, { detail: 'retention_gap' }))
    const error = await readHostLogs('secret', 'ref', 'old').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HostLogRefusal)
    expect(JSON.stringify(error)).not.toContain('held-text')
  })

  it('reference returns the log_ref only', async () => {
    vi.stubGlobal('fetch', answer(200, { log_ref: 'r1', endpoint: 'x', ready: true }))
    await expect(referenceHostLogs('secret')).resolves.toBe('r1')
  })
})
