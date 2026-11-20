/**
 * @file events.test.ts
 * @description The typed event bus (OVERSTORY-CITY-R010): the full
 * vocabulary is accepted, unknown types are counted and dropped, never
 * fatal, the recent ring is bounded, and startup events are replayable
 * when the UI mounts after them.
 */
// spec: OVERSTORY-CITY-R010
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EVENT_TYPES,
  bus,
  externalDropped,
  feedFullySimulated,
  getMode,
  injectLive,
  isReplaying,
  makeEvent,
  setMode,
  setReplaying,
  setTimeSource,
} from '../core/events'

afterEach(() => {
  bus.reset()
  vi.restoreAllMocks()
})

describe('vocabulary (R010)', () => {
  it('every declared type is accepted through the live bridge', () => {
    for (const type of EVENT_TYPES) {
      expect(injectLive({ type, detail: 'probe' })).toBe(true)
    }
    expect(externalDropped()).toBe(0)
    expect(bus.recent()).toHaveLength(EVENT_TYPES.length)
  })

  it('unknown types are counted, not fatal', () => {
    expect(injectLive({ type: 'bogus.type' })).toBe(false)
    expect(injectLive(null)).toBe(false)
    expect(injectLive(undefined)).toBe(false)
    // Only unknown types are counted; empty injections are refused uncounted.
    expect(externalDropped()).toBe(1)
    expect(bus.recent()).toHaveLength(0)
  })

  it('makeEvent warns (and still returns) on an unknown type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const evt = makeEvent('not.a.type')
    expect(evt.type).toBe('not.a.type')
    expect(warn).toHaveBeenCalled()
  })
})

describe('recent ring (R010)', () => {
  it('is bounded at 200 events', () => {
    for (let i = 0; i < 250; i++) {
      bus.emit(makeEvent('character.idle', {}, `idle ${i}`))
    }
    const recent = bus.recent()
    expect(recent).toHaveLength(200)
    expect(recent[0].detail).toBe('idle 50')
    expect(recent[199].detail).toBe('idle 249')
  })

  it('replays startup events for a UI that mounts late', () => {
    bus.emit(makeEvent('asset.verified', {}, 'city-assets/characters/robot-expressive.glb verified'))
    bus.emit(makeEvent('mode.selected', { mode: 'simulated' }, 'Running on the deterministic simulation'))
    bus.emit(makeEvent('character.spawned', { character: 'player' }, 'The Rookie joins the city'))
    const seen: string[] = []
    const unsub = bus.subscribe((e) => seen.push(e.type))
    for (const evt of bus.recent()) seen.push(`replayed:${evt.type}`)
    unsub()
    expect(seen).toEqual(['replayed:asset.verified', 'replayed:mode.selected', 'replayed:character.spawned'])
  })

  it('a broken subscriber does not kill the bus or other subscribers', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const good: string[] = []
    const broken = vi.fn(() => {
      throw new Error('downstream failure')
    })
    bus.subscribe(broken)
    bus.subscribe((e) => good.push(e.type))
    expect(() => bus.emit(makeEvent('task.assigned', {}, 'x'))).not.toThrow()
    expect(broken).toHaveBeenCalled()
    expect(good).toEqual(['task.assigned'])
    expect(warn).toHaveBeenCalled()
  })
})

describe('provenance (R010)', () => {
  it('makeEvent stamps simulated provenance by default', () => {
    const evt = makeEvent('character.idle')
    expect(evt.provenance).toBe('simulated')
    const stamped = bus.emit(evt)
    expect(stamped.provenance).toBe('simulated')
  })

  it('injectLive stamps live provenance — the caller can never set it', () => {
    expect(injectLive({ type: 'tool.call', detail: 'from the fleet' })).toBe(true)
    const evt = bus.recent()[bus.recent().length - 1]
    expect(evt.provenance).toBe('live')
    // Even a caller that tries to pass a simulated provenance gets live.
    expect(injectLive({ type: 'tool.call', provenance: 'simulated' })).toBe(true)
    expect(bus.recent()[bus.recent().length - 1].provenance).toBe('live')
  })

  it('makeEvent refuses a caller-supplied live provenance: the bus stamps, not the caller', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    // A simulation module (or a test) that tries to forge a live event is
    // stripped back to simulated and warned — the feed's live badge can
    // never be faked from inside the simulation (R010).
    const evt = bus.emit(makeEvent('tool.call', { provenance: 'live' as const }, 'spoofed'))
    expect(evt.provenance).toBe('simulated')
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("caller-supplied provenance 'live' stripped from 'tool.call'"),
    )
    // The feed badge condition stays simulated — the spoof did not land.
    expect(feedFullySimulated()).toBe(true)
    // An explicit simulated stamp is the bus's own value: accepted, unwarned.
    warn.mockClear()
    const ok = bus.emit(makeEvent('task.queued', { provenance: 'simulated' }, 'fine'))
    expect(ok.provenance).toBe('simulated')
    expect(warn).not.toHaveBeenCalled()
  })

  it('the feed badge condition: fully simulated until the first live event lands', () => {
    expect(feedFullySimulated()).toBe(true) // empty ring: nothing live has landed
    bus.emit(makeEvent('task.assigned', {}, 'x'))
    expect(feedFullySimulated()).toBe(true)
    expect(injectLive({ type: 'tool.call' })).toBe(true)
    expect(feedFullySimulated()).toBe(false)
    // Once a live event lands the badge stays cleared.
    bus.emit(makeEvent('task.done', {}, 'y'))
    expect(feedFullySimulated()).toBe(false)
  })

  it('the replay mark is stamped by the bus from the driver window, never by the caller', () => {
    expect(isReplaying()).toBe(false)
    // Outside a replay window the mark is absent — even when forged.
    const forged = bus.emit({ type: 'task.queued', detail: 'x', provenance: 'simulated', replay: true })
    expect(forged.replay).toBeUndefined()
    // Inside the driver window every emitted event carries the mark.
    setReplaying(true)
    try {
      const marked = bus.emit(makeEvent('character.spawned', { character: 'c' }, 'r'))
      expect(marked.replay).toBe(true)
      // The ring keeps the mark, so a feed replayed after the window still
      // shows it.
      expect(bus.recent().at(-1)?.replay).toBe(true)
    } finally {
      setReplaying(false)
    }
    // After the window the mark stops again.
    const clear = bus.emit(makeEvent('task.queued', {}, 'live'))
    expect(clear.replay).toBeUndefined()
    // bus.reset() closes any forgotten window.
    setReplaying(true)
    bus.reset()
    expect(isReplaying()).toBe(false)
  })
})

describe('clock stamping and mode', () => {
  it('stamps events from the bound time source (the in-game clock)', () => {
    setTimeSource(() => 9 * 3600 + 123)
    const evt = bus.emit(makeEvent('tool.call', {}, 't'))
    expect(evt.ts).toBe(9 * 3600 + 123)
  })

  it('lets callers override the timestamp', () => {
    setTimeSource(() => 42)
    const evt = bus.emit(makeEvent('tool.call', { ts: 7 }, 't'))
    expect(evt.ts).toBe(7)
  })

  it('setMode emits mode.selected with the reason for the new mode', () => {
    const seen: { mode?: string; detail?: string }[] = []
    bus.subscribe((e) => {
      if (e.type === 'mode.selected') seen.push({ mode: e.mode, detail: e.detail })
    })
    setMode('live')
    setMode('simulated')
    expect(getMode()).toBe('simulated')
    // The live-mode detail states what is actually streaming: the platform
    // stream is not connected in this build, so the simulation continues —
    // never "streaming live platform events" (R010).
    expect(seen).toEqual([
      {
        mode: 'live',
        detail:
          'Live mode selected — no live event stream is connected in this build; the city continues on its deterministic simulation until the platform stream lands',
      },
      { mode: 'simulated', detail: 'Running on the deterministic simulation' },
    ])
  })

  it('ids are unique per emission', () => {
    const a = bus.emit(makeEvent('task.assigned', {}, 'a'))
    const b = bus.emit(makeEvent('task.assigned', {}, 'b'))
    expect(a.id).not.toBe(b.id)
  })
})
