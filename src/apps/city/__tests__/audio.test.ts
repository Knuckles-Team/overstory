/**
 * @file audio.test.ts
 * @description Zoom-layered synthesized audio (OVERSTORY-CITY-R042).
 */
// spec: OVERSTORY-CITY-R042
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  CUES,
  MASTER_GAIN,
  SOURCES,
  SOURCE_WEIGHTS,
  ZOOM_BANDS,
  createAudioEngine,
  layerGains,
  mixFor,
  type AudioContextLike,
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
