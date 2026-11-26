import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import ProjectMode from '@/components/views/ProjectMode'
import { renderWithProviders } from '@/__tests__/fixtures'
import { servedOk, servedRefusal, servedUnavailable, stubServed } from '@/lib/arbora-api/__tests__/served-fixtures'

afterEach(() => vi.unstubAllGlobals())

async function load(replies: { status: number; body: unknown }[]) {
  const stub = stubServed(replies)
  vi.stubGlobal('fetch', vi.fn(stub.fetcher))
  const view = renderWithProviders(<ProjectMode />)
  await view.user.type(screen.getByLabelText('Repository'), 'org/repo')
  await view.user.click(screen.getByRole('button', { name: 'Load' }))
  return { ...view, calls: stub.calls }
}

describe('ProjectMode', () => {
  it('shows the served mode and labels an unavailable read', async () => {
    // spec: OVERSTORY-DECIDE-R011
    const { calls, unmount } = await load([servedOk({ repository: 'org/repo', mode: 'development', previous: null })])
    expect(await screen.findByText('development', { selector: 'strong' })).toBeInTheDocument()
    expect(calls[0]).toEqual({ url: '/api/v1/ops/project.mode.get', body: { repository: 'org/repo' } })
    unmount()
    await load([servedUnavailable()])
    expect(await screen.findByText('Unavailable.')).toBeInTheDocument()
  })

  it('test_evolving_shows_pending_approval_and_never_self_approves', async () => {
    // spec: OVERSTORY-DECIDE-R011
    const { user, calls } = await load([
      servedOk({ repository: 'org/repo', mode: 'development', previous: null }),
      servedRefusal('CONFIRMATION_REQUIRED', 409, {
        plan_ref: 'plan-abcdef12',
        op: 'project.mode.set',
        effect: 'write',
      }),
    ])
    await screen.findByText('development', { selector: 'strong' })
    await user.selectOptions(screen.getByLabelText('Mode'), 'evolving')
    // Evolving needs a reason first.
    expect(screen.getByRole('button', { name: 'Change mode' })).toBeDisabled()
    await user.type(screen.getByLabelText(/Reason/), 'start the loop')
    await user.click(screen.getByRole('button', { name: 'Change mode' }))
    expect(await screen.findByText('Pending operator approval.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(calls[1]).toEqual({
      url: '/api/v1/ops/project.mode.set',
      body: { repository: 'org/repo', mode: 'evolving', reason: 'start the loop' },
    })
    // The view never calls the mode directly a second time with a plan reference.
    expect(calls).toHaveLength(2)
  })
})
