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
import { useEffect, useMemo, useRef, useState } from 'react'
import { isCitySandbox } from '@/lib/city-sandbox'
import { CityWebMcp } from './CityWebMcp'
import { fetchCityFleet, fetchCityLayout, saveCityLayout } from '../api'
import { FLEET_SNAPSHOT, fleetToConnectors, type FleetServer } from '../core/ecosystem'
import { pinBytes } from '../core/assets'
import { BUDGETS } from '../core/budgets'
import { AUDIO_OVERVIEW_HEIGHT, createAudioEngine } from '../core/audio'
import { bus, makeEvent, setMode, setTimeSource } from '../core/events'
import { derivedRoadGraph, nextDocument, validateEdit, type LayoutOverride } from '../core/layoutEdit'
import { init2D, supportsWebGL } from '../core/render2d'
import { init3D } from '../core/render3d'
import { replayRun } from '../core/replay'
import {
  applyLayoutEdit,
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
import { installCityFidelity, type CityFidelityHandle } from '../core/fidelity'
import type { CityToolController } from '../webmcp'
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
  const fpsRef = useRef<HTMLSpanElement | null>(null)
  const debugFps = new URLSearchParams(window.location.search).get('debug') === '1'
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
  const btnAudioRef = useRef<HTMLButtonElement | null>(null)
  const btnView2dRef = useRef<HTMLButtonElement | null>(null)
  const btnView3dRef = useRef<HTMLButtonElement | null>(null)
  const btnTourRef = useRef<HTMLButtonElement | null>(null)
  const btnEditRef = useRef<HTMLButtonElement | null>(null)
  const editPanelRef = useRef<HTMLDivElement | null>(null)
  const scrubberRef = useRef<HTMLInputElement | null>(null)
  const scrubberReadoutRef = useRef<HTMLSpanElement | null>(null)
  const speedBarRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)

  // The WebMCP tools (R034, constitution R-IV) dispatch through the same
  // action seam as the UI: the seam is built once inside the effect below
  // and kept in a ref, and the read context reads the live world plus the
  // page-owned view state at call time. The controller is stable for the
  // page's life, so the registered set is built once and retires with it.
  const actionsRef = useRef<CityActions | null>(null)
  const webmcpModeRef = useRef<'LIVE' | 'SIMULATED'>('SIMULATED')
  const webmcpViewRef = useRef<'3d' | '2d'>('3d')
  const webmcpSpeedRef = useRef(1)
  const webmcpSelectionRef = useRef<SelectionHit | null>(null)
  const webmcpController = useMemo<CityToolController>(
    () => ({
      actions: {
        dispatch: () => actionsRef.current?.dispatch(),
        onboard: (id) => actionsRef.current?.onboard(id),
        focus: (x, z) => actionsRef.current?.focus(x, z),
        overview: () => actionsRef.current?.overview(),
        setSelected: (hit) => actionsRef.current?.setSelected(hit),
        speed: (v) => actionsRef.current?.speed(v),
        setActivity: (m) => actionsRef.current?.setActivity(m),
        setAudio: (on) => actionsRef.current?.setAudio(on),
        setView: (v) => actionsRef.current?.setView(v),
        scrub: (o) => actionsRef.current?.scrub(o),
        startTour: () => actionsRef.current?.startTour(),
        layoutEdit: (edit) =>
          actionsRef.current?.layoutEdit(edit) ?? Promise.resolve({ ok: false, reason: 'unavailable' }),
      },
      readContext: () => ({
        mode: webmcpModeRef.current,
        activity: world.activity,
        speed: webmcpSpeedRef.current,
        view: webmcpViewRef.current,
        clock: Math.round(world.clock),
        day: world.day,
        selection: webmcpSelectionRef.current,
        characters: world.characters.map((c) => ({
          id: c.id,
          kind: c.kind,
          role: c.role,
          state: c.state,
          context: Math.round(c.context),
        })),
        buildings: Object.values(world.buildings).map((b) => ({
          id: b.id,
          name: b.name,
          category: b.category,
          online: b.online,
          packStatus: b.packStatus,
          toolCount: b.toolCount,
        })),
        recentEvents: bus
          .recent()
          .slice(-20)
          .map((e) => ({ type: e.type, detail: e.detail ?? '', provenance: e.provenance })),
      }),
    }),
    [],
  )

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
      btnAudio: btnAudioRef.current as HTMLElement,
      btnView2d: btnView2dRef.current as HTMLElement,
      btnView3d: btnView3dRef.current as HTMLElement,
      scrubber: scrubberRef.current!,
      scrubberReadout: scrubberReadoutRef.current as HTMLElement,
      btnTour: btnTourRef.current as HTMLElement,
      btnEdit: btnEditRef.current as HTMLElement,
      editPanel: editPanelRef.current as HTMLElement,
      speedButtons: Array.from(speedBarRef.current?.querySelectorAll<HTMLElement>('.speed-btn') ?? []),
    }
    if (!holder) return

    let disposed = false
    const sandbox = isCitySandbox()
    // Read through a function so each post-await check sees a plain boolean
    // (the flag is set only in the unmount closure, so the first check would
    // otherwise narrow the rest of the body to `false`).
    const isDisposed = (): boolean => disposed
    let raf = 0
    const meterLifecycle = new AbortController()
    // R042: the ambience engine starts muted; the toggle (a user gesture) enables it.
    const audio = createAudioEngine(() => (typeof AudioContext === 'undefined' ? null : new AudioContext()))
    const unsubscribeCues = bus.subscribe((e) => {
      audio.cue(e.type)
    })
    let renderer: CityRenderer | null = null
    let ui: CityUi | null = null
    let observer: ResizeObserver | null = null
    // The fidelity seam (R012.9): installed in development builds so the
    // golden-viewpoint harness can drive the page through its own seams.
    let fidelityHandle: CityFidelityHandle | null = null
    let speed = parseSpeedParam(window.location.search)
    // The active renderer view; the page owns it (R027).
    let view: '3d' | '2d' = '3d'
    // The paused 3D renderer kept while a WebGL context is lost (R015): the
    // fallback to the 2D schematic is not a one-way door — when the browser
    // restores the context the kept renderer resumes and the schematic is
    // disposed. While it is kept, manual 3D toggles are ignored: the restore
    // callback owns the return path.
    let kept3d: CityRenderer | null = null
    // The canonical recorded-action history for the replay scrubber (R029):
    // live-recorded actions plus everything a replay re-recorded (identical
    // in-game timestamps, so the dedupe is stable).
    let historyActions: RecordedAction[] = []
    const actionKey = (a: RecordedAction): string => `${a.kind}:${a.ts}:${a.target ?? ''}`
    // The fleet source this city booted from (R029): a replay must boot from
    // the same source its mode decided — a LIVE city replays the served
    // catalog, never the bundled snapshot.
    let bootFleet: FleetServer[] = FLEET_SNAPSHOT
    // The replay is synchronous work over the whole recorded history; a
    // scrubber drag fires a burst of input events, so at most one replay
    // lands per pause in the drag (~250 ms) and the readout stays live.
    let scrubTimer: ReturnType<typeof setTimeout> | null = null

    function syncSpeedButtons(): void {
      for (const b of els.speedButtons) b.classList.toggle('active', Number(b.dataset.speed) === speed)
    }

    function syncViewButtons(): void {
      els.btnView2d.setAttribute('aria-pressed', String(view === '2d'))
      els.btnView3d.setAttribute('aria-pressed', String(view === '3d'))
    }

    const onSelect = (hit: SelectionHit | null): void => {
      webmcpSelectionRef.current = hit
      ui?.select(hit)
    }

    // R015: on WebGL context loss the page overlays the 2D schematic of the
    // same city graph — and keeps the paused 3D renderer instead of disposing
    // it, so a restored context resumes the 3D view (the fallback is not a
    // one-way door). Both transitions go through the real DOM events the
    // scene wires its listeners to.
    function fallbackTo2D(): void {
      if (!holder || view !== '3d' || kept3d || isDisposed()) return
      kept3d = renderer
      view = '2d'
      webmcpViewRef.current = view
      renderer = init2D(holder, world, { onSelect })
      ui?.setRenderer(renderer)
      syncViewButtons()
    }

    function resume3D(): void {
      if (!kept3d || isDisposed()) return
      const keep = kept3d
      kept3d = null
      renderer?.dispose()
      renderer = keep
      view = '3d'
      webmcpViewRef.current = view
      // Rebind to the world state the schematic has been showing (a replay
      // may have replaced it while the context was lost).
      renderer.resync?.()
      ui?.setRenderer(renderer)
      syncViewButtons()
    }

    const ctxLostOpts = {
      onContextLost: fallbackTo2D,
      onContextRestored: resume3D,
    }

    // The 3D/2D view swap (R027): the 2D schematic is the accessible view and
    // the context-loss fallback (R015). The new renderer mounts before the
    // old one disposes, so the holder never holds a dead canvas. A manual
    // swap to 2D disposes the 3D renderer outright (unlike a context loss,
    // which keeps it for the restore).
    async function swapView(next: '3d' | '2d'): Promise<void> {
      if (!holder || view === next || isDisposed()) return
      if (kept3d && next === '3d') return // the restore callback owns the path
      const prev = renderer
      let nextR: CityRenderer
      if (next === '2d') {
        nextR = init2D(holder, world, { onSelect })
        kept3d = null // a deliberate swap supersedes any kept renderer
      } else {
        try {
          nextR = await init3D(holder, world, {
            onSelect,
            ...ctxLostOpts,
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
      webmcpViewRef.current = view
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
        if (!sandbox) {
          const res = await fetchCityFleet()
          if (res.servers.length > 0) {
            fleet = res.servers
            live = true
          }
        }
      } catch {
        // Host unreachable or 503 → SIMULATED; the banner states the reason.
      }
      if (isDisposed()) return
      // Every replay of this city's history boots from this same source
      // (R029): the scrubber shows the replayed window of the actual city.
      bootFleet = fleet
      // The stored layout document (R032): a second viewer boots into the
      // same city the first one edited — an absent or refused read keeps the
      // derived layout, never a partial one.
      let layoutDoc: LayoutOverride | null = null
      try {
        if (!sandbox) layoutDoc = (await fetchCityLayout()).doc
      } catch {
        // 503 (the served layout read is not live yet) or absent → derived.
      }
      if (isDisposed()) return

      // 2. Bind the event clock first so every startup event is stamped with
      //    the in-game clock, then choose the mode and verify the pins.
      setTimeSource(() => world.clock)
      setMode(live ? 'live' : 'simulated')
      webmcpModeRef.current = live ? 'LIVE' : 'SIMULATED'
      await verifyAssets()
      if (isDisposed()) return

      // 3. Seed the city from the (fleet or snapshot) connector list; the
      //    activity mode is quiet by default (R026).
      initSim(fleetToConnectors(fleet))
      if (parseDemoParam(window.location.search)) setSimActivity('demo')
      // The stored layout document lands over the derived placement (R032);
      // the road layer is redrawn once the renderer exists below.
      if (layoutDoc) applyLayoutEdit(layoutDoc)

      // 4. Renderer: WebGL scene, or the 2D schematic of the same graph.
      view = supportsWebGL() ? '3d' : '2d'
      if (view === '3d') {
        try {
          renderer = await init3D(holder, world, {
            onSelect,
            // R015: context loss keeps the paused 3D renderer under the 2D
            // schematic; context restore resumes it.
            ...ctxLostOpts,
          })
        } catch (err) {
          console.warn('[city] 3D renderer unavailable, falling back to 2D:', err)
          view = '2d'
          webmcpViewRef.current = view
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
          webmcpSpeedRef.current = v
          syncSpeedButtons()
        },
        setActivity: (mode) => {
          setSimActivity(mode)
          ui?.refresh()
        },
        setView: (v) => {
          // While a kept 3D renderer is paused under the schematic, the
          // restore callback owns the return to 3D (R015).
          if (kept3d && v === '3d') return
          void swapView(v)
        },
        // R029: seek the recorded history — the deterministic replay driver
        // replaces the world state, and the renderer rebinds to it. Debounced
        // to one replay per drag pause; the replay boots from the fleet
        // source this city booted from, so a LIVE city never replays the
        // bundled snapshot.
        scrub: (offsetS) => {
          if (isDisposed()) return
          if (scrubTimer) clearTimeout(scrubTimer)
          scrubTimer = setTimeout(() => {
            scrubTimer = null
            if (isDisposed()) return
            const merged = new Map<string, RecordedAction>()
            for (const a of historyActions) merged.set(actionKey(a), a)
            for (const a of world.actions) merged.set(actionKey(a), a)
            historyActions = [...merged.values()].sort((a, b) => a.ts - b.ts)
            replayRun(historyActions, {
              durationGameS: Math.max(0, Math.round(offsetS)),
              dtGame: 5,
              fleet: bootFleet,
              layout: world.layoutDoc ?? undefined,
            })
            renderer?.resync?.()
            // The replayed world carries the stored layout's graph — the road
            // layer redraws to match (R032).
            if (renderer?.setRoads && world.roadGraph) renderer.setRoads(world.roadGraph)
            ui?.refresh()
          }, 250)
        },
        setAudio: (on) => {
          if (isDisposed()) return
          if (on) void audio.enable()
          else audio.disable()
          btnAudioRef.current?.setAttribute('aria-pressed', String(on))
          if (btnAudioRef.current) btnAudioRef.current.textContent = on ? 'Sound: on' : 'Sound: off'
        },
        startTour: () => {
          ui?.startTour()
        },
        // R032: one layout edit through the same action seam as the UI —
        // validated against the live world and road graph, the next document
        // persisted through the served layout write, applied to the world,
        // the road layer redrawn, and the edit broadcast as a visible event.
        // A refused or unavailable edit leaves the city unchanged and reports
        // the operator-facing reason.
        layoutEdit: async (edit) => {
          const verdict = validateEdit(edit, world, world.roadGraph ?? derivedRoadGraph())
          if (!verdict.ok) return { ok: false, reason: verdict.reason }
          try {
            const doc = nextDocument(world.layoutDoc, edit, world)
            const saved = sandbox ? { doc } : await saveCityLayout(doc)
            if (isDisposed()) return { ok: true }
            applyLayoutEdit(saved.doc)
            world.layoutDoc = saved.doc
            if (renderer?.setRoads && world.roadGraph) renderer.setRoads(world.roadGraph)
            bus.emit(
              makeEvent(
                'layout.edited',
                edit.kind === 'move-building' || edit.kind === 'rotate-building' ? { building: edit.buildingId } : {},
                `Layout edit saved: ${edit.kind}`,
              ),
            )
            ui?.refresh()
            return { ok: true }
          } catch {
            return { ok: false, reason: 'unavailable' }
          }
        },
      }
      actionsRef.current = actions
      fidelityHandle = installCityFidelity({
        core: () => renderer?.fidelity ?? null,
        view: () => view,
        mode: () => webmcpModeRef.current,
        actions: () => actions,
        world,
        viewport: () => ({ width: holder.clientWidth, height: holder.clientHeight }),
      })
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
      let audioClock = 0
      const meter = fpsRef.current
      let meterLast: number | null = null
      let meterStart = 0
      let meterFrames = 0
      let slowFrames = 0
      const targetFrameMs = Math.ceil((1000 / BUDGETS.fpsIntegrated) * 10) / 10
      const resetMeter = (): void => {
        meterLast = null
        meterFrames = 0
        slowFrames = 0
        if (meter) {
          meter.textContent = document.hidden ? 'FPS paused' : 'Measuring FPS…'
          delete meter.dataset.budget
        }
      }
      if (meter) document.addEventListener('visibilitychange', resetMeter, { signal: meterLifecycle.signal })
      function updateMeter(now: number): void {
        if (!meter || document.hidden) return
        if (meterLast === null) {
          meterStart = now
        } else {
          meterFrames++
          if (now - meterLast > targetFrameMs) slowFrames++
        }
        meterLast = now
        const elapsed = now - meterStart
        if (elapsed < 1000) return
        const fps = (meterFrames * 1000) / elapsed
        const belowBudget = fps < 1000 / targetFrameMs
        meter.dataset.budget = belowBudget ? 'below' : 'met'
        meter.textContent = `${fps.toFixed(1)} FPS · ${BUDGETS.fpsIntegrated} target · ${slowFrames} slow frames`
        meter.title = `${view.toUpperCase()} · ${belowBudget ? 'Below target' : 'Target met'} · Last measurement window`
        meterStart = now
        meterFrames = 0
        slowFrames = 0
      }
      const frame = (now: number): void => {
        updateMeter(now)
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        // R042: the ambience follows the camera height, four times a second.
        audioClock += dt
        if (audioClock >= 0.25) {
          audioClock = 0
          audio.update(renderer?.fidelity?.camera.position.y ?? AUDIO_OVERVIEW_HEIGHT, false)
        }
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
      // Unmount safety (OVERSTORY-CITY-R018): stop the loop, any pending
      // replay, the renderer (and any kept one paused under the schematic,
      // R015), the UI subscription, then the world and the bus.
      disposed = true
      cancelAnimationFrame(raf)
      meterLifecycle.abort()
      if (scrubTimer) clearTimeout(scrubTimer)
      observer?.disconnect()
      if (kept3d) kept3d.dispose()
      if (renderer) renderer.dispose()
      fidelityHandle?.dispose()
      unsubscribeCues()
      audio.dispose()
      ui?.dispose()
      resetSim()
      bus.reset()
    }
  }, [])

  return (
    <div className="city-scope">
      <CityWebMcp controller={webmcpController} />
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
        {debugFps && (
          <span ref={fpsRef} className="city-fps" data-testid="city-fps" aria-label="City frame rate">
            Measuring FPS…
          </span>
        )}
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
            <button type="button" className="btn ghost" ref={btnAudioRef} aria-pressed="false">
              Sound: off
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
            <button type="button" className="btn ghost" ref={btnEditRef} aria-expanded="false">
              Edit layout
            </button>
            <div ref={editPanelRef} className="edit-panel hidden" aria-label="Layout edit panel" />
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
