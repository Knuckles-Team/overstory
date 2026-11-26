import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { servedMeta, servedUnavailable } from '@/lib/arbora-api/__tests__/served-fixtures'
import { createArboraStore } from '@/lib/dashboards/store-arbora'

vi.mock('@/lib/webmcp/provider', () => ({ useWebMcpToolSet: () => undefined }))
vi.mock('@/lib/dashboards/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dashboards/query')>()),
  runPanelQuery: vi.fn().mockResolvedValue({ state: 'ok', data: { columns: ['n'], rows: [{ n: 1 }] } }),
  listNodeTypes: () => Promise.resolve([]),
}))

import DashboardsView from '../DashboardsView'
import { useDashboards } from '../useDashboards'

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
    },
  ],
}

function ok(result: unknown) {
  return Response.json({ ok: true, result, meta: servedMeta })
}

function route(ops: Record<string, () => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/session'))
        return Promise.resolve(Response.json({ authenticated: true, csrf_token: 'tok' }))
      const op = url.replace('/api/v1/ops/', '')
      const handler = ops[op]
      if (!handler) return Promise.resolve(Response.json(servedUnavailable().body, { status: 503 }))
      return Promise.resolve(handler())
    }),
  )
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DashboardsView remote={createArboraStore()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

// spec: OVERSTORY-DASH-R010, OVERSTORY-DASH-R012
describe('Dashboards page on the arbora store', () => {
  it('states that dashboards stay in this browser while arbora does not serve them', async () => {
    route({})
    const user = userEvent.setup()
    renderView()
    expect(await screen.findByText(/not served yet\. Dashboards stay in this browser/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('New dashboard'), 'Local')
    await user.click(screen.getByRole('button', { name: /Create/ }))
    await waitFor(() => {
      expect(screen.getByTestId('save-status')).toHaveTextContent(
        /Arbora is not serving dashboard saves yet\. Saved in this browser only/,
      )
    })
  })

  it('opens a shared dashboard read-only: owner and level shown, no edit controls', async () => {
    route({
      'dashboard.list': () =>
        ok({ items: [{ id: 'ops', title: 'Ops', owner: 'alice', role: 'shared' }], next_cursor: null }),
      'dashboard.get': () => ok({ document, owner: 'alice', role: 'view' }),
    })
    const user = userEvent.setup()
    renderView()
    await user.click(await screen.findByRole('button', { name: /Ops \(shared\)/ }))
    expect(await screen.findByTestId('dashboard-access')).toHaveTextContent(
      'Owner: alice · Your access: Reader (read only)',
    )
    expect(screen.getByTestId('panel-nodes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add panel/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit Nodes/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove Nodes/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toBeDisabled()
  })

  it('makes the agent edit tools refuse on a read-only dashboard', async () => {
    route({
      'dashboard.list': () => ok({ items: [], next_cursor: null }),
      'dashboard.get': () => ok({ document, owner: 'alice', role: 'view' }),
    })
    const remote = createArboraStore()
    const { result } = renderHook(() => useDashboards(undefined, remote))
    await act(async () => {
      await result.current.openRemote('ops')
    })
    expect(result.current.readOnly).toBe(true)
    expect(() => result.current.controller.edit('Rename', (d) => ({ ...d, title: 'x' }))).toThrow(/read-only/)
  })
})
