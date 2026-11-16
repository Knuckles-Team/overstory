/**
 * @file sim.test.ts
 * @description The simulation engine (OVERSTORY-CITY-R005…R009, R011,
 * R012) under deterministic seeded ticks: the boot population, the full
 * task chain within its real-time bound, construction and first-visit
 * bounds, the day/night cycle, speed semantics and the selection API.
 * `Math.random` is an LCG so every bound is reproducible.
 */
// spec: OVERSTORY-CITY-R005, OVERSTORY-CITY-R006, OVERSTORY-CITY-R007, OVERSTORY-CITY-R008, OVERSTORY-CITY-R009, OVERSTORY-CITY-R011, OVERSTORY-CITY-R012
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { EVENT_TYPES, bus } from '../core/events'
import { inWater } from '../core/layout'
import {
  TUNING,
  dispatchTask,
  getBuilding,
  getCharacter,
  initSim,
  onboardConnector,
  resetSim,
  tickSim,
  world,
} from '../core/sim'
import { setTimeSource } from '../core/events'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const STEP = 1 / 30 // real (wall) seconds per tick
let wall = 0 // wall seconds ticked so far

function tick(ticks: number, speed = 1): void {
  for (let i = 0; i < ticks; i++) {
    tickSim(STEP * world.timeScale * speed, STEP * speed)
    wall += STEP
  }
}

beforeEach(() => {
  bus.reset()
  resetSim()
  wall = 0
  vi.spyOn(Math, 'random').mockImplementation(lcg(20261115))
  setTimeSource(() => world.clock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function boot(): void {
  initSim(fleetToConnectors(FLEET_SNAPSHOT))
}

describe('boot state (R005/R002/R004)', () => {
  it('spawns the pinned roster: 17 characters, 14 AI + 3 human', () => {
    boot()
    const ai = world.characters.filter((c) => c.kind === 'ai').length
    const humans = world.characters.filter((c) => c.kind === 'human').length
    expect(world.characters).toHaveLength(17)
    expect(ai).toBe(14)
    expect(humans).toBe(3)
  })

  it('builds the seven core landmarks, each with a door', () => {
    boot()
    const core = Object.values(world.buildings).filter((b) => b.category === 'core')
    expect(core).toHaveLength(7)
    for (const b of core) {
      expect(b.door).not.toBeNull()
      expect(Number.isFinite(b.door?.x)).toBe(true)
      expect(Number.isFinite(b.door?.z)).toBe(true)
    }
  })

  it('served packs boot as built online buildings with their real tools', () => {
    boot()
    const connectors = Object.values(world.buildings).filter((b) => b.category === 'connector')
    expect(connectors).toHaveLength(7)
    const sql = getBuilding('sql-mcp')
    expect(sql?.online).toBe(true)
    expect(sql?.served).toBe(true)
    expect(sql?.tools).toContain('query')
    expect(sql?.simTools).toBe(false)
    expect(world.connectors).toHaveLength(74)
  })

  it('registered packs reserve named plots, unbuilt, with no construction', () => {
    boot()
    const reserved = world.plots.filter((p) => p.reservedId)
    expect(reserved).toHaveLength(67)
    expect(reserved.every((p) => !p.buildingId && !p.construction)).toBe(true)
    expect(world.plots.find((p) => p.reservedId === 'searxng-mcp')?.reservedName).toBe('Searxng')
  })
})

describe('SC-002: dispatched task runs the full chain within 60 real s (R006/R007)', () => {
  it('assign → travel → tool call → result → commit → idle', () => {
    boot()
    const seen = new Set<string>()
    let agentId: string | null = null
    const unsub = bus.subscribe((e) => {
      if (e.type === 'task.assigned' && !agentId) agentId = e.character ?? null
      if (!agentId || e.character !== agentId) return
      if (e.type === 'task.assigned') seen.add('assigned')
      if (e.type === 'character.traveling') seen.add('traveling')
      if (e.type === 'tool.call') seen.add('call')
      if (e.type === 'tool.result') seen.add('result')
      if (e.type === 'knowledge.committed') seen.add('committed')
      if (e.type === 'character.idle') seen.add('idle')
    })
    expect(dispatchTask()).toBe(true)
    const t0 = wall
    while (wall - t0 < 60) {
      tick(1)
      const done = ['assigned', 'traveling', 'call', 'result', 'committed', 'idle'].every((k) => seen.has(k))
      if (done) break
    }
    unsub()
    const missing = ['assigned', 'traveling', 'call', 'result', 'committed', 'idle'].filter((k) => !seen.has(k))
    expect(missing, `chain missing ${missing.join(', ')}`).toHaveLength(0)
    expect(wall - t0).toBeLessThanOrEqual(60)
    expect(world.stats.knowledge).toBeGreaterThan(0)
  })

  it('dispatches fail with a queued event when no idle agent is available', () => {
    boot()
    world.clock = 23 * 3600 // night: no dispatches, everyone heads home
    const seen: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'task.queued') seen.push(e.detail ?? '')
    })
    // Put every agent to sleep so the idle pool is empty at night.
    for (const c of world.characters) {
      if (c.kind === 'ai') c.state = 'sleeping'
    }
    expect(dispatchTask()).toBe(false)
    expect(seen.some((d) => d.includes('No idle agent'))).toBe(true)
  })
})

describe('approval cycle (R007)', () => {
  it('pending approval is resolved by the operator at the gate', () => {
    const orig = TUNING.approvalChance
    TUNING.approvalChance = 1
    try {
      boot()
      const seen: string[] = []
      bus.subscribe((e) => {
        if (e.type === 'task.pending_approval' || e.type === 'task.approved') seen.push(e.type)
      })
      expect(dispatchTask()).toBe(true)
      const t0 = wall
      while (!seen.includes('task.approved') && wall - t0 < 90) tick(1)
      expect(seen).toContain('task.pending_approval')
      expect(seen).toContain('task.approved')
      expect(world.stats.approvals).toBeGreaterThan(0)
    } finally {
      TUNING.approvalChance = orig
    }
  })
})

describe('SC-003: construction and first visit (R008)', () => {
  it('a connector rises from its reserved plot in <= 30 real s and is visited within 2 real minutes', () => {
    boot()
    expect(onboardConnector('searxng-mcp')).toBe(true)
    // onboardConnector raises the building on the first empty plot; find it
    // by buildingId so the bound does not depend on plot order.
    const plot = world.plots.find((p) => p.buildingId === 'searxng-mcp')
    expect(plot?.construction).not.toBeNull()
    const milestones: number[] = []
    const unsub = bus.subscribe((e) => {
      if (e.type === 'construction.progress' && e.building === 'searxng-mcp') milestones.push(e.ts ?? 0)
    })
    const b0 = wall
    while (plot?.construction !== null && wall - b0 < 30) tick(1)
    unsub()
    // completeConstruction clears the construction record.
    expect(plot?.construction).toBeNull()
    expect(wall - b0).toBeLessThanOrEqual(30)
    expect(milestones.length).toBeGreaterThanOrEqual(3) // 25/50/75%
    const building = getBuilding('searxng-mcp')
    expect(building?.online).toBe(true)
    expect(building?.simTools).toBe(true)
    expect(building?.tools).toEqual(['ingest', 'query', 'sync'])

    const v0 = wall
    let visited = false
    const unsub2 = bus.subscribe((e) => {
      if (e.type === 'tool.call' && e.building === 'searxng-mcp') visited = true
    })
    while (!visited && wall - v0 < 120) tick(1)
    unsub2()
    expect(visited).toBe(true)
    expect(wall - v0).toBeLessThanOrEqual(120)
  })

  it('refuses when no empty plot remains, with a visible queued event', () => {
    boot()
    for (const p of world.plots) {
      p.buildingId = 'full' // district is at capacity
      p.reservedId = null
      p.reservedName = null
    }
    const seen: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'task.queued') seen.push(e.detail ?? '')
    })
    expect(onboardConnector('gitlab-mcp')).toBe(false)
    expect(seen.some((d) => d.includes('no empty plot'))).toBe(true)
  })
})

describe('day/night cycle (R009) — SC-005 full day at 4x', () => {
  it('runs a complete day at 4x in ~2.5 real minutes with all invariants holding', () => {
    boot()
    const dayStart = world.day
    const clockStart = world.clock
    const stats0 = { ...world.stats }
    const slept = new Set<string>()
    const woke = new Set<string>()
    const types = new Set<string>()
    const unsub = bus.subscribe((e) => {
      types.add(e.type)
      if (e.type === 'character.sleeping' && e.character) slept.add(e.character)
      if (e.type === 'character.waking' && e.character) woke.add(e.character)
    })
    let guard = 0
    while ((world.day === dayStart || world.clock < clockStart) && guard++ < 30000) tick(4, 4)
    unsub()
    expect(world.day).toBeGreaterThan(dayStart)
    // One in-game day at 1x is 600 real s (timeScale 144); at 4x that is 150.
    expect(wall).toBeGreaterThan(140)
    expect(wall).toBeLessThan(170)
    expect(world.stats.toolCalls).toBeGreaterThan(stats0.toolCalls)
    expect(world.stats.knowledge).toBeGreaterThan(stats0.knowledge)
    // Every citizen slept and woke within the cycle.
    expect(slept.size).toBeGreaterThanOrEqual(15)
    expect(woke.size).toBeGreaterThanOrEqual(15)
    // Nobody left the walkable ground; budgets stayed in range.
    expect(world.characters.filter((c) => inWater(c.pos.x, c.pos.z))).toHaveLength(0)
    expect(world.characters.every((c) => c.context >= 0 && c.context <= 100)).toBe(true)
    // The whole day emitted only declared vocabulary.
    for (const type of types) expect(EVENT_TYPES).toContain(type)
  })

  it('no new tasks start at night', () => {
    boot()
    world.clock = 22 * 3600
    const assigned: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'task.assigned') assigned.push(e.type)
    })
    tick(30 * 30) // 30 real s at 1x (43 in-game minutes, still night)
    expect(assigned).toHaveLength(0)
  })
})

describe('speed and clock semantics (R012)', () => {
  it('the in-game clock runs at timeScale 144 (one day = ten real minutes at 1x)', () => {
    boot()
    expect(world.timeScale).toBe(144)
    const before = world.clock
    tickSim(144, 1)
    expect(world.clock - before).toBe(144)
  })

  it('pause freezes the clock and every action timer together', () => {
    boot()
    const clockBefore = world.clock
    expect(onboardConnector('searxng-mcp')).toBe(true)
    const plot = world.plots.find((p) => p.buildingId === 'searxng-mcp')
    const progressBefore = plot?.construction?.progress ?? 0
    tickSim(0, 0)
    tickSim(0, 0)
    expect(world.clock).toBe(clockBefore)
    // Construction still in progress, exactly where it started.
    expect(plot?.construction).not.toBeNull()
    expect(plot?.construction?.progress).toBe(progressBefore)
  })

  it('speed scales the clock and action timers together', () => {
    boot()
    expect(onboardConnector('searxng-mcp')).toBe(true)
    const plot = world.plots.find((p) => p.buildingId === 'searxng-mcp')
    const clockBefore = world.clock
    const progressBefore = plot?.construction?.progress ?? 0
    // The page loop multiplies both dts by the speed: tickSim(dt*144*s, dt*s).
    tickSim(144 * 4 * STEP, 4 * STEP)
    expect(world.clock - clockBefore).toBeCloseTo(144 * 4 * STEP)
    // Construction runs in real seconds (12 s at 1×), scaled by the speed.
    expect((plot?.construction?.progress ?? 0) - progressBefore).toBeCloseTo((4 * STEP) / 12)
  })
})

describe('selection API (R011)', () => {
  it('returns the character and building records for the selected ids', () => {
    boot()
    const ch = getCharacter('chad-speedwell')
    expect(ch?.name).toBe('Chad Speedwell')
    expect(ch?.kind).toBe('ai')
    expect(ch?.state).toBe('idle')
    const building = getBuilding('sql-mcp')
    expect(building?.name).toBe('Sql')
    expect(building?.category).toBe('connector')
    expect(building?.tools).toContain('query')
    expect(getCharacter('not-a-citizen')).toBeUndefined()
    expect(getBuilding('not-a-building')).toBeUndefined()
  })
})
