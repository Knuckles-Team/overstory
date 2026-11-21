// spec: OVERSTORY-APPS-R004
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readRun, TERMINATION_LABELS, TERMINATION_REASONS, terminationLabel } from '@/lib/run-read'

const meta = { registry_digest: 'digest', api_version: 'v1' }

function stubOps(results: Record<string, unknown>) {
  const fetcher = vi.fn().mockImplementation(async (path: string) => {
    if (path === '/auth/session')
      return { ok: true, status: 200, json: async () => ({ authenticated: true, csrf_token: 't' }) }
    const op = path.replace('/api/v1/ops/', '')
    if (!(op in results)) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { value: results[op] }, meta }) }
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('run read', () => {
  // spec: OVERSTORY-APPS-R004.1
  it('run read goes through the arbora read operations', async () => {
    const fetcher = stubOps({
      'runs.get': {
        termination_reason: 'stuck',
        harness_config: { plan_scaffold: 'todo' },
        peak_context_tokens: 900,
        context_budget_tokens: 1000,
        cost_usd: 0.5,
      },
    })
    const read = await readRun('run-1')
    const paths = fetcher.mock.calls.map((call) => String(call[0])).filter((path) => path !== '/auth/session')
    expect(paths).toEqual(['/api/v1/ops/runs.get'])
    for (const call of fetcher.mock.calls.filter((c) => String(c[0]) !== '/auth/session'))
      expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ run_id: 'run-1' })
    expect(read).toMatchObject({
      terminationReason: 'stuck',
      peakContextTokens: 900,
      contextBudgetTokens: 1000,
      costUsd: 0.5,
    })
  })

  // spec: OVERSTORY-APPS-R004.5
  it('each termination reason has its own label and overflow and stuck are not a generic failure', () => {
    const labels = TERMINATION_REASONS.map((reason) => TERMINATION_LABELS[reason].label)
    expect(new Set(labels).size).toBe(TERMINATION_REASONS.length)
    expect(TERMINATION_LABELS.context_overflow.label).toMatch(/overflow/i)
    expect(TERMINATION_LABELS.stuck.label).toMatch(/stuck/i)
    expect(TERMINATION_LABELS.context_overflow.tone).not.toBe('error')
    expect(TERMINATION_LABELS.stuck.tone).not.toBe('error')
    expect(TERMINATION_LABELS.error.label).not.toBe(TERMINATION_LABELS.stuck.label)
    expect(terminationLabel('something_new')).toBeNull()
    expect(terminationLabel(undefined)).toBeNull()
  })

  // spec: OVERSTORY-APPS-R004.6
  it('an absent operation yields nulls, never zero', async () => {
    stubOps({})
    const read = await readRun('run-1')
    expect(read).toEqual({
      harnessConfig: null,
      terminationReason: null,
      peakContextTokens: null,
      contextBudgetTokens: null,
      costUsd: null,
      getAvailable: false,
    })
  })
})
