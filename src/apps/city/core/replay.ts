/**
 * @file replay.ts
 * @description The recorded-action replay driver (OVERSTORY-CITY-R029).
 * Operator actions (dispatch, onboard, approvals) are recorded in the sim
 * with in-game timestamps; this driver re-runs them on a fixed schedule
 * (~300 in-game seconds of city life) against a seeded PRNG (R014), so the
 * replayed history is deterministic per seed: the same seed plus the same
 * recorded actions always yields the identical event sequence.
 *
 * Every run starts from a fresh, fully-reset world over the bundled snapshot
 * (R014) — the driver owns no state of its own and never runs two worlds at
 * once. The event bus is left intact: the caller's subscriptions keep
 * receiving the replayed events, which is what makes the scrubber (R029)
 * show the replayed history in the live feed. A test that wants a clean
 * bus calls `bus.reset()` itself before running.
 */
import { FLEET_SNAPSHOT, fleetToConnectors } from './ecosystem'
import { bus, setTimeSource, type CityEvent } from './events'
import { DEFAULT_SEED, mulberry32 } from './prng'
import {
  dispatchTask,
  initSim,
  onboardConnector,
  resetSim,
  setSimRandom,
  tickSim,
  world,
  type RecordedAction,
} from './sim'

/** The fixed replay schedule (~300 in-game seconds of city life, R029). */
export const REPLAY_DEFAULT_DURATION_GAME_S = 300

export interface ReplayOptions {
  /** The seed the replayed PRNG is initialised with (default: fixed). */
  seed?: number
  /** In-game seconds to simulate (default: the ~300 s fixed schedule). */
  durationGameS?: number
  /** In-game seconds per fixed tick (default: 5). */
  dtGame?: number
  /** Real seconds per tick (default: dtGame / timeScale at 1×). */
  dtReal?: number
}

export interface ReplayResult {
  /** Every event emitted during the replay, in order (with provenance). */
  events: CityEvent[]
  finalAbsGameS: number
  finalClock: number
  finalDay: number
}

/**
 * Replay the recorded operator actions on a fixed schedule, deterministically
 * per seed. The recorded actions are injected at their recorded in-game
 * timestamps; approvals are recorded for the scrubber's timeline while the
 * gate resolution itself is part of the deterministic simulation.
 */
export function replayRun(actions: RecordedAction[], opts: ReplayOptions = {}): ReplayResult {
  const seed = opts.seed ?? DEFAULT_SEED
  const dtGame = opts.dtGame ?? 5
  const dtReal = opts.dtReal ?? dtGame / world.timeScale
  const duration = opts.durationGameS ?? REPLAY_DEFAULT_DURATION_GAME_S

  // A fresh, fully-reset world, seeded PRNG, in-game event clock. The bus
  // (and its subscribers) is deliberately left in place: the replayed
  // events stream into the live feed while the world state is replaced.
  resetSim()
  setSimRandom(mulberry32(seed))
  setTimeSource(() => world.clock)

  const events: CityEvent[] = []
  const unsub = bus.subscribe((e) => events.push(e))
  initSim(fleetToConnectors(FLEET_SNAPSHOT))

  const due = [...actions].sort((a, b) => a.ts - b.ts)
  let ai = 0
  const target = world.absGameS + duration
  while (world.absGameS < target) {
    // Inject every recorded action due at or before the current tick.
    while (ai < due.length && due[ai].ts <= world.absGameS) {
      const a = due[ai++]
      if (a.kind === 'dispatch') dispatchTask(a.target)
      else if (a.kind === 'onboard') onboardConnector(a.target ?? '')
    }
    tickSim(dtGame, dtReal)
  }
  unsub()
  return { events, finalAbsGameS: world.absGameS, finalClock: world.clock, finalDay: world.day }
}
