import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import ProposalReview from '@/components/views/ProposalReview'
import { renderWithProviders } from '@/__tests__/fixtures'
import { servedOk, servedRefusal, servedUnavailable, stubServed } from '@/lib/arbora-api/__tests__/served-fixtures'

/**
 * ProposalReview (OVERSTORY-DECIDE-R009.1, R009.2): the real view against the
 * recorded served shapes of `development.proposal.list` and `.review`.
 */

afterEach(() => vi.unstubAllGlobals())

const proposals = {
  items: [
    {
      id: 'prop-1',
      kind: 'add_row',
      target: 'specs/x/requirements.md',
      evidence: [
        { kind: 'code_graph_fact', record_id: 'rec-code', digest: 'sha256:11' },
        { kind: 'research_citation', record_id: 'rec-res', digest: 'sha256:22' },
      ],
      state: 'open',
    },
    { id: 'prop-2', kind: 'prune_row', target: 'specs/y/requirements.md', evidence: [], state: 'open' },
  ],
}

async function loadRepository(replies: { status: number; body: unknown }[]) {
  const stub = stubServed(replies)
  vi.stubGlobal('fetch', vi.fn(stub.fetcher))
  const view = renderWithProviders(<ProposalReview />)
  await view.user.type(screen.getByLabelText('Repository'), 'org/repo')
  await view.user.click(screen.getByRole('button', { name: 'Load' }))
  return { ...view, calls: stub.calls }
}

describe('ProposalReview', () => {
  it('test_kinds_and_evidence_render_and_missing_is_labeled', async () => {
    // spec: OVERSTORY-DECIDE-R009.1
    const { calls } = await loadRepository([servedOk(proposals)])
    const addGroup = await screen.findByRole('region', { name: 'Kind add_row' })
    expect(within(addGroup).getByText('rec-code')).toBeInTheDocument()
    expect(within(addGroup).getByText('rec-res')).toBeInTheDocument()
    // No gate result was served for the first proposal: labelled, never invented.
    expect(within(addGroup).getByText('Gate results').nextSibling).toHaveTextContent('unavailable')
    const pruneGroup = screen.getByRole('region', { name: 'Kind prune_row' })
    expect(within(pruneGroup).getAllByText('unavailable')).toHaveLength(3)
    expect(calls[0]).toEqual({ url: '/api/v1/ops/development.proposal.list', body: { repository: 'org/repo' } })
  })

  it('labels an unavailable proposal list instead of showing an empty one', async () => {
    // spec: OVERSTORY-DECIDE-R009.1
    await loadRepository([servedUnavailable()])
    expect(await screen.findByText('Unavailable.')).toBeInTheDocument()
    expect(screen.queryByText(/no proposals/i)).not.toBeInTheDocument()
  })

  it('test_accept_requests_a_pull_request_and_offers_no_direct_write', async () => {
    // spec: OVERSTORY-DECIDE-R009.2
    const { user, calls } = await loadRepository([
      servedOk(proposals),
      servedOk({ id: 'prop-1', state: 'approved', pull_request: 'https://example.test/org/repo/pull/7' }),
      servedOk({ items: [{ ...proposals.items[0], state: 'approved' }, proposals.items[1]] }),
    ])
    await screen.findByRole('region', { name: 'Kind add_row' })
    expect(screen.queryByRole('button', { name: /merge|write|apply/i })).not.toBeInTheDocument()
    const accept = screen.getAllByRole('button', { name: 'Accept' })[0]
    expect(accept).toBeDisabled()
    await user.type(screen.getByLabelText('Reason for prop-1'), 'evidence holds')
    await user.click(accept)
    const link = await screen.findByRole('link', { name: 'https://example.test/org/repo/pull/7' })
    expect(link).toHaveAttribute('href', 'https://example.test/org/repo/pull/7')
    expect(screen.getByText(/gate state: unavailable/i)).toBeInTheDocument()
    expect(calls[1]).toEqual({
      url: '/api/v1/ops/development.proposal.review',
      body: { proposal_id: 'prop-1', decision: 'accept', reason: 'evidence holds' },
    })
  })

  it('shows a refusal and does not render an unsafe pull request link', async () => {
    // spec: OVERSTORY-DECIDE-R009.2
    const { user } = await loadRepository([servedOk(proposals), servedRefusal('PROPOSAL_DIRECT_WRITE_REFUSED', 409)])
    await screen.findByRole('region', { name: 'Kind add_row' })
    await user.type(screen.getByLabelText('Reason for prop-1'), 'try')
    await user.click(screen.getAllByRole('button', { name: 'Accept' })[0])
    expect(await screen.findByText('Refused.')).toBeInTheDocument()
  })

  it('records a reject as a refusal with no pull request', async () => {
    // spec: OVERSTORY-DECIDE-R009.2
    const { user, calls } = await loadRepository([
      servedOk(proposals),
      servedOk({ id: 'prop-1', state: 'rejected', pull_request: null }),
      servedOk({ items: [{ ...proposals.items[0], state: 'rejected' }, proposals.items[1]] }),
    ])
    await screen.findByRole('region', { name: 'Kind add_row' })
    await user.type(screen.getByLabelText('Reason for prop-1'), 'not needed')
    await user.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    expect(await screen.findByText('Rejected.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(calls[1].body).toMatchObject({ decision: 'reject' })
  })
})
