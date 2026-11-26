// spec: OVERSTORY-APPS-R030.10.2
// spec: OVERSTORY-APPS-R030.10.5
// spec: OVERSTORY-APPS-R030.10.6
// spec: OVERSTORY-APPS-R030.10.8
import { describe, expect, it } from 'vitest'
import Graph from 'graphology'
import { GraphMotionController, type MotionClock } from '../useGraphMotion'
import {
  DEFAULT_GRAPH_MOTION,
  planChange,
  resetGraphMotionMetrics,
  retainedGraphMotion,
  type NodeTween,
} from '@/lib/graph-motion'

interface Attrs {
  x: number
  y: number
  size: number
}

function fakeClock() {
  let now = 1000
  let pending: (() => void) | null = null
  const clock: MotionClock = {
    now: () => now,
    requestFrame: (cb) => {
      pending = () => {
        cb(now)
      }
      return 1
    },
    cancelFrame: () => {
      pending = null
    },
  }
  return {
    clock,
    /** Advance by `ms` and run the scheduled frame, if any. */
    frame(ms = 16) {
      now += ms
      const run = pending
      pending = null
      run?.()
    },
    get pending() {
      return pending !== null
    },
  }
}

function setup(reduced = false, maxAnimatedNodes = DEFAULT_GRAPH_MOTION.maxAnimatedNodes) {
  const graph = new Graph<Attrs>()
  const clock = fakeClock()
  let refreshes = 0
  const controller = new GraphMotionController({
    config: { ...DEFAULT_GRAPH_MOTION, maxAnimatedNodes },
    reducedMotion: () => reduced,
    clock: clock.clock,
    getGraph: () => graph as unknown as Graph<Attrs & Record<string, unknown>>,
    refresh: () => {
      refreshes += 1
    },
  })
  return { graph, clock, controller, refreshes: () => refreshes }
}

const place = (graph: Graph<Attrs>, id: string, x: number, y: number, size = 6) => graph.addNode(id, { x, y, size })

describe('graph motion controller', () => {
  it('test_positions_tween_over_frames_and_new_nodes_start_at_the_cause', () => {
    resetGraphMotionMetrics()
    const { graph, clock, controller } = setup()
    place(graph, 'hub', 0, 0, 8)
    place(graph, 'kid', 0, 0, 0)
    const tweens = planChange({
      current: new Map([['hub', { x: 0, y: 0, size: 8, alpha: 1 }]]),
      targets: new Map([
        ['hub', { x: 0, y: 0, size: 8 }],
        ['kid', { x: 100, y: 0, size: 6 }],
      ]),
      added: ['kid'],
      removed: [],
      cause: 'hub',
      config: DEFAULT_GRAPH_MOTION,
      kind: 'expand',
    })
    expect(tweens.find((t) => t.id === 'kid')).toMatchObject({ fromX: 0, fromY: 0 })
    controller.transition('expand', tweens)
    const seen = new Set<number>()
    for (let i = 0; i < 12; i++) {
      clock.frame(16)
      seen.add(Math.round(graph.getNodeAttribute('kid', 'x')))
    }
    expect(seen.size).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < 40 && clock.pending; i++) clock.frame(16)
    expect(graph.getNodeAttribute('kid', 'x')).toBe(100)
    expect(graph.getNodeAttribute('kid', 'size')).toBe(6)
    expect(controller.alpha('kid')).toBe(1)
    expect(controller.running).toBe(false)
  })

  it('test_hover_and_select_fade_the_rest_and_cross_fade_between_nodes', () => {
    const { graph, clock, controller } = setup()
    for (const id of ['a', 'b', 'c']) place(graph, id, 0, 0)
    // Hover a: a and its neighbor b stay, c fades to 0.15 over hoverMs (120 ms).
    controller.fadeTo(
      'hover',
      new Map([
        ['a', 1],
        ['b', 1],
        ['c', 0.15],
      ]),
    )
    clock.frame(60)
    const mid = controller.alpha('c')
    expect(mid).toBeLessThan(1)
    expect(mid).toBeGreaterThan(0.15)
    clock.frame(80)
    expect(controller.alpha('c')).toBeCloseTo(0.15, 5)
    expect(controller.alpha('a')).toBe(1)
    // Move to c: a fades out while c fades in, and c never passes through 1 for the unfocused rest.
    controller.fadeTo(
      'hover',
      new Map([
        ['a', 0.15],
        ['b', 0.15],
        ['c', 1],
      ]),
    )
    clock.frame(60)
    expect(controller.alpha('a')).toBeLessThan(1)
    expect(controller.alpha('c')).toBeGreaterThan(0.15)
    expect(controller.edgeAlpha('a', 'c')).toBe(Math.min(controller.alpha('a'), controller.alpha('c')))
    for (let i = 0; i < 20 && clock.pending; i++) clock.frame(16)
    expect(controller.alpha('a')).toBeCloseTo(0.15, 5)
    expect(controller.alpha('c')).toBe(1)
  })

  it('test_interrupt_has_no_jump_and_reduced_motion_is_one_frame_with_live_region', () => {
    const { graph, clock, controller } = setup()
    place(graph, 'n', 0, 0)
    const move = (toX: number): NodeTween => ({
      id: 'n',
      fromX: graph.getNodeAttribute('n', 'x'),
      fromY: 0,
      toX,
      toY: 0,
      fromSize: 6,
      toSize: 6,
      fromAlpha: 1,
      toAlpha: 1,
    })
    controller.transition('layout', [move(200)])
    clock.frame(16)
    clock.frame(200)
    const before = graph.getNodeAttribute('n', 'x')
    expect(before).toBeGreaterThan(0)
    expect(before).toBeLessThan(200)
    // A second transition starts from the sampled position: no jump.
    controller.transition('layout', [move(-50)])
    expect(graph.getNodeAttribute('n', 'x')).toBe(before)
    clock.frame(16)
    const after = graph.getNodeAttribute('n', 'x')
    expect(Math.abs(after - before)).toBeLessThan(10)
    for (let i = 0; i < 60 && clock.pending; i++) clock.frame(16)
    expect(graph.getNodeAttribute('n', 'x')).toBe(-50)

    const reduced = setup(true)
    place(reduced.graph, 'n', 0, 0)
    const metrics = reduced.controller.transition('layout', [{ ...move(80), fromX: 0 }])
    expect(reduced.graph.getNodeAttribute('n', 'x')).toBe(80)
    expect(reduced.clock.pending).toBe(false)
    expect(metrics?.frames).toBe(1)
  })

  it('test_metrics_recorded_and_snap_beyond_the_animated_cap', () => {
    resetGraphMotionMetrics()
    const { graph, clock, controller } = setup(false, 3)
    const tweens: NodeTween[] = []
    for (let i = 0; i < 6; i++) {
      place(graph, `n${String(i)}`, i, 0)
      tweens.push({
        id: `n${String(i)}`,
        fromX: i,
        fromY: 0,
        toX: i + 100,
        toY: 0,
        fromSize: 6,
        toSize: 6,
        fromAlpha: 1,
        toAlpha: 1,
      })
    }
    controller.transition('layout', tweens, { cause: { x: 0, y: 0 } })
    // The three farthest snap at once; the three nearest are still moving.
    expect(graph.getNodeAttribute('n5', 'x')).toBe(105)
    expect(graph.getNodeAttribute('n0', 'x')).toBe(0)
    for (let i = 0; i < 60 && clock.pending; i++) clock.frame(16)
    expect(graph.getNodeAttribute('n0', 'x')).toBe(100)
    const [metric] = retainedGraphMotion()
    expect(metric.kind).toBe('layout')
    expect(metric.nodesAnimated).toBe(3)
    expect(metric.frames).toBeGreaterThan(10)
    expect(metric.p95FrameMs).toBeGreaterThan(0)
    expect(metric.droppedFrames).toBe(0)
  })
})
