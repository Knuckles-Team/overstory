// The single typed event bus. Every visible behaviour in the city is driven
// by an event emitted here (OVERSTORY-CITY-R010). Simulation and the live
// bridge emit the same vocabulary.

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

export interface CityEvent {
  id?: string
  type: string
  ts?: number
  character?: string
  building?: string
  task?: string
  mode?: string
  detail?: string
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

function emit(evt: CityEvent): CityEvent {
  evt.id = `ev-${++seq}`
  evt.ts = evt.ts ?? (timeSource ? timeSource() : 0)
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
  },
}

export function makeEvent(type: string, refs: Partial<CityEvent> = {}, detail = ''): CityEvent {
  if (!(EVENT_TYPES as readonly string[]).includes(type)) {
    console.warn('[events] unknown type', type)
  }
  // ts is assigned by emit() from the active time source (in-game clock);
  // callers may override it explicitly.
  return { type, ...refs, detail }
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
      mode === 'simulated' ? 'Running on the deterministic simulation' : 'Streaming live platform events',
    ),
  )
}

export function getMode(): 'simulated' | 'live' {
  return liveMode
}

/**
 * Inject an external (live) event. Shape: { type, character?, building?,
 * task?, detail?, ts? }. Returns true when accepted.
 */
export function injectLive(evt: CityEvent | null | undefined): boolean {
  if (!evt || typeof evt.type !== 'string') return false
  if (!(EVENT_TYPES as readonly string[]).includes(evt.type)) {
    droppedExternal++
    return false
  }
  emit({ ...evt, ts: evt.ts ?? 0 })
  return true
}

export function externalDropped(): number {
  return droppedExternal
}
