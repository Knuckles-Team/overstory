import { describe, it, expect } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import DecisionExplorerTab from '@/components/decisions/DecisionExplorerTab'
import { ArboraApiError } from '@/lib/arbora-api/invoke'
import { renderWithProviders } from '@/__tests__/fixtures'
import { baseRecord, baseRow, createFixtureTransport, emptyProvenance } from './decisions-fixtures'

/**
 * DecisionExplorerTab (requirement OVERSTORY-DECIDE-R003, part of OVERSTORY-DECIDE-R002): the
 * real component against an explicit fixture `DecisionsTransport` (see
 * `decisions-fixtures.ts`) — no network, no module mocking.
 */

describe('DecisionExplorerTab', () => {
  it('lists decisions and shows a placeholder until one is selected', async () => {
    const transport = createFixtureTransport()
    transport.listDecisions.mockResolvedValue([baseRow])
    renderWithProviders(<DecisionExplorerTab transport={transport} />)

    await waitFor(() => {
      expect(transport.listDecisions).toHaveBeenCalled()
    })
    expect(await screen.findByText(/decision:abc123/i)).toBeInTheDocument()
    expect(screen.getByText(/select a decision/i)).toBeInTheDocument()
  })

  it('shows the empty state on a genuine zero-row result', async () => {
    const transport = createFixtureTransport()
    transport.listDecisions.mockResolvedValue([])
    renderWithProviders(<DecisionExplorerTab transport={transport} />)
    expect(await screen.findByText(/no decisions recorded yet/i)).toBeInTheDocument()
  })

  it('shows an honest unavailable notice on a failed fetch, never an empty list', async () => {
    const transport = createFixtureTransport()
    transport.listDecisions.mockRejectedValue(new Error('network down'))
    renderWithProviders(<DecisionExplorerTab transport={transport} />)
    expect(await screen.findByText(/could not be fetched/i)).toBeInTheDocument()
    expect(screen.queryByText(/no decisions recorded yet/i)).not.toBeInTheDocument()
  })

  // spec: OVERSTORY-DECIDE-R003, OVERSTORY-DECIDE-R002
  it('selecting a row loads and renders its premises, outcome, and why-not (OVERSTORY-DECIDE-R003)', async () => {
    const transport = createFixtureTransport()
    transport.listDecisions.mockResolvedValue([baseRow])
    transport.getDecision.mockResolvedValue(baseRecord)
    transport.getDecisionProvenance.mockResolvedValue(emptyProvenance)
    const { user } = renderWithProviders(<DecisionExplorerTab transport={transport} />)

    const row = await screen.findByRole('button', { name: /decision:abc123/i })
    await user.click(row)

    await waitFor(() => {
      expect(transport.getDecision).toHaveBeenCalledWith('decision:abc123', expect.anything())
    })
    const detail = await screen.findByText('Decision')
    const card = detail.closest('[class*="rounded"]')?.parentElement ?? document.body
    expect(within(card as HTMLElement).getByText('agent:writer')).toBeInTheDocument()
    expect(within(card as HTMLElement).getByText(/graph-digest-1/i)).toBeInTheDocument()
    // "Retired" appears twice on purpose: once under Eliminated candidates,
    // once under Why not -- both sections render the same violation tag.
    expect(within(card as HTMLElement).getAllByText(/retired/i).length).toBeGreaterThanOrEqual(2)
  })

  // spec: OVERSTORY-DECIDE-R008
  it('selecting a row with the keyboard alone (no pointer) loads its detail (OVERSTORY-DECIDE-R008)', async () => {
    const transport = createFixtureTransport()
    transport.listDecisions.mockResolvedValue([baseRow])
    transport.getDecision.mockResolvedValue(baseRecord)
    transport.getDecisionProvenance.mockResolvedValue(emptyProvenance)
    const { user } = renderWithProviders(<DecisionExplorerTab transport={transport} />)

    const row = await screen.findByRole('button', { name: /decision:abc123/i })
    expect(row).toHaveAttribute('aria-pressed', 'false')
    row.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(transport.getDecision).toHaveBeenCalledWith('decision:abc123', expect.anything())
    })
    expect(row).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Decision')).toBeInTheDocument()
  })

  // spec: OVERSTORY-DECIDE-R002
  it('labels a served-UNAVAILABLE decision log as unavailable, not as empty or as a network error', async () => {
    const transport = createFixtureTransport()
    transport.listDecisions.mockRejectedValue(new ArboraApiError('UNAVAILABLE', 503, true, {}))
    renderWithProviders(<DecisionExplorerTab transport={transport} />)
    expect(await screen.findByText('Unavailable.')).toBeInTheDocument()
    expect(screen.queryByText(/no decisions recorded yet/i)).not.toBeInTheDocument()
  })

  // spec: OVERSTORY-DECIDE-R002
  it('renders the served provenance (facts at revision, rules) and labels unavailable provenance', async () => {
    const transport = createFixtureTransport()
    transport.listDecisions.mockResolvedValue([baseRow])
    transport.getDecision.mockResolvedValue(baseRecord)
    transport.getDecisionProvenance.mockResolvedValue({
      ...emptyProvenance,
      premises: [{ kind: 'fact', ref: 'node:1', class: 'observed' }],
      facts: [{ node_id: 'node:1', revision: 3, digest: 'sha256:bb' }],
      rules: [{ rule_id: 'rule:cap', version: 2, digest: 'sha256:cc' }],
      approver: 'alice',
    })
    const { user } = renderWithProviders(<DecisionExplorerTab transport={transport} />)
    await user.click(await screen.findByRole('button', { name: /decision:abc123/i }))
    expect(await screen.findByText('node:1 @ r3')).toBeInTheDocument()
    expect(screen.getByText('rule:cap v2')).toBeInTheDocument()
    expect(screen.getByText(/approved by alice/)).toBeInTheDocument()
  })

  // spec: OVERSTORY-DECIDE-R002
  it('shows provenance as unavailable when decision.provenance.get is not served yet', async () => {
    const transport = createFixtureTransport()
    transport.listDecisions.mockResolvedValue([baseRow])
    transport.getDecision.mockResolvedValue(baseRecord)
    transport.getDecisionProvenance.mockRejectedValue(new ArboraApiError('UNAVAILABLE', 503, true, {}))
    const { user } = renderWithProviders(<DecisionExplorerTab transport={transport} />)
    await user.click(await screen.findByRole('button', { name: /decision:abc123/i }))
    expect(await screen.findByText(/provenance is not served yet/i)).toBeInTheDocument()
  })
})
