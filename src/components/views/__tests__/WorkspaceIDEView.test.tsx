// spec: OVERSTORY-DESIGN-R004.1.2
import { render, screen, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkspaceIDEView from '@/components/views/WorkspaceIDEView'

vi.mock('@/lib/api', () => ({ api: { getEditorContext: vi.fn().mockRejectedValue(new Error('offline')) } }))
vi.mock('@/lib/page-context', () => ({ usePageContextPublisher: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WorkspaceIDEView', () => {
  it('says settings will not persist when browser storage is denied', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError')
    })
    render(<WorkspaceIDEView />)
    expect(screen.getByRole('status').textContent).toMatch(/settings won.t persist/)
    expect(screen.getByTitle('Workspace IDE')).toBeTruthy()
  })

  it('stays quiet when storage works', () => {
    render(<WorkspaceIDEView />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('replaces the frame with a notice when the frame policy blocks it', () => {
    render(<WorkspaceIDEView />)
    act(() => {
      const event = new Event('securitypolicyviolation') as Event & {
        violatedDirective: string
        effectiveDirective: string
      }
      Object.assign(event, { violatedDirective: "frame-src 'none'", effectiveDirective: 'frame-src' })
      document.dispatchEvent(event)
    })
    expect(screen.queryByTitle('Workspace IDE')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/frame policy/)
  })
})
