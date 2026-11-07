import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CypherReplView from '@/components/views/CypherReplView'

const meta = { registry_digest: 'digest', api_version: 'v1' }

function reply(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(''),
  }) as unknown as Promise<Response>
}

function createFetchMock(rows: unknown = [{ n: { id: 'node1' } }]) {
  return vi.fn((input: RequestInfo | URL) =>
    String(input) === '/auth/session'
      ? reply({ authenticated: true, csrf_token: 'csrf' })
      : reply({ ok: true, result: { rows }, meta }),
  )
}

describe('CypherReplView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('renders the REPL with default query and caution banner', () => {
    global.fetch = createFetchMock() as unknown as typeof fetch
    render(<CypherReplView />)

    const editor = screen.getByLabelText('UQL query') as HTMLTextAreaElement
    expect(editor.value).toContain('MATCH (n) RETURN n LIMIT 10')

    expect(screen.getByText(/Read-only queries recommended/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^run$/i })).toBeInTheDocument()
  })

  it('runs a query, shows results, and appends history', async () => {
    const fetchSpy = createFetchMock([{ node: { id: 'n1' }, name: 'foo' }])
    global.fetch = fetchSpy as unknown as typeof fetch

    render(<CypherReplView />)

    screen.getByRole('button', { name: /^run$/i }).click()

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([url]) => String(url) === '/api/v1/ops/query.uql')).toBe(true)
    })
    const call = fetchSpy.mock.calls.find(([url]) => String(url) === '/api/v1/ops/query.uql') as unknown as [
      string,
      RequestInit,
    ]
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(String(call[1].body))).toMatchObject({ text: expect.stringContaining('MATCH') })

    // Result panel reports the count as "Returned 1 row(s). ...". Match that
    // exact phrasing so it does not also collide with the history badge below
    // (which reads "1 rows").
    await waitFor(() => {
      expect(screen.getByText(/Returned 1 row\(s\)/i)).toBeInTheDocument()
    })

    // History sidebar badge records the run as "1 rows".
    await waitFor(() => {
      expect(screen.getByText(/^1 rows$/i)).toBeInTheDocument()
    })
  })

  it('surfaces refused operations in the result panel', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) =>
      String(input) === '/auth/session'
        ? reply({ authenticated: true, csrf_token: 'csrf' })
        : reply(
            {
              ok: false,
              error: { code: 'denied', source: 'arbora', message: 'no', retryable: false },
              meta,
            },
            403,
          ),
    ) as unknown as typeof fetch

    render(<CypherReplView />)
    screen.getByRole('button', { name: /^run$/i }).click()

    await waitFor(() => {
      expect(screen.getByText(/Arbora operation refused: denied/)).toBeInTheDocument()
    })
  })

  it('detects destructive queries and shows a warning', async () => {
    global.fetch = createFetchMock() as unknown as typeof fetch
    render(<CypherReplView />)

    const editor = screen.getByLabelText('UQL query') as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'DELETE n' } })

    await waitFor(() => {
      expect(screen.getByText(/destructive/i, { selector: 'span' })).toBeInTheDocument()
    })
  })

  it('shows the shared empty-state message before any query has run', () => {
    global.fetch = createFetchMock() as unknown as typeof fetch
    render(<CypherReplView />)

    expect(screen.getByText('No results.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
