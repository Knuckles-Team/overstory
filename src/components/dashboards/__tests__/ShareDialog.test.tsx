import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/__tests__/fixtures'
import { servedOk, servedUnavailable, stubServed } from '@/lib/arbora-api/__tests__/served-fixtures'
import { createArboraStore } from '@/lib/dashboards/store-arbora'
import { ShareDialog } from '../ShareDialog'

afterEach(() => vi.unstubAllGlobals())

function mount(replies: { status: number; body: unknown }[]) {
  const stub = stubServed(replies)
  vi.stubGlobal('fetch', vi.fn(stub.fetcher))
  const view = renderWithProviders(
    <ShareDialog store={createArboraStore()} dashboardId="ops" open onOpenChange={() => undefined} />,
  )
  return { ...view, calls: stub.calls }
}

// spec: OVERSTORY-DASH-R012
describe('ShareDialog', () => {
  it('lets the owner grant and revoke reader or editor access', async () => {
    const { user, calls } = mount([
      servedOk({ id: 'ops', owner: 'alice', role: 'owner', grants: [{ principal_or_group: 'bob', role: 'view' }] }),
      servedOk({
        id: 'ops',
        grants: [
          { principal_or_group: 'bob', role: 'view' },
          { principal_or_group: 'carol', role: 'edit' },
        ],
      }),
      servedOk({ id: 'ops', owner: 'alice', role: 'owner', grants: [] }),
      servedOk({ id: 'ops', grants: [] }),
      servedOk({ id: 'ops', owner: 'alice', role: 'owner', grants: [] }),
    ])
    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByText('Your access: Owner')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'carol')
    await user.selectOptions(screen.getByLabelText('Access'), 'edit')
    await user.click(screen.getByRole('button', { name: 'Grant access' }))
    await waitFor(() => {
      expect(calls).toHaveLength(3)
    })
    expect(calls[1]).toEqual({
      url: '/api/v1/ops/dashboard.share',
      body: { id: 'ops', grantee: 'carol', group: null, role: 'edit', action: 'grant' },
    })
  })

  it('shows a reader the owner and level but offers no grant or revoke control', async () => {
    mount([servedOk({ id: 'ops', owner: 'alice', role: 'view', grants: [] })])
    expect(await screen.findByText('Your access: Reader')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Grant access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument()
  })

  it('refuses honestly when the access read is not served', async () => {
    mount([servedUnavailable()])
    expect(await screen.findByText('Unavailable.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Grant access' })).not.toBeInTheDocument()
  })
})
