import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api-validation'
import {
  readGraphNodes,
  readGraphRelationships,
  readGraphStats,
  readGraphNodeTypes,
  type GraphNode,
  type GraphRelationship,
  type GraphStats,
} from './graph-read'
import type { NodeTypeBreakdownData } from './NodeTypeBreakdown'
import { useGraphClasses } from './useGraphClasses'
import { useGraphChanges } from '@/hooks/useGraphChanges'
import { readLiveLimits, type ChangeEffect, type LiveLimitsState } from '@/lib/graph-changes'

/**
 * The owner publishes the live graph bounds; no source serves them yet, so bounded live mode stays
 * unavailable and the hook makes no change-feed request (OVERSTORY-APPS-R030.8.4).
 */
export const PUBLISHED_LIVE_LIMITS: LiveLimitsState = readLiveLimits(undefined)

interface GraphSnapshot {
  binding: string | null
  nodes: GraphNode[]
  relationships: GraphRelationship[]
  stats: GraphStats | null
  breakdown: NodeTypeBreakdownData | null
  pending: string[]
  failed: string[]
  denied: boolean
}
const empty = (): GraphSnapshot => ({
  binding: null,
  nodes: [],
  relationships: [],
  stats: null,
  breakdown: null,
  pending: [],
  failed: [],
  denied: false,
})

/** A request generation owns all four reads, and any denial retires that entire generation. */
export function useExploreGraph(
  active: boolean,
  type: string | null,
  limits: LiveLimitsState = PUBLISHED_LIVE_LIMITS,
) {
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<GraphSnapshot>(empty)
  const generation = useRef(0)
  const typeRef = useRef(type)
  typeRef.current = type
  const classes = useGraphClasses(active)
  const binding = JSON.stringify([type, revision])
  useEffect(() => {
    const request = ++generation.current
    const abort = new AbortController()
    setSnapshot(active ? { ...empty(), binding, pending: ['nodes', 'relationships', 'stats', 'breakdown'] } : empty())
    if (!active)
      return () => {
        abort.abort()
      }
    const current = () => generation.current === request && !abort.signal.aborted
    const receive = async <K extends 'nodes' | 'relationships' | 'stats' | 'breakdown'>(
      key: K,
      read: () => Promise<GraphSnapshot[K]>,
    ) => {
      try {
        const value = await read()
        if (current()) setSnapshot((previous) => ({ ...previous, [key]: value }))
      } catch (error) {
        if (!current()) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          // Do not wait for slower successful siblings before withdrawing protected data.
          ++generation.current
          abort.abort()
          setSnapshot({ ...empty(), binding, denied: true })
          return
        }
        setSnapshot((previous) => ({ ...previous, failed: [...previous.failed, key] }))
      } finally {
        if (current()) setSnapshot((previous) => ({ ...previous, pending: previous.pending.filter((v) => v !== key) }))
      }
    }
    void receive('nodes', () => readGraphNodes(type, abort.signal))
    void receive('relationships', () => readGraphRelationships(abort.signal))
    void receive('stats', () => readGraphStats(abort.signal))
    void receive('breakdown', () => readGraphNodeTypes(abort.signal))
    return () => {
      abort.abort()
    }
  }, [active, type, binding])
  const token = generation.current
  // Committed changes of other clients merge into the held sample. Nothing is cleared, so the
  // selection, the camera and the layout anchors of the canvas survive (OVERSTORY-APPS-R030.8.2).
  const converge = useCallback((effect: ChangeEffect) => {
    const request = generation.current
    const gone = new Set(effect.remove)
    if (gone.size > 0)
      setSnapshot((previous) => ({
        ...previous,
        nodes: previous.nodes.filter((node) => !gone.has(node.id)),
        relationships: previous.relationships.filter((edge) => !gone.has(edge.source) && !gone.has(edge.target)),
      }))
    if (effect.refresh.length === 0) return
    void Promise.all([readGraphNodes(typeRef.current), readGraphRelationships()]).then(
      ([nodes, relationships]) => {
        if (generation.current === request) setSnapshot((previous) => ({ ...previous, nodes, relationships }))
      },
      () => undefined,
    )
  }, [])
  const revoke = useCallback(() => {
    ++generation.current
    setSnapshot({ ...empty(), denied: true })
  }, [])
  const live = useGraphChanges({ active, limits, onEffect: converge, onRevoked: revoke })
  return {
    live,
    classes,
    ...(active && snapshot.binding === binding
      ? snapshot
      : { ...empty(), pending: active ? ['nodes', 'relationships', 'stats', 'breakdown'] : [] }),
    isCurrent: () => generation.current === token,
    refresh: () => {
      // Withdraw old data synchronously, before the next request effect runs.
      ++generation.current
      setSnapshot({ ...empty(), pending: ['nodes', 'relationships', 'stats', 'breakdown'] })
      setRevision((previous) => previous + 1)
    },
  }
}
