/**
 * @file CityPage.test.tsx
 * @description The city page shell (OVERSTORY-CITY-R012/R013/R014/R015/R018,
 * R026/R027/R030): the mode decision (LIVE fleet read vs SIMULATED fallback
 * with a stated banner), startup asset verification against the real
 * lockfile and real GLB bytes (including the license-allowlist gate), the
 * quiet-by-default activity badge and the `?demo=` boot, keyboard
 * accessibility of the controls, the WebGL context-loss fallback to the 2D
 * schematic, the first-visit tour (once per session, skippable) and unmount
 * safety (renderer disposed, no animation frame survives). The 3D renderer
 * is mocked — jsdom cannot run a WebGL scene; the 2D schematic is real.
 *
 * Every test boots the page to completion (`.city-booting` gone) before
 * asserting, then unmounts so the effect cleanup runs and no bus ring,
 * world state or in-flight boot leaks into the next test.
 */
// spec: OVERSTORY-CITY-R012, OVERSTORY-CITY-R013, OVERSTORY-CITY-R014, OVERSTORY-CITY-R015, OVERSTORY-CITY-R018, OVERSTORY-CITY-R026, OVERSTORY-CITY-R027, OVERSTORY-CITY-R029, OVERSTORY-CITY-R030
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CityPage, { parseDemoParam, parseSpeedParam } from '../components/CityPage'
import { init3D } from '../core/render3d'
import { tickSim, world } from '../core/sim'
import { TOUR_SESSION_KEY } from '../core/ui'
import type { CityRenderer } from '../core/types'

vi.mock('../core/render3d', () => ({ init3D: vi.fn() }))

const PUBLIC_DIR = join(__dirname, '..', '..', '..', '..', 'public')

function lockJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, 'city-assets', 'assets.lock.json'), 'utf8')) as Record<
    string,
    unknown
  >
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

/** Install the fetch double: fleet endpoint, lockfile (optionally mutated) and asset bytes. */
function installFetch(mode: 'live' | 'simulated', lockOverride?: Record<string, unknown>): void {
  const lock = lockOverride ?? lockJson()
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
async function bootCity(mode: 'live' | 'simulated', path = '/apps/city') {
  installFetch(mode)
  window.history.replaceState(null, '', path)
  const view = render(<CityPage />)
  await vi.waitFor(
    () => {
      expect(document.querySelector('.city-booting')).toBeNull()
    },
    { timeout: 15_000 },
  )
  return view
}

describe('speed and demo URL params (R012/R026)', () => {
  it('parseSpeedParam: parses the accepted speeds and defaults to 1x', () => {
    expect(parseSpeedParam('?speed=4')).toBe(4)
    expect(parseSpeedParam('?speed=0')).toBe(0)
    expect(parseSpeedParam('?speed=2')).toBe(2)
    expect(parseSpeedParam('')).toBe(1)
    expect(parseSpeedParam('?speed=')).toBe(1)
    expect(parseSpeedParam('?speed=bogus')).toBe(1)
    expect(parseSpeedParam('?speed=8')).toBe(1)
  })

  it('parseDemoParam: ?demo=1|true boots labelled demo, absent or invalid boots quiet', () => {
    expect(parseDemoParam('?demo=1')).toBe(true)
    expect(parseDemoParam('?demo=true')).toBe(true)
    expect(parseDemoParam('')).toBe(false)
    expect(parseDemoParam('?demo=0')).toBe(false)
    expect(parseDemoParam('?demo=false')).toBe(false)
    expect(parseDemoParam('?demo=bogus')).toBe(false)
  })
})

describe('activity mode (R026)', () => {
  it('boots quiet by default, labelled in the badge', async () => {
    const view = await bootCity('simulated')
    try {
      const badge = document.querySelector('.badge.quiet') as HTMLElement
      expect(badge?.textContent).toBe('QUIET ACTIVITY')
      const demoBtn = document.querySelector('button[aria-pressed]') as HTMLButtonElement
      expect(demoBtn?.textContent).toBe('Demo: off')
      expect(demoBtn?.getAttribute('aria-pressed')).toBe('false')
    } finally {
      view.unmount()
    }
  })

  it('?demo=1 boots the labelled demo mode', async () => {
    const view = await bootCity('simulated', '/apps/city?demo=1')
    try {
      const badge = document.querySelector('.badge.demo') as HTMLElement
      expect(badge?.textContent).toBe('DEMO ACTIVITY')
      const demoBtn = document.querySelector('button[aria-pressed]') as HTMLButtonElement
      expect(demoBtn?.getAttribute('aria-pressed')).toBe('true')
    } finally {
      view.unmount()
    }
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

  it('verifies every pinned asset at startup (R013): the shared rig + marker verified, no failures', async () => {
    const view = await bootCity('live')
    try {
      await vi.waitFor(() => {
        const chips = Array.from(document.querySelectorAll('.feed-item .chip-evt')).map((el) => el.textContent)
        expect(chips.filter((t) => t === 'asset.verified')).toHaveLength(2)
      })
      const chips = Array.from(document.querySelectorAll('.feed-item .chip-evt')).map((el) => el.textContent)
      expect(chips.some((t) => t === 'asset.failed')).toBe(false)
    } finally {
      view.unmount()
    }
  })

  it('refuses an out-of-allowlist pin before any bytes are fetched (R013 license gate)', async () => {
    const lock = JSON.parse(JSON.stringify(lockJson())) as Record<string, unknown>
    const files = lock.files as Record<string, { license: string }>
    const firstPin = Object.keys(files)[0]
    files[firstPin].license = 'GPL-3.0'
    installFetch('simulated', lock)
    window.history.replaceState(null, '', '/apps/city')
    const view = render(<CityPage />)
    try {
      await vi.waitFor(
        () => {
          const texts = Array.from(document.querySelectorAll('.feed-item')).map((el) => el.textContent ?? '')
          expect(texts.some((t) => t.includes('refused'))).toBe(true)
        },
        { timeout: 15_000 },
      )
      const chips = Array.from(document.querySelectorAll('.feed-item .chip-evt')).map((el) => el.textContent)
      expect(chips.filter((t) => t === 'asset.failed').length).toBeGreaterThanOrEqual(1)
      expect(chips.filter((t) => t === 'asset.verified')).toHaveLength(0)
      // The refusal happens before the fetch loop: no GLB was requested.
      const glbFetches = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) =>
        String(u).endsWith('.glb'),
      )
      expect(glbFetches).toHaveLength(0)
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

describe('replay (R029): the scrubber re-runs the actual city', () => {
  it('a LIVE city replays its served catalog, not the bundled snapshot', async () => {
    const view = await bootCity('live')
    try {
      // The live boot built the city from the served catalog (2 servers),
      // not the bundled snapshot (74).
      expect(world.connectors.length).toBe(2)
      // Advance the clock past boot, then record an operator action inside
      // the window the scrubber will seek, and seek.
      for (let i = 0; i < 30; i++) tickSim(1, 1 / world.timeScale)
      screen.getByRole('button', { name: 'Dispatch task' }).click()
      const scrubber = document.getElementById('city-scrubber') as HTMLInputElement
      // The 4 Hz panel refresh would have widened the range already; the
      // operator drags within the range the UI exposed.
      scrubber.max = String(world.absGameS - 9 * 3600)
      scrubber.value = '15'
      scrubber.dispatchEvent(new Event('input', { bubbles: true }))
      // The replay is debounced (~250 ms) and boots from the same source.
      await vi.waitFor(
        () => {
          expect(document.querySelector('.feed-item .prov-chip.replay')).not.toBeNull()
        },
        { timeout: 5_000 },
      )
      // The replayed city is still the served catalog — the snapshot's 74
      // connectors never replaced it.
      expect(world.connectors.length).toBe(2)
      // The mode never swapped to the snapshot's mode.
      expect(screen.getByText('LIVE')).toBeInTheDocument()
      // And the readout states the replayed clock, not "live".
      const readout = document.querySelector('.scrub-readout') as HTMLElement
      expect(readout.textContent?.startsWith('replayed')).toBe(true)
    } finally {
      view.unmount()
    }
  })

  it('a scrubber drag fires one replay, not one per input event', async () => {
    const view = await bootCity('live')
    try {
      for (let i = 0; i < 30; i++) tickSim(1, 1 / world.timeScale)
      screen.getByRole('button', { name: 'Dispatch task' }).click()
      const scrubber = document.getElementById('city-scrubber') as HTMLInputElement
      // The 4 Hz panel refresh would have widened the range already.
      scrubber.max = String(world.absGameS - 9 * 3600)
      // A drag: several input events in quick succession.
      for (const v of ['5', '10', '15']) {
        scrubber.value = v
        scrubber.dispatchEvent(new Event('input', { bubbles: true }))
      }
      await vi.waitFor(
        () => {
          expect(document.querySelector('.feed-item .prov-chip.replay')).not.toBeNull()
        },
        { timeout: 5_000 },
      )
      // One replay run marks ~17 spawn rows; the feed keeps 40, so a
      // saturated list (all rows replayed) means the drag multiplied runs.
      const marked = document.querySelectorAll('.feed-item .prov-chip.replay').length
      expect(marked).toBeGreaterThanOrEqual(17)
      expect(marked).toBeLessThan(40)
    } finally {
      view.unmount()
    }
  })
})

describe('keyboard accessibility (R027)', () => {
  it('the stat labels are not form labels; the scrubber has a labelled control', async () => {
    const view = await bootCity('simulated')
    try {
      expect(document.querySelectorAll('.stat label')).toHaveLength(0)
      expect(document.querySelectorAll('.stat .stat-label')).toHaveLength(5)
      const label = document.querySelector('label[for="city-scrubber"]')
      expect(label).not.toBeNull()
      expect(document.getElementById('city-scrubber')?.getAttribute('type')).toBe('range')
    } finally {
      view.unmount()
    }
  })

  it('population rows are keyboard reachable: tabindex and button semantics', async () => {
    const view = await bootCity('simulated')
    try {
      const rows = document.querySelectorAll('.pop-row')
      expect(rows.length).toBe(17)
      for (const row of rows) {
        expect(row.getAttribute('tabindex')).toBe('0')
        expect(row.getAttribute('role')).toBe('button')
        expect(row.getAttribute('aria-label')).toBeTruthy()
      }
    } finally {
      view.unmount()
    }
  })

  it('the modal is a dialog with focus management and Escape closes it', async () => {
    const view = await bootCity('simulated')
    try {
      screen.getByRole('button', { name: 'Onboard connector' }).click()
      const panel = document.querySelector('.city-modal-backdrop .city-modal') as HTMLElement
      expect(panel.getAttribute('role')).toBe('dialog')
      expect(panel.getAttribute('aria-modal')).toBe('true')
      // Focus moved into the dialog (the close control).
      expect(document.activeElement).toBe(panel.querySelector('#city-modal-close'))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await vi.waitFor(() => {
        expect((document.querySelector('.city-modal-backdrop') as HTMLElement).classList.contains('open')).toBe(false)
      })
      // Focus returns to the trigger control.
      const trigger = screen.getByRole('button', { name: 'Onboard connector' })
      expect(document.activeElement).toBe(trigger)
    } finally {
      view.unmount()
    }
  })

  it('the 3D/2D toggle is keyboard operable and swaps the renderer', async () => {
    const renderer = fakeRenderer()
    renderer.getViewport = vi.fn(() => ({ x: 40, z: -30, verticalSpan: 200 }))
    renderer.setViewport = vi.fn()
    ;(init3D as ReturnType<typeof vi.fn>).mockResolvedValue(renderer)
    const view = await bootCity('simulated')
    try {
      const btn2d = screen.getByRole('button', { name: '2D view' })
      const btn3d = screen.getByRole('button', { name: '3D view' })
      const holder = document.querySelector('.city-holder') as HTMLElement
      Object.defineProperty(holder, 'clientWidth', { value: 800, configurable: true })
      Object.defineProperty(holder, 'clientHeight', { value: 600, configurable: true })
      expect(btn2d.getAttribute('aria-pressed')).toBe('false')
      expect(btn3d.getAttribute('aria-pressed')).toBe('true')
      // Keyboard activation of the toggle (R027: no mouse-only control).
      btn2d.focus()
      btn2d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      // The toggle fires on click; the browser maps Enter on a focused
      // button to a click — exercise the same path the keyboard does.
      btn2d.click()
      await vi.waitFor(() => {
        expect(btn2d.getAttribute('aria-pressed')).toBe('true')
        expect(btn3d.getAttribute('aria-pressed')).toBe('false')
      })
      // The 3D renderer was torn down; the 2D schematic (a canvas) is up.
      expect(renderer.dispose).toHaveBeenCalledTimes(1)
      expect(holder.querySelector('canvas')).not.toBeNull()
      btn3d.click()
      await vi.waitFor(() => {
        expect(renderer.setViewport).toHaveBeenCalledWith({ x: 40, z: -30, verticalSpan: 200 })
      })
    } finally {
      view.unmount()
    }
  })
})

describe('WebGL context loss and restore (R015)', () => {
  // The 3D renderer is mocked (jsdom cannot run a WebGL scene), but the mock
  // emulates three's listener wiring: it mounts a real canvas and attaches the
  // page's callbacks as real DOM listeners, exactly as WebGLRenderer does on
  // its canvas. The tests then dispatch real webglcontextlost /
  // webglcontextrestored events — the listeners are exercised through the
  // DOM, never by calling the callbacks (R015).
  function mockInit3DWithRealCanvas(): CityRenderer {
    const renderer = fakeRenderer()
    vi.mocked(init3D).mockImplementation((container, _w, opts) => {
      const canvas = document.createElement('canvas')
      canvas.className = 'city-3d-canvas'
      container.appendChild(canvas)
      if (opts.onContextLost) canvas.addEventListener('webglcontextlost', opts.onContextLost)
      if (opts.onContextRestored) canvas.addEventListener('webglcontextrestored', opts.onContextRestored)
      return Promise.resolve(renderer)
    })
    return renderer
  }

  it('a lost context keeps the paused 3D renderer under the 2D schematic', async () => {
    const renderer = mockInit3DWithRealCanvas()
    const view = await bootCity('simulated')
    try {
      const canvas = document.querySelector('canvas.city-3d-canvas') as HTMLCanvasElement
      canvas.dispatchEvent(new Event('webglcontextlost'))
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: '2D view' }).getAttribute('aria-pressed')).toBe('true')
      })
      // The schematic layers over the kept 3D canvas — it is not replaced,
      // and the paused renderer was not disposed (the fallback is not a
      // one-way door).
      const holder = document.querySelector('.city-holder') as HTMLElement
      expect(holder.querySelectorAll('canvas')).toHaveLength(2)
      expect(renderer.dispose).not.toHaveBeenCalled()
      // A manual 3D toggle is ignored while the kept renderer is paused —
      // the restore callback owns the return path.
      screen.getByRole('button', { name: '3D view' }).click()
      expect(holder.querySelectorAll('canvas')).toHaveLength(2)
      expect(renderer.dispose).not.toHaveBeenCalled()
    } finally {
      view.unmount()
    }
  })

  it('a restored context resumes the kept 3D renderer and drops the schematic', async () => {
    const renderer = mockInit3DWithRealCanvas()
    renderer.getViewport = vi.fn(() => ({ x: 18, z: -26, verticalSpan: 150 }))
    renderer.setViewport = vi.fn()
    const view = await bootCity('simulated')
    try {
      const holder = document.querySelector('.city-holder') as HTMLElement
      Object.defineProperty(holder, 'clientWidth', { value: 800, configurable: true })
      Object.defineProperty(holder, 'clientHeight', { value: 600, configurable: true })
      const canvas = document.querySelector('canvas.city-3d-canvas') as HTMLCanvasElement
      canvas.dispatchEvent(new Event('webglcontextlost'))
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: '2D view' }).getAttribute('aria-pressed')).toBe('true')
      })
      canvas.dispatchEvent(new Event('webglcontextrestored'))
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: '3D view' }).getAttribute('aria-pressed')).toBe('true')
      })
      // The kept renderer resumed: it was never disposed and the schematic
      // canvas is gone — one canvas in the holder, the 3D one.
      expect(holder.querySelectorAll('canvas')).toHaveLength(1)
      expect(holder.querySelector('canvas.city-3d-canvas')).not.toBeNull()
      expect(renderer.dispose).not.toHaveBeenCalled()
      expect(renderer.setViewport).toHaveBeenCalledWith({ x: 18, z: -26, verticalSpan: 150 })
    } finally {
      view.unmount()
    }
  })

  it('unmount disposes both the active renderer and a kept one', async () => {
    const renderer = mockInit3DWithRealCanvas()
    const view = await bootCity('simulated')
    const canvas = document.querySelector('canvas.city-3d-canvas') as HTMLCanvasElement
    canvas.dispatchEvent(new Event('webglcontextlost'))
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: '2D view' }).getAttribute('aria-pressed')).toBe('true')
    })
    view.unmount()
    // The kept 3D renderer is disposed with the rest of the page (R018).
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })
})

describe('first-visit tour (R030)', () => {
  it('runs on first visit, is skippable, and marks the session done', async () => {
    window.sessionStorage.removeItem(TOUR_SESSION_KEY)
    const view = await bootCity('simulated')
    try {
      await vi.waitFor(() => {
        expect(document.querySelector('.tour-card')).not.toBeNull()
      })
      expect(document.querySelector('.tour-card')?.textContent).toContain('Welcome to Arbora City')
      const skip = document.querySelector('#city-tour-skip') as HTMLButtonElement | null
      expect(skip).not.toBeNull()
      skip?.click()
      expect(document.querySelector('.tour-card')).toBeNull()
      expect(window.sessionStorage.getItem(TOUR_SESSION_KEY)).toBe('1')
    } finally {
      view.unmount()
    }
  })

  it('does not re-run once the session has seen the tour', async () => {
    window.sessionStorage.setItem(TOUR_SESSION_KEY, '1')
    const view = await bootCity('simulated')
    try {
      await vi.waitFor(() => {
        expect(document.querySelector('.city-booting')).toBeNull()
      })
      // Give the (absent) tour one tick to prove it never renders.
      await new Promise((r) => setTimeout(r, 50))
      expect(document.querySelector('.tour-card')).toBeNull()
    } finally {
      view.unmount()
    }
  })

  it('the legend stays available (R025/R030)', async () => {
    const view = await bootCity('simulated')
    try {
      await vi.waitFor(() => {
        expect(document.querySelectorAll('.legend-line').length).toBe(6)
      })
      const first = document.querySelector('.legend-line')?.textContent
      expect(first).toContain('=')
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
