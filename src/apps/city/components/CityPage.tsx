/**
 * @file CityPage.tsx
 * @description The Arbora City page (OVERSTORY-CITY-R001/R004/R014/R018).
 * The React shell decides the mode (LIVE fleet read vs SIMULATED bundled
 * snapshot), verifies the pinned character assets, and mounts the simulation
 * core into the holder. The core owns its own DOM; this component owns the
 * lifecycle: one fetch per pinned file, a full dispose on unmount so no
 * animation frame, timer or event listener survives the route.
 */
import { useEffect, useRef, useState } from 'react'
import { fetchCityFleet } from '../api'
import { FLEET_SNAPSHOT, fleetToConnectors, type FleetServer } from '../core/ecosystem'
import { pinBytes } from '../core/assets'
import { bus, makeEvent, setMode, setTimeSource } from '../core/events'
import { init2D, supportsWebGL } from '../core/render2d'
import { init3D } from '../core/render3d'
import { initSim, resetSim, tickSim, world, dispatchTask, onboardConnector } from '../core/sim'
import { initUI, type CityUi } from '../core/ui'
import type { CityRenderer, CityUiElements, SelectionHit } from '../core/types'
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
 * typed, visible failure, never a silent skip.
 */
async function verifyAssets(): Promise<void> {
  let files: { bytes: number; sha256: string }[] = []
  let paths: string[] = []
  try {
    const json = (await (await fetch(`${ASSETS_BASE}/assets.lock.json`)).json()) as unknown
    const parsed = assetsLockSchema.safeParse(json)
    if (!parsed.success) throw new Error('lockfile shape invalid')
    paths = Object.keys(parsed.data.files)
    files = paths.map((p) => parsed.data.files[p])
  } catch (err) {
    console.warn('[city] lockfile unavailable:', err)
    bus.emit(makeEvent('asset.failed', {}, `assets.lock.json: ${String(err)}`))
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
  const clockRef = useRef<HTMLSpanElement | null>(null)
  const modeRef = useRef<HTMLSpanElement | null>(null)
  const bannerRef = useRef<HTMLDivElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)
  const statPopRef = useRef<HTMLSpanElement | null>(null)
  const statKnowRef = useRef<HTMLSpanElement | null>(null)
  const statToolsRef = useRef<HTMLSpanElement | null>(null)
  const statIncidentsRef = useRef<HTMLSpanElement | null>(null)
  const statConnectorsRef = useRef<HTMLSpanElement | null>(null)
  const btnDispatchRef = useRef<HTMLButtonElement | null>(null)
  const btnOverviewRef = useRef<HTMLButtonElement | null>(null)
  const btnOnboardRef = useRef<HTMLButtonElement | null>(null)
  const speedBarRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const holder = holderRef.current
    const els: CityUiElements = {
      popList: popListRef.current as HTMLElement,
      inspector: inspectorRef.current as HTMLElement,
      feedList: feedRef.current as HTMLElement,
      clock: clockRef.current as HTMLElement,
      mode: modeRef.current as HTMLElement,
      banner: bannerRef.current as HTMLElement,
      modal: modalRef.current as HTMLElement,
      statPop: statPopRef.current as HTMLElement,
      statKnow: statKnowRef.current as HTMLElement,
      statTools: statToolsRef.current as HTMLElement,
      statIncidents: statIncidentsRef.current as HTMLElement,
      statConnectors: statConnectorsRef.current as HTMLElement,
      btnDispatch: btnDispatchRef.current as HTMLElement,
      btnOverview: btnOverviewRef.current as HTMLElement,
      btnOnboard: btnOnboardRef.current as HTMLElement,
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

    function syncSpeedButtons(): void {
      for (const b of els.speedButtons) b.classList.toggle('active', Number(b.dataset.speed) === speed)
    }

    const onSelect = (hit: SelectionHit | null): void => {
      ui?.select(hit)
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

      // 3. Seed the city from the (fleet or snapshot) connector list.
      initSim(fleetToConnectors(fleet))

      // 4. Renderer: WebGL scene, or the 2D schematic of the same graph.
      try {
        renderer = supportsWebGL() ? await init3D(holder, world, { onSelect }) : init2D(holder, world, { onSelect })
      } catch (err) {
        console.warn('[city] 3D renderer unavailable, falling back to 2D:', err)
        renderer = init2D(holder, world, { onSelect })
      }
      if (isDisposed()) {
        renderer.dispose()
        return
      }
      setReady(true)

      // 5. UI panels + the animation loop.
      ui = initUI(
        world,
        renderer,
        {
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
        },
        els,
      )
      syncSpeedButtons()
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
        <span ref={clockRef} className="city-clock">
          Day 1 · 09:00
        </span>
        <div className="stats">
          <div className="stat">
            <label>Population</label>
            <span ref={statPopRef}>—</span>
          </div>
          <div className="stat">
            <label>Knowledge</label>
            <span ref={statKnowRef}>0</span>
          </div>
          <div className="stat">
            <label>Tool calls</label>
            <span ref={statToolsRef}>0</span>
          </div>
          <div className="stat">
            <label>Incidents</label>
            <span ref={statIncidentsRef}>0</span>
          </div>
          <div className="stat">
            <label>Connectors</label>
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
        <aside className="city-left">
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
          </div>
        </div>
        <aside className="city-right">
          <div ref={inspectorRef} className="city-inspector" />
          <div className="city-feed">
            <h2>Activity</h2>
            <div ref={feedRef} className="feed-list" />
          </div>
        </aside>
      </div>
      <div ref={modalRef} className="city-modal-backdrop">
        <div className="city-modal" />
      </div>
    </div>
  )
}
