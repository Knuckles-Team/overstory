import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { sendGraphEdit } from '@/lib/graph-edit'
import { renderGraphView } from '@/__tests__/graph-view-harness'

vi.mock('@/components/knowledge-graph/GraphCanvas', async () =>
  (await import('@/__tests__/graph-canvas-mock')).canvasModule(),
)
vi.mock('@/lib/graph-edit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/graph-edit')>()),
  sendGraphEdit: vi.fn(),
}))

const send = vi.mocked(sendGraphEdit)

describe('graph edit log', () => {
  beforeEach(() => {
    send.mockReset()
  })

  // spec: OVERSTORY-APPS-R030.6
  it('test_log_records_each_verdict', async () => {
    send.mockResolvedValueOnce({ verdict: 'applied', reason: '', id: 'node1' })
    send.mockResolvedValueOnce({ verdict: 'refused', reason: 'ACCESS_DENIED' })
    send.mockResolvedValueOnce({ verdict: 'unavailable', reason: 'not available' })
    const { user } = renderGraphView()
    await screen.findByTestId('graph-edit-log-empty')
    await screen.findByRole('list', { name: 'canvas nodes' })

    await user.click(screen.getByText('mock-delete'))
    await user.click(screen.getByText('mock-add'))
    await user.click(screen.getByText('mock-update'))

    const log = await screen.findByRole('list', { name: 'Graph edit log' })
    await waitFor(() => {
      expect(within(log).getAllByRole('listitem')).toHaveLength(3)
    })
    const rows = within(log).getAllByRole('listitem')
    // Newest first: update (unavailable), add (refused), delete (applied).
    expect(rows.map((row) => row.getAttribute('data-verdict'))).toEqual(['unavailable', 'refused', 'applied'])
    expect(rows[0]).toHaveTextContent('update node1')
    expect(rows[0]).toHaveTextContent('not available')
    expect(rows[1]).toHaveTextContent('add Concept')
    expect(rows[1]).toHaveTextContent('ACCESS_DENIED')
    expect(rows[2]).toHaveTextContent('delete node1')
  })
})
