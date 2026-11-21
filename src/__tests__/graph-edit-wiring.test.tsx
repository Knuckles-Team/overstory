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

describe('graph edit wiring', () => {
  beforeEach(() => {
    send.mockReset()
  })

  // spec: OVERSTORY-APPS-R030.3
  it('test_handlers_call_send_graph_edit', async () => {
    send.mockResolvedValueOnce({ verdict: 'applied', reason: '', id: 'node1' })
    send.mockResolvedValueOnce({ verdict: 'applied', reason: '', id: 'node_new' })
    const { user } = renderGraphView()
    const list = await screen.findByRole('list', { name: 'canvas nodes' })
    await waitFor(() => {
      expect(list).toHaveTextContent('node1')
    })

    await user.click(screen.getByText('mock-delete'))
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith({ kind: 'delete', id: 'node1' })
      expect(list).not.toHaveTextContent('node1')
    })

    await user.click(screen.getByText('mock-add'))
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith({ kind: 'add', labels: ['Concept'], properties: { name: 'fresh' } })
      expect(list).toHaveTextContent('node_new')
    })
  })

  it('changes no local state before the engine answers', async () => {
    send.mockReturnValue(new Promise(() => undefined))
    const { user } = renderGraphView()
    const list = await screen.findByRole('list', { name: 'canvas nodes' })
    await waitFor(() => {
      expect(list).toHaveTextContent('node1')
    })
    await user.click(screen.getByText('mock-delete'))
    expect(send).toHaveBeenCalledTimes(1)
    expect(list).toHaveTextContent('node1')
  })
})
