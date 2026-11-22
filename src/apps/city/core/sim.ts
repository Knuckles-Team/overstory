// The simulation engine: the only writer of world state. Every state change
// emits a typed event on the shared bus (OVERSTORY-CITY-R006).
//
// Time convention: the in-game clock runs at `timeScale` in-game seconds per
// real second, so one in-game day is ten real minutes at 1× and the day/night
// cycle reads as a living city. Character actions — walking, tool calls,
// construction, task cadence — are paced in *real* seconds at 1× so motion
// and work look natural. The speed control multiplies both together; nothing
// else changes.
//
// Determinism (R014): every random draw goes through the injected seeded
// PRNG (prng.ts) — `Math.random()` is never called in this module. Activity
// (R026): the sim defaults to `quiet` (no auto-tasking, no wandering, no
// patrol); `demo` restores the continuous behaviour. Operator actions are
// recorded with in-game timestamps for the replay driver (R029).

import {
  CORE_LANDMARKS,
  ROSTER,
  SIM_TOOLS,
  connectorsByDomain,
  type ConnectorDef,
  type CoreDef,
  type RoleId,
} from './ecosystem'
import { BUILDING_POS, PLOTS, HOUSES, buildingDoor, plotDoor, findPath, type Vec2 } from './layout'
import { pathOn, type RoadGraph } from '@/lib/scene3d/roads'
import { makeTrafficRoutes, tickTraffic, type TrafficFleet } from './render3d/traffic'
import {
  CITY_WORLD_SEED,
  generateFrontageSites,
  generateRoadsideMassing,
  type FrontageSite,
  type RegionalMassing,
} from './worldgen'
import { applyDocument, derivedRoadGraph, type LayoutOverride } from './layoutEdit'
import { bus, makeEvent, type CityEvent } from './events'
import { defaultPrng, type Prng } from './prng'

// ---- Agent state machine (R006) --------------------------------------------
// One declared lifecycle the sim, the tests and the documentation all read.
// Every state change goes through `transition`, which refuses an illegal
// change (a refused transition is a visible queued event, never a silent
// state write).
export const AGENT_STATES = ['idle', 'tasked', 'traveling', 'working', 'committing', 'awaiting', 'sleeping'] as const
export type AgentState = (typeof AGENT_STATES)[number]

export const AGENT_TRANSITIONS: Record<AgentState, readonly AgentState[]> = {
  idle: ['tasked', 'awaiting', 'sleeping'],
  tasked: ['traveling', 'sleeping'],
  traveling: ['working', 'awaiting', 'committing', 'sleeping'],
  working: ['working', 'traveling', 'committing', 'sleeping'],
  committing: ['idle', 'traveling', 'sleeping'],
  awaiting: ['traveling', 'idle', 'sleeping'],
  sleeping: ['idle'],
}

/** True when `from → to` is declared (or a no-op self transition). */
export function canTransition(from: AgentState, to: AgentState): boolean {
  return from === to || AGENT_TRANSITIONS[from].includes(to)
}

// ---- Activity mode (R026) ----------------------------------------------------
export type ActivityMode = 'quiet' | 'demo'

// ---- Operator action record (R029) -------------------------------------------
/** One recorded operator action, stamped with the in-game absolute time. */
export interface RecordedAction {
  kind: 'dispatch' | 'onboard' | 'approve'
  /** Monotonic in-game seconds (does not wrap at midnight). */
  ts: number
  /** The dispatched agent id (dispatch) or connector id (onboard). */
  target?: string
}

export interface Plot {
  x: number
  z: number
  buildingId: string | null
  /** The connector reserved for this plot (registered packs). */
  reservedId: string | null
  /** Display name of a reserved, not-yet-built plot. */
  reservedName: string | null
  construction: { connectorId: string; progress: number; lastMilestone: number } | null
  access?: FrontageSite
}

export interface Task {
  id: string
  agentId: string
  buildingId: string
  tool: string
  approvalRequired: boolean
  state: 'queued' | 'pending_approval' | 'active' | 'done' | 'failed'
  calls: number
}

export interface Building {
  id: string
  name: string
  category: 'core' | 'connector'
  role: string
  tools: string[]
  rooms: string[]
  color: number
  kind: string
  x: number
  z: number
  w: number
  d: number
  online: boolean
  visits: number
  fresh: number
  flash: number
  served: boolean
  packStatus: string
  blurb: string
  simTools: boolean
  /** The served tool count (R025 building-height channel), before the SIM_TOOLS fallback. */
  toolCount: number
  door: Vec2 | null
  /** Quarter-turn rotation in degrees (R032); 0 for the derived layout. */
  rot: number
  /** The plot the derived layout places this building on (R032); null for core landmarks. */
  derivedPlot: number | null
  access?: FrontageSite
}

class Character {
  id: string
  kind: 'ai' | 'npc'
  name: string
  role: RoleId
  state: AgentState = 'idle'
  mood = ''
  context: number
  visible = true
  /** Every v1 character is simulated (R005/R010); live presence is R023. */
  provenance: 'simulated' | 'live' = 'simulated'
  task: Task | null = null
  path: number[][] = []
  pathPos = 0
  /** The walk's destination point (R032 re-route); null when not walking. */
  target: Vec2 | null = null
  walkPhase: number
  facing = 0
  home: Vec2
  homeDoor: Vec2
  arriveHook: (() => void) | null = null
  wanderTimer: number
  workTimer = 0
  callDuration = 0
  callsLeft = 0
  retryWait = 0
  waitTimer = 0
  roomIndex = 0
  roomTimer = 0
  commitPhase: 'committing' | 'compacting' | null = null
  events: { type: string; detail: string }[] = []
  pos: Vec2 = { x: 0, z: 0 }

  constructor(entry: { kind: 'ai' | 'npc'; id: string; role: RoleId }, index: number) {
    this.id = entry.id
    this.kind = entry.kind
    // The display name is the pseudonymous id (R020) — never an identity.
    this.name = entry.id
    this.role = entry.role
    this.mood = this.kind === 'npc' ? 'supervising' : 'wandering'
    this.context = 10 + simRandom() * 15
    this.walkPhase = simRandom() * Math.PI * 2
    const home = world.homes[index % world.homes.length]
    this.home = home
    this.homeDoor = home.access ? { x: home.access.roadX, z: home.access.roadZ } : { x: home.x - 4, z: home.z }
    this.wanderTimer = 2 + simRandom() * 6
  }

  setPos(x: number, z: number): void {
    this.pos = { x, z }
  }

  /**
   * The walk's waypoints (R032): the live road graph routes the walk when it
   * exists; a route the graph cannot provide keeps the derived grid, and a
   * walk without either end stays where it was aimed (a refused layout edit
   * never strands a character on the old route).
   */
  worldPath(toX: number, toZ: number): number[][] {
    const graph = world.roadGraph
    if (graph) {
      const live = pathOn(graph, this.pos.x, this.pos.z, toX, toZ)
      if (live) return live
    }
    return findPath(this.pos.x, this.pos.z, toX, toZ)
  }

  go(toX: number, toZ: number, arriveHook: (() => void) | null, mood?: string): void {
    this.target = { x: toX, z: toZ }
    this.path = this.worldPath(toX, toZ)
    this.pathPos = 0
    this.arriveHook = arriveHook
    if (mood) this.mood = mood
  }

  moving(): boolean {
    return this.path.length > 0 && this.pathPos < this.path.length
  }

  // Paced in real seconds (see module header).
  move(dtReal: number): boolean {
    if (!this.moving()) return false
    const target = this.path[this.pathPos]
    const dx = target[0] - this.pos.x
    const dz = target[1] - this.pos.z
    const dist = Math.hypot(dx, dz)
    const step = WALK * dtReal
    if (dist <= step) {
      this.pos = { x: target[0], z: target[1] }
      this.pathPos++
      if (this.pathPos >= this.path.length) {
        this.path = []
        const hook = this.arriveHook
        this.arriveHook = null
        if (hook) hook()
        return true
      }
    } else {
      this.pos = { x: this.pos.x + (dx / dist) * step, z: this.pos.z + (dz / dist) * step }
      this.facing = Math.atan2(dx, dz)
      this.walkPhase += step * 4.2
    }
    return false
  }

  logEvent(evt: CityEvent): void {
    this.events.unshift({ type: evt.type, detail: evt.detail ?? '' })
    if (this.events.length > 5) this.events.pop()
  }
}

// ---- World -----------------------------------------------------------------

export const world = {
  day: 1,
  clock: 9 * 3600, // in-game seconds since midnight; the city wakes at 09:00
  /** Monotonic in-game seconds (no midnight wrap) — action-record timestamps. */
  absGameS: 9 * 3600,
  timeScale: 144, // in-game seconds per real second at 1× (1 day = 10 min)
  /** Activity mode: quiet (default) or labelled demo (R026). */
  activity: 'quiet' as ActivityMode,
  characters: [] as Character[],
  buildings: {} as Record<string, Building>,
  regionalMassing: [] as RegionalMassing[],
  homes: HOUSES.map((home) => ({ ...home })) as (Vec2 & { access?: FrontageSite })[],
  plots: PLOTS.map((p) => ({
    x: p.x,
    z: p.z,
    buildingId: null,
    reservedId: null,
    reservedName: null,
    construction: null,
  })) as Plot[],
  tasks: [] as Task[],
  /** Operator actions recorded for the replay driver (R029), bounded. */
  actions: [] as RecordedAction[],
  stats: { knowledge: 0, toolCalls: 0, tasksDone: 0, incidents: 0, approvals: 0, dispatches: 0 },
  firstVisit: null as { buildingId: string; age: number } | null,
  /** The current connector catalog (from the fleet read or the snapshot). */
  connectors: [] as ConnectorDef[],
  /**
   * Connectors the catalog outgrew past the district's plots (R002):
   * surfaced as a queued event at init — never silently dropped.
   */
  overflow: [] as ConnectorDef[],
  /**
   * The live road graph (R032): the derived grid at boot, the overrides'
   * graph after a saved layout edit; null before the sim initializes.
   */
  roadGraph: null as RoadGraph | null,
  /** Ambient vehicles belong to the world, not either renderer. */
  traffic: null as TrafficFleet | null,
  /** District style overrides: domain → archetype (R032); empty when derived. */
  districtStyles: {} as Record<string, string>,
  /** The stored layout override document applied to this world (R032). */
  layoutDoc: null as LayoutOverride | null,
  initialized: false,
}

/**
 * The replay window the action record is bounded to (R029): ~300 in-game
 * seconds, the fixed schedule the replay driver steps on. Older entries are
 * dropped as new ones land, so the record never grows without bound.
 */
export const ACTION_WINDOW_GAME_S = 300

/** One recorded operator action, stamped and bounded to the replay window. */
function recordAction(kind: RecordedAction['kind'], target?: string): void {
  world.actions.push({ kind, ts: world.absGameS, target })
  while (world.actions.length > 0 && world.actions[0].ts < world.absGameS - ACTION_WINDOW_GAME_S) {
    world.actions.shift()
  }
}

export const NIGHT_START = 21 * 3600
export const NIGHT_END = 6 * 3600
export const isNight = (clock: number): boolean => clock >= NIGHT_START || clock < NIGHT_END

/** Named behaviour constants (tests adjust the probabilities, never the logic). */
export const TUNING = {
  approvalChance: 0.2,
}

// ---- The seeded PRNG (R014) -------------------------------------------------
// The only randomness the simulation uses. Tests and the replay driver
// replace it with an identically-seeded instance for exact sequences.
let rng: Prng = defaultPrng()

/** Inject a PRNG (tests, replay). */
export function setSimRandom(p: Prng): void {
  rng = p
}

/** One deterministic draw in [0, 1). */
export function simRandom(): number {
  return rng()
}

/** Set the activity mode (R026): quiet is the default, demo is labelled. */
export function setActivity(mode: ActivityMode): void {
  world.activity = mode
}

export function getActivity(): ActivityMode {
  return world.activity
}

/**
 * The single guarded state change (R006): refuses illegal transitions. The
 * feed carries operator-facing wording; the raw invariant is logged, not
 * shown. Every caller honours the result — a refused transition neither
 * walks, changes mood nor emits success events, so state and behaviour
 * never diverge.
 */
export function transition(ch: Character, to: AgentState): boolean {
  if (to === ch.state) return true
  if (!canTransition(ch.state, to)) {
    console.warn(`[city] refused state change ${ch.id}: ${ch.state} → ${to}`)
    bus.emit(
      makeEvent(
        'task.queued',
        { character: ch.id },
        `${ch.name} is still ${ch.state} — the change to ${to} was refused and queued`,
      ),
    )
    return false
  }
  ch.state = to
  return true
}

/**
 * Every building a character interacts with carries a door (core landmarks
 * project one from their footprint; connector buildings from their plot).
 * The footprint fallback keeps a broken invariant from stalling the sim.
 */
function doorOf(b: Building): Vec2 {
  return b.door ?? { x: b.x, z: b.z }
}

const WALK = 2.6 // metres per real second at 1×
const CONSTRUCTION_REAL_S = 12 // real seconds at 1× (SC-003: < 30 s)
const FIRST_VISIT_GRACE_S = 300 // real seconds before an owed first visit is dropped
const AUTO_TASK_MIN = 8
const AUTO_TASK_MAX = 16 // real seconds between auto tasks
let autoTaskTimer = 5 // first auto task shortly after boot

// ---- Buildings -------------------------------------------------------------

function makeBuilding(def: CoreDef | ConnectorDef, category: 'core' | 'connector', plot?: Plot): Building {
  const pos = category === 'core' ? BUILDING_POS[def.id] : undefined
  return {
    id: def.id,
    name: def.name,
    category,
    role: 'role' in def ? def.role : def.blurb,
    // A live served pack whose tool names the host did not report falls back
    // to the simulated tool set so tasks always name a real chip (simTools
    // marks the fallback so the inspector can say so).
    tools: def.tools.length ? def.tools : SIM_TOOLS,
    // The connector def carries the authoritative flag (fleetToConnectors
    // sets it for every simulated tool list); core landmarks never simulate.
    simTools: 'simTools' in def ? def.simTools : false,
    // Core components list their rooms explicitly; connector buildings
    // derive internal locations from their tool set (one area per tool).
    rooms: 'rooms' in def ? def.rooms : def.tools.length ? def.tools.slice(0, 3) : ['main'],
    color: def.color,
    kind: 'kind' in def ? def.kind : def.archetype,
    x: plot ? plot.x : pos ? pos.x : 0,
    z: plot ? plot.z : pos ? pos.z : 0,
    // Connector parcels are ten metres between road centrelines. A 5.6 m
    // kit preserves a real sidewalk/setback on all four sides instead of
    // letting the generated facade graze the 2.6 m carriageway.
    w: pos ? pos.w : 5.6,
    d: pos ? pos.d : 5.6,
    online: true,
    visits: 0,
    fresh: 0,
    flash: 0,
    served: 'packStatus' in def ? def.packStatus === 'served' : true,
    packStatus: 'packStatus' in def ? def.packStatus : 'core',
    blurb: 'blurb' in def ? def.blurb : '',
    // The authoritative served tool count: the 'building-height' channel
    // (R025) encodes this, so the simulated fallback below never inflates it.
    toolCount: def.tools.length,
    // Core doors project from the landmark footprint; connector doors are
    // set by placeConnector from the plot they sit on.
    door: category === 'core' ? buildingDoor(def.id) : null,
    rot: 0,
    derivedPlot: null,
  }
}

// Connector buildings live on plots; their doors project from the plot centre.
function placeConnector(def: ConnectorDef, plot: Plot, prebuilt: boolean): void {
  const b = makeBuilding(def, 'connector', plot)
  b.door = plotDoor(plot)
  b.access = plot.access
  // The derived layout's own placement (R032): restoring the derived city
  // puts the building back exactly here.
  b.derivedPlot = world.plots.indexOf(plot)
  world.buildings[def.id] = b
  plot.buildingId = def.id
  if (!prebuilt) {
    plot.construction = { connectorId: def.id, progress: 0, lastMilestone: 0 }
    bus.emit(makeEvent('construction.progress', { building: def.id }, `Scaffolding raised at ${def.name}`))
  } else {
    b.fresh = 900
  }
}

// ---- Setup -----------------------------------------------------------------

/**
 * Seed the city from a connector list (fleet read or snapshot). Served packs
 * are built and online; registered-unpublished packs reserve a named plot
 * (OVERSTORY-CITY-R002/R008). Plots are reserved in district-domain order
 * (never catalog order) so each domain is a contiguous block of the district.
 */
export function initSim(connectors: ConnectorDef[]): void {
  if (world.initialized) return
  world.connectors = connectors
  world.absGameS = world.clock
  world.roadGraph = derivedRoadGraph()
  world.traffic = null
  let coreSites: FrontageSite[] = []
  if ('seed:0' in world.roadGraph.nodes) {
    const requests = [
      ...CORE_LANDMARKS.map((core) => ({ id: core.id, w: BUILDING_POS[core.id].w, d: BUILDING_POS[core.id].d })),
      ...HOUSES.map((_, index) => ({ id: `home-${index}`, w: 4, d: 4 })),
      ...PLOTS.map((_, index) => ({ id: `plot-${index}`, w: 5.6, d: 5.6 })),
    ]
    const sites = generateFrontageSites(world.roadGraph, CITY_WORLD_SEED, requests)
    coreSites = sites.filter((site) => !site.id.startsWith('plot-') && !site.id.startsWith('home-'))
    if (coreSites.length !== CORE_LANDMARKS.length)
      throw new Error('Seed cannot place all city landmarks beside roads')
    world.homes = sites
      .filter((site) => site.id.startsWith('home-'))
      .map((site) => ({ x: site.x, z: site.z, access: site }))
    if (world.homes.length < ROSTER.length) throw new Error('Seed cannot place all city homes beside roads')
    world.plots = sites
      .filter((site) => site.id.startsWith('plot-'))
      .map((site) => ({
        x: site.x,
        z: site.z,
        buildingId: null,
        reservedId: null,
        reservedName: null,
        construction: null,
        access: site,
      }))
  }

  for (const c of CORE_LANDMARKS) {
    const building = makeBuilding(c, 'core')
    const site = coreSites.find((candidate) => candidate.id === c.id)
    if (site) {
      building.x = site.x
      building.z = site.z
      building.door = { x: site.roadX, z: site.roadZ }
      building.access = site
    }
    world.buildings[c.id] = building
  }

  let plotIdx = 0
  for (const c of connectorsByDomain(connectors)) {
    if (plotIdx >= world.plots.length) {
      // The district is full: the overflow is a visible queued event, never
      // a silent drop (R002 amendment).
      world.overflow.push(c)
      continue
    }
    const plot = world.plots[plotIdx++]
    if (c.packStatus === 'served') {
      placeConnector(c, plot, true)
    } else {
      plot.reservedId = c.id
      plot.reservedName = c.name
    }
  }
  if (world.overflow.length > 0) {
    bus.emit(
      makeEvent(
        'task.queued',
        {},
        `${world.overflow.length} connectors outgrew the ${world.plots.length}-plot district — queued for the next expansion`,
      ),
    )
  }

  if ('seed:0' in world.roadGraph.nodes) {
    world.regionalMassing = generateRoadsideMassing(world.roadGraph, CITY_WORLD_SEED, [
      ...Object.values(world.buildings),
      ...world.plots.map((plot) => ({ ...plot, w: 5.6, d: 5.6 })),
      ...world.homes.map((home) => ({ ...home, w: 4, d: 4 })),
    ])
  }

  ROSTER.forEach((r, i) => {
    const ch = new Character(r, i)
    const a = (i / ROSTER.length) * Math.PI * 2
    if ('seed:0' in world.roadGraph!.nodes) ch.setPos(ch.homeDoor.x, ch.homeDoor.z)
    else ch.setPos(Math.cos(a) * 4.5, Math.sin(a) * 4.5)
    world.characters.push(ch)
    // Spawn events live in the sim, not the renderer, so both views emit
    // the identical vocabulary (constitution P2).
    bus.emit(makeEvent('character.spawned', { character: ch.id }, `${ch.name} joins the city`))
  })

  // The derived road graph (R032): characters walk it, and a saved layout
  // edit replaces it with the overrides' graph.
  world.districtStyles = {}
  world.layoutDoc = null

  world.initialized = true
}

export function onboardConnector(connectorId: string): boolean {
  const plot = world.plots.find((p) => !p.buildingId && !p.construction)
  if (!plot) {
    bus.emit(makeEvent('task.queued', {}, 'City is full — no empty plot for this connector'))
    return false
  }
  const def = world.connectors.find((c) => c.id === connectorId)
  if (!def) return false
  recordAction('onboard', connectorId)
  plot.reservedId = null
  plot.reservedName = null
  placeConnector(def, plot, false)
  return true
}

function completeConstruction(plot: Plot): void {
  plot.construction = null
  const b = world.buildings[plot.buildingId!]
  b.fresh = 900
  world.firstVisit = { buildingId: b.id, age: 0 }
  bus.emit(makeEvent('building.completed', { building: b.id }, `${b.name} is open for business`))
  bus.emit(makeEvent('connector.joined', { building: b.id }, `${b.id} connected through the fleet boundary`))
}

// ---- Layout edits (R032) -----------------------------------------------------

/**
 * Re-path every character that is walking toward a point the new road graph
 * routes differently (R032): the walk resumes from the character's position
 * on the live graph. A route the graph cannot provide keeps the character's
 * current path — a refused or partial edit never strands anyone.
 */
export function rerouteCharacters(): void {
  for (const ch of world.characters) {
    if (ch.state !== 'traveling' || !ch.target) continue
    const live = world.roadGraph ? pathOn(world.roadGraph, ch.pos.x, ch.pos.z, ch.target.x, ch.target.z) : null
    if (live) {
      ch.path = live
      ch.pathPos = 0
    }
  }
}

/**
 * Apply a stored layout document to the live city (R032): the world state
 * moves to the document's final state, the road graph re-derives with the
 * overrides, and every character bound to a moved building re-joins its new
 * door — a walker re-paths from where it stands, a character queued at the
 * old door steps onto the new one. Idempotent for an already-applied doc.
 */
export function applyLayoutEdit(doc: LayoutOverride): void {
  const moved = new Set(doc.moves.map((m) => m.buildingId))
  applyDocument(world, doc)
  for (const ch of world.characters) {
    if (!ch.task || !moved.has(ch.task.buildingId)) continue
    const b = world.buildings[ch.task.buildingId]
    if (!b.door) continue
    if (ch.state === 'traveling') {
      ch.go(b.door.x, b.door.z, ch.arriveHook)
    } else {
      ch.setPos(b.door.x, b.door.z)
    }
  }
  rerouteCharacters()
}

// ---- Tasks -----------------------------------------------------------------

let taskSeq = 0

function pickBuilding(): Building | null {
  const candidates = Object.values(world.buildings).filter((b) => b.online)
  if (!candidates.length) return null
  let total = 0
  const weights = candidates.map((b) => {
    const w = 1 + (b.fresh > 0 ? 8 : 0) + (b.served ? 1 : 0)
    total += w
    return w
  })
  let r = simRandom() * total
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]
    if (r <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

function makeTask(agent: Character, building: Building): Task {
  const tool = building.tools[Math.floor(simRandom() * building.tools.length)]
  const task: Task = {
    id: `t-${++taskSeq}`,
    agentId: agent.id,
    buildingId: building.id,
    tool,
    approvalRequired: simRandom() < TUNING.approvalChance,
    state: 'active',
    calls: 1 + Math.floor(simRandom() * 3),
  }
  world.tasks.unshift(task)
  if (world.tasks.length > 40) world.tasks.pop()
  agent.task = task
  return task
}

export function dispatchTask(agentId?: string): boolean {
  // A named target that is busy (or the night) is a visible queued event —
  // never a silent swap onto another agent (R007 amendment).
  if (agentId) {
    const named = world.characters.find((c) => c.id === agentId)
    if (named?.state !== 'idle' || isNight(world.clock)) {
      const who = named ? `${named.name} is ${named.state}` : 'the requested agent is not in the city'
      bus.emit(makeEvent('task.queued', {}, `${who} — the dispatch is queued until they are free`))
      return false
    }
  }
  const idle = world.characters.filter((c) => c.kind === 'ai' && c.state === 'idle' && !isNight(world.clock))
  const agent = agentId
    ? world.characters.find((c) => c.id === agentId)!
    : idle.length
      ? idle[Math.floor(simRandom() * idle.length)]
      : null
  if (!agent) {
    bus.emit(makeEvent('task.queued', {}, 'No idle agent — task will start when one is free'))
    return false
  }
  const building = pickBuilding()
  if (!building) return false
  const task = makeTask(agent, building)
  world.stats.dispatches++
  recordAction('dispatch', agent.id)
  startWork(agent, task)
  bus.emit(
    makeEvent(
      'operator.dispatched',
      { character: agent.id, building: building.id, task: task.id },
      `Operator dispatched ${agent.name} to ${building.name}`,
    ),
  )
  // The chief operator walks over for the hand-off (purely visual).
  const chief = world.characters.find((c) => c.id === 'operator-01')
  if (chief && chief.state !== 'sleeping') {
    chief.go(agent.pos.x + 1, agent.pos.z + 1, null, 'delivering a task')
  }
  return true
}

function startWork(agent: Character, task: Task): void {
  const building = world.buildings[task.buildingId]
  const refs = { character: agent.id, task: task.id, building: building.id }
  // Honoured refusals (R006 amendment): a refused change stops the walk,
  // the mood and the success events — state and behaviour never diverge.
  if (!transition(agent, 'tasked')) return
  if (task.approvalRequired) {
    task.state = 'pending_approval'
    const gate = doorOf(world.buildings.arbora)
    if (transition(agent, 'traveling')) {
      agent.go(
        gate.x,
        gate.z,
        () => {
          if (!transition(agent, 'awaiting')) return
          agent.mood = 'awaiting approval'
          bus.emit(
            makeEvent(
              'task.pending_approval',
              { character: agent.id, task: task.id, building: building.id },
              `${task.tool} at ${building.name} needs operator approval`,
            ),
          )
        },
        'seeking approval',
      )
      const assigned = makeEvent(
        'task.assigned',
        refs,
        `Assigned ${task.tool} at ${building.name} (approval required)`,
      )
      bus.emit(assigned)
      bus.emit(makeEvent('character.traveling', refs, `${agent.name} heads to the gate for approval`))
      agent.logEvent(assigned)
    }
  } else {
    const door = doorOf(building)
    if (transition(agent, 'traveling')) {
      agent.go(
        door.x,
        door.z,
        () => {
          beginToolCall(agent)
        },
        'en route',
      )
      const assigned = makeEvent('task.assigned', refs, `Assigned ${task.tool} at ${building.name}`)
      bus.emit(assigned)
      bus.emit(makeEvent('character.traveling', refs, `${agent.name} heads to ${building.name}`))
      agent.logEvent(assigned)
    }
  }
}

function beginToolCall(agent: Character): void {
  const task = agent.task
  if (!task) return
  const building = world.buildings[task.buildingId]
  if (world.firstVisit?.buildingId === task.buildingId) world.firstVisit = null
  if (!transition(agent, 'working')) return
  agent.mood = agent.retryWait > 0 ? 'retrying after incident' : 'focused'
  if (agent.retryWait > 0) {
    agent.callDuration = 3 + simRandom() * 2
    agent.retryWait = 0
    return
  }
  agent.callsLeft = task.calls
  agent.workTimer = 0
  agent.callDuration = 2.5 + simRandom() * 2.5 // real seconds
  agent.roomTimer = 0
  agent.roomIndex = Math.floor(simRandom() * building.rooms.length)
  world.buildings[task.buildingId].visits++
  bus.emit(
    makeEvent(
      'tool.call',
      { character: agent.id, building: building.id, task: task.id },
      `tool.call → ${task.tool} @ ${building.name}`,
    ),
  )
}

function finishToolCall(agent: Character): void {
  const task = agent.task
  if (!task) return
  const building = world.buildings[task.buildingId]
  agent.context = Math.min(100, agent.context + 12 + simRandom() * 8)

  if (simRandom() < 0.1 && agent.callsLeft > 1) {
    // Incident: refused result, one retry.
    world.stats.incidents++
    building.flash = 1
    bus.emit(
      makeEvent(
        'task.failed',
        { character: agent.id, building: building.id, task: task.id },
        `${task.tool} refused — contradiction recorded, retrying`,
      ),
    )
    agent.mood = 'recovering from incident'
    agent.retryWait = 4
    agent.workTimer = 0
    return
  }

  world.stats.toolCalls++
  bus.emit(
    makeEvent('tool.result', { character: agent.id, building: building.id, task: task.id }, `${task.tool} → ok`),
  )

  agent.callsLeft--
  if (agent.context >= 85 && agent.callsLeft > 0) {
    // Context compaction detour to the vault (traveling → committing).
    const vault = world.buildings.medulla
    const door = doorOf(vault)
    agent.commitPhase = 'compacting'
    bus.emit(
      makeEvent(
        'context.compacted',
        { character: agent.id, task: task.id },
        `${agent.name}'s context reached ${Math.round(agent.context)}% — compacting at the vault`,
      ),
    )
    if (transition(agent, 'traveling')) {
      agent.mood = 'compacting memory'
      agent.go(
        door.x,
        door.z,
        () => {
          // Six real seconds of compaction once the change is accepted.
          if (!transition(agent, 'committing')) return
          agent.workTimer = 6
        },
        'compacting memory',
      )
      bus.emit(
        makeEvent(
          'character.traveling',
          { character: agent.id, building: 'medulla', task: task.id },
          `${agent.name} detours to the vault`,
        ),
      )
    }
    return
  }

  if (agent.callsLeft <= 0) {
    commitKnowledge(agent)
  } else {
    agent.workTimer = 0
    agent.callDuration = 2.5 + simRandom() * 2.5
    bus.emit(
      makeEvent(
        'tool.call',
        { character: agent.id, building: task.buildingId, task: task.id },
        `tool.call → ${task.tool} @ ${building.name} (continued)`,
      ),
    )
  }
}

function commitKnowledge(agent: Character): void {
  const task = agent.task
  const vault = world.buildings.medulla
  const door = doorOf(vault)
  agent.commitPhase = 'committing'
  if (!transition(agent, 'traveling')) return
  agent.mood = 'committing knowledge'
  agent.go(
    door.x,
    door.z,
    () => {
      if (!transition(agent, 'committing')) return
      agent.workTimer = 4
    },
    'committing knowledge',
  )
  bus.emit(
    makeEvent(
      'character.traveling',
      { character: agent.id, building: 'medulla', task: task ? task.id : undefined },
      `${agent.name} heads to the vault to commit`,
    ),
  )
}

function finishCommitting(agent: Character): void {
  if (agent.commitPhase === 'compacting') {
    agent.context = 25 + simRandom() * 15
    const b = world.buildings[agent.task ? agent.task.buildingId : 'arbora']
    const door = doorOf(b)
    if (transition(agent, 'traveling')) {
      agent.go(
        door.x,
        door.z,
        () => {
          beginToolCall(agent)
        },
        'back to work',
      )
      bus.emit(
        makeEvent('character.traveling', { character: agent.id, building: b.id }, `${agent.name} returns to work`),
      )
    }
    return
  }
  const task = agent.task
  if (!transition(agent, 'idle')) return
  world.stats.knowledge++
  world.stats.tasksDone++
  if (task) task.state = 'done'
  agent.task = null
  bus.emit(
    makeEvent(
      'knowledge.committed',
      { character: agent.id, building: 'medulla', task: task ? task.id : undefined },
      `${agent.name} committed evidence and provenance to the vault`,
    ),
  )
  agent.mood = 'wandering'
  const evt = makeEvent('character.idle', { character: agent.id }, `${agent.name} is back to idle`)
  bus.emit(evt)
  agent.logEvent(evt)
  agent.wanderTimer = 3 + simRandom() * 8
}

// ---- Simulated operator behaviour (R005/R007) ------------------------------

function tickHumans(ch: Character, _dtReal: number): void {
  const night = isNight(world.clock)
  if (ch.id === 'operator-01') {
    if (ch.state === 'sleeping') {
      if (!night) wakeUp(ch)
      return
    }
    if (night) {
      goSleep(ch)
      return
    }
    // Resolve pending approvals at the gate — governed behaviour, so it runs
    // in every activity mode (R007).
    const pending = world.tasks.find((t) => t.state === 'pending_approval')
    if (pending && ch.state !== 'awaiting') {
      // The stroll to the gate is ambient operator behaviour; the lifecycle
      // change (idle → awaiting) happens at the gate and is guarded.
      const gate = doorOf(world.buildings.arbora)
      if (ch.moving() && ch.mood === 'approving') return
      ch.go(
        gate.x,
        gate.z,
        () => {
          if (!transition(ch, 'awaiting')) return
          ch.waitTimer = 2
        },
        'approving',
      )
      return
    }
    if (ch.state === 'awaiting') {
      if (ch.waitTimer <= 0) {
        if (!transition(ch, 'idle')) return
        ch.mood = 'supervising'
        const pending2 = world.tasks.find((t) => t.state === 'pending_approval')
        if (pending2) {
          world.stats.approvals++
          pending2.state = 'active'
          recordAction('approve')
          const agent = world.characters.find((c) => c.id === pending2.agentId)
          const building = world.buildings[pending2.buildingId]
          bus.emit(
            makeEvent(
              'task.approved',
              { character: ch.id, task: pending2.id },
              `Operator approved ${pending2.tool} at ${building.name}`,
            ),
          )
          if (agent?.state === 'awaiting' && transition(agent, 'traveling')) {
            const door = doorOf(building)
            agent.go(
              door.x,
              door.z,
              () => {
                beginToolCall(agent)
              },
              'en route',
            )
            bus.emit(
              makeEvent(
                'character.traveling',
                { character: agent.id, task: pending2.id, building: building.id },
                `${agent.name} heads to ${building.name}`,
              ),
            )
          }
        }
      }
      return
    }
    // Stroll the plaza — labelled demo behaviour only (R026).
    if (world.activity === 'demo' && ch.state === 'idle' && !ch.moving() && ch.wanderTimer <= 0) {
      const a = simRandom() * Math.PI * 2
      ch.go(Math.cos(a) * 5, Math.sin(a) * 5, null, 'supervising')
      ch.wanderTimer = 8 + simRandom() * 10
    }
  } else if (ch.id === 'operator-02') {
    // Patrols the connector district by day — labelled demo behaviour (R026).
    if (night) {
      if (ch.state === 'sleeping') return
      goSleep(ch)
      return
    }
    if (ch.state === 'sleeping') {
      wakeUp(ch)
      return
    }
    if (world.activity === 'demo' && !ch.moving() && ch.waitTimer <= 0) {
      const built = world.plots.filter((p) => p.buildingId && !p.construction)
      if (built.length) {
        const p = built[Math.floor(simRandom() * built.length)]
        const b = world.buildings[p.buildingId!]
        const door = doorOf(b)
        ch.go(
          door.x,
          door.z,
          () => {
            ch.waitTimer = 4 + simRandom() * 4
          },
          'patrolling',
        )
      } else {
        ch.waitTimer = 5
      }
    }
  } else if (ch.id === 'operator-03') {
    // Nightshift: sleeps by day, patrols by night (demo behaviour, R026).
    if (!night) {
      if (ch.state === 'sleeping') return
      goSleep(ch)
      return
    }
    if (ch.state === 'sleeping') {
      wakeUp(ch)
      return
    }
    if (world.activity === 'demo' && !ch.moving() && ch.waitTimer <= 0) {
      const arboraDoor = ('arbora' in world.buildings ? world.buildings.arbora.door : null) ??
        buildingDoor('arbora') ?? { x: 0, z: 0 }
      const spots = [arboraDoor, { x: -45, z: -45 }, { x: -65, z: 30 }, { x: -5, z: 15 }]
      const s = spots[Math.floor(simRandom() * spots.length)]
      ch.go(
        s.x,
        s.z,
        () => {
          ch.waitTimer = 5 + simRandom() * 5
        },
        'night patrol',
      )
    }
  }
}

function goSleep(ch: Character): void {
  if (ch.state === 'sleeping' || ch.moving()) return
  if (!transition(ch, 'sleeping')) return
  ch.mood = 'recharging'
  ch.go(
    ch.homeDoor.x,
    ch.homeDoor.z,
    () => {
      ch.visible = false
      bus.emit(makeEvent('character.sleeping', { character: ch.id }, `${ch.name} is home for the night`))
    },
    'heading home',
  )
}

function wakeUp(ch: Character): void {
  if (ch.state !== 'sleeping') return
  if (!transition(ch, 'idle')) return
  ch.visible = true
  ch.pos = { ...ch.homeDoor }
  ch.mood = ch.kind === 'npc' ? 'supervising' : 'wandering'
  ch.wanderTimer = 2 + simRandom() * 6
  bus.emit(makeEvent('character.waking', { character: ch.id }, `${ch.name} is up and about`))
}

// ---- Agent behaviour ------------------------------------------------------

function tickAgent(ch: Character, dtReal: number): void {
  const night = isNight(world.clock)

  if (ch.state === 'sleeping') {
    if (!night) wakeUp(ch)
    return
  }

  // Night commute: finish the current tool call, then head home.
  if (night && (ch.state === 'idle' || ch.state === 'tasked' || ch.state === 'traveling' || ch.state === 'awaiting')) {
    if (!ch.moving()) goSleep(ch)
    return
  }
  if (night && ch.state === 'working') {
    // Let the in-flight call finish, then sleep.
    ch.workTimer -= dtReal
    if (ch.workTimer <= 0) {
      ch.task = null
      goSleep(ch)
    }
    return
  }

  switch (ch.state) {
    case 'idle': {
      ch.wanderTimer -= dtReal
      // Wandering is labelled demo behaviour (R026): quiet agents stand by.
      if (world.activity === 'demo' && !ch.moving() && ch.wanderTimer <= 0) {
        // Stroll: plaza, a park, or the waterfront.
        const spots = [
          [simRandom() * 10 - 5, simRandom() * 10 - 5],
          [12 + simRandom() * 6, -8 + simRandom() * 6],
          [22 + simRandom() * 6, -28 + simRandom() * 6],
          [-8 + simRandom() * 6, 12 + simRandom() * 6],
        ]
        const s = spots[Math.floor(simRandom() * spots.length)]
        ch.go(s[0], s[1], null)
        ch.wanderTimer = 6 + simRandom() * 8
      }
      break
    }
    case 'working': {
      if (ch.retryWait > 0) {
        ch.retryWait -= dtReal
        if (ch.retryWait <= 0) beginToolCall(ch)
        break
      }
      ch.workTimer += dtReal
      ch.roomTimer += dtReal
      if (ch.roomTimer > 15 && ch.task) {
        ch.roomTimer = 0
        const rooms = world.buildings[ch.task.buildingId].rooms
        ch.roomIndex = (ch.roomIndex + 1) % rooms.length
      }
      if (ch.workTimer >= ch.callDuration) finishToolCall(ch)
      break
    }
    case 'committing': {
      if (ch.moving()) break
      ch.workTimer -= dtReal
      if (ch.workTimer <= 0) finishCommitting(ch)
      break
    }
    case 'tasked':
    case 'traveling':
    case 'awaiting':
      break // arrival hooks drive the next state
    default:
      break
  }
}

// ---- Main tick ------------------------------------------------------------

export function tickSim(dtGame: number, dtReal: number): void {
  if (world.roadGraph && world.traffic?.graph !== world.roadGraph) {
    world.traffic = { graph: world.roadGraph, routes: makeTrafficRoutes(world.roadGraph), elapsed: 0, positions: [] }
  }
  if (world.traffic) tickTraffic(world.traffic, dtReal)
  world.clock += dtGame
  world.absGameS += dtGame
  if (world.clock >= 86400) {
    world.clock -= 86400
    world.day++
  }

  // Auto tasking (daytime only, bounded concurrency).
  autoTaskTimer -= dtReal
  if (autoTaskTimer <= 0) {
    autoTaskTimer = AUTO_TASK_MIN + simRandom() * (AUTO_TASK_MAX - AUTO_TASK_MIN)
    if (!isNight(world.clock)) {
      const idle = world.characters.filter((c) => c.kind === 'ai' && c.state === 'idle')
      const owed = world.firstVisit ? world.buildings[world.firstVisit.buildingId] : null
      if (owed && idle.length) {
        // A freshly completed building is owed its first visit — real
        // activity, so it is dispatched in every mode (R008).
        const agent = idle[Math.floor(simRandom() * idle.length)]
        const task = makeTask(agent, owed)
        startWork(agent, task)
        world.firstVisit = null
      } else if (world.activity === 'demo') {
        // Continuous auto-tasking is labelled demo behaviour (R026).
        const active = world.characters.filter(
          (c) => c.kind === 'ai' && ['tasked', 'working', 'committing', 'awaiting'].includes(c.state),
        ).length
        if (active < 6 && idle.length) {
          const agent = idle[Math.floor(simRandom() * idle.length)]
          const building = pickBuilding()
          if (building) {
            const task = makeTask(agent, building)
            startWork(agent, task)
          }
        }
      }
    }
  }

  for (const ch of world.characters) {
    ch.wanderTimer -= dtReal
    ch.waitTimer -= dtReal
    if (ch.kind === 'ai') tickAgent(ch, dtReal)
    else tickHumans(ch, dtReal)
    ch.move(dtReal)
  }

  // Construction (real-time, so SC-003 holds at any speed).
  for (const plot of world.plots) {
    if (!plot.construction) continue
    const c = plot.construction
    c.progress += dtReal / CONSTRUCTION_REAL_S
    for (const m of [0.25, 0.5, 0.75]) {
      if (c.progress >= m && c.lastMilestone < m) {
        c.lastMilestone = m
        const b = world.buildings[c.connectorId]
        bus.emit(makeEvent('construction.progress', { building: b.id }, `${b.name}: ${Math.round(m * 100)}% complete`))
      }
    }
    if (c.progress >= 1) completeConstruction(plot)
  }

  // The owed first visit expires if the city stays idle.
  if (world.firstVisit) {
    world.firstVisit.age += dtReal
    if (world.firstVisit.age > FIRST_VISIT_GRACE_S) world.firstVisit = null
  }

  // Building decay.
  for (const b of Object.values(world.buildings)) {
    if (b.fresh > 0) b.fresh = Math.max(0, b.fresh - dtReal)
    if (b.flash > 0) b.flash = Math.max(0, b.flash - dtReal * 0.8)
  }
}

// ---- Accessors (selection API, UI, tests) ----------------------------------

export function getCharacter(id: string): Character | undefined {
  return world.characters.find((c) => c.id === id)
}

export function getBuilding(id: string): Building | undefined {
  return world.buildings[id]
}

// Test seam: reset the world between cases.
export function resetSim(): void {
  world.day = 1
  world.clock = 9 * 3600
  world.absGameS = 9 * 3600
  world.activity = 'quiet'
  world.characters = []
  world.buildings = {}
  world.regionalMassing = []
  world.homes = HOUSES.map((home) => ({ ...home }))
  world.plots = PLOTS.map((p) => ({
    x: p.x,
    z: p.z,
    buildingId: null,
    reservedId: null,
    reservedName: null,
    construction: null,
  }))
  world.tasks = []
  world.actions = []
  world.stats = { knowledge: 0, toolCalls: 0, tasksDone: 0, incidents: 0, approvals: 0, dispatches: 0 }
  world.firstVisit = null
  world.connectors = []
  world.overflow = []
  world.roadGraph = null
  world.traffic = null
  world.districtStyles = {}
  world.layoutDoc = null
  world.initialized = false
  autoTaskTimer = 5
  taskSeq = 0
}
