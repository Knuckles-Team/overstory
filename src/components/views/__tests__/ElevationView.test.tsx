import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import ElevationView from '@/components/views/ElevationView'
import { renderWithProviders } from '@/__tests__/fixtures'

function reply(status: number, body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as Response)
}

const META = { registry_digest: 'test-digest', api_version: 'v1' }

/** A successful operation envelope, with the `meta` block the envelope schema requires. */
function okReply(result: unknown): Promise<Response> {
  return reply(200, { ok: true, result, meta: META })
}

function deniedReply(): Promise<Response> {
  return reply(403, {
    ok: false,
    error: { code: 'SCOPE_REQUIRED', source: 'arbora', message: 'denied', retryable: false },
    meta: META,
  })
}

// The typed Arbora transport reads a CSRF token from `/auth/session` before
// every operation call, so every fetcher below must answer it with a valid
// authenticated session -- a 404 or an unauthenticated session there blocks
// the operation call before it is ever attempted.
const AUTHENTICATED_SESSION = { authenticated: true, csrf_token: 'test-csrf-token' }

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/** Wrap a fetcher that only needs to answer operation calls: `/auth/session`
 *  is handled here so every test does not have to repeat that branch. */
function withSession(opFetcher: Fetcher) {
  return vi.fn((url: string, init?: RequestInit) =>
    url === '/auth/session' ? reply(200, AUTHENTICATED_SESSION) : opFetcher(url, init),
  )
}

/** The JSON body of the first operation call for the given op. */
function opBody(fetcher: ReturnType<typeof withSession>, op: string): Record<string, unknown> | undefined {
  const call = fetcher.mock.calls.find(([url]) => url.includes(`/api/v1/ops/${op}`))
  if (!call || typeof call[1]?.body !== 'string') return undefined
  return JSON.parse(call[1].body) as Record<string, unknown>
}

const ELEVATION = {
  elevation_id: 'elev-1',
  grantee: 'principal-1',
  status: 'pending',
  scopes: [{ graph: 'kg', action: 'write' }],
  span_ms: 3600000,
  justification: 'maintenance window',
  request_digest: 'digest-abc',
  requested_at_ms: 1700000000000,
  revision: 1,
  approved_at_ms: null,
  hard_expires_at_ms: 1700003600000,
  ended_at_ms: null,
  remaining_ms: 1800000,
  own: false,
}

function listReply() {
  return (url: string) =>
    url.includes('access.elevation.list') ? okReply({ elevations: [ELEVATION] }) : reply(404, {})
}

// spec: OVERSTORY-IDENTITY-R007
describe('ElevationView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal(
      'fetch',
      withSession((url) => (url.includes('/api/v1/ops/') ? reply(404, {}) : reply(200, { authenticated: false }))),
    )
  })

  it('lists every elevation with scope, reason, expiry and revision', async () => {
    vi.stubGlobal('fetch', withSession(listReply()))
    renderWithProviders(<ElevationView />)
    await waitFor(() => {
      expect(screen.getByText('elev-1 · pending')).toBeInTheDocument()
    })
    expect(screen.getByText(/kg \/ write/)).toBeInTheDocument()
    expect(screen.getByText('Reason: maintenance window')).toBeInTheDocument()
    expect(screen.getByText(/Expires/)).toBeInTheDocument()
    expect(screen.getByText(/revision 1/)).toBeInTheDocument()
  })

  it('requests an elevation through the typed op and shows the bound receipt', async () => {
    const fetcher = withSession((url) =>
      url.includes('access.elevation.request')
        ? okReply({ ...ELEVATION, elevation_id: 'elev-new' })
        : url.includes('access.elevation.list')
          ? okReply({ elevations: [] })
          : reply(404, {}),
    )
    vi.stubGlobal('fetch', fetcher)
    const { user } = renderWithProviders(<ElevationView />)
    await user.click(screen.getByRole('tab', { name: 'request' }))

    const request = screen.getByRole('button', { name: 'Request' })
    expect(request).toBeDisabled()
    await user.type(screen.getByLabelText('Elevation id'), 'elev-new')
    await user.type(screen.getByLabelText('Graph'), 'kg')
    await user.type(screen.getByLabelText('Span (ms)'), '3600000')
    await user.type(screen.getByLabelText('Justification'), 'maintenance window')
    expect(request).toBeEnabled()
    await user.click(request)

    await waitFor(() => {
      expect(screen.getByTestId('elevation-receipt')).toBeInTheDocument()
    })
    expect(opBody(fetcher, 'access.elevation.request')).toEqual({
      elevation_id: 'elev-new',
      scopes: [{ graph: 'kg', action: 'write' }],
      span_ms: 3600000,
      justification: 'maintenance window',
    })
    expect(screen.getByTestId('receipt-justification')).toHaveTextContent('maintenance window')
    expect(screen.getByTestId('receipt-expiry')).toHaveTextContent(/Expires/)
  })

  it('approves only the exact request it displays, bound by its digest', async () => {
    const fetcher = withSession((url) =>
      url.includes('access.elevation.approve')
        ? okReply({ ...ELEVATION, status: 'active', approved_at_ms: 1700000100000 })
        : url.includes('access.elevation.list')
          ? okReply({ elevations: [ELEVATION] })
          : reply(404, {}),
    )
    vi.stubGlobal('fetch', fetcher)
    const { user } = renderWithProviders(<ElevationView />)
    await user.click(screen.getByRole('tab', { name: 'approve' }))

    const pick = await screen.findByLabelText('Elevation to approve')
    await user.selectOptions(pick, 'elev-1')
    // The digest of the displayed request must be visible before approving.
    expect(screen.getByTestId('selected-digest')).toHaveTextContent('digest-abc')
    await user.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => {
      expect(screen.getByText('Approval recorded.')).toBeInTheDocument()
    })
    expect(opBody(fetcher, 'access.elevation.approve')).toEqual({
      elevation_id: 'elev-1',
      request_digest: 'digest-abc',
    })
  })

  it('revokes the selected elevation by id alone', async () => {
    const fetcher = withSession((url) =>
      url.includes('access.elevation.revoke')
        ? okReply({ ...ELEVATION, status: 'ended', ended_at_ms: 1700000200000 })
        : url.includes('access.elevation.list')
          ? okReply({ elevations: [ELEVATION] })
          : reply(404, {}),
    )
    vi.stubGlobal('fetch', fetcher)
    const { user } = renderWithProviders(<ElevationView />)
    await user.click(screen.getByRole('tab', { name: 'revoke' }))

    const pick = await screen.findByLabelText('Elevation to revoke')
    await user.selectOptions(pick, 'elev-1')
    await user.click(screen.getByRole('button', { name: 'Revoke' }))

    await waitFor(() => {
      expect(screen.getByText('Revocation recorded.')).toBeInTheDocument()
    })
    expect(opBody(fetcher, 'access.elevation.revoke')).toEqual({ elevation_id: 'elev-1' })
  })

  it('surfaces a refusal as the denied state, not a receipt', async () => {
    const fetcher = withSession((url) =>
      url.includes('access.elevation.approve')
        ? deniedReply()
        : url.includes('access.elevation.list')
          ? okReply({ elevations: [ELEVATION] })
          : reply(404, {}),
    )
    vi.stubGlobal('fetch', fetcher)
    const { user } = renderWithProviders(<ElevationView />)
    await user.click(screen.getByRole('tab', { name: 'approve' }))
    await user.selectOptions(await screen.findByLabelText('Elevation to approve'), 'elev-1')
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => {
      expect(screen.getByText('This operation requires an authorized administrator session.')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('elevation-receipt')).not.toBeInTheDocument()
  })

  it('routes a step-up confirmation to the bound console URL', async () => {
    const planRef = `arbora_plan:${'a'.repeat(48)}`
    const fetcher = withSession((url) =>
      url.includes('access.elevation.approve')
        ? reply(428, {
            ok: false,
            error: {
              code: 'STEP_UP_REQUIRED',
              source: 'arbora',
              message: 'confirmation required',
              retryable: false,
              details: {
                plan_ref: planRef,
                console_url: `/console/confirm/${planRef}`,
                op: 'access.elevation.approve',
              },
            },
            meta: META,
          })
        : url.includes('access.elevation.list')
          ? okReply({ elevations: [ELEVATION] })
          : reply(404, {}),
    )
    vi.stubGlobal('fetch', fetcher)
    const { user } = renderWithProviders(<ElevationView />)
    await user.click(screen.getByRole('tab', { name: 'approve' }))
    await user.selectOptions(await screen.findByLabelText('Elevation to approve'), 'elev-1')
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-link')).toHaveAttribute('href', `/console/confirm/${planRef}`)
    })
  })
})
