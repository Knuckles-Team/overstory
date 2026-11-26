// spec: OVERSTORY-APPS-R030.12.1
// spec: OVERSTORY-APPS-R030.12.2
// spec: OVERSTORY-APPS-R030.12.3
// spec: OVERSTORY-APPS-R030.12.4
// spec: OVERSTORY-APPS-R030.12.5
import { describe, expect, it, vi } from 'vitest'
import { ArboraApiError } from '@/lib/arbora-api/invoke'
import {
  OVERLAY_KINDS,
  RING_STYLES,
  centralitySteps,
  communityColors,
  idleOverlay,
  isStale,
  pathProgress,
  planPathReveal,
  runOverlay,
} from '@/lib/graph-overlays'

type Read = Parameters<typeof runOverlay>[2]
type Uql = Parameters<typeof runOverlay>[3]
const ok = (value: unknown): Read => vi.fn(() => Promise.resolve(value)) as unknown as Read
const visible = ['a', 'b', 'c', 'd']

describe('graph overlays', () => {
  it('test_tuples_closed_and_revision_change_marks_stale', async () => {
    expect(OVERLAY_KINDS).toEqual(['community', 'centrality', 'path', 'shape'])
    expect(idleOverlay('path')).toEqual({ kind: 'path', status: 'idle', computedAtRevision: null })
    const result = await runOverlay(
      'community',
      { visibleIds: visible, revision: 4 },
      ok({ communities: { a: 0, b: 0, c: 1, zzz: 2 } }),
    )
    expect(result.state).toEqual({ kind: 'community', status: 'ready', computedAtRevision: 4 })
    expect(isStale(result.state, 4)).toBe(false)
    expect(isStale(result.state, 5)).toBe(true)
    expect(isStale(idleOverlay('community'), 5)).toBe(false)
  })

  it('test_community_and_pagerank_are_requested_and_mapped', async () => {
    const read = ok([
      ['a', 0],
      ['b', 0],
      ['c', 1],
      ['d', 1],
      ['outside', 0],
    ])
    const community = await runOverlay('community', { visibleIds: visible, revision: 1 }, read)
    expect(read).toHaveBeenCalledWith(
      'eg.compute.CommunityDetection',
      { resolution: 1 },
      expect.anything(),
      expect.anything(),
    )
    if (community.answer?.kind !== 'community') throw new Error('no answer')
    expect([...community.answer.communities.keys()]).toEqual(['a', 'b', 'c', 'd'])
    const colors = communityColors(community.answer.communities, false)
    expect(colors.get('a')).toBe(colors.get('b'))
    expect(colors.get('a')).not.toBe(colors.get('c'))

    const rank = ok({
      scores: [
        { id: 'a', score: 0.1 },
        { id: 'b', score: 0.5 },
        { id: 'c', score: 0.9 },
        { id: 'd', score: 0.3 },
      ],
    })
    const central = await runOverlay('centrality', { visibleIds: visible, revision: 1 }, rank)
    expect(rank).toHaveBeenCalledWith(
      'eg.compute.PageRank',
      { damping: 0.85, iterations: 20 },
      expect.anything(),
      expect.anything(),
    )
    if (central.answer?.kind !== 'centrality') throw new Error('no answer')
    const steps = centralitySteps(central.answer.scores)
    expect(steps.get('a')).toBe(0)
    expect(steps.get('c')).toBe(4)
    expect(Math.max(...steps.values())).toBeLessThanOrEqual(4)

    const tooMany = await runOverlay(
      'community',
      { visibleIds: Array.from({ length: 5001 }, (_, i) => `n${String(i)}`), revision: 1 },
      read,
    )
    expect(tooMany.state).toMatchObject({ status: 'refused', reason: 'Too many nodes for this overlay' })
  })

  it('test_path_reveals_edge_by_edge_and_no_path_is_shown', async () => {
    const read = ok({ path: ['a', 'b', 'c', 'd'] })
    const result = await runOverlay('path', { visibleIds: visible, revision: 1, pathEnds: ['a', 'd'] }, read)
    expect(read).toHaveBeenCalledWith(
      'eg.compute.GetShortestPath',
      { source_id: 'a', target_id: 'd' },
      expect.anything(),
      expect.anything(),
    )
    if (result.answer?.kind !== 'path') throw new Error('no answer')
    const steps = planPathReveal(result.answer.path)
    expect(steps.map((s) => [s.source, s.target])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ])
    expect(steps[2].endMs).toBeCloseTo(700)
    expect(pathProgress(steps, 0)).toEqual([0, 0, 0])
    const half = pathProgress(steps, 350)
    expect(half[0]).toBe(1)
    expect(half[1]).toBeGreaterThan(0)
    expect(half[1]).toBeLessThan(1)
    expect(half[2]).toBe(0)
    expect(pathProgress(planPathReveal(result.answer.path, 0), 0)).toEqual([1, 1, 1])
    const none = await runOverlay('path', { visibleIds: visible, revision: 1, pathEnds: ['a', 'd'] }, ok({ path: [] }))
    expect(none.answer).toEqual({ kind: 'path', path: [] })
  })

  it('test_shape_rings_use_line_style_and_text', async () => {
    const uql = vi.fn(() =>
      Promise.resolve([
        { id: 'a', verdict: 'pass' },
        { node_id: 'b', conforms: false },
        { id: 'c', status: 'warning' },
        { id: 'd' },
      ]),
    ) as unknown as Uql
    const result = await runOverlay('shape', { visibleIds: visible, revision: 2 }, ok(null), uql)
    expect(uql).toHaveBeenCalledWith('VALIDATE SHAPE', { node_ids: visible }, undefined)
    if (result.answer?.kind !== 'shape') throw new Error('no answer')
    expect([...result.answer.verdicts]).toEqual([
      ['a', 'pass'],
      ['b', 'fail'],
      ['c', 'warn'],
    ])
    expect(new Set(Object.values(RING_STYLES).map((r) => r.dash.join(','))).size).toBe(3)
    expect(RING_STYLES.fail.text).toBe('Shape: fail')
  })

  it('test_refusals_keep_the_prior_look_and_stale_chip_shows', async () => {
    const throwing = (code: string): Read =>
      vi.fn(() => Promise.reject(new ArboraApiError(code, 403, false, {}))) as unknown as Read
    const denied = await runOverlay('community', { visibleIds: visible, revision: 1 }, throwing('FORBIDDEN'))
    expect(denied).toEqual({
      state: { kind: 'community', status: 'refused', computedAtRevision: null, reason: 'FORBIDDEN' },
      answer: null,
    })
    const absent = await runOverlay('centrality', { visibleIds: visible, revision: 1 }, throwing('HTTP_UNAVAILABLE'))
    expect(absent.state).toMatchObject({ status: 'unavailable', reason: 'not available' })
    const unreadable = await runOverlay('centrality', { visibleIds: visible, revision: 1 }, ok({ weird: true }))
    expect(unreadable.state.status).toBe('refused')
    expect(unreadable.answer).toBeNull()
    const noEnds = await runOverlay('path', { visibleIds: visible, revision: 1 }, ok({}))
    expect(noEnds.state.status).toBe('refused')
  })
})
