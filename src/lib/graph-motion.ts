/**
 * The motion contract of the graph view (OVERSTORY-APPS-R030.10.1).
 *
 * Everything here is pure: a transition is a plan of per-node tweens, and
 * `sampleTween` reads the attributes of every node at one instant. The view
 * commits the new visible set first and then samples these plans per frame.
 */

export const GRAPH_TRANSITIONS = ['layout', 'expand', 'collapse', 'focus', 'hover', 'select'] as const
export type GraphTransition = (typeof GRAPH_TRANSITIONS)[number]

export interface GraphMotionConfig {
  layoutMs: number
  expandMs: number
  collapseMs: number
  focusMs: number
  hoverMs: number
  staggerMs: number
  maxStaggerMs: number
  maxAnimatedNodes: number
}

export const DEFAULT_GRAPH_MOTION: GraphMotionConfig = {
  layoutMs: 600,
  expandMs: 450,
  collapseMs: 350,
  focusMs: 400,
  hoverMs: 120,
  staggerMs: 18,
  maxStaggerMs: 360,
  maxAnimatedNodes: 300,
}

/** One node's movement inside a plan. `delayMs` staggers the start; `pulse` is a peak size multiplier. */
export interface NodeTween {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  fromSize: number
  toSize: number
  fromAlpha: number
  toAlpha: number
  delayMs?: number
  pulse?: number
}

export interface TweenPlan {
  kind: GraphTransition
  startedAt: number
  durationMs: number
  tweens: NodeTween[]
}

export interface SampledNode {
  id: string
  x: number
  y: number
  size: number
  alpha: number
  done: boolean
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3)
export const easeInOutCubic = (t: number): number => {
  const c = clamp01(t)
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Build a plan. A non-positive duration makes the final state appear on the first sample. */
export function planTween(
  kind: GraphTransition,
  startedAt: number,
  durationMs: number,
  tweens: NodeTween[],
): TweenPlan {
  return { kind, startedAt, durationMs: Math.max(0, durationMs), tweens }
}

/** Total time a plan needs, including the longest stagger delay. */
export function planEndsAt(plan: TweenPlan): number {
  let delay = 0
  for (const t of plan.tweens) delay = Math.max(delay, t.delayMs ?? 0)
  return plan.startedAt + plan.durationMs + delay
}

/** Pure: the attributes of every node of the plan at time `now`. */
export function sampleTween(
  plan: TweenPlan,
  now: number,
  ease: (t: number) => number = easeInOutCubic,
): SampledNode[] {
  return plan.tweens.map((t) => {
    const elapsed = now - plan.startedAt - (t.delayMs ?? 0)
    const raw = plan.durationMs <= 0 ? 1 : clamp01(elapsed / plan.durationMs)
    const e = ease(raw)
    const pulseBump = t.pulse && t.pulse > 1 ? 1 + (t.pulse - 1) * Math.sin(Math.PI * raw) : 1
    return {
      id: t.id,
      x: lerp(t.fromX, t.toX, e),
      y: lerp(t.fromY, t.toY, e),
      size: lerp(t.fromSize, t.toSize, e) * pulseBump,
      alpha: lerp(t.fromAlpha, t.toAlpha, e),
      done: raw >= 1,
    }
  })
}

/** Stagger delays in engine order, capped so a large burst still finishes quickly. */
export function staggerDelays(count: number, config: GraphMotionConfig): number[] {
  return Array.from({ length: count }, (_, i) => Math.min(i * config.staggerMs, config.maxStaggerMs))
}

/**
 * When more than `maxAnimatedNodes` nodes change, the nearest ones to the cause animate and the rest snap.
 * Returns the ids that animate and the ids that snap.
 */
export function splitAnimated<T extends { id: string; fromX: number; fromY: number }>(
  tweens: T[],
  cause: { x: number; y: number },
  maxAnimatedNodes: number,
): { animated: T[]; snapped: T[] } {
  if (tweens.length <= maxAnimatedNodes) return { animated: tweens, snapped: [] }
  const ranked = [...tweens].sort(
    (a, b) => Math.hypot(a.fromX - cause.x, a.fromY - cause.y) - Math.hypot(b.fromX - cause.x, b.fromY - cause.y),
  )
  return { animated: ranked.slice(0, maxAnimatedNodes), snapped: ranked.slice(maxAnimatedNodes) }
}

/** One recorded transition: how many frames ran and how long they took (OVERSTORY-APPS-R030.10.8). */
export interface GraphMotionMetrics {
  kind: GraphTransition
  frames: number
  p95FrameMs: number
  droppedFrames: number
  nodesAnimated: number
}

/** The reference frame budget: 60 frames per second. */
export const FRAME_BUDGET_MS = 16.7

export function percentile95(samples: readonly number[]): number {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}

export function summarizeFrames(
  kind: GraphTransition,
  frameMs: readonly number[],
  nodesAnimated: number,
): GraphMotionMetrics {
  return {
    kind,
    frames: frameMs.length,
    p95FrameMs: percentile95(frameMs),
    droppedFrames: frameMs.filter((ms) => ms > FRAME_BUDGET_MS * 2).length,
    nodesAnimated,
  }
}

export type GraphMotionSink = (metrics: GraphMotionMetrics) => void

const sinks = new Set<GraphMotionSink>()
const retained: GraphMotionMetrics[] = []
const RETAIN_LIMIT = 200

/** The one metrics sink. The view records here and the served e2e reads `window.__graphMotionMetrics`. */
export function recordGraphMotion(metrics: GraphMotionMetrics): void {
  retained.push(metrics)
  if (retained.length > RETAIN_LIMIT) retained.shift()
  for (const sink of sinks) sink(metrics)
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __graphMotionMetrics?: GraphMotionMetrics[] }).__graphMotionMetrics = retained
  }
}

export function subscribeGraphMotion(sink: GraphMotionSink): () => void {
  sinks.add(sink)
  return () => {
    sinks.delete(sink)
  }
}

export function retainedGraphMotion(): readonly GraphMotionMetrics[] {
  return retained
}

export function resetGraphMotionMetrics(): void {
  retained.length = 0
}

/** Reduced motion keeps every duration at zero so the final state shows in one frame. */
export function effectiveConfig(config: GraphMotionConfig, reducedMotion: boolean): GraphMotionConfig {
  if (!reducedMotion) return config
  return { ...config, layoutMs: 0, expandMs: 0, collapseMs: 0, focusMs: 0, hoverMs: 0, staggerMs: 0, maxStaggerMs: 0 }
}

export interface Placement {
  x: number
  y: number
  size: number
}

export interface ChangeInput {
  /** Where every node that is on screen now is, including nodes about to leave. */
  current: ReadonlyMap<string, Placement & { alpha: number }>
  /** Where every node that stays or arrives ends up, from the worker layout. */
  targets: ReadonlyMap<string, Placement>
  /** Arriving node ids, in the order the engine returned them. */
  added: readonly string[]
  /** Leaving node ids. */
  removed: readonly string[]
  /** The node that caused the change. New nodes start there and removed nodes return there. */
  cause: string | null
  config: GraphMotionConfig
  kind: Extract<GraphTransition, 'layout' | 'expand' | 'collapse'>
}

/**
 * Per-node tweens for one change of the visible set (OVERSTORY-APPS-R030.10.2 to .4).
 * A retained node moves from where it is. A new node grows from the cause with a stagger.
 * A removed node returns to the cause and fades. The cause pulses on an expand.
 */
export function planChange(input: ChangeInput): NodeTween[] {
  const { current, targets, added, removed, cause, config, kind } = input
  const causePlace = cause ? (current.get(cause) ?? targets.get(cause) ?? null) : null
  const out: NodeTween[] = []
  const addedSet = new Set(added)
  const delays = staggerDelays(added.length, config)
  for (const [id, to] of targets) {
    if (addedSet.has(id)) continue
    const from = current.get(id)
    if (!from) continue
    out.push({
      id,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      fromSize: from.size,
      toSize: to.size,
      fromAlpha: from.alpha,
      toAlpha: 1,
      ...(kind === 'expand' && id === cause ? { pulse: 1.25 } : {}),
    })
  }
  added.forEach((id, index) => {
    const to = targets.get(id)
    if (!to) return
    const from = causePlace ?? to
    out.push({
      id,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      fromSize: 0,
      toSize: to.size,
      fromAlpha: 0,
      toAlpha: 1,
      delayMs: delays[index],
    })
  })
  for (const id of removed) {
    const from = current.get(id)
    if (!from) continue
    const to = causePlace ?? from
    out.push({
      id,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      fromSize: from.size,
      toSize: 0,
      fromAlpha: from.alpha,
      toAlpha: 0,
    })
  }
  return out
}
