/**
 * Owner-published budgets of the graph view (OVERSTORY-APPS-R030.13.1).
 *
 * The values come from the owner-published limits that the live convergence rows read. Until a
 * limit source is wired, the starting defaults apply and say so. A published limit that is
 * missing a field or holds a non-positive value makes expansion unavailable; the view never
 * guesses a replacement for it.
 */

export interface GraphBudget {
  maxVisibleNodes: number
  maxVisibleEdges: number
  labelBudget: number
  clusterThreshold: number
}

export const STARTING_GRAPH_BUDGET: GraphBudget = {
  maxVisibleNodes: 5000,
  maxVisibleEdges: 20000,
  labelBudget: 150,
  clusterThreshold: 2000,
}

export const GRAPH_LIMITS_UNAVAILABLE = 'Graph limits unavailable'

export type GraphBudgetState =
  | { status: 'ready'; budget: GraphBudget; source: 'starting-default' | 'published' }
  | { status: 'unavailable'; notice: typeof GRAPH_LIMITS_UNAVAILABLE; missing: string[] }

const KEYS = ['maxVisibleNodes', 'maxVisibleEdges', 'labelBudget', 'clusterThreshold'] as const

/** Parse published limits. `undefined` means no source is wired and the starting defaults apply. */
export function readGraphBudget(published?: unknown): GraphBudgetState {
  if (published === undefined) return { status: 'ready', budget: STARTING_GRAPH_BUDGET, source: 'starting-default' }
  const record = typeof published === 'object' && published !== null ? (published as Record<string, unknown>) : {}
  const missing = KEYS.filter((k) => {
    const v = record[k]
    return typeof v !== 'number' || !Number.isFinite(v) || v <= 0
  })
  if (missing.length > 0) return { status: 'unavailable', notice: GRAPH_LIMITS_UNAVAILABLE, missing }
  return {
    status: 'ready',
    budget: {
      maxVisibleNodes: record.maxVisibleNodes as number,
      maxVisibleEdges: record.maxVisibleEdges as number,
      labelBudget: record.labelBudget as number,
      clusterThreshold: record.clusterThreshold as number,
    },
    source: 'published',
  }
}

/** Whether `adding` more nodes would pass the visible limit. */
export function wouldExceedNodes(budget: GraphBudget, visible: number, adding: number): boolean {
  return visible + adding > budget.maxVisibleNodes
}

/** Level of detail for the current counts and camera state. */
export interface LevelOfDetail {
  hideEdgesOnMove: boolean
  renderEdgeLabels: boolean
  labelBudget: number
}

export function levelOfDetail(budget: GraphBudget, visibleEdges: number): LevelOfDetail {
  return {
    hideEdgesOnMove: visibleEdges > 5000,
    renderEdgeLabels: visibleEdges < 500,
    labelBudget: budget.labelBudget,
  }
}

/** Above the threshold, the view opens on engine cluster nodes. */
export function startsClustered(budget: GraphBudget, totalNodes: number): boolean {
  return totalNodes > budget.clusterThreshold
}
