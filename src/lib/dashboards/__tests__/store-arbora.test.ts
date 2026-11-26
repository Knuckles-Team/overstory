import { afterEach, describe, expect, it, vi } from 'vitest'
import { servedOk, servedRefusal, servedUnavailable, stubServed } from '@/lib/arbora-api/__tests__/served-fixtures'
import { addPanel, createDashboard } from '../model'
import { createArboraStore, describeRemoteWrite, fromArboraDocument } from '../store-arbora'

afterEach(() => vi.unstubAllGlobals())

function install(replies: { status: number; body: unknown }[]) {
  const stub = stubServed(replies)
  vi.stubGlobal('fetch', vi.fn(stub.fetcher))
  return stub.calls
}

function uqlDashboard() {
  const base = createDashboard('Ops', [])
  return addPanel(base, { title: 'Nodes', viz: 'table', query: 'MATCH (n) RETURN n LIMIT 5', options: {} }).doc
}

// spec: OVERSTORY-DASH-R010
describe('store_arbora', () => {
  it('saves a uql dashboard with the expected revision and remembers the revision arbora returns', async () => {
    const calls = install([
      servedOk({ id: 'ops', revision: 1, owner: 'alice' }),
      servedOk({ id: 'ops', revision: 2, owner: 'alice' }),
    ])
    const store = createArboraStore()
    const doc = uqlDashboard()
    expect(await store.save(doc)).toEqual({ kind: 'saved', id: 'ops', revision: 1, owner: 'alice' })
    expect(calls[0].url).toBe('/api/v1/ops/dashboard.save')
    expect(calls[0].body).toMatchObject({ expected_revision: 0, document: { id: 'ops', schema_version: 1 } })
    await store.save(doc)
    expect(calls[1].body).toMatchObject({ expected_revision: 1 })
  })

  it('maps a stale revision to a conflict and never retries as an overwrite', async () => {
    const calls = install([servedRefusal('DASHBOARD_REVISION_CONFLICT', 409)])
    const store = createArboraStore()
    expect(await store.save(uqlDashboard())).toEqual({ kind: 'conflict' })
    expect(calls).toHaveLength(1)
  })

  it('stores every panel query kind as data in the saved document', async () => {
    const calls = install([servedOk({ id: 'ops', revision: 1, owner: 'alice' })])
    const store = createArboraStore()
    const base = uqlDashboard()
    const queries = [
      { kind: 'nl' as const, text: 'how many nodes' },
      { kind: 'fleet-call' as const, server: 'catalog', tool: 'search', arguments: { q: 'x' } },
      { kind: 'eg-op' as const, op: 'eg.query.Uql', params: { text: 'MATCH (n) |> LIMIT 1' } },
    ]
    const doc = { ...base, panels: queries.map((query, i) => ({ ...base.panels[0], id: `p${i}`, query })) }
    const result = await store.save(doc)
    expect(result.kind).toBe('saved')
    const sent = ((calls[0].body as { document: unknown }).document as { panels: { query: unknown }[] }).panels.map(
      (p) => p.query,
    )
    expect(sent).toEqual(queries)
  })

  it('reports an unserved save as unavailable and keeps the local fallback pending', async () => {
    install([servedUnavailable()])
    const store = createArboraStore()
    const write = await store.save(uqlDashboard())
    expect(write).toMatchObject({ kind: 'unavailable', code: 'UNAVAILABLE' })
    expect(describeRemoteWrite(write, 'Saved in this browser only.')).toMatchObject({
      status: 'saved-locally-pending-arbora',
    })
    expect(describeRemoteWrite({ kind: 'conflict' }, 'x').status).toBe('conflict')
    expect(describeRemoteWrite({ kind: 'saved', id: 'ops', revision: 1, owner: 'a' }, 'x').status).toBe(
      'saved-to-arbora',
    )
  })

  it('loads a document with its owner and role and lists the caller dashboards', async () => {
    const document = {
      schema_version: 1,
      id: 'ops',
      title: 'Ops',
      revision: 3,
      params: [],
      panels: [
        {
          id: 'nodes',
          title: 'Nodes',
          viz: 'table',
          query: { kind: 'uql', text: 'MATCH (n) RETURN n' },
          layout: { x: 0, y: 0, w: 6, h: 4 },
          options: {},
          terms: [],
          concepts: [],
        },
      ],
    }
    install([
      servedOk({ document, owner: 'alice', role: 'view' }),
      servedOk({ items: [{ id: 'ops', title: 'Ops', owner: 'alice', role: 'shared' }], next_cursor: null }),
    ])
    const store = createArboraStore()
    const loaded = await store.load('ops')
    expect(loaded).toMatchObject({ kind: 'ready', result: { owner: 'alice', role: 'view' } })
    const listed = await store.list()
    expect(listed).toEqual({ kind: 'ready', result: [{ id: 'ops', title: 'Ops', owner: 'alice', role: 'shared' }] })
  })

  it('does not draw a stored-reference panel it cannot run', () => {
    expect(
      fromArboraDocument({
        schema_version: 1,
        id: 'ops',
        title: 'Ops',
        revision: 1,
        params: [],
        panels: [
          {
            id: 'p',
            title: 'P',
            viz: 'table',
            query: { kind: 'stored', ref: 'q1' },
            layout: { x: 0, y: 0, w: 6, h: 4 },
            options: {},
          },
        ],
      }),
    ).toBeNull()
  })

  it('drops at the stored revision and shares through dashboard.share', async () => {
    const calls = install([
      servedOk({ id: 'ops', revision: 4, owner: 'alice' }),
      servedOk({ id: 'ops', deleted: true }),
      servedOk({ id: 'ops', grants: [{ principal_or_group: 'bob', role: 'view' }] }),
    ])
    const store = createArboraStore()
    await store.save(uqlDashboard())
    expect(await store.remove('ops')).toMatchObject({ kind: 'saved' })
    expect(calls[1].body).toEqual({ id: 'ops', expected_revision: 4 })
    const shared = await store.share('ops', { grantee: 'bob' }, 'view', 'grant')
    expect(shared).toEqual({ kind: 'ready', result: [{ principal_or_group: 'bob', role: 'view' }] })
    expect(calls[2].body).toEqual({ id: 'ops', grantee: 'bob', group: null, role: 'view', action: 'grant' })
  })
})
