import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import MagmaView from '@/components/views/MagmaView'

const META = { registry_digest: 'digest', api_version: 'v1' }

function reply(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(''),
  }) as unknown as Promise<Response>
}

/** Answers the CSRF session fetch and the retrieval.search operation. */
function createFetchMock(hits: { ref: string; text: string; tokens: number }[] = []) {
  return vi.fn((url: string) =>
    url === '/auth/session'
      ? reply({ authenticated: true, csrf_token: 'csrf-test' })
      : reply({ ok: true, result: { value: { tenant: 't', hits } }, meta: META }),
  )
}

describe('MagmaView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the MAGMA query form', () => {
    global.fetch = createFetchMock([]) as unknown as typeof fetch
    render(<MagmaView />)

    // The view's heading is "Perspective Views" (the MAGMA orthogonal-views explorer).
    expect(screen.getByText('Perspective Views')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/find all reasoning traces/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run query/i })).toBeInTheDocument()
  })

  it('submits a query and renders grouped results', async () => {
    const fetchSpy = createFetchMock([{ ref: 'r1', text: 'Result one', tokens: 3 }])
    global.fetch = fetchSpy as unknown as typeof fetch

    render(<MagmaView />)

    const textarea = screen.getByPlaceholderText(/find all reasoning traces/i)
    fireEvent.change(textarea, { target: { value: 'why did auth fail' } })

    screen.getByRole('button', { name: /run query/i }).click()

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })
    const [url, init] = fetchSpy.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/ops/retrieval.search')
    expect(init.method).toBe('POST')
    expect(init.body).toContain('why did auth fail')

    await waitFor(() => {
      expect(screen.getByText(/semantic view/i)).toBeInTheDocument()
      expect(screen.getByText('Result one')).toBeInTheDocument()
    })
  })

  it('blocks submission on empty query', async () => {
    const fetchSpy = createFetchMock([])
    global.fetch = fetchSpy as unknown as typeof fetch

    render(<MagmaView />)

    screen.getByRole('button', { name: /run query/i }).click()

    await waitFor(() => {
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
