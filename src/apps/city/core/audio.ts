/**
 * @file audio.ts
 * @description Sound that changes with zoom (OVERSTORY-CITY-R042).
 * Ambience is synthesized live: filtered noise and low oscillators, no
 * sample files. The mix crossfades by camera height: city hum and wind
 * from high above, birds, traffic and footsteps at street level, room tone
 * and voices indoors. Events have cues: a siren for a failure, a bell for
 * a completed task, a horn for a ship at the exchange. The engine starts
 * muted and begins only after a user gesture calls `enable()`. The mix is a
 * pure function of the camera, so it is tested without any audio hardware.
 */
import { mulberry32, DEFAULT_SEED, type Prng } from './prng'

export type AudioLayer = 'city' | 'street' | 'room'

/** Camera heights (metres) where the mix is fully city and fully street. */
export const ZOOM_BANDS = { cityAbove: 60, streetBelow: 8 } as const

/** The camera height assumed when no 3D camera exists (the 2D schematic is the city level). */
export const AUDIO_OVERVIEW_HEIGHT = 100

/** The ambient sources and how strongly each layer carries them. */
export const SOURCE_WEIGHTS: Readonly<Record<string, Readonly<Record<AudioLayer, number>>>> = {
  hum: { city: 1, street: 0.2, room: 0 },
  wind: { city: 1, street: 0.25, room: 0 },
  surf: { city: 0.4, street: 0.3, room: 0 },
  rain: { city: 0.3, street: 0.3, room: 0.1 },
  traffic: { city: 0.15, street: 1, room: 0 },
  crowd: { city: 0, street: 0.8, room: 0.1 },
  birds: { city: 0, street: 1, room: 0 },
  footsteps: { city: 0, street: 1, room: 0.2 },
  roomTone: { city: 0, street: 0, room: 1 },
  voices: { city: 0, street: 0, room: 0.9 },
}

export const SOURCES = Object.keys(SOURCE_WEIGHTS)

/** The layer gains for a camera: they always sum to 1, so the mix never jumps or clips. */
export function layerGains(cameraHeight: number, indoors: boolean): Record<AudioLayer, number> {
  if (indoors) return { city: 0, street: 0, room: 1 }
  const { cityAbove, streetBelow } = ZOOM_BANDS
  const t = Math.min(1, Math.max(0, (cameraHeight - streetBelow) / (cityAbove - streetBelow)))
  return { city: t, street: 1 - t, room: 0 }
}

/** Per-source gain for a camera: the layer gains weighted by the source table. */
export function mixFor(cameraHeight: number, indoors: boolean): Record<string, number> {
  const g = layerGains(cameraHeight, indoors)
  const out: Record<string, number> = {}
  for (const s of SOURCES) {
    const w = SOURCE_WEIGHTS[s]
    out[s] = g.city * w.city + g.street * w.street + g.room * w.room
  }
  return out
}

export interface Cue {
  name: 'siren' | 'bell' | 'horn'
  /** Note frequencies in Hz, played in order. */
  notes: readonly number[]
  /** Seconds per note. */
  step: number
}

/** The event cues. The horn waits on a ship-arrival event the exchange will emit (R035). */
export const CUES: Readonly<Record<string, Cue | undefined>> = {
  'task.failed': { name: 'siren', notes: [660, 880, 660, 880], step: 0.35 },
  'task.done': { name: 'bell', notes: [1318], step: 0.6 },
  'ship.arrived': { name: 'horn', notes: [98, 98], step: 0.7 },
}

/** The slice of the Web Audio API the engine uses, so a test can fake it. */
export interface AudioNodeLike {
  connect(to: unknown): unknown
  disconnect?(): void
}
export interface GainLike extends AudioNodeLike {
  gain: { value: number; setTargetAtTime(v: number, t: number, tc: number): void }
}
export interface AudioContextLike {
  currentTime: number
  sampleRate: number
  destination: unknown
  state?: string
  resume?(): Promise<void>
  close?(): Promise<void>
  createGain(): GainLike
  createBuffer(ch: number, len: number, rate: number): { getChannelData(c: number): Float32Array }
  createBufferSource(): AudioNodeLike & {
    buffer: unknown
    loop: boolean
    start(t?: number): void
    stop(t?: number): void
  }
  createBiquadFilter(): AudioNodeLike & { type: string; frequency: { value: number } }
  createOscillator(): AudioNodeLike & {
    type: string
    frequency: { value: number }
    start(t?: number): void
    stop(t?: number): void
  }
}

/** Per-source synthesis recipe: filtered noise at a centre frequency, or a low oscillator. */
const RECIPES: Readonly<Record<string, { osc?: number; noiseHz?: number; q?: number }>> = {
  hum: { osc: 55 },
  wind: { noiseHz: 400 },
  surf: { noiseHz: 250 },
  rain: { noiseHz: 5000 },
  traffic: { noiseHz: 180 },
  crowd: { noiseHz: 900 },
  birds: { osc: 2600 },
  footsteps: { noiseHz: 1200 },
  roomTone: { osc: 120 },
  voices: { noiseHz: 600 },
}

/** The master gain when enabled; the whole mix stays well under clipping. */
export const MASTER_GAIN = 0.25

export interface AudioEngine {
  readonly enabled: boolean
  enable(): Promise<void>
  disable(): void
  update(cameraHeight: number, indoors: boolean): void
  cue(eventType: string): Cue | null
  dispose(): void
}

export function createAudioEngine(
  makeContext: () => AudioContextLike | null,
  prng: Prng = mulberry32(DEFAULT_SEED),
): AudioEngine {
  let ctx: AudioContextLike | null = null
  let master: GainLike | null = null
  const sources = new Map<string, GainLike>()
  let enabled = false
  let last = { height: 100, indoors: false }

  function build(c: AudioContextLike): void {
    master = c.createGain()
    master.gain.value = 0
    master.connect(c.destination)
    for (const s of SOURCES) {
      const g = c.createGain()
      g.gain.value = 0
      g.connect(master)
      sources.set(s, g)
      const r = RECIPES[s]
      if (r.osc !== undefined) {
        const o = c.createOscillator()
        o.type = 'sine'
        o.frequency.value = r.osc
        o.connect(g)
        o.start()
      } else {
        const len = Math.floor(c.sampleRate * 2)
        const buf = c.createBuffer(1, len, c.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < len; i++) data[i] = prng() * 2 - 1
        const src = c.createBufferSource()
        src.buffer = buf
        src.loop = true
        const f = c.createBiquadFilter()
        f.type = 'bandpass'
        f.frequency.value = r.noiseHz ?? 500
        src.connect(f)
        f.connect(g)
        src.start()
      }
    }
  }

  function apply(): void {
    if (!ctx || !master) return
    master.gain.setTargetAtTime(enabled ? MASTER_GAIN : 0, ctx.currentTime, 0.3)
    const mix = mixFor(last.height, last.indoors)
    for (const [s, g] of sources) g.gain.setTargetAtTime(enabled ? mix[s] : 0, ctx.currentTime, 0.5)
  }

  return {
    get enabled() {
      return enabled
    },
    async enable() {
      if (!ctx) {
        ctx = makeContext()
        if (!ctx) return
        build(ctx)
      }
      await ctx.resume?.()
      enabled = true
      apply()
    },
    disable() {
      enabled = false
      apply()
    },
    update(cameraHeight, indoors) {
      last = { height: cameraHeight, indoors }
      apply()
    },
    cue(eventType) {
      const cue = CUES[eventType] ?? null
      if (!cue || !enabled || !ctx || !master) return cue && enabled ? cue : null
      const c = ctx
      cue.notes.forEach((hz, i) => {
        const o = c.createOscillator()
        o.type = cue.name === 'horn' ? 'sawtooth' : 'sine'
        o.frequency.value = hz
        const g = c.createGain()
        g.gain.value = 0.3
        o.connect(g)
        g.connect(master!)
        o.start(c.currentTime + i * cue.step)
        o.stop(c.currentTime + (i + 1) * cue.step)
      })
      return cue
    },
    dispose() {
      enabled = false
      sources.clear()
      master = null
      void ctx?.close?.()
      ctx = null
    },
  }
}
