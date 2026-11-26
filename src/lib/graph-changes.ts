/**
 * Live graph convergence (OVERSTORY-APPS-R030.8).
 *
 * The engine serves one authorized snapshot identity (`eg.graph.OpenGraphSnapshot`) and an ordered,
 * tenant-bound change feed (`eg.graph.ReadGraphChanges`). This module types both, reduces pages of
 * events into one feed state and judges the measured latency against owner-published limits. It
 * decides nothing about what the engine returns: a withheld event never appears, and a cursor the
 * engine refuses always ends in a fresh authorized snapshot.
 */
import { z } from 'zod'
import { callServed, type ServedReply } from '@/lib/arbora-api/served'

export const SNAPSHOT_OP = 'eg.graph.OpenGraphSnapshot'
export const CHANGES_OP = 'eg.graph.ReadGraphChanges'
export const CHANGES_PAGE_LIMIT = 200
export const LIVE_LIMITS_UNAVAILABLE = 'Live graph limits unavailable'

/** Engine refusal codes that make the held cursor useless. Each needs a fresh authorized snapshot. */
export const CURSOR_REFUSALS = ['CURSOR_EXPIRED', 'AUTHORIZATION_CHANGED', 'GRAPH_INCARNATION_STALE'] as const
export type CursorRefusal = (typeof CURSOR_REFUSALS)[number]

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const ids = z.array(z.string().min(1).max(512)).max(100000)

export const graphSnapshotSchema = z
  .object({
    schema_version: count,
    incarnation: count,
    committed_revision: count,
    snapshot_digest: z.string().regex(/^[0-9a-f]{64}$/),
    visibility_revision: count,
    high_water_cursor: z.string().min(1).max(4096),
  })
  .strict()
export type GraphSnapshotIdentity = z.infer<typeof graphSnapshotSchema>

const changeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('upsert'), node_ids: ids, edge_ids: ids }).strict(),
  z.object({ kind: z.literal('tombstone'), deleted_ids: ids, deletion_revision: count }).strict(),
  z
    .object({
      kind: z.literal('row'),
      table: z.string().max(256),
      operation: z.enum(['insert', 'update', 'delete']),
      key: z.string().max(4096),
    })
    .strict(),
])
export type GraphChange = z.infer<typeof changeSchema>

export const graphChangeEventSchema = z
  .object({
    schema_version: count,
    commit_id: z.string().min(1).max(256),
    event_ordinal: count,
    committed_at_ms: count,
    visible_at_ms: count,
    latency_profile_revision: count,
    commit_to_visible_ms: count,
    change: changeSchema,
  })
  .strict()
export type GraphChangeEvent = z.infer<typeof graphChangeEventSchema>

export const graphChangePageSchema = z
  .object({
    schema_version: count,
    events: z.array(graphChangeEventSchema).max(10000),
    next_cursor: z.string().min(1).max(4096),
  })
  .strict()
export type GraphChangePage = z.infer<typeof graphChangePageSchema>

export const readGraphSnapshot = (signal?: AbortSignal): Promise<ServedReply<GraphSnapshotIdentity>> =>
  callServed(SNAPSHOT_OP, {}, graphSnapshotSchema, { signal })

export const readGraphChanges = (
  cursor: string,
  signal?: AbortSignal,
  limit = CHANGES_PAGE_LIMIT,
): Promise<ServedReply<GraphChangePage>> =>
  callServed(CHANGES_OP, { cursor, limit }, graphChangePageSchema, { signal })

// ── Owner-published bounds ──────────────────────────────────────────────────────────────────────

/** Bounds the owner publishes. Each is positive, finite and tied to one contract revision. */
export interface LiveGraphLimits {
  /** Largest commit-to-visible time the owner accepts, in milliseconds. */
  commitToVisibleMs: number
  /** Largest p95 frame time while a change is applied, in milliseconds. */
  frameP95Ms: number
  /** Largest layout settle time after a change, in milliseconds. */
  layoutSettleMs: number
  /** The engine latency profile these numbers were measured under. */
  profileRevision: number
  contractRevision: string
  workload: string
}

export type LiveLimitsState =
  | { status: 'ready'; limits: LiveGraphLimits }
  | { status: 'unavailable'; notice: typeof LIVE_LIMITS_UNAVAILABLE; missing: string[] }

const BOUNDS = ['commitToVisibleMs', 'frameP95Ms', 'layoutSettleMs'] as const

/** Parse published bounds. An absent, nonpositive or nonfinite bound makes bounded live mode unavailable. */
export function readLiveLimits(published: unknown): LiveLimitsState {
  const record = typeof published === 'object' && published !== null ? (published as Record<string, unknown>) : {}
  const missing: string[] = BOUNDS.filter((k) => {
    const v = record[k]
    return typeof v !== 'number' || !Number.isFinite(v) || v <= 0
  })
  if (typeof record.profileRevision !== 'number' || !Number.isInteger(record.profileRevision))
    missing.push('profileRevision')
  for (const key of ['contractRevision', 'workload'] as const)
    if (typeof record[key] !== 'string' || record[key] === '') missing.push(key)
  if (missing.length > 0) return { status: 'unavailable', notice: LIVE_LIMITS_UNAVAILABLE, missing }
  return {
    status: 'ready',
    limits: {
      commitToVisibleMs: record.commitToVisibleMs as number,
      frameP95Ms: record.frameP95Ms as number,
      layoutSettleMs: record.layoutSettleMs as number,
      profileRevision: record.profileRevision as number,
      contractRevision: record.contractRevision as string,
      workload: record.workload as string,
    },
  }
}

// ── Feed state ──────────────────────────────────────────────────────────────────────────────────

export type ResnapshotReason = CursorRefusal | 'REVISION_REGRESSION'

/** What the feed measured: revisions and commit-to-visible latency against the owner limit. */
export interface FeedEvidence {
  snapshotRevision: number
  snapshotIncarnation: number
  lastEventOrdinal: number
  applied: number
  duplicates: number
  regressions: number
  maxCommitToVisibleMs: number
  exceededLimit: number
  /** Events measured under a latency profile other than the one the limits name. */
  profileMismatch: number
}

export type FeedState =
  | { phase: 'idle' }
  | { phase: 'unavailable'; reason: string }
  | { phase: 'revoked' }
  | { phase: 'resnapshot'; reason: ResnapshotReason }
  | {
      phase: 'live'
      snapshot: GraphSnapshotIdentity
      cursor: string
      lastOrdinal: number
      seen: readonly string[]
      /** Ids a committed event deleted, kept apart from entities that merely became invisible. */
      tombstoned: readonly string[]
      evidence: FeedEvidence
    }

/** The most event keys and tombstones the reducer remembers. Older ones cannot arrive again. */
export const SEEN_LIMIT = 4096
export const TOMBSTONE_LIMIT = 100000

const eventKey = (event: GraphChangeEvent): string => `${event.commit_id}:${event.event_ordinal}`
const tail = <T>(items: readonly T[], limit: number): readonly T[] => items.slice(Math.max(0, items.length - limit))

export const idleFeed = (): FeedState => ({ phase: 'idle' })

/** Start a feed from an authorized snapshot. Without usable limits there is no bounded live mode. */
export function openFeed(snapshot: GraphSnapshotIdentity, limits: LiveLimitsState): FeedState {
  if (limits.status !== 'ready') return { phase: 'unavailable', reason: limits.notice }
  return {
    phase: 'live',
    snapshot,
    cursor: snapshot.high_water_cursor,
    lastOrdinal: -1,
    seen: [],
    tombstoned: [],
    evidence: {
      snapshotRevision: snapshot.committed_revision,
      snapshotIncarnation: snapshot.incarnation,
      lastEventOrdinal: -1,
      applied: 0,
      duplicates: 0,
      regressions: 0,
      maxCommitToVisibleMs: 0,
      exceededLimit: 0,
      profileMismatch: 0,
    },
  }
}

/** A snapshot older than the one held is a revision regression: the held state stays and a fresh one is read. */
export function acceptSnapshot(state: FeedState, snapshot: GraphSnapshotIdentity, limits: LiveLimitsState): FeedState {
  if (
    state.phase === 'live' &&
    state.snapshot.incarnation === snapshot.incarnation &&
    snapshot.committed_revision < state.snapshot.committed_revision
  )
    return { phase: 'resnapshot', reason: 'REVISION_REGRESSION' }
  return openFeed(snapshot, limits)
}

export interface PageOutcome {
  state: FeedState
  /** Events to apply, in engine order, with duplicates and regressions already removed. */
  apply: GraphChangeEvent[]
}

/** Reduce one page: sort, drop duplicates, reject regressions, then record the evidence. */
export function receivePage(state: FeedState, page: GraphChangePage, limits: LiveLimitsState): PageOutcome {
  if (state.phase !== 'live' || limits.status !== 'ready') return { state, apply: [] }
  const seen = new Set(state.seen)
  const evidence = { ...state.evidence }
  const apply: GraphChangeEvent[] = []
  let last = state.lastOrdinal
  const ordered = [...page.events].sort((a, b) => a.event_ordinal - b.event_ordinal)
  for (const event of ordered) {
    const key = eventKey(event)
    if (seen.has(key)) {
      evidence.duplicates += 1
      continue
    }
    if (event.event_ordinal <= last) {
      evidence.regressions += 1
      continue
    }
    seen.add(key)
    last = event.event_ordinal
    apply.push(event)
    evidence.applied += 1
    evidence.maxCommitToVisibleMs = Math.max(evidence.maxCommitToVisibleMs, event.commit_to_visible_ms)
    if (event.latency_profile_revision !== limits.limits.profileRevision) evidence.profileMismatch += 1
    else if (event.commit_to_visible_ms > limits.limits.commitToVisibleMs) evidence.exceededLimit += 1
  }
  evidence.lastEventOrdinal = last
  const tombstoned = apply.flatMap((e) => (e.change.kind === 'tombstone' ? e.change.deleted_ids : []))
  return {
    apply,
    state: {
      ...state,
      cursor: page.next_cursor,
      lastOrdinal: last,
      seen: tail([...seen], SEEN_LIMIT),
      tombstoned: tail([...state.tombstoned, ...tombstoned], TOMBSTONE_LIMIT),
      evidence,
    },
  }
}

/** The engine refused the cursor. Each refusal needs a fresh authorized snapshot, never a retry of the cursor. */
export function refuseCursor(state: FeedState, code: string): FeedState {
  if (state.phase === 'revoked') return state
  return (CURSOR_REFUSALS as readonly string[]).includes(code)
    ? { phase: 'resnapshot', reason: code as CursorRefusal }
    : state
}

/** A denied read withdraws everything protected and stops the subscription. */
export const revokeFeed = (): FeedState => ({ phase: 'revoked' })

export type EntityStanding = 'present' | 'tombstone' | 'inaccessible'

/** A deleted entity and one the caller can no longer see are different answers. */
export function standingOf(state: FeedState, id: string, visible: ReadonlySet<string>): EntityStanding {
  if (visible.has(id)) return 'present'
  return state.phase === 'live' && state.tombstoned.includes(id) ? 'tombstone' : 'inaccessible'
}

// ── Applying events to the sample on screen ─────────────────────────────────────────────────────

export interface ChangeEffect {
  /** Ids whose rows the view must read again. */
  refresh: string[]
  /** Ids the view removes without a read. */
  remove: string[]
}

/** What a set of committed events asks of the view. Row changes of user tables do not touch the graph. */
export function effectOf(events: readonly GraphChangeEvent[]): ChangeEffect {
  const refresh = new Set<string>()
  const remove = new Set<string>()
  for (const { change } of events) {
    if (change.kind === 'upsert') {
      for (const id of [...change.node_ids, ...change.edge_ids]) {
        refresh.add(id)
        remove.delete(id)
      }
    } else if (change.kind === 'tombstone') {
      for (const id of change.deleted_ids) {
        remove.add(id)
        refresh.delete(id)
      }
    }
  }
  return { refresh: [...refresh], remove: [...remove] }
}

// ── Layout and selection evidence ───────────────────────────────────────────────────────────────

export interface LayoutMeasure {
  frameP95Ms: number
  settleMs: number
  nodes: number
}

export interface LayoutVerdict {
  frame: 'within' | 'exceeded' | 'unmeasured'
  settle: 'within' | 'exceeded' | 'unmeasured'
}

const finitePositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Compare one measured layout with the owner limits. A missing measure is unmeasured, never within. */
export function judgeLayout(measure: Partial<LayoutMeasure> | null, limits: LiveLimitsState): LayoutVerdict | null {
  if (limits.status !== 'ready') return null
  const judge = (value: unknown, limit: number): LayoutVerdict['frame'] =>
    !finitePositive(value) ? 'unmeasured' : value > limit ? 'exceeded' : 'within'
  return {
    frame: judge(measure?.frameP95Ms, limits.limits.frameP95Ms),
    settle: judge(measure?.settleMs, limits.limits.layoutSettleMs),
  }
}

export interface SelectionContinuity {
  before: string | null
  after: string | null
  retained: boolean
}

/** A selected node survives a change when it is still in the sample, and the selection never moves by itself. */
export function selectionContinuity(before: string | null, sample: readonly { id: string }[]): SelectionContinuity {
  const present = before !== null && sample.some((n) => n.id === before)
  return { before, after: present ? before : null, retained: before === null || present }
}
