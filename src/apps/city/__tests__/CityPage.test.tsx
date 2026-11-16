/**
 * @file CityPage.test.tsx
 * @description The city page shell (OVERSTORY-CITY-R001/R013/R014/R018):
 * the mode decision (LIVE fleet read vs SIMULATED fallback with a stated
 * banner), startup asset verification against the real lockfile and real
 * GLB bytes, and unmount safety (renderer disposed, no animation frame
 * survives). The 3D renderer is mocked — jsdom cannot run a WebGL scene.
 *
 * Every test boots the page to completion (`.city-booting` gone) before
 * asserting, then unmounts so the effect cleanup runs and no bus ring,
 * world state or in-flight boot leaks into the next test.
 */
// spec: OVERSTORY-CITY-R012, OVERSTORY-CITY-R013, OVERSTORY-CITY-R014, OVERSTORY-CITY-R018
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CityPage, { parseSpeedParam } from '../components/CityPage'
import { init3D } from '../core/render3d'
import type { CityRenderer } from '../core/types'

vi.mock('../core/render3d', () => ({ init3D: vi.fn() }))

const PUBLIC_DIR = join(__dirname, '..', '..', '..', '..', 'public')

function lockJson(): unknown {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, 'city-assets', 'assets.lock.json'), 'utf8'))
}

function assetBytes(rel: string): ArrayBuffer {
  const buf = readFileSync(join(PUBLIC_DIR, 'city-assets', rel))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function fakeRenderer(): CityRenderer {
  return {
    render: vi.fn(),
    dispose: vi.fn(),
    focus: vi.fn(),
    overview: vi.fn(),
    say: vi.fn(),
    onResize: vi.fn(),
    setSelected: vi.fn(),
  }
}

function installFetch(mode: 'live' | 'simulated'): void {
  const lock = lockJson()
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.startsWith('/api/apps/city/fleet')) {
      if (mode === 'live') {
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(''),
          json: () =>
            Promise.resolve({
              servers: [
                { server: 'alpha-mcp', toolCount: 5, tools: ['alpha_one'], packStatus: 'served' },
                { server: 'beta-mcp', toolCount: 0, tools: [], packStatus: 'registered_unpublished' },
              ],
              captured_at: '2026-11-15T12:00:00Z',
              cache: { stale: false, age_seconds: 0 },
            }),
        } as Response
      }
      return {
        ok: false,
        status: 503,
        text: () => Promise.resolve('arbora_unreachable'),
        json: () => Promise.resolve({}),
      } as unknown as Response
    }
    if (url.startsWith('/city-assets/assets.lock.json')) {
      return { ok: true, status: 200, json: () => Promise.resolve(lock) } as unknown as Response
    }
    if (url.startsWith('/city-assets/')) {
      const rel = url.replace(/^\/city-assets\//, '')
      return {
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(assetBytes(rel)),
      } as unknown as Response
    }
    return { ok: true, status: 200, json: () => Promise.resolve([]) } as unknown as Response
  }) as unknown as typeof fetch
}

let rafRegistered = 0

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  }
  // Never fire: boot schedules exactly one frame, so the registered count is
  // the loop's liveness and unmount's cancel is observable.
  globalThis.requestAnimationFrame = () => {
    rafRegistered++
    return rafRegistered
  }
  globalThis.cancelAnimationFrame = vi.fn()
})

/** Render the page and wait until boot has completed (renderer + UI up). */
async function bootCity(mode: 'live' | 'simulated') {
  installFetch(mode)
  window.history.replaceState(null, '', '/apps/city')
  const view = render(<CityPage />)
  await vi.waitFor(
    () => {
      expect(document.querySelector('.city-booting')).toBeNull()
    },
    { timeout: 15_000 },
  )
  return view
}

describe('parseSpeedParam (R012)', () => {
  it('parses the accepted speeds and defaults to 1x', () => {
    expect(parseSpeedParam('?speed=4')).toBe(4)
    expect(parseSpeedParam('?speed=0')).toBe(0)
    expect(parseSpeedParam('?speed=2')).toBe(2)
    expect(parseSpeedParam('')).toBe(1)
    expect(parseSpeedParam('?speed=')).toBe(1)
    expect(parseSpeedParam('?speed=bogus')).toBe(1)
    expect(parseSpeedParam('?speed=8')).toBe(1)
  })
})

describe('mode decision (R014)', () => {
  it('boots LIVE when the host serves the fleet', async () => {
    const view = await bootCity('live')
    try {
      expect(screen.getByText('LIVE')).toBeInTheDocument()
      const banner = document.querySelector('.city-banner') as HTMLElement
      expect(banner.classList.contains('hidden')).toBe(true)
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([u]) =>
          String(u).includes('/api/apps/city/fleet'),
        ),
      ).toBe(true)
    } finally {
      view.unmount()
    }
  })

  it('falls back to SIMULATED with a stated banner when the fleet read fails', async () => {
    const view = await bootCity('simulated')
    try {
      expect(screen.getByText('SIMULATED')).toBeInTheDocument()
      const banner = document.querySelector('.city-banner') as HTMLElement
      expect(banner.classList.contains('hidden')).toBe(false)
      expect(banner.textContent).toContain('live fleet read is unavailable')
    } finally {
      view.unmount()
    }
  })

  it('verifies every pinned asset at startup (R013): 18 verified events, no failures', async () => {
    const view = await bootCity('live')
    try {
      const chips = Array.from(document.querySelectorAll('.feed-item .chip-evt')).map((el) => el.textContent)
      expect(chips.filter((t) => t === 'asset.verified')).toHaveLength(18)
      expect(chips.some((t) => t === 'asset.failed')).toBe(false)
    } finally {
      view.unmount()
    }
  })

  it('lists the connectors from the live fleet in the onboard modal', async () => {
    const view = await bootCity('live')
    try {
      screen.getByRole('button', { name: 'Onboard connector' }).click()
      const modal = document.querySelector('.city-modal-backdrop') as HTMLElement
      expect(modal.classList.contains('open')).toBe(true)
      // The card name may carry a trailing SERVED badge in the same node.
      const names = Array.from(document.querySelectorAll('.c-name')).map((el) => el.textContent?.trim() ?? '')
      expect(names.some((n) => n.startsWith('Alpha'))).toBe(true)
      expect(names.some((n) => n.startsWith('Beta'))).toBe(true)
    } finally {
      view.unmount()
    }
  })
})

describe('unmount safety (R018)', () => {
  it('disposes the renderer and schedules no animation frame afterwards', async () => {
    const renderer = fakeRenderer()
    ;(init3D as ReturnType<typeof vi.fn>).mockResolvedValue(renderer)
    const registeredBefore = rafRegistered
    const view = await bootCity('simulated')
    expect(rafRegistered).toBeGreaterThan(registeredBefore) // the loop scheduled a frame
    view.unmount()
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    // The pending frame was cancelled; nothing new was scheduled.
    expect(globalThis.cancelAnimationFrame as ReturnType<typeof vi.fn>).toHaveBeenCalled()
    expect(rafRegistered).toBe(registeredBefore + 1)
  })
})
