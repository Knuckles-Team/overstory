import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/__tests__/fixtures'
import { servedOk, servedRefusal, servedUnavailable, stubServed } from '@/lib/arbora-api/__tests__/served-fixtures'
import CatalogPage from '../CatalogPage'

afterEach(() => vi.unstubAllGlobals())

const browse = {
  facets: [
    { kind: 'dashboard', count: 2 },
    { kind: 'connector', count: 1 },
  ],
  items: [
    { asset_id: 'dashboard:ops', kind: 'dashboard', name: 'Ops', owner: 'alice', score: null },
    { asset_id: 'connector:git', kind: 'connector', name: null, owner: null },
  ],
  next_cursor: null,
}

function mount(replies: { status: number; body: unknown }[]) {
  const stub = stubServed(replies)
  vi.stubGlobal('fetch', vi.fn(stub.fetcher))
  return { ...renderWithProviders(<CatalogPage />), calls: stub.calls }
}

// spec: OVERSTORY-DASH-R016
describe('CatalogPage', () => {
  it('browses, searches and opens an asset with owners, terms, lineage, ratings and comments', async () => {
    const { user, calls } = mount([
      servedOk(browse),
      servedOk(browse),
      servedOk({ items: [browse.items[0]], next_cursor: null }),
      servedOk({
        asset_id: 'dashboard:ops',
        kind: 'dashboard',
        name: 'Ops',
        owners: ['alice'],
        terms: ['uptime'],
        lineage: { upstream: ['connector:git'], downstream: [] },
        ratings: { count: 2, mean: 4.5 },
        comments: [{ id: 'c1', author: 'bob', at: null, text: 'useful' }],
      }),
    ])
    expect(await screen.findByText('Ops')).toBeInTheDocument()
    expect(screen.getByText('connector:git', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByLabelText('Assets per kind')).toHaveTextContent('dashboard: 2 · connector: 1')
    await user.type(screen.getByLabelText('Search the catalog'), 'ops')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await user.click(await screen.findByRole('button', { name: /Ops/ }))
    expect(await screen.findByText('uptime')).toBeInTheDocument()
    expect(screen.getByText('Ratings: 4.5 from 2')).toBeInTheDocument()
    expect(screen.getByText('useful', { exact: false })).toBeInTheDocument()
    expect(calls.map((c) => c.url.replace('/api/v1/ops/', ''))).toEqual([
      'catalog.assets.browse',
      'catalog.assets.browse',
      'catalog.assets.search',
      'catalog.assets.get',
    ])
    expect(calls[2].body).toEqual({ text: 'ops', kinds: [] })
  })

  it('labels an unserved catalog as unavailable and never as empty', async () => {
    mount([servedUnavailable(), servedUnavailable()])
    expect(await screen.findByText('Unavailable.')).toBeInTheDocument()
    expect(screen.queryByText(/no catalog assets match/i)).not.toBeInTheDocument()
  })

  it('labels a denied catalog read as denied', async () => {
    mount([servedRefusal('SUBJECT_ACCESS_DENIED', 403), servedRefusal('SUBJECT_ACCESS_DENIED', 403)])
    expect(await screen.findByText('Denied.')).toBeInTheDocument()
  })

  it('says so when the catalog has no matching asset', async () => {
    mount([
      servedOk({ facets: [], items: [], next_cursor: null }),
      servedOk({ facets: [], items: [], next_cursor: null }),
    ])
    expect(await screen.findByText('No catalog assets match.')).toBeInTheDocument()
  })
})
