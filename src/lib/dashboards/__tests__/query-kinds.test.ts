import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/arbora-api/invoke', () => ({ invoke: invokeMock }))

import { QuerySchema } from '../model'
import { runPanelQuery } from '../query'
import { runEgOp, runFleetCall, runNlQuery } from '../query-kinds'

const signal = new AbortController().signal

// spec: OVERSTORY-DASH-R005
describe('query_kinds', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('runs a natural-language query through eg.query.NlQuery', async () => {
    invokeMock.mockResolvedValue({ rows: [{ name: 'a', total: 3 }] })
    const outcome = await runNlQuery({ kind: 'nl', text: 'how many agents' }, signal)
    expect(invokeMock).toHaveBeenCalledWith('eg.query.NlQuery', { text: 'how many agents' }, expect.anything(), {
      signal,
    })
    expect(outcome).toEqual({
      state: 'ok',
      data: { columns: ['name', 'total'], rows: [{ name: 'a', total: 3 }] },
    })
  })

  it('runs fleet.call with the server, tool and arguments', async () => {
    invokeMock.mockResolvedValue({ value: [{ host: 'h1' }] })
    const outcome = await runFleetCall(
      { kind: 'fleet-call', server: 'inventory', tool: 'list_hosts', arguments: { limit: 5 } },
      signal,
    )
    expect(invokeMock).toHaveBeenCalledWith(
      'fleet.call',
      { server: 'inventory', tool: 'list_hosts', arguments: { limit: 5 } },
      expect.anything(),
      { signal },
    )
    expect(outcome.state).toBe('ok')
  })

  it('runs a named eg.query operation and reports an empty answer honestly', async () => {
    invokeMock.mockResolvedValue({ rows: [] })
    const outcome = await runEgOp({ kind: 'eg-op', op: 'eg.query.Uql', params: { text: 'x' } }, signal)
    expect(invokeMock).toHaveBeenCalledWith('eg.query.Uql', { text: 'x' }, expect.anything(), { signal })
    expect(outcome).toEqual({ state: 'empty', note: 'The query returned no rows.' })
  })

  it('dispatches from runPanelQuery by kind', async () => {
    invokeMock.mockResolvedValue({ rows: [{ a: 1 }] })
    const outcome = await runPanelQuery({ query: { kind: 'nl', text: 'q' } }, [], signal)
    expect(outcome.state).toBe('ok')
    expect(invokeMock).toHaveBeenCalledWith('eg.query.NlQuery', { text: 'q' }, expect.anything(), { signal })
  })

  it('refuses arguments that fail the strict schema, before any call', async () => {
    expect(QuerySchema.safeParse({ kind: 'eg-op', op: 'eg.storage.Delete', params: {} }).success).toBe(false)
    expect(QuerySchema.safeParse({ kind: 'fleet-call', server: 'a b', tool: 't' }).success).toBe(false)
    expect(QuerySchema.safeParse({ kind: 'nl', text: 'q', extra: 1 }).success).toBe(false)
    await expect(runEgOp({ kind: 'eg-op', op: 'eg.storage.Delete', params: {} } as never, signal)).rejects.toThrow()
    const outcome = await runPanelQuery(
      { query: { kind: 'eg-op', op: 'eg.storage.Delete', params: {} } as never },
      [],
      signal,
    )
    expect(outcome.state).toBe('error')
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
