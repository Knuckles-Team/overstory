/**
 * The scene of the graph view: one renderer over one in-memory graph (OVERSTORY-APPS-R030.10 to .13).
 *
 * State commits first. A change of the visible set is written into the graph model at once, the
 * layout runs in the worker, and the motion controller then moves what changed. Selection, expand,
 * collapse, the legend and the overlays all go through that one path; there is no second renderer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sigma from 'sigma'
import { EdgeArrowProgram, EdgeRectangleProgram, NodeCircleProgram } from 'sigma/rendering'
import { EdgeCurvedArrowProgram } from '@sigma/edge-curve'
import type { Attributes } from 'graphology-types'
import type { GraphNode, GraphRelationship } from './GraphAdapter'
import { resolveNodeType } from './GraphAdapter'
import {
  applyVisible,
  createViewGraph,
  restyleAll,
  targetSize,
  type StyleContext,
  type ViewEdgeAttributes,
  type ViewGraph,
  type ViewNodeAttributes,
} from './graph-sync'
import { createShapePrograms } from './shape-programs'
import { paintOverlay, type PaintScene } from './overlay-painter'
import { GraphMotionController, useGraphMotion } from './useGraphMotion'
import { LayoutClient, type LayoutWorkerFactory, defaultLayoutWorker } from './layout-client'
import type { ClassesState } from './graph-read'
import { pickReadableTextColor, resolveThemeColors } from './theme-colors'
import { drawThemedNodeHover } from './hover-draw'
import { useTheme } from '@/components/theme-provider'
import {
  DEFAULT_GRAPH_MOTION,
  planChange,
  type ChangeInput,
  type GraphTransition,
  type NodeTween,
  type Placement,
} from '@/lib/graph-motion'
import { CLASS_SHAPES, mixHex, withAlpha } from '@/lib/graph-semantics'
import { levelOfDetail, type GraphBudgetState } from '@/lib/graph-budget'
import {
  collapseNode,
  expandCluster,
  expandNode,
  isClusterNodeId,
  type ExpansionRecord,
  type ExpandVerdict,
} from '@/lib/graph-expand'
import {
  centralitySteps,
  communityColors,
  idleOverlay,
  isStale,
  planPathReveal,
  pathProgress,
  runOverlay,
  stepColor,
  stepSize,
  PATH_REVEAL_MS,
  type OverlayAnswer,
  type OverlayKind,
  type OverlayState,
  type PathRevealStep,
  type ShapeVerdict,
} from '@/lib/graph-overlays'

export interface ExtraState {
  nodes: GraphNode[]
  relationships: GraphRelationship[]
  records: Map<string, ExpansionRecord>
  hidden: Record<string, number>
}
const emptyExtra = (): ExtraState => ({ nodes: [], relationships: [], records: new Map(), hidden: {} })

interface PendingCause {
  id: string
  kind: Extract<GraphTransition, 'expand' | 'collapse'>
}

export interface SceneParams {
  nodes: GraphNode[]
  relationships: GraphRelationship[]
  active: boolean
  isDark: boolean
  classes: ClassesState | null
  budget: GraphBudgetState
  selectedExternally: GraphNode | null
  onSelectNode: (node: GraphNode | null) => void
  expiredEdges?: ReadonlySet<string>
  expiredEdgeColor: string
  layoutFactory?: LayoutWorkerFactory
  /** The graph the view opened on, as engine cluster nodes. When set, it replaces `nodes` as the base. */
  clustered?: boolean
}

export interface OverlayView {
  state: OverlayState
}

export interface SceneNotice {
  nodeId: string | null
  text: string
}

const SETTLE_NOTICE_MS = 6000
const ALPHA_SELECT = 0.1
const ALPHA_HOVER = 0.15
export const EXPAND_FOCUS_EASE_MS = 400

function nodeLabelOf(node: GraphNode | undefined, id: string): string {
  if (node && typeof node.properties.name === 'string') return node.properties.name
  return id.substring(0, 24)
}

/** Deterministic seed so the first layout is the same on every load. */
function seedFor(id: string, spread: number): { x: number; y: number } {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  const a = (h >>> 0) / 4294967296
  const b = (Math.imul(h, 2654435761) >>> 0) / 4294967296
  return { x: (a - 0.5) * spread, y: (b - 0.5) * spread }
}

export function useGraphScene(params: SceneParams) {
  const {
    nodes,
    relationships,
    active,
    isDark,
    classes,
    budget,
    selectedExternally,
    onSelectNode,
    expiredEdges,
    expiredEdgeColor,
    layoutFactory,
    clustered = false,
  } = params
  const { motion: motionPref } = useTheme()

  const containerRef = useRef<HTMLDivElement>(null)
  const paintRef = useRef<HTMLCanvasElement>(null)
  const sigmaRef = useRef<Sigma<ViewNodeAttributes, ViewEdgeAttributes> | null>(null)
  const graphRef = useRef<ViewGraph>(createViewGraph())
  const layoutRef = useRef<LayoutClient | null>(null)
  const leavingRef = useRef<Set<string>>(new Set())
  const pendingRef = useRef<PendingCause | null>(null)
  const hoverRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const labelSetRef = useRef<Set<string>>(new Set())
  const expiredRef = useRef(expiredEdges)
  const expiredColorRef = useRef(expiredEdgeColor)
  expiredRef.current = expiredEdges
  expiredColorRef.current = expiredEdgeColor
  const isDarkRef = useRef(isDark)
  isDarkRef.current = isDark
  const expandUnavailable = useRef(false)
  const inFlight = useRef(new Set<string>())

  const [extra, setExtra] = useState<ExtraState>(emptyExtra)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pathEnd, setPathEnd] = useState<string | null>(null)
  const [hiddenClasses, setHiddenClasses] = useState<ReadonlySet<string>>(new Set())
  const [isolated, setIsolated] = useState<string | null>(null)
  const [notice, setNotice] = useState<SceneNotice | null>(null)
  const [live, setLive] = useState('')
  const [revision, setRevision] = useState(0)
  const [overlays, setOverlays] = useState<Record<OverlayKind, OverlayState>>({
    community: idleOverlay('community'),
    centrality: idleOverlay('centrality'),
    path: idleOverlay('path'),
    shape: idleOverlay('shape'),
  })
  const [nonce, setNonce] = useState(0)
  const lastNonce = useRef(0)
  const [pathMessage, setPathMessage] = useState<string | null>(null)
  const overlayRef = useRef<{
    colors: Map<string, string> | null
    sizes: Map<string, number> | null
    rings: Map<string, ShapeVerdict> | null
    path: { steps: PathRevealStep[]; progress: number[]; ids: Set<string> } | null
  }>({ colors: null, sizes: null, rings: null, path: null })
  const [overlayView, setOverlayView] = useState(0)

  // ── The visible set: the loaded base plus what expansions added ────────────────────────────
  const baseKey = `${String(nodes.length)}:${nodes[0]?.id ?? ''}:${nodes.at(-1)?.id ?? ''}:${String(relationships.length)}`
  useEffect(() => {
    setExtra(emptyExtra())
    leavingRef.current.clear()
  }, [baseKey, clustered])

  const displayNodes = useMemo(() => {
    const seen = new Set<string>()
    const out: GraphNode[] = []
    for (const n of [...nodes, ...extra.nodes]) {
      if (seen.has(n.id)) continue
      seen.add(n.id)
      out.push(n)
    }
    return out
  }, [nodes, extra.nodes])
  const displayRels = useMemo(() => {
    const seen = new Set<string>()
    const out: GraphRelationship[] = []
    for (const r of [...relationships, ...extra.relationships]) {
      const key = `${r.source}|${r.type}|${r.target}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(r)
    }
    return out
  }, [relationships, extra.relationships])
  const nodeById = useMemo(() => new Map(displayNodes.map((n) => [n.id, n])), [displayNodes])
  const nodeByIdRef = useRef(nodeById)
  nodeByIdRef.current = nodeById

  const theme = useMemo(() => resolveThemeColors(isDark), [isDark])
  const styleCtx = useMemo<StyleContext>(
    () => ({
      classIndex: classes?.status === 'ready' ? classes.index : null,
      isDark,
      labelColor: pickReadableTextColor(theme.card),
      edgeColor: theme.mutedForeground,
    }),
    [classes, isDark, theme],
  )
  const styleCtxRef = useRef(styleCtx)
  styleCtxRef.current = styleCtx

  // ── Renderer refresh and motion ────────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    sigmaRef.current?.refresh({ skipIndexation: true })
  }, [])
  const controller: GraphMotionController = useGraphMotion(() => graphRef.current, refresh, DEFAULT_GRAPH_MOTION)
  const controllerRef = useRef(controller)
  controllerRef.current = controller
  const reducedRef = useRef(false)
  reducedRef.current = controller.reduced

  const paint = useCallback(() => {
    const canvas = paintRef.current
    const sigma = sigmaRef.current
    if (!canvas || !sigma) return
    const dims = sigma.getDimensions()
    const ratio = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(dims.width * ratio) || canvas.height !== Math.round(dims.height * ratio)) {
      canvas.width = Math.round(dims.width * ratio)
      canvas.height = Math.round(dims.height * ratio)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    const graph = graphRef.current
    const badges = new Map<string, number>()
    graph.forEachNode((id, a) => {
      if (a.hiddenCount && a.hiddenCount > 0) badges.set(id, a.hiddenCount)
    })
    const overlay = overlayRef.current
    const scene: PaintScene = {
      place: (id) => {
        if (!graph.hasNode(id)) return null
        const a = graph.getNodeAttributes(id)
        const p = sigma.graphToViewport({ x: a.x, y: a.y })
        return { x: p.x, y: p.y, size: sigma.scaleSize(a.size), alpha: controllerRef.current.alpha(id) }
      },
      badges,
      selected: selectedRef.current,
      rings: overlay.rings,
      path: overlay.path ? { steps: overlay.path.steps, progress: overlay.path.progress } : null,
      accent: isDarkRef.current ? '#fbbf24' : '#b45309',
      badgeFill: isDarkRef.current ? '#f1f5f9' : '#0f172a',
      badgeText: isDarkRef.current ? '#0f172a' : '#f8fafc',
      ringColors: isDarkRef.current
        ? { pass: '#4ade80', warn: '#fbbf24', fail: '#f87171' }
        : { pass: '#15803d', warn: '#b45309', fail: '#b91c1c' },
    }
    paintOverlay(ctx, scene, dims.width, dims.height)
  }, [])
  const paintRefStable = useRef(paint)
  paintRefStable.current = paint

  // ── Sigma lifecycle ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !containerRef.current || sigmaRef.current) return
    const graph = graphRef.current
    const nodePrograms = { ...createShapePrograms(CLASS_SHAPES), circle: NodeCircleProgram }
    const sigma = new Sigma<ViewNodeAttributes, ViewEdgeAttributes>(graph, containerRef.current, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      defaultNodeType: 'circle',
      defaultEdgeType: 'arrow',
      nodeProgramClasses: nodePrograms,
      edgeProgramClasses: { line: EdgeRectangleProgram, arrow: EdgeArrowProgram, curvedArrow: EdgeCurvedArrowProgram },
      labelColor: { attribute: 'labelColor', color: '#e2e8f0' },
      zIndex: true,
      defaultDrawNodeHover: (context, data, settings) => {
        drawThemedNodeHover(context, data, settings, isDarkRef.current)
      },
      nodeReducer: (id, data) => reduceNode(id, data),
      edgeReducer: (id, data) => reduceEdge(id, data),
    })
    sigmaRef.current = sigma

    sigma.on('enterNode', ({ node }) => {
      hoverRef.current = node
      applyFocus()
    })
    sigma.on('leaveNode', () => {
      hoverRef.current = null
      applyFocus()
    })
    sigma.on('clickNode', (e) => {
      const original = e.event.original as MouseEvent
      if (original.altKey) {
        collapseRef.current(e.node)
        return
      }
      if (original.shiftKey && selectedRef.current && selectedRef.current !== e.node) {
        setPathEnd(e.node)
        return
      }
      selectNodeRef.current(e.node, true)
    })
    sigma.on('clickStage', () => {
      clearSelectionRef.current()
    })
    sigma.on('afterRender', () => {
      paintRefStable.current()
    })

    // Dragging pins a node: it keeps that position through later layouts.
    let dragged: string | null = null
    sigma.on('downNode', (e) => {
      dragged = e.node
      graph.setNodeAttribute(e.node, 'pinned', true)
    })
    sigma.getMouseCaptor().on('mousemovebody', (e) => {
      if (!dragged) return
      const pos = sigma.viewportToGraph(e)
      graph.mergeNodeAttributes(dragged, { x: pos.x, y: pos.y })
      e.preventSigmaDefault()
      e.original.preventDefault()
      e.original.stopPropagation()
    })
    const release = () => {
      dragged = null
    }
    sigma.getMouseCaptor().on('mouseup', release)
    sigma.getMouseCaptor().on('mouseleave', release)

    return () => {
      /* killed on unmount below */
    }
    // The renderer is created once per mount; the callbacks it holds read refs.
  }, [active])

  useEffect(
    () => () => {
      sigmaRef.current?.kill()
      sigmaRef.current = null
      layoutRef.current?.dispose()
      layoutRef.current = null
    },
    [],
  )

  // Level of detail follows the visible edge count.
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma || budget.status !== 'ready') return
    const lod = levelOfDetail(budget.budget, displayRels.length)
    sigma.setSetting('hideEdgesOnMove', lod.hideEdgesOnMove)
    sigma.setSetting('renderEdgeLabels', lod.renderEdgeLabels)
  }, [budget, displayRels.length, active])

  // ── Reducers ───────────────────────────────────────────────────────────────────────────────
  const reduceNode = (id: string, data: ViewNodeAttributes): Partial<ViewNodeAttributes> & Attributes => {
    const c = controllerRef.current
    const overlay = overlayRef.current
    const alpha = c.alpha(id)
    const mix = c.layerAlpha('overlay-mix', '__overlay-mix__')
    let color = data.color
    const override = overlay.colors?.get(id)
    if (override) color = mixHex(data.color, override, mix)
    let size = data.size
    const sized = overlay.sizes?.get(id)
    if (sized !== undefined) size = size + (sized - size) * mix
    const hidden = alpha < 0.02
    const labelled = labelSetRef.current.has(id)
    return {
      ...data,
      color: withAlpha(color, alpha),
      size,
      hidden,
      label: labelled || id === selectedRef.current || id === hoverRef.current ? data.label : '',
      forceLabel: labelled,
      zIndex: id === selectedRef.current ? 2 : id === hoverRef.current ? 1 : 0,
      highlighted: id === hoverRef.current,
    }
  }
  const reduceEdge = (id: string, data: ViewEdgeAttributes): Partial<ViewEdgeAttributes> & Attributes => {
    const g = graphRef.current
    const c = controllerRef.current
    const source = g.source(id)
    const target = g.target(id)
    const alpha = c.edgeAlpha(source, target)
    let color = data.color
    let size = data.size
    const expired = expiredRef.current
    if (expired && expired.size > 0 && expired.has(`${source}|${target}`)) {
      color = expiredColorRef.current
      size = Math.min(size, 1)
    }
    const path = overlayRef.current.path
    if (path?.progress.every((p) => p >= 1)) {
      const onPath = path.steps.some(
        (s) => (s.source === source && s.target === target) || (s.source === target && s.target === source),
      )
      if (onPath) {
        color = isDarkRef.current ? '#fbbf24' : '#b45309'
        size = 3
      }
    }
    return { ...data, color: withAlpha(color, alpha), size, hidden: alpha < 0.02 }
  }

  // ── Focus: hover and selection fades ──────────────────────────────────────────────────────
  const applyFocus = useCallback(() => {
    const graph = graphRef.current
    const c = controllerRef.current
    const focusId = hoverRef.current ?? selectedRef.current
    const targets = new Map<string, number>()
    if (!focusId || !graph.hasNode(focusId)) {
      graph.forEachNode((id) => targets.set(id, 1))
    } else {
      const keep = new Set([focusId, ...graph.neighbors(focusId)])
      const floor = selectedRef.current && !hoverRef.current ? ALPHA_SELECT : ALPHA_HOVER
      graph.forEachNode((id) => targets.set(id, keep.has(id) ? 1 : floor))
    }
    c.fadeTo(hoverRef.current ? 'hover' : 'select', targets)
    // Labels: the selected node, its neighbors, then the highest degree up to the label budget.
    const labelBudget = budgetRef.current.status === 'ready' ? budgetRef.current.budget.labelBudget : 150
    const set = new Set<string>()
    const byDegree = graph.nodes().sort((a, b) => graph.degree(b) - graph.degree(a))
    for (const id of byDegree.slice(0, labelBudget)) set.add(id)
    if (selectedRef.current && graph.hasNode(selectedRef.current)) {
      set.add(selectedRef.current)
      for (const n of graph.neighbors(selectedRef.current)) set.add(n)
    }
    labelSetRef.current = set
    refresh()
    paintRefStable.current()
  }, [refresh])
  const budgetRef = useRef(budget)
  budgetRef.current = budget

  const fitCamera = useCallback((ids: readonly string[]) => {
    const sigma = sigmaRef.current
    if (!sigma || ids.length === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of ids) {
      const d = sigma.getNodeDisplayData(id)
      if (!d) continue
      minX = Math.min(minX, d.x)
      minY = Math.min(minY, d.y)
      maxX = Math.max(maxX, d.x)
      maxY = Math.max(maxY, d.y)
    }
    if (!Number.isFinite(minX)) return
    const span = Math.max(maxX - minX, maxY - minY, 0.02)
    void sigma
      .getCamera()
      .animate(
        { x: (minX + maxX) / 2, y: (minY + maxY) / 2, ratio: Math.min(1.2, Math.max(0.05, span * 1.5)) },
        { duration: controllerRef.current.reduced ? 0 : controllerRef.current.config.focusMs },
      )
  }, [])

  const selectNode = useCallback(
    (id: string, userClick: boolean) => {
      selectedRef.current = id
      setSelectedId(id)
      const node = nodeByIdRef.current.get(id) ?? null
      if (userClick) onSelectNode(node)
      applyFocus()
      const graph = graphRef.current
      if (graph.hasNode(id)) fitCamera([id, ...graph.neighbors(id)])
      // A node whose neighbors are not all shown grows on click.
      const a = graph.hasNode(id) ? graph.getNodeAttributes(id) : null
      if (userClick && a && a.hiddenCount !== 0 && !expandUnavailable.current) void expandRef.current(id)
    },
    [applyFocus, fitCamera, onSelectNode],
  )
  const selectNodeRef = useRef(selectNode)
  selectNodeRef.current = selectNode

  const clearSelection = useCallback(() => {
    selectedRef.current = null
    setSelectedId(null)
    setPathEnd(null)
    onSelectNode(null)
    clearPathRef.current()
    applyFocus()
  }, [applyFocus, onSelectNode])
  const clearSelectionRef = useRef(clearSelection)
  clearSelectionRef.current = clearSelection

  // External selection (table, details pane) drives the same focus.
  useEffect(() => {
    const id = selectedExternally?.id ?? null
    if (id === selectedRef.current) return
    selectedRef.current = id
    setSelectedId(id)
    applyFocus()
  }, [selectedExternally, applyFocus])

  // ── Sync: commit the visible set, lay out in the worker, then move ─────────────────────────
  useEffect(() => {
    if (!active) return
    const graph = graphRef.current
    const c = controllerRef.current
    const cause = pendingRef.current
    pendingRef.current = null
    const wasEmpty = graph.order === 0
    const before = new Map<string, Placement & { alpha: number }>()
    graph.forEachNode((id, a) => before.set(id, { x: a.x, y: a.y, size: a.size, alpha: c.alpha(id) }))
    const spread = Math.max(80, Math.sqrt(displayNodes.length) * 50)
    const causeAttrs = cause && graph.hasNode(cause.id) ? graph.getNodeAttributes(cause.id) : null
    const diff = applyVisible(
      graph,
      displayNodes,
      displayRels,
      styleCtxRef.current,
      (node) => {
        if (causeAttrs) {
          // Coincident nodes would never separate, so each starts a hair from the cause.
          const jitter = seedFor(node.id, 2)
          return { x: causeAttrs.x + jitter.x, y: causeAttrs.y + jitter.y }
        }
        return seedFor(node.id, wasEmpty ? spread : spread * 0.5)
      },
      extra.hidden,
      leavingRef.current,
    )
    const unchanged = !wasEmpty && diff.added.length === 0 && diff.removed.length === 0 && nonce === lastNonce.current
    lastNonce.current = nonce
    if (unchanged) return
    setRevision((r) => r + 1)
    for (const node of diff.added) c.setLayerAlpha('grow', node.id, wasEmpty ? 1 : 0)
    // Nodes that left stay in the model until their tween ends.
    const leaving = leavingRef.current
    for (const id of diff.removed) leaving.add(id)
    if (graph.order === 0) return
    restyleAll(graph, displayNodes, styleCtxRef.current)

    const targetsSize = new Map<string, number>()
    graph.forEachNode((id) => targetsSize.set(id, targetSize(graph, id)))
    if (wasEmpty) {
      // First sight of the graph: show sizes now, settle positions from the seed.
      graph.forEachNode((id) => graph.setNodeAttribute(id, 'size', targetsSize.get(id) ?? 6))
    }

    const layoutNodes = graph
      .nodes()
      .filter((id) => !leaving.has(id))
      .map((id) => {
        const a = graph.getNodeAttributes(id)
        return { id, x: a.x, y: a.y, mass: a.mass }
      })
    const layoutEdges = graph
      .edges()
      .map((k) => ({ source: graph.source(k), target: graph.target(k) }))
      .filter((e) => !leaving.has(e.source) && !leaving.has(e.target))
    const pinned = layoutNodes.filter((n) => graph.getNodeAttribute(n.id, 'pinned') === true).map((n) => n.id)
    layoutRef.current ??= new LayoutClient(layoutFactory ?? defaultLayoutWorker)
    const kind: 'layout' | 'expand' | 'collapse' = cause?.kind ?? 'layout'
    const causeId = cause?.id ?? null
    const addedIds = diff.added.map((n) => n.id)
    // Every node still leaving goes now, including any a superseded change left behind.
    const removedIds = [...leaving]
    const current = new Map(before)
    for (const id of addedIds) {
      const a = graph.getNodeAttributes(id)
      current.set(id, { x: a.x, y: a.y, size: 0, alpha: 0 })
    }
    // Growth starts on the first batch of the worker, so nothing waits for the layout to settle. The settled
    // answer then retargets from where the nodes are, which is an interruption and so never jumps.
    let started = false
    const targetsFrom = (positions: ReadonlyMap<string, { x: number; y: number }> | null): Map<string, Placement> => {
      const targets = new Map<string, Placement>()
      for (const n of layoutNodes) {
        const p = positions?.get(n.id)
        targets.set(n.id, { x: p?.x ?? n.x, y: p?.y ?? n.y, size: targetsSize.get(n.id) ?? 6 })
      }
      return targets
    }
    const done = () => {
      for (const id of removedIds) {
        if (graph.hasNode(id)) graph.dropNode(id)
        leaving.delete(id)
        c.forget(id)
      }
      applyFocus()
      if (causeId && kind === 'expand') fitCamera([causeId, ...addedIds])
    }
    const begin = (positions: ReadonlyMap<string, { x: number; y: number }> | null) => {
      started = true
      // The worker answered some frames after this change was committed, so a running motion has moved on.
      // Start from where each node is now; starting from the snapshot taken at commit would jump back.
      const addedSet = new Set(addedIds)
      for (const id of [...current.keys()]) {
        if (addedSet.has(id)) continue
        const now = c.current(id)
        if (now) current.set(id, { x: now.x, y: now.y, size: now.size, alpha: c.layerAlpha('grow', id) })
      }
      const targets = targetsFrom(positions)
      if (wasEmpty) {
        for (const n of layoutNodes) current.set(n.id, { x: n.x, y: n.y, size: targetsSize.get(n.id) ?? 6, alpha: 1 })
      }
      const input: ChangeInput = {
        current,
        targets,
        added: wasEmpty ? [] : addedIds,
        removed: removedIds,
        cause: causeId,
        config: c.config,
        kind,
      }
      c.transition(kind, planChange(input), { cause: causeAttrs ?? undefined, onComplete: done })
    }
    const retarget = (positions: ReadonlyMap<string, { x: number; y: number }>) => {
      const targets = targetsFrom(positions)
      const tweens: NodeTween[] = []
      for (const [id, to] of targets) {
        const now = c.current(id)
        if (!now) continue
        tweens.push({
          id,
          fromX: now.x,
          fromY: now.y,
          toX: to.x,
          toY: to.y,
          fromSize: now.size,
          toSize: to.size,
          fromAlpha: c.layerAlpha('grow', id),
          toAlpha: 1,
        })
      }
      c.transition('layout', tweens)
    }
    void layoutRef.current
      .run({ nodes: layoutNodes, edges: layoutEdges, pinned }, (batch) => {
        if (started || batch.type !== 'batch') return
        const first = new Map<string, { x: number; y: number }>()
        batch.ids.forEach((id, i) => {
          first.set(id, { x: batch.positions[i * 2], y: batch.positions[i * 2 + 1] })
        })
        begin(first)
      })
      .then((outcome) => {
        if (outcome.status === 'superseded') return
        const settled = outcome.status === 'settled' ? outcome.positions : null
        if (!started) begin(settled)
        else if (settled) retarget(settled)
      })
    // The visible set drives this effect; theme and schema changes recolor in place below.
  }, [displayNodes, displayRels, active, nonce])

  // Recolor in place when theme, schema or overlays change.
  useEffect(() => {
    if (graphRef.current.order === 0) return
    restyleAll(graphRef.current, displayNodes, styleCtx)
    sigmaRef.current?.setSetting('labelColor', { attribute: 'labelColor', color: styleCtx.labelColor })
    refresh()
  }, [styleCtx, displayNodes, refresh])

  // ── Legend: fade a class out, its edges follow ───────────────────────────────────────────
  const classKeyOf = useCallback((id: string) => {
    const g = graphRef.current
    return g.hasNode(id) ? g.getNodeAttribute(id, 'classKey') : ''
  }, [])
  useEffect(() => {
    const graph = graphRef.current
    const targets = new Map<string, number>()
    graph.forEachNode((id) => {
      const key = classKeyOf(id)
      const off = hiddenClasses.has(key) || (isolated !== null && isolated !== key)
      targets.set(id, off ? 0 : 1)
    })
    controllerRef.current.fadeTo('hover', targets, 'class')
  }, [hiddenClasses, isolated, classKeyOf, displayNodes])

  const toggleClass = useCallback((key: string) => {
    setIsolated(null)
    setHiddenClasses((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const isolateClass = useCallback((key: string) => {
    setHiddenClasses(new Set())
    setIsolated((prev) => (prev === key ? null : key))
  }, [])

  // ── Expand and collapse ──────────────────────────────────────────────────────────────────
  const applyVerdict = useCallback((originId: string, verdict: ExpandVerdict) => {
    const label = nodeLabelOf(nodeByIdRef.current.get(originId), originId)
    if (verdict.verdict === 'expanded') {
      pendingRef.current = { id: originId, kind: 'expand' }
      setExtra((prev) => {
        const records = new Map(prev.records)
        // Expanding again adds to what this node already took, so Collapse still takes all of it back.
        const earlier = prev.records.get(originId)
        records.set(
          originId,
          earlier
            ? {
                origin: originId,
                addedNodeIds: [...earlier.addedNodeIds, ...verdict.record.addedNodeIds],
                addedEdgeIds: [...earlier.addedEdgeIds, ...verdict.record.addedEdgeIds],
              }
            : verdict.record,
        )
        return {
          nodes: [...prev.nodes, ...verdict.nodes],
          relationships: [...prev.relationships, ...verdict.relationships],
          records,
          hidden: { ...prev.hidden, [originId]: 0, ...verdict.hidden },
        }
      })
      const hiddenLeft = verdict.hidden[originId] ?? 0
      setLive(`Expanded ${label}: ${String(verdict.nodes.length)} added, ${String(hiddenLeft)} hidden`)
      setNotice(null)
      return
    }
    if (verdict.verdict === 'unavailable') {
      if (verdict.reason === 'not available') expandUnavailable.current = true
      setNotice({ nodeId: originId, text: `Expand ${verdict.reason}` })
    } else {
      setNotice({ nodeId: originId, text: verdict.reason })
    }
    setLive(`${label}: ${verdict.verdict === 'unavailable' ? `Expand ${verdict.reason}` : verdict.reason}`)
  }, [])

  const expand = useCallback(
    async (id: string) => {
      if (inFlight.current.has(id)) return
      inFlight.current.add(id)
      try {
        const node = nodeByIdRef.current.get(id)
        const ctx = { visibleIds: new Set(nodeByIdRef.current.keys()), budget: budgetRef.current }
        const verdict = isClusterNodeId(id) && node ? await expandCluster(node, ctx) : await expandNode(id, ctx)
        applyVerdict(id, verdict)
      } finally {
        inFlight.current.delete(id)
      }
    },
    [applyVerdict],
  )
  const expandRef = useRef(expand)
  expandRef.current = expand

  const collapse = useCallback(
    (id: string) => {
      const record = extra.records.get(id)
      if (!record) return
      const { removeNodeIds } = collapseNode(record, displayRels)
      const gone = new Set(removeNodeIds)
      pendingRef.current = { id, kind: 'collapse' }
      setExtra((prev) => {
        const records = new Map(prev.records)
        records.delete(id)
        const hidden = Object.fromEntries(Object.entries(prev.hidden).filter(([key]) => !gone.has(key)))
        return {
          nodes: prev.nodes.filter((n) => !gone.has(n.id)),
          relationships: prev.relationships.filter((r) => !gone.has(r.source) && !gone.has(r.target)),
          records,
          hidden,
        }
      })
      setLive(`Collapsed ${nodeLabelOf(nodeByIdRef.current.get(id), id)}: ${String(gone.size)} removed`)
    },
    [extra.records, displayRels],
  )
  const collapseRef = useRef(collapse)
  collapseRef.current = collapse

  // Notices fade after a while.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => {
      setNotice(null)
    }, SETTLE_NOTICE_MS)
    return () => {
      clearTimeout(t)
    }
  }, [notice])

  // ── Overlays ─────────────────────────────────────────────────────────────────────────────
  const setOverlayMix = useCallback((to: number) => {
    const c = controllerRef.current
    const from = c.layerAlpha('overlay-mix', '__overlay-mix__')
    c.transition(
      'focus',
      [
        {
          id: '__overlay-mix__',
          fromX: 0,
          fromY: 0,
          toX: 0,
          toY: 0,
          fromSize: 0,
          toSize: 0,
          fromAlpha: from,
          toAlpha: to,
        },
      ],
      { layer: 'overlay-mix' },
    )
  }, [])

  const clearPath = useCallback(() => {
    const had = overlayRef.current.path !== null
    overlayRef.current = { ...overlayRef.current, path: null }
    setPathMessage(null)
    setOverlays((prev) => ({ ...prev, path: idleOverlay('path') }))
    if (had) {
      const targets = new Map<string, number>()
      graphRef.current.forEachNode((id) => targets.set(id, 1))
      controllerRef.current.fadeTo('select', targets, 'overlay')
    }
    refresh()
    paintRefStable.current()
  }, [refresh])
  const clearPathRef = useRef(clearPath)
  clearPathRef.current = clearPath

  const animatePath = useCallback((steps: PathRevealStep[]) => {
    const instant = controllerRef.current.reduced
    const start = performance.now()
    const frame = () => {
      const o = overlayRef.current.path
      if (!o) return
      const elapsed = performance.now() - start
      const done = instant || elapsed >= PATH_REVEAL_MS
      o.progress = done ? steps.map(() => 1) : pathProgress(steps, elapsed)
      sigmaRef.current?.refresh({ skipIndexation: true })
      paintRefStable.current()
      if (!done) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }, [])

  const applyAnswer = useCallback(
    (answer: OverlayAnswer) => {
      const c = controllerRef.current
      const dark = isDarkRef.current
      if (answer.kind === 'community') {
        overlayRef.current = {
          ...overlayRef.current,
          colors: communityColors(answer.communities, dark),
          sizes: null,
        }
        setOverlayMix(1)
      } else if (answer.kind === 'centrality') {
        const steps = centralitySteps(answer.scores)
        overlayRef.current = {
          ...overlayRef.current,
          colors: new Map([...steps].map(([id, s]) => [id, stepColor(s, dark)])),
          sizes: new Map([...steps].map(([id, s]) => [id, stepSize(s)])),
        }
        setOverlayMix(1)
      } else if (answer.kind === 'shape') {
        overlayRef.current = { ...overlayRef.current, rings: answer.verdicts }
      } else if (answer.path.length === 0) {
        overlayRef.current = { ...overlayRef.current, path: null }
        setPathMessage('No path')
      } else {
        const steps = planPathReveal(answer.path)
        const ids = new Set(answer.path)
        overlayRef.current = {
          ...overlayRef.current,
          path: { steps, progress: steps.map(() => 0), ids },
        }
        const targets = new Map<string, number>()
        graphRef.current.forEachNode((id) => targets.set(id, ids.has(id) ? 1 : ALPHA_HOVER))
        c.fadeTo('focus', targets, 'overlay')
        setPathMessage(null)
        animatePath(steps)
      }
      setOverlayView((v) => v + 1)
      refresh()
      paintRefStable.current()
    },
    [animatePath, refresh, setOverlayMix],
  )

  const runOverlayKind = useCallback(
    async (kind: OverlayKind) => {
      setOverlays((prev) => ({ ...prev, [kind]: { kind, status: 'loading', computedAtRevision: null } }))
      const ends: readonly [string, string] | undefined =
        selectedRef.current && pathEndRef.current ? [selectedRef.current, pathEndRef.current] : undefined
      const result = await runOverlay(kind, {
        visibleIds: [...nodeByIdRef.current.keys()],
        revision: revisionRef.current,
        pathEnds: ends,
      })
      if (result.answer === null) {
        // Refused or absent: the graph keeps its prior look, and the state says why.
        setOverlays((prev) => ({ ...prev, [kind]: result.state }))
        if (kind === 'path') setPathMessage(result.state.reason ?? null)
        return
      }
      setOverlays((prev) => ({ ...prev, [kind]: result.state }))
      applyAnswer(result.answer)
    },
    [applyAnswer],
  )
  const pathEndRef = useRef(pathEnd)
  pathEndRef.current = pathEnd
  const revisionRef = useRef(revision)
  revisionRef.current = revision

  const clearOverlay = useCallback(
    (kind: OverlayKind) => {
      if (kind === 'path') {
        clearPath()
        return
      }
      if (kind === 'shape') overlayRef.current = { ...overlayRef.current, rings: null }
      else {
        setOverlayMix(0)
        overlayRef.current = {
          ...overlayRef.current,
          colors: overlayRef.current.colors,
          sizes: overlayRef.current.sizes,
        }
      }
      setOverlays((prev) => ({ ...prev, [kind]: idleOverlay(kind) }))
      refresh()
      paintRefStable.current()
    },
    [clearPath, refresh, setOverlayMix],
  )

  // Escape clears the path and the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (selectedRef.current || overlayRef.current.path)) clearSelectionRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Read-only probe for the browser tests. Only present when the page opts in before load.
  useEffect(() => {
    const w = window as unknown as { __OVERSTORY_GRAPH_PROBE__?: boolean; __overstoryGraphProbe?: unknown }
    if (!w.__OVERSTORY_GRAPH_PROBE__) return
    w.__overstoryGraphProbe = {
      positions: () => {
        const sigma = sigmaRef.current
        const out: Record<string, { x: number; y: number; size: number; alpha: number }> = {}
        graphRef.current.forEachNode((id, a) => {
          const v = sigma ? sigma.graphToViewport({ x: a.x, y: a.y }) : { x: a.x, y: a.y }
          out[id] = { x: v.x, y: v.y, size: a.size, alpha: controllerRef.current.alpha(id) }
        })
        return out
      },
      // The committed visible set; nodes still tweening out are in `rendered` only.
      // Graph-space positions, free of camera motion.
      graphPositions: () => {
        const out: Record<string, { x: number; y: number }> = {}
        graphRef.current.forEachNode((id, a) => {
          out[id] = { x: a.x, y: a.y }
        })
        return out
      },
      ids: () => graphRef.current.nodes().filter((id) => !leavingRef.current.has(id)),
      rendered: () => graphRef.current.nodes(),
      running: () => controllerRef.current.running,
      select: (id: string) => {
        selectNodeRef.current(id, true)
      },
      pathEnd: (id: string) => {
        setPathEnd(id)
      },
      expand: (id: string) => expandRef.current(id),
      collapse: (id: string) => {
        collapseRef.current(id)
      },
      class: (id: string) => (graphRef.current.hasNode(id) ? graphRef.current.getNodeAttribute(id, 'type') : null),
      color: (id: string) => (graphRef.current.hasNode(id) ? graphRef.current.getNodeAttribute(id, 'color') : null),
      overlay: () => ({
        colors: overlayRef.current.colors ? Object.fromEntries(overlayRef.current.colors) : null,
        rings: overlayRef.current.rings ? Object.fromEntries(overlayRef.current.rings) : null,
        pathProgress: overlayRef.current.path?.progress ?? null,
      }),
      labelled: () => [...labelSetRef.current],
      setting: (name: string) =>
        sigmaRef.current ? (sigmaRef.current.getSetting as (n: string) => unknown)(name) : undefined,
    }
  })

  const stale = useMemo(
    () => ({
      community: isStale(overlays.community, revision),
      centrality: isStale(overlays.centrality, revision),
      path: isStale(overlays.path, revision),
      shape: isStale(overlays.shape, revision),
    }),
    [overlays, revision],
  )

  const relayout = useCallback(() => {
    // Re-run the sync effect's layout for the current set by nudging the model: a no-op change.
    pendingRef.current = null
    setNonce((n) => n + 1)
  }, [])

  return {
    containerRef,
    paintRef,
    sigmaRef,
    graph: graphRef.current,
    revision,
    controller,
    displayNodes,
    displayRels,
    extra,
    selectedId,
    pathEnd,
    setPathEnd,
    hiddenClasses,
    isolated,
    toggleClass,
    isolateClass,
    notice,
    live,
    expand,
    collapse,
    selectNode,
    clearSelection,
    overlays,
    stale,
    pathMessage,
    overlayView,
    runOverlayKind,
    clearOverlay,
    relayout,
    labelOf: (id: string) => nodeLabelOf(nodeById.get(id), id),
    typeOf: (id: string) => {
      const n = nodeById.get(id)
      return n ? resolveNodeType(n) : ''
    },
    resetCamera: () => {
      void sigmaRef.current
        ?.getCamera()
        .animatedReset({ duration: controller.reduced ? 0 : controller.config.focusMs })
    },
    motionPref,
  }
}
