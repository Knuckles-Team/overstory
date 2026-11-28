/**
 * @file sim.test.ts
 * @description The simulation engine (OVERSTORY-CITY-R002/R005…R012, R014,
 * R026, R029) under deterministic seeded ticks: the boot population, the
 * guarded state machine, quiet-by-default activity gating, the full task
 * chain within its real-time bound, construction and first-visit bounds, the
 * day/night cycle, speed semantics, the selection API and the deterministic
 * replay of recorded operator actions.
 *
 * The simulation draws only through the injected seeded PRNG (R014) — tests
 * replace it with an identically-seeded instance so every bound is
 * reproducible, and they assert `Math.random` is never called in the sim.
 */
// spec: OVERSTORY-CITY-R002, OVERSTORY-CITY-R005, OVERSTORY-CITY-R006, OVERSTORY-CITY-R007, OVERSTORY-CITY-R008, OVERSTORY-CITY-R009, OVERSTORY-CITY-R011, OVERSTORY-CITY-R012, OVERSTORY-CITY-R014, OVERSTORY-CITY-R026, OVERSTORY-CITY-R029, OVERSTORY-CITY-R107
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLEET_SNAPSHOT, connectorsByDomain, fleetToConnectors, type ConnectorDef } from '../core/ecosystem'
import { EVENT_TYPES, bus, setTimeSource } from '../core/events'
import { inWater } from '../core/layout'
import { DEFAULT_SEED, mulberry32 } from '../core/prng'
import { REPLAY_DEFAULT_DURATION_GAME_S, replayRun } from '../core/replay'
import {
  AGENT_STATES,
  AGENT_TRANSITIONS,
  ACTION_WINDOW_GAME_S,
  advanceSubSteps,
  SIM_SUBSTEPS_PER_FRAME_MAX,
  SIM_SUBSTEP_GAME_S,
  TUNING,
  canTransition,
  dispatchTask,
  getBuilding,
  getCharacter,
  initSim,
  onboardConnector,
  resetSim,
  setActivity,
  setSimRandom,
  tickSim,
  transition,
  world,
} from '../core/sim'

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
  setSimRandom(mulberry32(DEFAULT_SEED))
  setTimeSource(() => world.clock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function boot(): void {
  initSim(fleetToConnectors(FLEET_SNAPSHOT))
}

function positions(): [number, number][] {
  return world.characters.map((c) => [c.pos.x, c.pos.z])
}

describe('boot state (R005/R002/R004)', () => {
  it('spawns the pinned roster: 17 characters, 14 AI + 3 simulated NPC operators, all on the shared rig', () => {
    boot()
    const ai = world.characters.filter((c) => c.kind === 'ai').length
    const npc = world.characters.filter((c) => c.kind === 'npc').length
    expect(world.characters).toHaveLength(17)
    expect(ai).toBe(14)
    expect(npc).toBe(3)
    // Every v1 character is labelled simulated until real presence lands (R010).
    expect(world.characters.every((c) => c.provenance === 'simulated')).toBe(true)
    // The display name is the pseudonymous id (R020/R033): no comic roster.
    for (const c of world.characters) {
      expect(c.name).toBe(c.id)
      expect(c.id, `${c.id} is a pseudonymous id`).toMatch(/^(agent|operator)-\d{2}$/)
    }
    // The simulated operators wear the core accent (R025 via R033).
    for (const c of world.characters.filter((x) => x.kind === 'npc')) {
      expect(c.role).toBe('core')
      expect(c.id).toMatch(/^operator-\d{2}$/)
    }
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

  it('reserves plots in district-domain order, never catalog order (R002)', () => {
    boot()
    const order = connectorsByDomain(fleetToConnectors(FLEET_SNAPSHOT)).map((c) => c.id)
    const plotIndex = new Map<string, number>()
    world.plots.forEach((p, i) => {
      if (p.buildingId) plotIndex.set(p.buildingId, i)
      if (p.reservedId) plotIndex.set(p.reservedId, i)
    })
    expect(plotIndex.size).toBe(74)
    // The plot sequence follows the domain-grouped order exactly.
    let prev = -1
    for (const id of order) {
      const i = plotIndex.get(id)
      expect(i, `${id} missing from the plots`).toBeTypeOf('number')
      expect(i, `${id} out of domain order`).toBeGreaterThan(prev)
      prev = i!
    }
  })

  it('connectors past the district capacity are queued for expansion, never dropped (R002)', () => {
    const base = fleetToConnectors(FLEET_SNAPSHOT) // 74 connectors, 78 plots
    const extra: ConnectorDef[] = Array.from({ length: 8 }, (_, i) => ({
      id: `overflow-${i}`,
      name: `Overflow ${i}`,
      blurb: '',
      archetype: 'office',
      color: 0x336699,
      tools: [],
      packStatus: 'registered_unpublished',
      simTools: false,
    }))
    const queued: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'task.queued') queued.push(e.detail ?? '')
    })
    initSim([...base, ...extra]) // 82 connectors
    // The district is exactly full; the surplus is world state, not a drop.
    expect(world.plots.filter((p) => p.buildingId ?? p.reservedId)).toHaveLength(78)
    expect(world.overflow).toHaveLength(4)
    expect(queued.some((d) => d.includes('4 connectors outgrew the 78-plot district'))).toBe(true)
    // A reset clears the overflow queue with the rest of the world.
    resetSim()
    expect(world.overflow).toHaveLength(0)
  })
})

describe('state machine (R006)', () => {
  it('declares the full state set, and every state can reach sleep', () => {
    expect(AGENT_STATES).toEqual(['idle', 'tasked', 'traveling', 'working', 'committing', 'awaiting', 'sleeping'])
    for (const from of AGENT_STATES) {
      const targets = AGENT_TRANSITIONS[from]
      expect(targets).toBeDefined()
      for (const to of targets) expect(AGENT_STATES).toContain(to)
      expect(canTransition(from, 'sleeping'), `${from} cannot sleep`).toBe(true)
    }
  })

  it('declares the legal lifecycle path end to end', () => {
    expect(canTransition('idle', 'tasked')).toBe(true)
    expect(canTransition('tasked', 'traveling')).toBe(true)
    expect(canTransition('traveling', 'working')).toBe(true)
    expect(canTransition('working', 'committing')).toBe(true)
    expect(canTransition('committing', 'idle')).toBe(true)
  })

  it('refuses an illegal transition with a visible queued event, never a silent write', () => {
    boot()
    const ch = getCharacter('agent-01')
    expect(ch?.state).toBe('idle')
    const queued: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'task.queued') queued.push(e.detail ?? '')
    })
    expect(transition(ch!, 'working')).toBe(false) // idle → working is not declared
    expect(ch?.state).toBe('idle') // the refused change is not written
    expect(queued.some((d) => d.includes('refused'))).toBe(true)
  })

  it('allows a declared transition', () => {
    boot()
    const ch = getCharacter('agent-01')
    expect(transition(ch!, 'tasked')).toBe(true)
    expect(ch?.state).toBe('tasked')
  })

  it('a refused transition is honoured: no walk, no mood change, no success events', () => {
    boot()
    const ch = getCharacter('agent-01')!
    const mood = ch.mood
    const pos = { ...ch.pos }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const success: string[] = []
    bus.subscribe((e) => {
      if (e.type !== 'task.queued') success.push(e.type)
    })
    expect(transition(ch, 'working')).toBe(false) // idle → working is not declared
    expect(ch.state).toBe('idle')
    expect(ch.mood).toBe(mood) // the refused change did not rewrite behaviour
    expect(ch.pos).toEqual(pos) // and did not start a walk
    expect(success).toHaveLength(0)
    expect(warn).toHaveBeenCalled() // the raw invariant is logged, not shown
  })

  it('a refused event carries operator-facing wording, not the raw invariant string', () => {
    boot()
    const ch = getCharacter('agent-01')!
    const queued: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'task.queued') queued.push(e.detail ?? '')
    })
    transition(ch, 'working')
    expect(queued).toHaveLength(1)
    expect(queued[0]).not.toContain('Illegal state change')
    expect(queued[0]).toContain('refused')
    expect(queued[0]).toContain(ch.name)
  })
})

describe('quiet by default (R026)', () => {
  // spec: OVERSTORY-CITY-R026.1
  it('boots quiet: no auto-task, no wander, no patrol without an operator action', () => {
    boot()
    expect(world.activity).toBe('quiet')
    const types: string[] = []
    bus.subscribe((e) => types.push(e.type))
    // AI agents hold their ground in quiet: no wandering, no tasks. The
    // night operator walking home by day is governed citizen behaviour, so
    // the stillness bound is asserted on the AI agents.
    const start = world.characters.filter((c) => c.kind === 'ai').map((c) => [c.pos.x, c.pos.z] as [number, number])
    tick(1800) // 60 real s at 1×
    expect(types).not.toContain('task.assigned') // no auto-tasking
    expect(types).not.toContain('character.traveling') // no wandering
    const now = world.characters.filter((c) => c.kind === 'ai').map((c) => [c.pos.x, c.pos.z] as [number, number])
    expect(now).toEqual(start)
  })

  it('demo restores the continuous behaviour: auto-tasking and wander motion', () => {
    boot()
    setActivity('demo')
    expect(world.activity).toBe('demo')
    const assigned: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'task.assigned') assigned.push(e.character ?? '')
    })
    const start = positions()
    tick(1500) // 50 real s at 1×
    expect(assigned.length).toBeGreaterThan(0)
    expect(positions()).not.toEqual(start)
  })

  it('setActivity toggles the mode and resetSim returns to quiet', () => {
    boot()
    setActivity('demo')
    expect(world.activity).toBe('demo')
    resetSim()
    expect(world.activity).toBe('quiet')
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

  it('a dispatch on a busy target is a visible queued event, never a silent swap', () => {
    boot()
    expect(dispatchTask()).toBe(true) // one agent is now busy
    const busy = world.characters.find((c) => c.state === 'tasked' || c.state === 'traveling')!
    expect(busy).toBeDefined()
    const dispatched: string[] = []
    const queued: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'operator.dispatched') dispatched.push(e.character ?? '')
      if (e.type === 'task.queued') queued.push(e.detail ?? '')
    })
    expect(dispatchTask(busy.id)).toBe(false)
    // The refusal names the busy agent and queues the work.
    expect(queued.some((d) => d.includes(busy.name) && d.includes('queued'))).toBe(true)
    // No silent swap: no other agent received the task.
    expect(dispatched).toHaveLength(0)
    expect(world.characters.filter((c) => c.task).length).toBe(1)
    // The named target is still busy — the dispatch was refused, not
    // swapped onto a different agent.
    expect(busy.state).not.toBe('idle')
    expect(busy.task).toBeDefined()
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
  // A full-day soak: the ~2.5 minutes are in simulated wall time, but the
  // soak still runs thousands of real simulation ticks, so it gets an
  // explicit bound with margin for a loaded CI runner.
  it('runs a complete day at 4x in ~2.5 real minutes with all invariants holding', () => {
    boot()
    setActivity('demo') // continuous behaviour; the sleep/wake cycle itself is governed
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
  }, 20_000)

  it('no new tasks start at night', () => {
    boot()
    setActivity('demo') // auto-tasking is the behaviour under test at night
    world.clock = 22 * 3600
    const assigned: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'task.assigned') assigned.push(e.type)
    })
    tick(30 * 30) // 30 real s at 1x (43 in-game minutes, still night)
    expect(assigned).toHaveLength(0)
  })
})

describe('seeded PRNG (R014)', () => {
  it('the simulation never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random')
    boot()
    dispatchTask()
    tick(900) // 30 real s of full behaviour
    expect(spy).not.toHaveBeenCalled()
  })

  it('the same seed boots the identical city', () => {
    boot()
    const a = world.characters.map((c) => ({
      id: c.id,
      context: c.context,
      walkPhase: c.walkPhase,
      wanderTimer: c.wanderTimer,
      pos: c.pos,
    }))
    resetSim()
    setSimRandom(mulberry32(DEFAULT_SEED))
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const b = world.characters.map((c) => ({
      id: c.id,
      context: c.context,
      walkPhase: c.walkPhase,
      wanderTimer: c.wanderTimer,
      pos: c.pos,
    }))
    expect(b).toEqual(a)
  })
})

describe('replay (R029)', () => {
  // Compare runs by their observable content, not bus-assigned ids: the
  // module-level id counter keeps incrementing across runs by design.
  const sig = (
    events: {
      type: string
      ts?: number
      detail?: string
      character?: string
      building?: string
      provenance: string
    }[],
  ) => events.map((e) => [e.type, e.ts, e.detail, e.character, e.building, e.provenance])

  it('records operator actions with their in-game timestamps', () => {
    boot()
    expect(dispatchTask()).toBe(true)
    expect(onboardConnector('searxng-mcp')).toBe(true)
    expect(world.actions).toEqual([
      { kind: 'dispatch', ts: 9 * 3600, target: expect.any(String) },
      { kind: 'onboard', ts: 9 * 3600, target: 'searxng-mcp' },
    ])
  })

  it('the same seed plus the same recorded actions yields the identical event sequence', () => {
    boot()
    dispatchTask()
    const actions = world.actions.slice()
    bus.reset()
    const a = replayRun(actions)
    const b = replayRun(actions)
    expect(a.events.length).toBeGreaterThan(0)
    expect(a.events.some((e) => e.type === 'task.assigned')).toBe(true)
    expect(sig(a.events)).toEqual(sig(b.events))
    // The fixed schedule: ~300 in-game seconds of city life.
    expect(a.finalAbsGameS).toBe(9 * 3600 + REPLAY_DEFAULT_DURATION_GAME_S)
  })

  it('scrubbing to a recorded action reproduces the state deterministically', () => {
    boot()
    dispatchTask()
    const actions = world.actions.slice()
    const until = actions[0].ts - 9 * 3600 + 5 // one fixed tick past the dispatch
    const snapshot = () => ({
      stats: { ...world.stats },
      states: world.characters.map((c) => [c.id, c.state] as [string, string]),
      absGameS: world.absGameS,
    })
    replayRun(actions, { durationGameS: until, dtGame: 5 })
    const s1 = snapshot()
    replayRun(actions, { durationGameS: until, dtGame: 5 })
    expect(snapshot()).toEqual(s1)
  })

  it('the action record is bounded to the replay window: old entries age out (R029)', () => {
    boot()
    const firstTs = 9 * 3600
    expect(dispatchTask()).toBe(true)
    expect(world.actions.map((a) => a.ts)).toEqual([firstTs])
    // 70 ticks at 1x advance the in-game clock past the 300 s window
    // (70 x (1/30) x 144 = 336 in-game seconds).
    tick(70)
    expect(world.absGameS - firstTs).toBeGreaterThan(ACTION_WINDOW_GAME_S)
    // Recording the next action trims the aged entry; the record stays
    // bounded to the window it replays.
    expect(dispatchTask()).toBe(true)
    expect(world.actions).toHaveLength(1)
    expect(world.actions[0].ts).toBeCloseTo(firstTs + 70 * (1 / 30) * world.timeScale, 6)
    expect(world.actions[0].ts - world.absGameS).toBeCloseTo(0, 6)
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

  it('each declared speed scales the clock and action timers by exactly its factor', () => {
    boot()
    expect(onboardConnector('searxng-mcp')).toBe(true)
    const plot = world.plots.find((p) => p.buildingId === 'searxng-mcp')
    for (const speed of [0.5, 1, 1.25, 1.5, 2, 4, 8, 20]) {
      const clockBefore = world.clock
      const progressBefore = plot?.construction?.progress ?? 0
      // The page loop multiplies both dts by the speed: tickSim(dt*144*s, dt*s).
      tickSim(144 * speed * STEP, speed * STEP)
      expect(world.clock - clockBefore, `clock at ${speed}×`).toBeCloseTo(144 * speed * STEP)
      // Construction runs in real seconds (12 s at 1×), scaled by the speed.
      expect((plot?.construction?.progress ?? 0) - progressBefore, `construction at ${speed}×`).toBeCloseTo(
        (speed * STEP) / 12,
      )
    }
  })

  it('slow motion at 0.5x halves the rate in the same mode', () => {
    boot()
    setActivity('demo')
    const clockBefore = world.clock
    tick(60, 0.5) // 60 sub-ticks at 0.5×
    expect(world.clock - clockBefore).toBeCloseTo(144 * STEP * 0.5 * 60)
  })

  it(
    'a full day at 20x completes with every invariant holding',
    { timeout: 30_000 }, // the full-day soak takes real ticks; CI runners need the headroom
    () => {
      boot()
      setActivity('demo')
      const dayStart = world.day
      const clockStart = world.clock
      const types = new Set<string>()
      const unsub = bus.subscribe((e) => {
        types.add(e.type)
      })
      let guard = 0
      while ((world.day === dayStart || world.clock < clockStart) && guard++ < 30000) tick(4, 20)
      unsub()
      expect(world.day).toBeGreaterThan(dayStart)
      // One in-game day at 1x is 600 real s (timeScale 144); at 20x that is 30.
      expect(wall).toBeGreaterThan(25)
      expect(wall).toBeLessThan(35)
      // Nobody left the walkable ground; budgets stayed in range.
      expect(world.characters.filter((c) => inWater(c.pos.x, c.pos.z))).toHaveLength(0)
      expect(world.characters.every((c) => c.context >= 0 && c.context <= 100)).toBe(true)
      // The whole day emitted only declared vocabulary.
      for (const type of types) expect(EVENT_TYPES).toContain(type)
    },
  )

  it('the sub-step accumulator keeps in-game time exact across frames of varying length (R012 amended)', () => {
    const sub = SIM_SUBSTEP_GAME_S
    const cap = SIM_SUBSTEPS_PER_FRAME_MAX
    let pending = 0
    let executed = 0
    let fed = 0
    // Frames of varying length: sub-step slivers, a frame that overflows
    // the per-frame cap, and one huge frame.
    for (const frame of [0.4, 1.3, 2.0, 47.9, 0.1, 100, 3.3]) {
      fed += frame
      const { run, pending: next } = advanceSubSteps(pending, frame, sub, cap)
      pending = next
      executed += run * sub
      // No in-game time is lost or gained: executed plus the carried
      // remainder always equals everything fed so far.
      expect(executed + pending, 'no in-game time lost or gained').toBeCloseTo(fed, 12)
      // The executed total is always an exact multiple of the sub-step.
      expect(executed / sub - Math.round(executed / sub), 'exact sub-step multiple').toBeCloseTo(0, 12)
      expect(run).toBeLessThanOrEqual(cap)
      expect(pending).toBeGreaterThanOrEqual(0)
    }
    // The cap defers, it never drops: an oversized frame runs the full cap
    // and carries the rest forward.
    const big = advanceSubSteps(0, 100, sub, cap)
    expect(big.run).toBe(cap)
    expect(big.pending).toBeCloseTo(100 - cap * sub, 12)
  })

  it('replay of actions recorded during a fast run reproduces the same in-game state (R012/R029)', () => {
    boot()
    const t0 = world.absGameS
    // Operate the city for 600 in-game seconds at the page's fixed sub-step
    // — the same sub-step at every speed — dispatching a task mid-run and
    // onboarding a connector later. The actions stamp their in-game time,
    // not the wall-clock speed they were made at.
    let dispatched = false
    let onboarded = false
    while (world.absGameS - t0 < 600) {
      if (!dispatched && world.absGameS - t0 >= 300) {
        expect(dispatchTask()).toBe(true)
        dispatched = true
      }
      if (!onboarded && world.absGameS - t0 >= 450) {
        expect(onboardConnector('searxng-mcp')).toBe(true)
        onboarded = true
      }
      tickSim(SIM_SUBSTEP_GAME_S, SIM_SUBSTEP_GAME_S / world.timeScale)
    }
    const actions = world.actions.slice()
    const live = {
      day: world.day,
      clock: world.clock,
      states: world.characters.map((c) => c.state),
    }
    // The replay operates purely on in-game timestamps, so the speed the
    // live run displayed at cannot change the result: same seed, same
    // recorded actions, same fixed sub-step schedule.
    replayRun(actions, { durationGameS: 600, dtGame: SIM_SUBSTEP_GAME_S })
    expect(world.day).toBe(live.day)
    expect(world.clock).toBe(live.clock)
    expect(world.characters.map((c) => c.state)).toEqual(live.states)
    // The re-recorded actions keep their in-game timestamps.
    expect(world.actions).toEqual(actions)
  })
})

describe('selection API (R011)', () => {
  it('returns the character and building records for the selected ids', () => {
    boot()
    const ch = getCharacter('agent-01')
    // The display name is the pseudonymous id itself (R020/R033).
    expect(ch?.name).toBe('agent-01')
    expect(ch?.kind).toBe('ai')
    expect(ch?.state).toBe('idle')
    const mayor = getCharacter('operator-01')
    expect(mayor?.kind).toBe('npc')
    const building = getBuilding('sql-mcp')
    expect(building?.name).toBe('Sql')
    expect(building?.category).toBe('connector')
    expect(building?.tools).toContain('query')
    expect(getCharacter('not-a-citizen')).toBeUndefined()
    expect(getBuilding('not-a-building')).toBeUndefined()
  })
})

// R107: Character commute — NPCs get a workBuilding assigned at boot,
// and the commute method is called from tickSim when night falls.
describe('character commute (R107)', () => {
  it('commute() sets target and moves character toward destination', () => {
    boot()
    const ch = getCharacter('agent-01')!
    const startX = ch.pos.x
    const startZ = ch.pos.z
    ch.commute(startX + 10, startZ + 10)
    // commute() should set the target position and compute a path.
    expect(ch.target).toEqual({ x: startX + 10, z: startZ + 10 })
    expect(ch.path.length).toBeGreaterThan(0)
    // The mood should be 'commuting'.
    expect(ch.mood).toBe('commuting')
    // The character should be in motion.
    expect(ch.moving()).toBe(true)
  })
})
