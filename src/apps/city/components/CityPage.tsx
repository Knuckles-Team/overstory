/**
 * @file CityPage.tsx
 * @description The Arbora City page (OVERSTORY-CITY-R001/R004/R014/R018).
 * The React shell decides the mode (LIVE fleet read vs SIMULATED bundled
 * snapshot), verifies the pinned character assets (license allowlist
 * included, R013), and mounts the simulation core into the holder. The core
 * owns its own DOM; this component owns the lifecycle: one fetch per pinned
 * file, a full dispose on unmount so no animation frame, timer or event
 * listener survives the route.
 *
 * The 2026-11-17 review amendments: the 3D/2D view swap with the 2D schematic
 * as the accessible view (R027), the WebGL context-loss fallback (R015), the
 * labelled demo mode with `?demo=` boot (R026), the time scrubber wired to
 * the replay driver (R029) and the first-visit tour trigger (R030).
 */
import { useEffect, useRef, useState } from 'react'
import { fetchCityFleet } from '../api'
import { FLEET_SNAPSHOT, fleetToConnectors, type FleetServer } from '../core/ecosystem'
import { pinBytes } from '../core/assets'
import { bus, makeEvent, setMode, setTimeSource } from '../core/events'
import { init2D, supportsWebGL } from '../core/render2d'
import { init3D } from '../core/render3d'
import { replayRun } from '../core/replay'
import {
  dispatchTask,
  initSim,
  onboardConnector,
  resetSim,
  setActivity as setSimActivity,
  tickSim,
  world,
  type RecordedAction,
} from '../core/sim'
import { TOUR_SESSION_KEY, initUI, type CityUi } from '../core/ui'
import type { CityActions, CityRenderer, CityUiElements, SelectionHit } from '../core/types'
import { assetsLockSchema } from '../schemas'
import '../city.css'

const ASSETS_BASE = '/city-assets'
const SPEEDS = [0, 1, 2, 4] as const

/**
 * SubtleCrypto, or null when the environment lacks it (non-secure origins,
 * test doubles). The global is read through a loose type because lib.dom
 * declares `crypto.subtle` as always present, which hides the runtime case.
 */
function subtleCrypto(): SubtleCrypto | null {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto
  return globalCrypto?.subtle ?? null
}

/** `?speed=0|1|2|4` sets the initial speed; absent or invalid boots at 1×. */
export function parseSpeedParam(search: string): number {
  const raw = new URLSearchParams(search).get('speed')
  if (!raw) return 1
  const value = Number(raw)
  return SPEEDS.includes(value as (typeof SPEEDS)[number]) ? value : 1
}

/** `?demo=1|true` boots in the labelled demo activity mode (R026); absent or invalid boots quiet. */
export function parseDemoParam(search: string): boolean {
  const raw = new URLSearchParams(search).get('demo')
  return raw === '1' || raw === 'true'
}

/**
 * Fetch one pinned file, verify byte count and SHA-256 against the lockfile,
 * and pin the verified bytes so the renderer reuses them (one fetch per pin,
 * OVERSTORY-CITY-R013). One retry; a second failure emits `asset.failed`.
 */
async function verifyPinned(path: string, expected: { bytes: number; sha256: string }): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const buf = await (await fetch(`${ASSETS_BASE}/${path.split('/').slice(1).join('/')}`)).arrayBuffer()
      if (buf.byteLength !== expected.bytes) throw new Error(`size ${buf.byteLength} != ${expected.bytes}`)
      const digest = await crypto.subtle.digest('SHA-256', buf)
      const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
      if (hash !== expected.sha256) throw new Error(`sha ${hash} != ${expected.sha256}`)
      pinBytes(path, buf)
      bus.emit(makeEvent('asset.verified', {}, `${path} verified`))
      return
    } catch (err) {
      if (attempt === 2) bus.emit(makeEvent('asset.failed', {}, `${path}: ${String(err)}`))
    }
  }
}

/**
 * Verify every pinned asset at startup (OVERSTORY-CITY-R013). The lockfile
 * itself is fetched from the site root; a missing or malformed lockfile is a
 * typed, visible failure, never a silent skip. Licensing is a gate: a pin
 * whose license is outside the lockfile's allowlist is refused before any
 * bytes are fetched (R013 amendment).
 */
async function verifyAssets(): Promise<void> {
  let files: { bytes: number; sha256: string; license: string }[] = []
  let paths: string[] = []
  let allowlist: string[] = []
  try {
    const json = (await (await fetch(`${ASSETS_BASE}/assets.lock.json`)).json()) as unknown
    const parsed = assetsLockSchema.safeParse(json)
    if (!parsed.success) throw new Error('lockfile shape invalid')
    paths = Object.keys(parsed.data.files)
    files = paths.map((p) => parsed.data.files[p])
    allowlist = parsed.data.license_allowlist
  } catch (err) {
    console.warn('[city] lockfile unavailable:', err)
    bus.emit(makeEvent('asset.failed', {}, `assets.lock.json: ${String(err)}`))
    return
  }
  const refused = files.filter((f) => !allowlist.includes(f.license))
  if (refused.length) {
    for (const f of refused) {
      bus.emit(makeEvent('asset.failed', {}, `license "${f.license}" is outside the allowlist — pin refused`))
    }
    return
  }
  if (!subtleCrypto()) {
    bus.emit(makeEvent('asset.failed', {}, 'SHA-256 verification unavailable in this environment'))
    return
  }
  await Promise.all(paths.map((path, i) => verifyPinned(path, files[i])))
}

export default function CityPage() {
  const holderRef = useRef<HTMLDivElement | null>(null)
  const popListRef = useRef<HTMLOListElement | null>(null)
  const inspectorRef = useRef<HTMLDivElement | null>(null)
  const feedRef = useRef<HTMLDivElement | null>(null)
  const simBadgeRef = useRef<HTMLDivElement | null>(null)
  const activityBadgeRef = useRef<HTMLSpanElement | null>(null)
  const clockRef = useRef<HTMLSpanElement | null>(null)
  const modeRef = useRef<HTMLSpanElement | null>(null)
  const bannerRef = useRef<HTMLDivElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)
  const legendRef = useRef<HTMLDivElement | null>(null)
  const tourRef = useRef<HTMLDivElement | null>(null)
  const statPopRef = useRef<HTMLSpanElement | null>(null)
  const statKnowRef = useRef<HTMLSpanElement | null>(null)
  const statToolsRef = useRef<HTMLSpanElement | null>(null)
  const statIncidentsRef = useRef<HTMLSpanElement | null>(null)
  const statConnectorsRef = useRef<HTMLSpanElement | null>(null)
  const btnDispatchRef = useRef<HTMLButtonElement | null>(null)
  const btnOverviewRef = useRef<HTMLButtonElement | null>(null)
  const btnOnboardRef = useRef<HTMLButtonElement | null>(null)
  const btnDemoRef = useRef<HTMLButtonElement | null>(null)
  const btnView2dRef = useRef<HTMLButtonElement | null>(null)
  const btnView3dRef = useRef<HTMLButtonElement | null>(null)
  const btnTourRef = useRef<HTMLButtonElement | null>(null)
  const scrubberRef = useRef<HTMLInputElement | null>(null)
  const scrubberReadoutRef = useRef<HTMLSpanElement | null>(null)
  const speedBarRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const holder = holderRef.current
    const els: CityUiElements = {
      popList: popListRef.current as HTMLElement,
      inspector: inspectorRef.current as HTMLElement,
      feedList: feedRef.current as HTMLElement,
      simBadge: simBadgeRef.current as HTMLElement,
      activityBadge: activityBadgeRef.current as HTMLElement,
      clock: clockRef.current as HTMLElement,
      mode: modeRef.current as HTMLElement,
      banner: bannerRef.current as HTMLElement,
      modal: modalRef.current as HTMLElement,
      legend: legendRef.current as HTMLElement,
      tour: tourRef.current as HTMLElement,
      statPop: statPopRef.current as HTMLElement,
      statKnow: statKnowRef.current as HTMLElement,
      statTools: statToolsRef.current as HTMLElement,
      statIncidents: statIncidentsRef.current as HTMLElement,
      statConnectors: statConnectorsRef.current as HTMLElement,
      btnDispatch: btnDispatchRef.current as HTMLElement,
      btnOverview: btnOverviewRef.current as HTMLElement,
      btnOnboard: btnOnboardRef.current as HTMLElement,
      btnDemo: btnDemoRef.current as HTMLElement,
      btnView2d: btnView2dRef.current as HTMLElement,
      btnView3d: btnView3dRef.current as HTMLElement,
      scrubber: scrubberRef.current!,
      scrubberReadout: scrubberReadoutRef.current as HTMLElement,
      btnTour: btnTourRef.current as HTMLElement,
      speedButtons: Array.from(speedBarRef.current?.querySelectorAll<HTMLElement>('.speed-btn') ?? []),
    }
    if (!holder) return

    let disposed = false
    // Read through a function so each post-await check sees a plain boolean
    // (the flag is set only in the unmount closure, so the first check would
    // otherwise narrow the rest of the body to `false`).
    const isDisposed = (): boolean => disposed
    let raf = 0
    let renderer: CityRenderer | null = null
    let ui: CityUi | null = null
    let observer: ResizeObserver | null = null
    let speed = parseSpeedParam(window.location.search)
    // The active renderer view; the page owns it (R027).
    let view: '3d' | '2d' = '3d'
    // The canonical recorded-action history for the replay scrubber (R029):
    // live-recorded actions plus everything a replay re-recorded (identical
    // in-game timestamps, so the dedupe is stable).
    let historyActions: RecordedAction[] = []
    const actionKey = (a: RecordedAction): string => `${a.kind}:${a.ts}:${a.target ?? ''}`

    function syncSpeedButtons(): void {
      for (const b of els.speedButtons) b.classList.toggle('active', Number(b.dataset.speed) === speed)
    }

    function syncViewButtons(): void {
      els.btnView2d.setAttribute('aria-pressed', String(view === '2d'))
      els.btnView3d.setAttribute('aria-pressed', String(view === '3d'))
    }

    const onSelect = (hit: SelectionHit | null): void => {
      ui?.select(hit)
    }

    // The 3D/2D view swap (R027): the 2D schematic is the accessible view and
    // the context-loss fallback (R015). The new renderer mounts before the
    // old one disposes, so the holder never holds a dead canvas.
    async function swapView(next: '3d' | '2d'): Promise<void> {
      if (!holder || view === next || isDisposed()) return
      const prev = renderer
      let nextR: CityRenderer
      if (next === '2d') {
        nextR = init2D(holder, world, { onSelect })
      } else {
        try {
          nextR = await init3D(holder, world, {
            onSelect,
            // R015: on context loss the page falls back to the 2D schematic.
            onContextLost: () => {
              if (view === '3d') void swapView('2d')
            },
          })
        } catch (err) {
          console.warn('[city] 3D renderer unavailable, falling back to 2D:', err)
          nextR = init2D(holder, world, { onSelect })
        }
      }
      if (isDisposed()) {
        nextR.dispose()
        return
      }
      renderer = nextR
      view = next === '2d' ? '2d' : '3d'
      prev?.dispose()
      ui?.setRenderer(nextR)
      syncViewButtons()
    }

    async function boot(): Promise<void> {
      if (!holder) return // narrowed in the effect; the closure needs its own check
      // 1. Fleet read through the host (LIVE) or the bundled snapshot (SIMULATED).
      let fleet: FleetServer[] = FLEET_SNAPSHOT
      let live = false
      try {
        const res = await fetchCityFleet()
        if (res.servers.length > 0) {
          fleet = res.servers
          live = true
        }
      } catch {
        // Host unreachable or 503 → SIMULATED; the banner states the reason.
      }
      if (isDisposed()) return

      // 2. Bind the event clock first so every startup event is stamped with
      //    the in-game clock, then choose the mode and verify the pins.
      setTimeSource(() => world.clock)
      setMode(live ? 'live' : 'simulated')
      await verifyAssets()
      if (isDisposed()) return

      // 3. Seed the city from the (fleet or snapshot) connector list; the
      //    activity mode is quiet by default (R026).
      initSim(fleetToConnectors(fleet))
      if (parseDemoParam(window.location.search)) setSimActivity('demo')

      // 4. Renderer: WebGL scene, or the 2D schematic of the same graph.
      view = supportsWebGL() ? '3d' : '2d'
      if (view === '3d') {
        try {
          renderer = await init3D(holder, world, {
            onSelect,
            // R015: on context loss the page falls back to the 2D schematic.
            onContextLost: () => {
              if (view === '3d') void swapView('2d')
            },
          })
        } catch (err) {
          console.warn('[city] 3D renderer unavailable, falling back to 2D:', err)
          view = '2d'
          renderer = init2D(holder, world, { onSelect })
        }
      } else {
        renderer = init2D(holder, world, { onSelect })
      }
      if (isDisposed()) {
        renderer.dispose()
        return
      }
      setReady(true)

      // 5. UI panels + the animation loop.
      const actions: CityActions = {
        dispatch: () => dispatchTask(),
        onboard: (id) => {
          onboardConnector(id)
        },
        focus: (x, z) => {
          if (renderer) renderer.focus(x, z)
        },
        overview: () => {
          if (renderer) renderer.overview()
        },
        setSelected: (hit) => {
          if (renderer) renderer.setSelected(hit)
        },
        speed: (v) => {
          if (!SPEEDS.includes(v as (typeof SPEEDS)[number])) return
          speed = v
          syncSpeedButtons()
        },
        setActivity: (mode) => {
          setSimActivity(mode)
          ui?.refresh()
        },
        setView: (v) => {
          void swapView(v)
        },
        // R029: seek the recorded history — the deterministic replay driver
        // replaces the world state, and the renderer rebinds to it.
        scrub: (offsetS) => {
          if (isDisposed()) return
          const merged = new Map<string, RecordedAction>()
          for (const a of historyActions) merged.set(actionKey(a), a)
          for (const a of world.actions) merged.set(actionKey(a), a)
          historyActions = [...merged.values()].sort((a, b) => a.ts - b.ts)
          replayRun(historyActions, { durationGameS: Math.max(0, Math.round(offsetS)), dtGame: 5 })
          renderer?.resync?.()
          ui?.refresh()
        },
        startTour: () => {
          ui?.startTour()
        },
      }
      ui = initUI(world, renderer, actions, els)
      syncSpeedButtons()
      syncViewButtons()
      observer = new ResizeObserver(() => {
        // Read the ref fresh: it can be cleared by an unmount between frames.
        const h = holderRef.current
        if (renderer && h) renderer.onResize(h.clientWidth, h.clientHeight)
      })
      observer.observe(holder)

      let last = performance.now()
      const frame = (now: number): void => {
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        if (speed > 0) tickSim(dt * world.timeScale * speed, dt * speed)
        renderer?.render(dt)
        ui?.tick(dt)
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)

      // 6. First-visit tour (R030): once per session, skippable, re-openable.
      try {
        if (!window.sessionStorage.getItem(TOUR_SESSION_KEY)) ui.startTour()
      } catch {
        ui.startTour()
      }
    }

    void boot()

    return () => {
      // Unmount safety (OVERSTORY-CITY-R018): stop the loop, then the
      // renderer, then the UI subscription, then the world and the bus.
      disposed = true
      cancelAnimationFrame(raf)
      observer?.disconnect()
      if (renderer) renderer.dispose()
      ui?.dispose()
      resetSim()
      bus.reset()
    }
  }, [])

  return (
    <div className="city-scope">
      <header className="city-topbar">
        <div className="brand">
          ARBORA CITY
          <span className="brand-sub">the living view of a governed agent platform</span>
        </div>
        <span ref={modeRef} className="badge sim">
          SIMULATED
        </span>
        <span ref={activityBadgeRef} className="badge quiet">
          QUIET ACTIVITY
        </span>
        <span ref={clockRef} className="city-clock">
          Day 1 · 09:00
        </span>
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Population</span>
            <span ref={statPopRef}>—</span>
          </div>
          <div className="stat">
            <span className="stat-label">Knowledge</span>
            <span ref={statKnowRef}>0</span>
          </div>
          <div className="stat">
            <span className="stat-label">Tool calls</span>
            <span ref={statToolsRef}>0</span>
          </div>
          <div className="stat">
            <span className="stat-label">Incidents</span>
            <span ref={statIncidentsRef}>0</span>
          </div>
          <div className="stat">
            <span className="stat-label">Connectors</span>
            <span ref={statConnectorsRef}>—</span>
          </div>
        </div>
        <div ref={speedBarRef} className="speed">
          <button type="button" className="speed-btn active" data-speed="1">
            1×
          </button>
          <button type="button" className="speed-btn" data-speed="2">
            2×
          </button>
          <button type="button" className="speed-btn" data-speed="4">
            4×
          </button>
          <button type="button" className="speed-btn" data-speed="0">
            Pause
          </button>
        </div>
      </header>
      <div className="city-body">
        <aside className="city-left" aria-label="Population">
          <h2>Population</h2>
          <ol ref={popListRef} className="pop-list" />
        </aside>
        <div ref={holderRef} className="city-holder">
          {!ready && (
            <div className="city-booting" role="status">
              Booting the city…
            </div>
          )}
          <div ref={bannerRef} className="city-banner hidden">
            Running on the deterministic simulation — the live fleet read is unavailable
          </div>
          <div className="city-controls">
            <button type="button" className="btn" ref={btnDispatchRef}>
              Dispatch task
            </button>
            <button type="button" className="btn" ref={btnOnboardRef}>
              Onboard connector
            </button>
            <button type="button" className="btn ghost" ref={btnOverviewRef}>
              Overview
            </button>
            <button type="button" className="btn ghost" ref={btnDemoRef} aria-pressed="false">
              Demo: off
            </button>
            <button type="button" className="btn ghost" ref={btnView3dRef} aria-pressed="true">
              3D view
            </button>
            <button type="button" className="btn ghost" ref={btnView2dRef} aria-pressed="false">
              2D view
            </button>
            <button type="button" className="btn ghost" ref={btnTourRef}>
              Tour
            </button>
            <div className="scrub">
              <label className="scrub-label" htmlFor="city-scrubber">
                Replay
              </label>
              <input
                ref={scrubberRef}
                id="city-scrubber"
                className="scrub-input"
                type="range"
                min={0}
                max={0}
                step={5}
                value={0}
              />
              <span ref={scrubberReadoutRef} className="scrub-readout">
                live 09:00
              </span>
            </div>
          </div>
        </div>
        <aside className="city-right" aria-label="City details">
          <div ref={inspectorRef} className="city-inspector" aria-live="polite" />
          <div className="city-legend">
            <h2>Legend</h2>
            <div ref={legendRef} className="legend-panel" />
          </div>
          <div className="city-feed">
            <h2>Activity</h2>
            <div ref={simBadgeRef} className="badge sim sim-badge">
              SIMULATED ACTIVITY
            </div>
            <div ref={feedRef} className="feed-list" />
          </div>
        </aside>
      </div>
      <div ref={tourRef} className="city-tour" />
      <div ref={modalRef} className="city-modal-backdrop">
        <div className="city-modal" />
      </div>
    </div>
  )
}
