import { Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { matchRoute } from '@/lib/nav-registry'
import { renderWithProviders } from '@/__tests__/fixtures'
import { installFakeArbora } from './fake-arbora'

/**
 * Journey for OVERSTORY-DECIDE-R009.3 at the registered route: a reviewer lists
 * proposals, accepts one and sees its pull request, rejects one and sees the
 * refusal, and a second tenant sees no proposal of the first. The ops endpoint
 * is an in-process stand-in answering with the recorded served shapes; a run
 * against a live loopback arbora stays a CI qualification step.
 */

afterEach(() => vi.unstubAllGlobals())

describe('proposal route journey', () => {
  // spec: OVERSTORY-DECIDE-R009.3
  it('test_reviewer_lists_and_decides_a_proposal', async () => {
    const states: Record<string, string> = { 'prop-1': 'open', 'prop-2': 'open' }
    const arbora = installFakeArbora({
      'development.proposal.list': (_params, tenant) => ({
        items:
          tenant === 'tenant-a'
            ? Object.entries(states).map(([id, state]) => ({
                id,
                kind: 'update_row',
                target: `specs/${id}`,
                evidence: [],
                state,
              }))
            : [],
      }),
      'development.proposal.review': (params) => {
        const id = String(params.proposal_id)
        states[id] = params.decision === 'accept' ? 'approved' : 'rejected'
        return {
          id,
          state: states[id],
          pull_request: params.decision === 'accept' ? 'https://example.test/pr/9' : null,
        }
      },
    })
    const matched = matchRoute('/proposals')
    expect(matched?.route.id).toBe('control-plane.proposals')
    const Page = matched!.route.element
    const { user, unmount } = renderWithProviders(
      <Suspense fallback={null}>
        <Page />
      </Suspense>,
    )
    await user.type(await screen.findByLabelText('Repository'), 'org/repo')
    await user.click(screen.getByRole('button', { name: 'Load' }))
    await screen.findByLabelText('Reason for prop-1')

    await user.type(screen.getByLabelText('Reason for prop-1'), 'ok')
    await user.click(screen.getAllByRole('button', { name: 'Accept' })[0])
    expect(await screen.findByRole('link', { name: 'https://example.test/pr/9' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Reason for prop-2'), 'no')
    await user.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    expect(await screen.findByText('Rejected.')).toBeInTheDocument()
    expect(arbora.calls.filter((c) => c.op === 'development.proposal.review')).toHaveLength(2)
    unmount()

    arbora.signInAs('tenant-b')
    const second = renderWithProviders(
      <Suspense fallback={null}>
        <Page />
      </Suspense>,
    )
    await second.user.type(await screen.findByLabelText('Repository'), 'org/repo')
    await second.user.click(screen.getByRole('button', { name: 'Load' }))
    expect(await screen.findByText('No proposals for this repository.')).toBeInTheDocument()
  })
})
