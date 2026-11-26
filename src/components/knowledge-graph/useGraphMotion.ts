/**
 * The frame loop of the graph view (OVERSTORY-APPS-R030.10.2, .5, .6, .8).
 *
 * `GraphMotionController` owns no graph data. It samples pure tween plans from
 * `@/lib/graph-motion` and writes the result into the graph model that the
 * renderer draws: position and size as node attributes, alpha in its own map
 * that the node and edge reducers read. A new transition starts from the values
 * the graph holds at that instant, so an interruption has no jump.
 */
import { useEffect, useMemo, useRef } from 'react'
import type Graph from 'graphology'
import { useTheme } from '@/components/theme-provider'
import {
  DEFAULT_GRAPH_MOTION,
  effectiveConfig,
  planEndsAt,
  planTween,
  recordGraphMotion,
  sampleTween,
  splitAnimated,
  summarizeFrames,
  type GraphMotionConfig,
  type GraphMotionMetrics,
  type GraphTransition,
  type NodeTween,
  type TweenPlan,
} from '@/lib/graph-motion'

type MotionGraph = Graph<{ x: number; y: number; size: number } & Record<string, unknown>>

export interface MotionClock {
  now: () => number
  requestFrame: (cb: (t: number) => void) => number
  cancelFrame: (handle: number) => void
}

const browserClock = (): MotionClock => ({
  now: () => performance.now(),
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (h) => {
    cancelAnimationFrame(h)
  },
})

interface RunningPlan {
  plan: TweenPlan
  /** Geometry plans move nodes; alpha plans only fade them (focus, hover, legend, overlays). */
  channel: 'geometry' | 'alpha'
  /** Alpha layer this plan writes: growth and fade-out use 'grow', focus 'focus', legend 'class', overlays 'overlay'. */
  layer: string
  onComplete?: () => void
  frameMs: number[]
  nodesAnimated: number
}

export interface TransitionOptions {
  cause?: { x: number; y: number }
  onComplete?: () => void
  /** The alpha layer to write. Defaults to 'grow' for moves and 'focus' for fades. */
  layer?: string
}

export interface MotionSettings {
  config?: GraphMotionConfig
  reducedMotion?: () => boolean
  clock?: MotionClock
  /** Redraw hook; the renderer is refreshed with indexation skipped. */
  refresh: () => void
  getGraph: () => MotionGraph | null
  onMetrics?: (metrics: GraphMotionMetrics) => void
}

export class GraphMotionController {
  private readonly clock: MotionClock
  /** Alpha per layer; a node's alpha is the product of its layers, so a focus fade never undoes a legend fade. */
  private readonly layers = new Map<string, Map<string, number>>()
  private plans: RunningPlan[] = []
  private handle: number | null = null
  private lastFrame = 0

  private readonly settings: MotionSettings

  constructor(settings: MotionSettings) {
    this.settings = settings
    this.clock = settings.clock ?? browserClock()
  }

  get config(): GraphMotionConfig {
    return effectiveConfig(this.settings.config ?? DEFAULT_GRAPH_MOTION, this.reduced)
  }

  get reduced(): boolean {
    return this.settings.reducedMotion?.() ?? false
  }

  get running(): boolean {
    return this.plans.length > 0
  }

  /** The alpha of a node right now; 1 when nothing fades it. This is the `focusAlpha` sampler of R030.10.5. */
  alpha(id: string): number {
    let product = 1
    for (const layer of this.layers.values()) product *= layer.get(id) ?? 1
    return product
  }

  layerAlpha(layer: string, id: string): number {
    return this.layers.get(layer)?.get(id) ?? 1
  }

  setLayerAlpha(layer: string, id: string, alpha: number): void {
    let map = this.layers.get(layer)
    if (!map) {
      map = new Map()
      this.layers.set(layer, map)
    }
    map.set(id, alpha)
  }

  focusAlpha(id: string): number {
    return this.alpha(id)
  }

  /** The alpha of an edge is that of its fainter end. */
  edgeAlpha(source: string, target: string): number {
    return Math.min(this.alpha(source), this.alpha(target))
  }

  forget(id: string): void {
    for (const layer of this.layers.values()) layer.delete(id)
  }

  /** Current geometry of a node, read from the graph so interruption never jumps. */
  current(id: string): { x: number; y: number; size: number; alpha: number } | null {
    const graph = this.settings.getGraph()
    if (!graph?.hasNode(id)) return null
    const a = graph.getNodeAttributes(id)
    return { x: a.x, y: a.y, size: a.size, alpha: this.alpha(id) }
  }

  /**
   * Start a transition. The caller has already committed the new visible set to the graph; this only moves it.
   * Nodes of a running geometry plan that the new plan also names are taken over from their current values.
   */
  transition(kind: GraphTransition, tweens: NodeTween[], options: TransitionOptions = {}): GraphMotionMetrics | null {
    if (tweens.length === 0) {
      options.onComplete?.()
      return null
    }
    const channel = kind === 'layout' || kind === 'expand' || kind === 'collapse' ? 'geometry' : 'alpha'
    const layer = options.layer ?? (channel === 'geometry' ? 'grow' : 'focus')
    const config = this.config
    const duration = this.durationOf(kind, config)
    const cause = options.cause ?? { x: tweens[0].fromX, y: tweens[0].fromY }
    const { animated, snapped } = splitAnimated(
      tweens,
      cause,
      this.settings.config?.maxAnimatedNodes ?? config.maxAnimatedNodes,
    )
    for (const s of snapped)
      this.apply({ id: s.id, x: s.toX, y: s.toY, size: s.toSize, alpha: s.toAlpha }, channel, layer)
    const taken = new Set(animated.map((t) => t.id))
    // Take over: strip the named nodes from older plans of the same channel; they continue nowhere else.
    this.plans = this.plans
      .map((r) =>
        r.channel === channel && r.layer === layer
          ? { ...r, plan: { ...r.plan, tweens: r.plan.tweens.filter((t) => !taken.has(t.id)) } }
          : r,
      )
      .filter((r) => r.plan.tweens.length > 0 || r.onComplete)
    const start = this.clock.now()
    const plan = planTween(kind, start, duration, animated)
    const maxDelay = animated.reduce((m, t) => Math.max(m, t.delayMs ?? 0), 0)
    if (this.reduced || (duration <= 0 && maxDelay <= 0)) {
      this.applyPlan(sampleTween(plan, planEndsAt(plan) + 1), channel, layer)
      this.settings.refresh()
      const metrics = summarizeFrames(kind, [0], animated.length)
      this.report(metrics)
      options.onComplete?.()
      return metrics
    }
    this.plans.push({
      plan,
      channel,
      layer,
      onComplete: options.onComplete,
      frameMs: [],
      nodesAnimated: animated.length,
    })
    this.ensureLoop()
    return null
  }

  /** Fade nodes to target alphas over `ms` without moving them. Starts from each node's current alpha. */
  fadeTo(
    kind: Extract<GraphTransition, 'focus' | 'hover' | 'select'>,
    targets: ReadonlyMap<string, number>,
    layer = 'focus',
  ): void {
    const graph = this.settings.getGraph()
    if (!graph) return
    const tweens: NodeTween[] = []
    for (const [id, toAlpha] of targets) {
      if (!graph.hasNode(id)) continue
      const a = graph.getNodeAttributes(id)
      const fromAlpha = this.layerAlpha(layer, id)
      if (Math.abs(fromAlpha - toAlpha) < 1e-3) continue
      tweens.push({
        id,
        fromX: a.x,
        fromY: a.y,
        toX: a.x,
        toY: a.y,
        fromSize: a.size,
        toSize: a.size,
        fromAlpha,
        toAlpha,
      })
    }
    this.transition(kind, tweens, { layer })
  }

  cancel(): void {
    if (this.handle !== null) this.clock.cancelFrame(this.handle)
    this.handle = null
    this.plans = []
  }

  /** Run one frame. Exposed so tests can drive a fake clock. */
  tick(): void {
    const now = this.clock.now()
    const dt = this.lastFrame === 0 ? 0 : now - this.lastFrame
    this.lastFrame = now
    const finished: RunningPlan[] = []
    for (const running of this.plans) {
      this.applyPlan(sampleTween(running.plan, now), running.channel, running.layer)
      running.frameMs.push(dt)
      if (now >= planEndsAt(running.plan)) finished.push(running)
    }
    this.settings.refresh()
    if (finished.length > 0) {
      this.plans = this.plans.filter((r) => !finished.includes(r))
      for (const r of finished) {
        // The terminal sample is exact: snap to the target so no rounding remains.
        this.applyPlan(sampleTween(r.plan, planEndsAt(r.plan) + 1), r.channel, r.layer)
        this.report(summarizeFrames(r.plan.kind, r.frameMs, r.nodesAnimated))
        r.onComplete?.()
      }
      this.settings.refresh()
    }
    if (this.plans.length === 0) {
      this.handle = null
      this.lastFrame = 0
    } else {
      this.handle = this.clock.requestFrame(() => {
        this.tick()
      })
    }
  }

  private ensureLoop(): void {
    if (this.handle !== null) return
    this.lastFrame = 0
    this.handle = this.clock.requestFrame(() => {
      this.tick()
    })
  }

  private durationOf(kind: GraphTransition, config: GraphMotionConfig): number {
    switch (kind) {
      case 'layout':
        return config.layoutMs
      case 'expand':
        return config.expandMs
      case 'collapse':
        return config.collapseMs
      case 'hover':
        return config.hoverMs
      case 'focus':
      case 'select':
        return config.focusMs
    }
  }

  private applyPlan(samples: ReturnType<typeof sampleTween>, channel: 'geometry' | 'alpha', layer: string): void {
    for (const s of samples) this.apply(s, channel, layer)
  }

  private apply(
    s: { id: string; x: number; y: number; size: number; alpha: number },
    channel: 'geometry' | 'alpha',
    layer: string,
  ): void {
    const graph = this.settings.getGraph()
    if (graph?.hasNode(s.id)) {
      if (channel === 'geometry') {
        graph.mergeNodeAttributes(s.id, { x: s.x, y: s.y, size: s.size })
      }
    }
    this.setLayerAlpha(layer, s.id, s.alpha)
  }

  private report(metrics: GraphMotionMetrics): void {
    recordGraphMotion(metrics)
    this.settings.onMetrics?.(metrics)
  }
}

/** True when the system or the in-app preference asks for less motion. */
export function prefersReducedMotion(inApp: 'system' | 'reduce'): boolean {
  if (inApp === 'reduce') return true
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

/** The controller of one graph view. The returned object is stable for the life of the component. */
export function useGraphMotion(
  getGraph: () => MotionGraph | null,
  refresh: () => void,
  config: GraphMotionConfig = DEFAULT_GRAPH_MOTION,
): GraphMotionController {
  const { motion } = useTheme()
  const motionRef = useRef(motion)
  motionRef.current = motion
  const getGraphRef = useRef(getGraph)
  getGraphRef.current = getGraph
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const controller = useMemo(
    () =>
      new GraphMotionController({
        config,
        reducedMotion: () => prefersReducedMotion(motionRef.current),
        getGraph: () => getGraphRef.current(),
        refresh: () => {
          refreshRef.current()
        },
      }),
    [config],
  )
  useEffect(
    () => () => {
      controller.cancel()
    },
    [controller],
  )
  return controller
}
