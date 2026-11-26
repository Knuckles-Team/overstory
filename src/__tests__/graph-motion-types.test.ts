// spec: OVERSTORY-APPS-R030.10.1
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRAPH_MOTION,
  GRAPH_TRANSITIONS,
  easeInOutCubic,
  easeOutCubic,
  effectiveConfig,
  planChange,
  planTween,
  sampleTween,
  splitAnimated,
  type NodeTween,
} from '@/lib/graph-motion'

const tween = (over: Partial<NodeTween> = {}): NodeTween => ({
  id: 'a',
  fromX: 0,
  fromY: 0,
  toX: 100,
  toY: 50,
  fromSize: 0,
  toSize: 10,
  fromAlpha: 0,
  toAlpha: 1,
  ...over,
})

describe('graph motion contract', () => {
  it('test_tuples_closed_and_sample_is_pure', () => {
    expect(GRAPH_TRANSITIONS).toEqual(['layout', 'expand', 'collapse', 'focus', 'hover', 'select'])
    expect(DEFAULT_GRAPH_MOTION).toEqual({
      layoutMs: 600,
      expandMs: 450,
      collapseMs: 350,
      focusMs: 400,
      hoverMs: 120,
      staggerMs: 18,
      maxStaggerMs: 360,
      maxAnimatedNodes: 300,
    })
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
    const plan = planTween('layout', 1000, 600, [tween()])
    const first = sampleTween(plan, 1300)
    const again = sampleTween(plan, 1300)
    expect(again).toEqual(first)
    expect(plan.tweens[0]).toEqual(tween())
    expect(sampleTween(plan, 1000)[0]).toMatchObject({ x: 0, size: 0, alpha: 0, done: false })
    expect(sampleTween(plan, 1600)[0]).toMatchObject({ x: 100, y: 50, size: 10, alpha: 1, done: true })
    const mid = sampleTween(plan, 1300)[0]
    expect(mid.x).toBeGreaterThan(0)
    expect(mid.x).toBeLessThan(100)
  })

  it('delays start per node and a zero duration shows the final state at once', () => {
    const plan = planTween('expand', 0, 450, [tween({ delayMs: 100 })])
    expect(sampleTween(plan, 50)[0].x).toBe(0)
    expect(sampleTween(plan, 100 + 450)[0].done).toBe(true)
    expect(sampleTween(planTween('layout', 0, 0, [tween()]), 0)[0]).toMatchObject({ x: 100, done: true })
  })

  it('pulses the size up to 1.25 times and back', () => {
    const plan = planTween('expand', 0, 400, [tween({ fromSize: 10, toSize: 10, fromAlpha: 1, pulse: 1.25 })])
    expect(sampleTween(plan, 200)[0].size).toBeCloseTo(12.5, 1)
    expect(sampleTween(plan, 400)[0].size).toBeCloseTo(10, 5)
  })

  it('reduced motion zeroes every duration', () => {
    const reduced = effectiveConfig(DEFAULT_GRAPH_MOTION, true)
    expect(reduced.layoutMs + reduced.expandMs + reduced.collapseMs + reduced.focusMs + reduced.hoverMs).toBe(0)
    expect(reduced.staggerMs).toBe(0)
    expect(effectiveConfig(DEFAULT_GRAPH_MOTION, false)).toBe(DEFAULT_GRAPH_MOTION)
  })

  it('animates only the nodes nearest the cause above the cap', () => {
    const many = Array.from({ length: 400 }, (_, i) => tween({ id: `n${String(i)}`, fromX: i, fromY: 0 }))
    const { animated, snapped } = splitAnimated(many, { x: 0, y: 0 }, 300)
    expect(animated).toHaveLength(300)
    expect(snapped).toHaveLength(100)
    expect(animated.every((t) => t.fromX < 300)).toBe(true)
  })

  it('plans a change: new nodes grow staggered from the cause, removed nodes return to it', () => {
    const current = new Map([
      ['hub', { x: 10, y: 10, size: 8, alpha: 1 }],
      ['gone', { x: 50, y: 50, size: 6, alpha: 1 }],
    ])
    const targets = new Map([
      ['hub', { x: 12, y: 12, size: 8 }],
      ['n1', { x: 30, y: 0, size: 6 }],
      ['n2', { x: 0, y: 30, size: 6 }],
    ])
    const tweens = planChange({
      current,
      targets,
      added: ['n1', 'n2'],
      removed: ['gone'],
      cause: 'hub',
      config: DEFAULT_GRAPH_MOTION,
      kind: 'expand',
    })
    const by = Object.fromEntries(tweens.map((t) => [t.id, t]))
    expect(by.hub.pulse).toBe(1.25)
    expect(by.n1).toMatchObject({ fromX: 10, fromY: 10, fromSize: 0, fromAlpha: 0, toSize: 6, delayMs: 0 })
    expect(by.n2.delayMs).toBe(18)
    expect(by.gone).toMatchObject({ toX: 10, toY: 10, toSize: 0, toAlpha: 0 })
  })

  it('caps the stagger at maxStaggerMs', () => {
    const added = Array.from({ length: 100 }, (_, i) => `n${String(i)}`)
    const targets = new Map<string, { x: number; y: number; size: number }>(
      added.map((id) => [id, { x: 1, y: 1, size: 5 }]),
    )
    targets.set('hub', { x: 0, y: 0, size: 8 })
    const tweens = planChange({
      current: new Map([['hub', { x: 0, y: 0, size: 8, alpha: 1 }]]),
      targets,
      added,
      removed: [],
      cause: 'hub',
      config: DEFAULT_GRAPH_MOTION,
      kind: 'expand',
    })
    expect(Math.max(...tweens.map((t) => t.delayMs ?? 0))).toBe(360)
  })
})
