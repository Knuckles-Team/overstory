// spec: OVERSTORY-IDENTITY-R003.3.4
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { invoke } from '@/lib/arbora-api/invoke'
import { useIdentity } from '@/lib/auth'
import { IDENTITY_INVALIDATED } from '@/lib/identity-events'

const signedIn = { authenticated: true, subject: 'fixture-user', roles: [], webui_role: 'user', mode: 'external' }

function Probe() {
  const { identity, loading } = useIdentity()
  return <output data-testid="id">{loading ? 'loading' : `${identity.needsSignIn}:${identity.userKey}`}</output>
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('only_a_real_401_signs_out', () => {
  it('keeps a known session when a later session read answers 503, and retries later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(signedIn))
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValue(Response.json(signedIn))
    vi.stubGlobal('fetch', fetcher)
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('id')).toHaveTextContent('false:fixture-user'))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByTestId('id')).toHaveTextContent('false:fixture-user')
    expect(fetcher).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('refuses an operation inline when the session has no CSRF token, without invalidating', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(signedIn))
    vi.stubGlobal('fetch', fetcher)
    const invalidated = vi.fn()
    window.addEventListener(IDENTITY_INVALIDATED, invalidated)
    await expect(invoke('markets.status', {}, z.unknown())).rejects.toThrow()
    await expect(invoke('markets.status', {}, z.unknown())).rejects.toThrow()
    window.removeEventListener(IDENTITY_INVALIDATED, invalidated)
    expect(invalidated).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not invalidate on a 503 session read but does on a 401', async () => {
    const invalidated = vi.fn()
    window.addEventListener(IDENTITY_INVALIDATED, invalidated)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('busy', { status: 503 })))
    await expect(invoke('markets.status', {}, z.unknown())).rejects.toThrow()
    expect(invalidated).not.toHaveBeenCalled()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 401 })))
    await expect(invoke('markets.status', {}, z.unknown())).rejects.toThrow()
    window.removeEventListener(IDENTITY_INVALIDATED, invalidated)
    expect(invalidated).toHaveBeenCalledTimes(1)
  })
})
