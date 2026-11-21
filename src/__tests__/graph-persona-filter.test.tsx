import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { filterByLabelText, personaDefaultFilter } from '@/lib/graph-edit'
import { renderGraphView } from '@/__tests__/graph-view-harness'

vi.mock('@/components/knowledge-graph/GraphCanvas', async () =>
  (await import('@/__tests__/graph-canvas-mock')).canvasModule(),
)

describe('graph persona and semantic filters', () => {
  // spec: OVERSTORY-APPS-R030.5
  it('test_persona_changes_presentation_only', async () => {
    const calls: string[] = []
    const fetcher = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input))
      return fetcher(input, init)
    })
    const { user } = renderGraphView()
    const list = await screen.findByRole('list', { name: 'canvas nodes' })
    await waitFor(() => {
      expect(list).toHaveTextContent('node1')
    })
    const before = calls.filter((url) => url.includes('/graph/')).length

    // Label text narrows the fetched set and never adds to it.
    await user.type(screen.getByLabelText('Filter by label text'), 'article')
    await waitFor(() => {
      expect(list).not.toHaveTextContent('node1')
    })
    expect(list).toHaveTextContent('node2')
    await user.clear(screen.getByLabelText('Filter by label text'))

    // A persona is presentation: the select changes, the engine is asked only for its type filter.
    await user.selectOptions(screen.getByLabelText('Persona'), 'reader')
    expect(screen.getByLabelText<HTMLSelectElement>('Persona').value).toBe('reader')
    expect(calls.every((url) => !/persona/i.test(url))).toBe(true)
    expect(before).toBeGreaterThan(0)
    vi.unstubAllGlobals()
  })

  it('a persona default filter picks only a type the engine reported', () => {
    expect(personaDefaultFilter('analyst', ['Memory', 'Document'])).toBe('Document')
    expect(personaDefaultFilter('analyst', ['Memory'])).toBeNull()
    expect(personaDefaultFilter('operator', [])).toBeNull()
    const nodes = [
      { labels: ['Memory'], properties: { name: 'alpha' } },
      { labels: ['Article'], properties: { title: 'Beta' } },
    ]
    expect(filterByLabelText(nodes, 'beta')).toHaveLength(1)
    expect(filterByLabelText(nodes, '')).toHaveLength(2)
    expect(filterByLabelText(nodes, 'zzz')).toHaveLength(0)
  })
})
