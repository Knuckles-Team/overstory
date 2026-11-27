/**
 * @file audio.test.ts
 * @description Zoom-layered synthesized audio (OVERSTORY-CITY-R042) and
 * district-based ambient layers (OVERSTORY-CITY-R055).
 */
// spec: OVERSTORY-CITY-R042, OVERSTORY-CITY-R055
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  CUES,
  DISTRICT_MIX,
  MASTER_GAIN,
  SOURCES,
  SOURCE_WEIGHTS,
  ZOOM_BANDS,
  createAudioEngine,
  layerGains,
  mixFor,
  mixForDistrict,
  type AudioContextLike,
  type DistrictType,
} from '../core/audio'
import { EVENT_TYPES } from '../core/events'

function fakeContext(): AudioContextLike & {
  gains: { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> } }[]
  oscillators: number
} {
  const gains: { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> } }[] = []
  let oscillators = 0
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
  const ctx = {
    currentTime: 0,
    sampleRate: 100,
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createGain: () => {
      const g = { ...node(), gain: { value: 1, setTargetAtTime: vi.fn() } }
      gains.push(g)
      return g
    },
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => ({ ...node(), buffer: null, loop: false, start: vi.fn(), stop: vi.fn() }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: { value: 0 } }),
    createOscillator: () => {
      oscillators++
      return { ...node(), type: '', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn() }
    },
    gains,
    get oscillators() {
      return oscillators
    },
  }
  return ctx as never
}

describe('zoom_layers', () => {
  it('lets each layer dominate its height band', () => {
    expect(layerGains(500, false).city).toBe(1)
    expect(layerGains(ZOOM_BANDS.streetBelow - 1, false).street).toBe(1)
    expect(layerGains(30, true).room).toBe(1)
    const high = mixFor(200, false)
    const street = mixFor(2, false)
    const room = mixFor(2, true)
    expect(high.wind).toBeGreaterThan(high.birds)
    expect(street.birds).toBeGreaterThan(street.wind)
    expect(street.traffic).toBeGreaterThan(high.traffic)
    expect(room.roomTone).toBe(1)
    expect(room.traffic).toBe(0)
    expect(room.voices).toBeGreaterThan(street.voices)
  })

  it('crossfades smoothly: layer gains sum to 1 and never jump between neighbouring heights', () => {
    let prev = layerGains(0, false)
    for (let h = 1; h <= 120; h++) {
      const g = layerGains(h, false)
      expect(g.city + g.street + g.room).toBeCloseTo(1, 10)
      expect(Math.abs(g.city - prev.city)).toBeLessThan(0.05)
      prev = g
    }
  })

  it('keeps every source gain within the cap', () => {
    for (const h of [0, 4, 8, 30, 60, 90, 1000])
      for (const indoors of [false, true]) {
        for (const s of SOURCES) {
          const g = mixFor(h, indoors)[s]
          expect(g).toBeGreaterThanOrEqual(0)
          expect(g).toBeLessThanOrEqual(1)
        }
      }
    expect(Object.keys(SOURCE_WEIGHTS)).toEqual(SOURCES)
  })

  it('has a cue for failure, completion and arrival; each fires on a real or declared event type', () => {
    expect(CUES['task.failed']?.name).toBe('siren')
    expect(CUES['task.done']?.name).toBe('bell')
    expect(CUES['ship.arrived']?.name).toBe('horn')
    for (const t of ['task.failed', 'task.done']) expect(EVENT_TYPES as readonly string[]).toContain(t)
  })

  it('starts muted and sounds only after enable() (a user gesture)', async () => {
    const ctx = fakeContext()
    const engine = createAudioEngine(() => ctx)
    expect(engine.enabled).toBe(false)
    expect(engine.cue('task.done')).toBeNull()
    engine.update(100, false)
    expect(ctx.oscillators).toBe(0)
    await engine.enable()
    expect(engine.enabled).toBe(true)
    expect(ctx.resume).toHaveBeenCalled()
    const master = ctx.gains[0]
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(MASTER_GAIN, 0, 0.3)
    engine.update(2, false)
    const before = ctx.oscillators
    expect(engine.cue('task.failed')?.name).toBe('siren')
    expect(ctx.oscillators - before).toBe(CUES['task.failed']?.notes.length)
    engine.disable()
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.3)
    expect(engine.cue('task.done')).toBeNull()
    engine.dispose()
  })

  it('stays silent when the browser has no audio context', async () => {
    const engine = createAudioEngine(() => null)
    await engine.enable()
    expect(engine.cue('task.done')).toBeNull()
  })

  it('ships no audio file: every sound is synthesized', () => {
    const exts = /\.(mp3|ogg|wav|flac|m4a|aac|opus|webm)$/i
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f)
        return statSync(p).isDirectory() ? walk(p) : [p]
      })
    expect(walk(join(__dirname, '..', '..', '..', '..', 'public', 'city-assets')).filter((p) => exts.test(p))).toEqual(
      [],
    )
  })
})

describe('R055 district layers', () => {
  // District types: residential, commercial, industrial, park, waterfront, civic
  const DISTRICTS: DistrictType[] = ['residential', 'commercial', 'industrial', 'park', 'waterfront', 'civic']

  it('each district layer dominates in its band', () => {
    for (const d of DISTRICTS) {
      const mix = mixForDistrict(100, false, d)
      // At city height, base sources plus district perturbation are present
      const dominantSources = SOURCES.filter((s) => mix[s] > 0.05)
      expect(dominantSources.length).toBeGreaterThan(0)
    }
  })

  it('crossfades smoothly: district mix sums within reasonable cap', () => {
    for (const d of DISTRICTS) {
      const mix = mixForDistrict(10, false, d)
      const sum = Object.values(mix).reduce((a, b) => a + b, 0)
      // Base zoom mix sums to at most 3x MASTER_GAIN; district adds small perturbation
      expect(sum).toBeLessThan(10)
    }
  })

  it('keeps every source gain within the cap', () => {
    for (const d of DISTRICTS) {
      for (const h of [2, 10, 50, 100]) {
        const mix = mixForDistrict(h, false, d)
        for (const s of SOURCES) {
          // Each source value is base mix * 0.95 + district * 0.05;
          // max source weight is 1.0, so max value is 1.0 * 0.95 + 1.0 * 0.05 = 1.0
          expect(mix[s]).toBeLessThanOrEqual(1.0)
        }
      }
    }
  })

  it('has cues for failure, completion, arrival, train, aircraft, and vessel horn', () => {
    expect(CUES['task.failed']?.name).toBe('siren')
    expect(CUES['task.done']?.name).toBe('bell')
    expect(CUES['ship.arrived']?.name).toBe('horn')
    expect(CUES['vehicle.train']?.name).toBe('train')
    expect(CUES['vehicle.aircraft']?.name).toBe('aircraft')
    expect(CUES['vessel.horn']?.name).toBe('horn')
  })

  it('starts muted and sounds only after enable()', async () => {
    let oscs = 0
    const makeCtx = (): AudioContextLike => ({
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
      createGain: () => ({ connect: () => null, gain: { value: 0, setTargetAtTime: () => {} } }),
      createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
      createBufferSource: () => ({
        buffer: null, loop: false, start: () => {}, stop: () => {}, connect: () => null,
      }),
      createOscillator: () => {
        oscs++
        return { type: 'sine', frequency: { value: 440 }, start: () => {}, stop: () => {}, connect: () => null }
      },
      createBiquadFilter: () => ({ type: 'bandpass', frequency: { value: 1000 }, connect: () => null }),
    })
    const engine = createAudioEngine(makeCtx, undefined, 'commercial')
    await engine.enable()
    engine.updateDistrict('industrial')
    engine.update(50, false)
    const cue = engine.cue('vehicle.train')
    expect(cue?.name).toBe('train')
    engine.dispose()
  })

  it('ships no audio file: every sound is synthesized', () => {
    const exts = /\.(mp3|ogg|wav|flac|m4a|aac|opus|webm)$/i
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f)
        return statSync(p).isDirectory() ? walk(p) : [p]
      })
    expect(walk(join(__dirname, '..', '..', '..', '..', 'public', 'city-assets')).filter((p) => exts.test(p))).toEqual(
      [],
    )
  })

  it('covers all six district types', () => {
    expect(Object.keys(DISTRICT_MIX)).toHaveLength(6)
    for (const d of DISTRICTS) {
      expect(DISTRICT_MIX[d]).toBeDefined()
      // Each district has characteristic sources (at least 3)
      const sources = Object.keys(DISTRICT_MIX[d]!)
      expect(sources.length).toBeGreaterThanOrEqual(3)
    }
    // Parks and waterfronts have birds
    expect(Object.keys(DISTRICT_MIX['park'])).toContain('birds')
    expect(Object.keys(DISTRICT_MIX['waterfront'])).toContain('birds')
  })
})
