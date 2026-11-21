// spec: OVERSTORY-APPS-R005.4
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveIdentity, type AuthSession } from '@/lib/auth'
import { conversationOwnerKey, saveConversationEntry, useConversations } from '@/lib/chat-store'
import { AppSidebar } from '../app-sidebar'
import { SidebarProvider } from '../ui/sidebar'

const identity = resolveIdentity(
  { authenticated: true, roles: [], subject: 'sync-subject', tenant: 'tenant-a' } as AuthSession,
  true,
)
const ownerKey = conversationOwnerKey(identity)

vi.mock('@/lib/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth')>()
  return { ...original, useIdentity: () => ({ identity, loading: false }) }
})
vi.mock('../mode-toggle', () => ({ ModeToggle: () => null }))
vi.mock('../UserMenu', () => ({ UserMenu: () => null }))

/** The workspace assistant reads its session list through the same hook the sidebar uses. */
function AssistantSessions() {
  const entries = useConversations(ownerKey)
  return (
    <ul aria-label="Assistant sessions">
      {entries.map((entry) => (
        <li key={entry.id}>{entry.firstMessage}</li>
      ))}
    </ul>
  )
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <AppSidebar />
        <AssistantSessions />
      </SidebarProvider>
    </QueryClientProvider>,
  )
}

function stubChats(remote: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => Promise.resolve(Response.json(url === '/api/apps' ? { apps: [] } : remote))),
  )
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/chat')
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('OVERSTORY-APPS-R005.4 one chat session list', () => {
  it('shows a session created in the assistant in the navigation list and the assistant list', async () => {
    stubChats([])
    mount()
    expect(screen.queryByText('Plan the release')).not.toBeInTheDocument()
    act(() => {
      saveConversationEntry(ownerKey, '/conversation-1', 'Plan the release')
    })
    await waitFor(() => {
      expect(screen.getAllByText('Plan the release')).toHaveLength(2)
    })
    const assistant = screen.getByRole('list', { name: 'Assistant sessions' })
    expect(assistant).toHaveTextContent('Plan the release')
  })

  it('shows one entry per served session in both lists', async () => {
    stubChats([{ id: '/served-1', firstMessage: 'Served session', timestamp: 1700000000000 }])
    mount()
    await waitFor(() => {
      expect(screen.getAllByText('Served session')).toHaveLength(2)
    })
  })
})
