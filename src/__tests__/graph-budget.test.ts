// spec: OVERSTORY-APPS-R030.13.1
import { describe, expect, it } from 'vitest'
import {
  GRAPH_LIMITS_UNAVAILABLE,
  STARTING_GRAPH_BUDGET,
  levelOfDetail,
  readGraphBudget,
  startsClustered,
  wouldExceedNodes,
} from '@/lib/graph-budget'

describe('graph budget', () => {
  it('test_limits_parse_and_missing_limit_makes_expansion_unavailable', () => {
    expect(readGraphBudget()).toEqual({ status: 'ready', budget: STARTING_GRAPH_BUDGET, source: 'starting-default' })
    expect(STARTING_GRAPH_BUDGET).toEqual({
      maxVisibleNodes: 5000,
      maxVisibleEdges: 20000,
      labelBudget: 150,
      clusterThreshold: 2000,
    })
    const published = { maxVisibleNodes: 100, maxVisibleEdges: 300, labelBudget: 10, clusterThreshold: 50 }
    expect(readGraphBudget(published)).toEqual({ status: 'ready', budget: published, source: 'published' })
    for (const bad of [
      { ...published, maxVisibleNodes: 0 },
      { ...published, labelBudget: -1 },
      { maxVisibleNodes: 5 },
      null,
      'x',
      { ...published, clusterThreshold: Number.NaN },
    ]) {
      expect(readGraphBudget(bad)).toMatchObject({ status: 'unavailable', notice: GRAPH_LIMITS_UNAVAILABLE })
    }
  })

  it('applies the node limit, level of detail and the clustered start', () => {
    expect(wouldExceedNodes(STARTING_GRAPH_BUDGET, 4990, 11)).toBe(true)
    expect(wouldExceedNodes(STARTING_GRAPH_BUDGET, 4990, 10)).toBe(false)
    expect(levelOfDetail(STARTING_GRAPH_BUDGET, 6000)).toEqual({
      hideEdgesOnMove: true,
      renderEdgeLabels: false,
      labelBudget: 150,
    })
    expect(levelOfDetail(STARTING_GRAPH_BUDGET, 100)).toMatchObject({ hideEdgesOnMove: false, renderEdgeLabels: true })
    expect(startsClustered(STARTING_GRAPH_BUDGET, 2001)).toBe(true)
    expect(startsClustered(STARTING_GRAPH_BUDGET, 2000)).toBe(false)
  })
})
