/**
 * Analytic overlays of the graph view (OVERSTORY-APPS-R030.12).
 *
 * Communities, centrality, paths and shape validity are computed by the engine. This module
 * asks for them through Arbora and maps the answers onto colors, steps, rings and a reveal
 * schedule. It computes no community, no score, no path and no verdict.
 *
 * The engine answers `CommunityDetection` and `PageRank` for the whole graph, so the browser
 * keeps the rows of the visible nodes and draws those. The answers are read tolerantly because
 * the registry publishes these results as opaque; an answer with no readable rows is a refusal,
 * never an invented overlay.
 */
import { z } from 'zod'
import { ArboraApiError, invoke } from '@/lib/arbora-api/invoke'
import { runUql } from '@/lib/arbora-api/uql'
import { colorOf, SLOT_HUES, oklchHex } from '@/lib/graph-semantics'

export const OVERLAY_KINDS = ['community', 'centrality', 'path', 'shape'] as const
export type OverlayKind = (typeof OVERLAY_KINDS)[number]

export const OVERLAY_STATUSES = ['idle', 'loading', 'ready', 'unavailable', 'refused'] as const
export type OverlayStatus = (typeof OVERLAY_STATUSES)[number]

export interface OverlayState {
  kind: OverlayKind
  status: OverlayStatus
  /** The graph revision the answer was computed at. */
  computedAtRevision: number | null
  reason?: string
}

export const idleOverlay = (kind: OverlayKind): OverlayState => ({ kind, status: 'idle', computedAtRevision: null })

/** An overlay computed at an older revision than the graph shows is stale. */
export function isStale(state: OverlayState, currentRevision: number): boolean {
  return state.status === 'ready' && state.computedAtRevision !== null && state.computedAtRevision !== currentRevision
}

export const MAX_OVERLAY_NODES = 5000
export const TOO_MANY_NODES = 'Too many nodes for this overlay'
export const NO_PATH = 'No path'
export const PATH_REVEAL_MS = 700

export const OPS = {
  community: 'eg.compute.CommunityDetection',
  centrality: 'eg.compute.PageRank',
  path: 'eg.compute.GetShortestPath',
  shape: 'query.uql',
} as const

export const SHAPE_VERDICTS = ['pass', 'warn', 'fail'] as const
export type ShapeVerdict = (typeof SHAPE_VERDICTS)[number]

export type OverlayAnswer =
  | { kind: 'community'; communities: Map<string, number> }
  | { kind: 'centrality'; scores: Map<string, number> }
  | { kind: 'path'; path: string[] }
  | { kind: 'shape'; verdicts: Map<string, ShapeVerdict> }

export type OverlayResult = { state: OverlayState; answer: OverlayAnswer } | { state: OverlayState; answer: null }

const open = z.unknown()

// ── Tolerant readers of the opaque engine answers ───────────────────────────────

function rowsOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['rows', 'results', 'items', 'scores', 'communities', 'assignments', 'values']) {
      if (Array.isArray(record[key])) return record[key] as unknown[]
    }
  }
  return []
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    for (const key of ['scores', 'communities', 'assignments', 'values']) {
      const inner = record[key]
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner as Record<string, unknown>
    }
    return record
  }
  return null
}

const idOf = (row: Record<string, unknown>): string | null => {
  for (const key of ['id', 'node_id', 'node', 'vertex_id', 'vertex']) if (typeof row[key] === 'string') return row[key]
  return null
}

/** Read `node id -> community index` from rows, from a map, or from a list of member lists. */
export function readCommunities(value: unknown): Map<string, number> {
  const out = new Map<string, number>()
  const rows = rowsOf(value)
  if (rows.length > 0 && rows.every((r) => Array.isArray(r) && r.every((x) => typeof x === 'string'))) {
    rows.forEach((members, index) => {
      for (const id of members) out.set(id, index)
    })
    return out
  }
  for (const row of rows) {
    if (Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'number') out.set(row[0], row[1])
    else if (row && typeof row === 'object') {
      const r = row as Record<string, unknown>
      const id = idOf(r)
      const c = r.community ?? r.community_id ?? r.label ?? r.value
      if (id !== null && typeof c === 'number') out.set(id, c)
    }
  }
  if (out.size > 0) return out
  const record = recordOf(value)
  if (record) for (const [id, c] of Object.entries(record)) if (typeof c === 'number') out.set(id, c)
  return out
}

/** Read `node id -> score` from `[id, score]` rows, objects or a map. */
export function readScores(value: unknown): Map<string, number> {
  const out = new Map<string, number>()
  for (const row of rowsOf(value)) {
    if (Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'number') out.set(row[0], row[1])
    else if (row && typeof row === 'object') {
      const r = row as Record<string, unknown>
      const id = idOf(r)
      const s = r.score ?? r.rank ?? r.pagerank ?? r.value
      if (id !== null && typeof s === 'number') out.set(id, s)
    }
  }
  if (out.size > 0) return out
  const record = recordOf(value)
  if (record) for (const [id, s] of Object.entries(record)) if (typeof s === 'number') out.set(id, s)
  return out
}

/** Read an ordered list of node ids from a path answer. */
export function readPath(value: unknown): string[] | null {
  let list: unknown = value
  if (!Array.isArray(value) && value && typeof value === 'object') {
    const r = value as Record<string, unknown>
    const key = ['path', 'nodes', 'node_ids'].find((k) => k in r)
    if (key === undefined) return null
    list = r[key]
    // An explicit empty or null path is the engine saying there is none.
    if (list === null) return []
  }
  if (!Array.isArray(list)) return null
  const ids = list.map((item) =>
    typeof item === 'string' ? item : item && typeof item === 'object' ? idOf(item as Record<string, unknown>) : null,
  )
  return ids.every((i): i is string => i !== null) ? ids : null
}

/** Read a verdict per node id from the rows of a shape validation. Nothing is decided here. */
export function readShapeVerdicts(rows: Record<string, unknown>[]): Map<string, ShapeVerdict> {
  const out = new Map<string, ShapeVerdict>()
  for (const row of rows) {
    const id = idOf(row) ?? (typeof row.focus_node === 'string' ? row.focus_node : null)
    if (id === null) continue
    const raw = row.verdict ?? row.status ?? row.severity ?? row.conforms
    if (raw === true) out.set(id, 'pass')
    else if (raw === false) out.set(id, 'fail')
    else if (typeof raw === 'string') {
      const v = raw.toLowerCase()
      if (v === 'pass' || v === 'conforms' || v === 'ok') out.set(id, 'pass')
      else if (v === 'warn' || v === 'warning') out.set(id, 'warn')
      else if (v === 'fail' || v === 'violation' || v === 'error') out.set(id, 'fail')
    }
  }
  return out
}

// ── Running an overlay ─────────────────────────────────────────────────────────────

export interface RunContext {
  visibleIds: readonly string[]
  revision: number
  signal?: AbortSignal
  /** Two selected node ids, for the path overlay. */
  pathEnds?: readonly [string, string]
}

type Read = typeof invoke
const state = (kind: OverlayKind, status: OverlayStatus, revision: number | null, reason?: string): OverlayState => ({
  kind,
  status,
  computedAtRevision: revision,
  ...(reason ? { reason } : {}),
})

function failure(kind: OverlayKind, error: unknown): OverlayResult {
  if (error instanceof ArboraApiError) {
    const absent =
      error.code === 'HTTP_UNAVAILABLE' || error.code === 'OPERATION_NOT_FOUND' || error.code === 'UNKNOWN_OPERATION'
    return {
      state: state(kind, absent ? 'unavailable' : 'refused', null, absent ? 'not available' : error.code),
      answer: null,
    }
  }
  throw error
}

/** Ask the engine for one overlay. The answer is drawn as returned; a failure keeps the prior look. */
export async function runOverlay(
  kind: OverlayKind,
  ctx: RunContext,
  read: Read = invoke,
  uql: typeof runUql = runUql,
): Promise<OverlayResult> {
  if (kind !== 'path' && ctx.visibleIds.length > MAX_OVERLAY_NODES) {
    return { state: state(kind, 'refused', null, TOO_MANY_NODES), answer: null }
  }
  const visible = new Set(ctx.visibleIds)
  try {
    if (kind === 'community') {
      const value = await read(OPS.community, { resolution: 1 }, open, { signal: ctx.signal })
      const all = readCommunities(value)
      const communities = new Map([...all].filter(([id]) => visible.has(id)))
      if (communities.size === 0)
        return { state: state(kind, 'refused', null, 'The engine answer held no readable communities'), answer: null }
      return { state: state(kind, 'ready', ctx.revision), answer: { kind, communities } }
    }
    if (kind === 'centrality') {
      const value = await read(OPS.centrality, { damping: 0.85, iterations: 20 }, open, { signal: ctx.signal })
      const all = readScores(value)
      const scores = new Map([...all].filter(([id]) => visible.has(id)))
      if (scores.size === 0)
        return { state: state(kind, 'refused', null, 'The engine answer held no readable scores'), answer: null }
      return { state: state(kind, 'ready', ctx.revision), answer: { kind, scores } }
    }
    if (kind === 'path') {
      if (!ctx.pathEnds) return { state: state(kind, 'refused', null, 'Select two nodes first'), answer: null }
      const [source_id, target_id] = ctx.pathEnds
      const value = await read(OPS.path, { source_id, target_id }, open, { signal: ctx.signal })
      const path = readPath(value)
      if (path === null)
        return { state: state(kind, 'refused', null, 'The engine answer held no readable path'), answer: null }
      return { state: state(kind, 'ready', ctx.revision), answer: { kind, path } }
    }
    const rows = await uql('VALIDATE SHAPE', { node_ids: [...ctx.visibleIds] }, ctx.signal)
    const verdicts = readShapeVerdicts(rows)
    return { state: state(kind, 'ready', ctx.revision), answer: { kind, verdicts } }
  } catch (error) {
    if (ctx.signal?.aborted) throw error
    return failure(kind, error)
  }
}

// ── Drawing the answers ───────────────────────────────────────────────────────────

/** Communities by size rank so the largest take the first slots; slot color from the shared palette. */
export function communityColors(communities: ReadonlyMap<string, number>, isDark: boolean): Map<string, string> {
  const sizes = new Map<number, number>()
  for (const c of communities.values()) sizes.set(c, (sizes.get(c) ?? 0) + 1)
  const ranked = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => c)
  const slotOfCommunity = new Map(ranked.map((c, i) => [c, i]))
  const out = new Map<string, string>()
  for (const [id, c] of communities) {
    const rank = slotOfCommunity.get(c) ?? 0
    out.set(id, colorOf({ slot: rank % SLOT_HUES.length, depth: Math.floor(rank / SLOT_HUES.length) }, { isDark }))
  }
  return out
}

export const CENTRALITY_STEPS = 5

/** Quantize engine scores to five sequential steps (0 lowest). Quantizing is drawing, not scoring. */
export function centralitySteps(scores: ReadonlyMap<string, number>): Map<string, number> {
  const values = [...scores.values()]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const out = new Map<string, number>()
  for (const [id, score] of scores) {
    const t = max === min ? 0 : (score - min) / (max - min)
    out.set(id, Math.min(CENTRALITY_STEPS - 1, Math.floor(t * CENTRALITY_STEPS)))
  }
  return out
}

export function stepColor(step: number, isDark: boolean): string {
  const t = step / (CENTRALITY_STEPS - 1)
  const l = isDark ? 0.45 + t * 0.4 : 0.85 - t * 0.5
  return oklchHex(l, 0.14, 250)
}

/** Optional size mapping for centrality: a step maps to a size between 6 and 22 pixels. */
export function stepSize(step: number): number {
  return 6 + (16 * step) / (CENTRALITY_STEPS - 1)
}

export const RING_STYLES: Record<ShapeVerdict, { dash: readonly number[]; width: number; text: string }> = {
  pass: { dash: [], width: 2, text: 'Shape: pass' },
  warn: { dash: [4, 3], width: 2, text: 'Shape: warn' },
  fail: { dash: [1.5, 2.5], width: 3, text: 'Shape: fail' },
}

export interface PathRevealStep {
  source: string
  target: string
  startMs: number
  endMs: number
}

/** Edge by edge across the reveal time, each edge drawing from source to target. */
export function planPathReveal(path: readonly string[], totalMs: number = PATH_REVEAL_MS): PathRevealStep[] {
  const edges = Math.max(0, path.length - 1)
  const slice = edges === 0 ? 0 : totalMs / edges
  return Array.from({ length: edges }, (_, i) => ({
    source: path[i],
    target: path[i + 1],
    startMs: i * slice,
    endMs: (i + 1) * slice,
  }))
}

/** Progress 0..1 of each step at `elapsedMs`. A zero reveal time shows every step complete. */
export function pathProgress(steps: readonly PathRevealStep[], elapsedMs: number): number[] {
  return steps.map((s) =>
    s.endMs <= s.startMs ? 1 : Math.min(1, Math.max(0, (elapsedMs - s.startMs) / (s.endMs - s.startMs))),
  )
}
