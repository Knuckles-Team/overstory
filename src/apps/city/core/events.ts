// The single typed event bus. Every visible behaviour in the city is driven
// by a event emitted here (OVERSTORY-CITY-R010). Simulation and the live
// bridge emit the same vocabulary.
//
// Provenance (R010 amendment): every event carries a `provenance` flag —
// `simulated` or `live`. In this delivery every event the simulation emits is
// `simulated`; only an external live stream (R020, not yet landed) injects
// `live` events. While the recent ring is entirely simulated the feed shows a
// "simulated activity" badge; it clears only once a live event lands.

export const EVENT_TYPES = [
  'character.spawned',
  'character.idle',
  'character.traveling',
  'character.sleeping',
  'character.waking',
  'task.assigned',
  'task.queued',
  'task.pending_approval',
  'task.approved',
  'tool.call',
  'tool.result',
  'task.failed',
  'task.done',
  'knowledge.committed',
  'context.compacted',
  'connector.joined',
  'construction.progress',
  'building.completed',
  'operator.dispatched',
  'asset.verified',
  'asset.failed',
  'mode.selected',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export type EventProvenance = 'simulated' | 'live'

export interface CityEvent {
  id?: string
  type: string
  ts?: number
  character?: string
  building?: string
  task?: string
  mode?: string
  detail?: string
  /** Where this event came from: the seeded simulation, or the live stream. */
  provenance: EventProvenance
  /** True when the event fired inside a replayed run (R029): the feed labels the replayed window. */
  replay?: boolean
}

type Listener = (evt: CityEvent) => void

let seq = 0
const listeners = new Set<Listener>()
const recent: CityEvent[] = [] // ring of the last 200 events
const MAX_RECENT = 200

let timeSource: (() => number) | null = null
export function setTimeSource(fn: () => number): void {
  timeSource = fn
}

// The replay window flag (R029): the replay driver raises it for the whole
// duration of a replayed run so every event emitted then carries the replay
// mark. Only the driver may set it; a caller event can never forge it.
let replaying = false
export function setReplaying(r: boolean): void {
  replaying = r
}
export function isReplaying(): boolean {
  return replaying
}

function emit(evt: CityEvent): CityEvent {
  evt.id = `ev-${++seq}`
  evt.ts = evt.ts ?? (timeSource ? timeSource() : 0)
  // The replay mark is stamped by the bus from the replay driver's window
  // flag — a caller-supplied mark is stripped, so the feed's "replayed"
  // label is as trustworthy as its provenance mark (R029/R010).
  if (replaying) evt.replay = true
  else delete evt.replay
  // Every event lands in the recent ring, including startup asset-verification
  // and mode events: the UI mounts after them and must be able to replay a
  // complete picture (and surface asset failures) from the ring (P7).
  recent.push(evt)
  if (recent.length > MAX_RECENT) recent.shift()
  for (const fn of listeners) {
    try {
      fn(evt)
    } catch (err) {
      // A broken subscriber must not kill the city (P7: fail visibly, not silently).
      console.warn('[events] subscriber failed for', evt.type, err)
    }
  }
  return evt
}

export const bus = {
  emit,
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  recent: () => recent.slice(),
  /** Test seam: clear all state between cases. */
  reset(): void {
    seq = 0
    listeners.clear()
    recent.length = 0
    droppedExternal = 0
    replaying = false
  },
}

export function makeEvent(type: string, refs: Partial<CityEvent> = {}, detail = ''): CityEvent {
  if (!(EVENT_TYPES as readonly string[]).includes(type)) {
    console.warn('[events] unknown type', type)
  }
  // ts is assigned by emit() from the active time source (in-game clock);
  // callers may override it explicitly. Provenance is stamped by the bus,
  // never by the caller: `makeEvent` is the simulation's voice, so it can
  // only stamp `simulated`. Only the live bridge (injectLive) may stamp
  // `live` — a caller-supplied `live` is a spoof and is stripped (R010).
  if (refs.provenance !== undefined && refs.provenance !== 'simulated') {
    console.warn(
      `[events] caller-supplied provenance '${refs.provenance}' stripped from '${type}': provenance is stamped by the bus, not the caller`,
    )
  }
  return { type, ...refs, detail, provenance: 'simulated' }
}

// ---- Mode + live bridge hook -----------------------------------------------
// External callers (a workspace bridge, a dev script, or the Arbora MCP
// surface) can push events into the city. Unknown types are ignored and
// counted, never fatal (plan.md, "Event vocabulary").
let liveMode: 'simulated' | 'live' = 'simulated'
let droppedExternal = 0

export function setMode(mode: 'simulated' | 'live'): void {
  liveMode = mode
  emit(
    makeEvent(
      'mode.selected',
      { mode },
      mode === 'simulated'
        ? 'Running on the deterministic simulation'
        : 'Live mode selected — no live event stream is connected in this build; the city continues on its deterministic simulation until the platform stream lands',
    ),
  )
}

export function getMode(): 'simulated' | 'live' {
  return liveMode
}

/**
 * Inject an external (live) event. Shape: { type, character?, building?,
 * task?, detail?, ts? }. Returns true when accepted. Live events are stamped
 * `provenance: 'live'` so the feed can tell them apart from the simulation
 * (R010) — the caller never sets it.
 */
export function injectLive(evt: (Partial<CityEvent> & { type: string }) | null | undefined): boolean {
  if (!evt || typeof evt.type !== 'string') return false
  if (!(EVENT_TYPES as readonly string[]).includes(evt.type)) {
    droppedExternal++
    return false
  }
  emit({ ...evt, ts: evt.ts ?? 0, provenance: 'live' })
  return true
}

export function externalDropped(): number {
  return droppedExternal
}

/**
 * True while the recent ring holds only simulated events — the condition the
 * feed badge ("simulated activity") shows on. It clears the first time a live
 * event lands (R020), never before.
 */
export function feedFullySimulated(): boolean {
  return recent.every((e) => e.provenance === 'simulated')
}
