import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import KnowledgeBaseView from '@/components/views/KnowledgeBaseView'
import { api } from '@/lib/api'
import { renderWithProviders, mockKnowledgeBase, mockArticle } from '@/__tests__/fixtures'

// Mock API calls. The component imports the `api` instance from '@/lib/api',
// so the factory must expose an `api` object carrying the spied methods.
vi.mock('@/lib/api', () => ({
  api: {
    listKnowledgeBases: vi.fn(() => Promise.resolve([mockKnowledgeBase])),
    searchKnowledgeBase: vi.fn(() => Promise.resolve([mockArticle])),
    getKBArticle: vi.fn(() => Promise.resolve(mockArticle)),
  },
}))

describe('KnowledgeBaseView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders knowledge base list correctly', async () => {
    renderWithProviders(<KnowledgeBaseView />)

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base')).toBeInTheDocument()
      expect(screen.getByText('10')).toBeInTheDocument() // article count
    })
  })

  it('offers no ingest action', async () => {
    renderWithProviders(<KnowledgeBaseView />)

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /ingest knowledge base/i })).toBeNull()
  })

  it('displays articles tab when KB is selected', async () => {
    const { user } = renderWithProviders(<KnowledgeBaseView />)

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base')).toBeInTheDocument()
    })

    // Click on KB
    await user.click(screen.getByText('Test Knowledge Base'))

    // "Articles" is both a tab and a card stat label; target the tab.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Articles' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('tab', { name: 'Articles' }))

    await waitFor(() => {
      expect(screen.getByText('Test Article')).toBeInTheDocument()
    })
  })

  it('offers no health tab', async () => {
    renderWithProviders(<KnowledgeBaseView />)

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base')).toBeInTheDocument()
    })
    expect(screen.queryByRole('tab', { name: 'Health' })).toBeNull()
  })

  it('shows loading state initially', () => {
    renderWithProviders(<KnowledgeBaseView />)

    expect(screen.getByText(/loading/i) || screen.queryByText(/loading/i)).toBeDefined()
  })

  it('handles empty knowledge bases gracefully', async () => {
    // Drive the real data path: KnowledgeBaseView lists via fetch('/api/enhanced/kb/list').
    vi.mocked(api).listKnowledgeBases.mockResolvedValueOnce([])
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        text: () => Promise.resolve('[]'),
      } as unknown as Response),
    ) as unknown as typeof fetch

    renderWithProviders(<KnowledgeBaseView />)

    await waitFor(() => {
      expect(screen.getByText('No knowledge bases found')).toBeInTheDocument()
    })
  })

  it('filters knowledge bases by search query', async () => {
    const { user } = renderWithProviders(<KnowledgeBaseView />)

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search knowledge bases/i)
    await user.type(searchInput, 'Test')

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base')).toBeInTheDocument()
    })
  })

  it('displays concepts tab with concept cards', async () => {
    const { user } = renderWithProviders(<KnowledgeBaseView />)

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('tab', { name: 'Concepts' }))

    // With a knowledge base auto-selected and its article loaded, the concepts
    // tab renders concept cards derived from the article's concepts.
    await waitFor(() => {
      expect(screen.getByText('AI')).toBeInTheDocument()
      expect(screen.getByText('Testing')).toBeInTheDocument()
    })
  })
})
