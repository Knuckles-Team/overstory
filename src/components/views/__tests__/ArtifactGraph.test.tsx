import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import ArtifactGraph from '@/components/views/ArtifactGraph'
import { renderWithProviders } from '@/__tests__/fixtures'
import { servedOk, servedRefusal, servedUnavailable, stubServed } from '@/lib/arbora-api/__tests__/served-fixtures'

afterEach(() => vi.unstubAllGlobals())

async function ask(replies: { status: number; body: unknown }[], subject?: string) {
  const stub = stubServed(replies)
  vi.stubGlobal('fetch', vi.fn(stub.fetcher))
  const view = renderWithProviders(<ArtifactGraph />)
  if (subject) {
    await view.user.selectOptions(screen.getByLabelText('Question'), 'changes_advancing_goal')
    await view.user.type(screen.getByLabelText('Goal'), subject)
  }
  await view.user.click(screen.getByRole('button', { name: 'Ask' }))
  return { ...view, calls: stub.calls }
}

describe('ArtifactGraph', () => {
  it('test_answers_keep_order_and_states_are_distinct', async () => {
    // spec: OVERSTORY-DECIDE-R010.1
    const first = await ask([
      servedOk({
        rows: [
          { task: 'T020', row: 'R002' },
          { task: 'T003', row: 'R001' },
          { task: 'T011', row: 'R009' },
        ],
        digests: ['sha256:ab'],
      }),
    ])
    const items = await screen.findAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['taskT020rowR002', 'taskT003rowR001', 'taskT011rowR009'])
    expect(screen.getByText(/sha256:ab/)).toBeInTheDocument()
    expect(first.calls[0]).toEqual({
      url: '/api/v1/ops/spec.query',
      body: { question: 'next_unblocked_task', subject: null },
    })
    first.unmount()

    const empty = await ask([servedOk({ rows: [], digests: [] })])
    expect(await screen.findByText('Empty answer.')).toBeInTheDocument()
    empty.unmount()

    const denied = await ask([servedRefusal('SUBJECT_ACCESS_DENIED', 403)])
    expect(await screen.findByText('Denied.')).toBeInTheDocument()
    denied.unmount()

    const unavailable = await ask([servedUnavailable()])
    expect(await screen.findByText('Unavailable.')).toBeInTheDocument()
    unavailable.unmount()

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes('/auth/session')
          ? Promise.resolve(Response.json({ authenticated: true, csrf_token: 'session-csrf' }))
          : Promise.reject(new TypeError('network down')),
      ),
    )
    const failed = renderWithProviders(<ArtifactGraph />)
    await failed.user.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByText('Transport failure.')).toBeInTheDocument()
  })

  it('sends the goal as the subject', async () => {
    // spec: OVERSTORY-DECIDE-R010.1
    const { calls } = await ask([servedOk({ rows: [], digests: [] })], 'goal-7')
    await screen.findByText('Empty answer.')
    expect(calls[0].body).toEqual({ question: 'changes_advancing_goal', subject: 'goal-7' })
  })
})
