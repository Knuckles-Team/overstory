import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
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

describe('graph edit refusal', () => {
  beforeEach(() => {
    send.mockReset()
  })

  // spec: OVERSTORY-APPS-R030.4
  it('test_unauthorized_edit_refused_and_unchanged', async () => {
    send.mockResolvedValue({ verdict: 'refused', reason: 'ACCESS_DENIED: node:write is required' })
    const { user } = renderGraphView()
    const list = await screen.findByRole('list', { name: 'canvas nodes' })
    await waitFor(() => {
      expect(list).toHaveTextContent('node1')
    })
    await user.click(screen.getByText('mock-delete'))
    const notice = await screen.findByTestId('graph-edit-refusal')
    expect(notice).toHaveTextContent('Edit refused: ACCESS_DENIED: node:write is required')
    expect(list).toHaveTextContent('node1')
  })

  it('shows not available when the operation is absent and leaves the node', async () => {
    send.mockResolvedValue({ verdict: 'unavailable', reason: 'not available' })
    const { user } = renderGraphView()
    const list = await screen.findByRole('list', { name: 'canvas nodes' })
    await waitFor(() => {
      expect(list).toHaveTextContent('node1')
    })
    await user.click(screen.getByText('mock-update'))
    expect(await screen.findByTestId('graph-edit-refusal')).toHaveTextContent('not available')
    expect(list).toHaveTextContent('node1')
  })
})
