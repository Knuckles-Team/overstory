/**
 * Incremental model of the visible set (OVERSTORY-APPS-R030.10.2, .3, .4).
 *
 * The view commits a new visible set to this graph first; motion follows. `diffVisible` names what
 * arrived and what left, `applyVisible` writes it without rebuilding the graph, so a retained node
 * keeps its position and the layout is seeded from where nodes are now.
 */
import Graph from 'graphology'
import type { GraphNode, GraphRelationship } from './GraphAdapter'
import { resolveNodeType } from './GraphAdapter'
import {
  classIriFor,
  colorOf,
  styleFor,
  styleForTypeString,
  type ClassIndex,
  type ClassShape,
  type ClassStyle,
} from '@/lib/graph-semantics'
import { edgeId } from '@/lib/graph-expand'

export interface ViewNodeAttributes {
  x: number
  y: number
  size: number
  color: string
  label: string
  /** Sigma node program: the class shape. */
  type: ClassShape
  nodeType: string
  classKey: string
  classLabel: string
  mass: number
  labelColor: string
  /** Hidden-neighbor count the engine reported; undefined when never read. */
  hiddenCount?: number
  pinned?: boolean
  [key: string]: unknown
}

export interface ViewEdgeAttributes {
  size: number
  color: string
  type?: string
  label?: string
  curvature?: number
  [key: string]: unknown
}

export type ViewGraph = Graph<ViewNodeAttributes, ViewEdgeAttributes>

export function createViewGraph(): ViewGraph {
  return new Graph<ViewNodeAttributes, ViewEdgeAttributes>({ multi: true, type: 'directed' })
}

export interface VisibleDiff {
  added: GraphNode[]
  removed: string[]
  retained: string[]
}

/** Which nodes arrived and which left, comparing `nodes` to the graph minus `leaving`. */
export function diffVisible(
  graph: ViewGraph,
  nodes: readonly GraphNode[],
  leaving: ReadonlySet<string> = new Set(),
): VisibleDiff {
  const wanted = new Set(nodes.map((n) => n.id))
  const added = nodes.filter((n) => !graph.hasNode(n.id) || leaving.has(n.id))
  const removed: string[] = []
  const retained: string[] = []
  graph.forEachNode((id) => {
    if (leaving.has(id)) return
    if (wanted.has(id)) retained.push(id)
    else removed.push(id)
  })
  return { added, removed, retained }
}

export interface StyleContext {
  classIndex: ClassIndex | null
  isDark: boolean
  labelColor: string
  edgeColor: string
}

/** The class style of a node: ontology class when the schema is read, the hash of the type string otherwise. */
export function styleOfNode(node: GraphNode, ctx: Pick<StyleContext, 'classIndex'>): ClassStyle {
  const type = resolveNodeType(node)
  if (!ctx.classIndex) return styleForTypeString(type)
  const iri = classIriFor(type, ctx.classIndex)
  return iri === null ? styleFor(type, ctx.classIndex.ancestry) : styleFor(iri, ctx.classIndex.ancestry)
}

const nodeLabel = (node: GraphNode): string =>
  typeof node.properties.name === 'string' ? node.properties.name : node.id.substring(0, 10)

/** Node size follows degree on a square-root scale from 6 to 22 pixels. */
export function sizeForDegree(degree: number, maxDegree: number): number {
  if (maxDegree <= 0) return 6
  return 6 + 16 * Math.sqrt(Math.max(0, degree) / maxDegree)
}

export function nodeAttributes(
  node: GraphNode,
  position: { x: number; y: number },
  ctx: StyleContext,
  hiddenCount?: number,
): ViewNodeAttributes {
  const style = styleOfNode(node, ctx)
  return {
    x: position.x,
    y: position.y,
    size: 6,
    color: colorOf(style, { isDark: ctx.isDark }),
    label: nodeLabel(node),
    type: style.shape,
    nodeType: resolveNodeType(node),
    classKey: style.slot === -1 ? 'unclassified' : style.rootIri === style.classIri ? style.classIri : style.classIri,
    classLabel: style.label,
    mass: 1,
    labelColor: ctx.labelColor,
    ...(hiddenCount === undefined ? {} : { hiddenCount }),
  }
}

/** Write the committed visible set into the graph. New nodes land at `seed(node)` with size 0 so growth starts clean. */
export function applyVisible(
  graph: ViewGraph,
  nodes: readonly GraphNode[],
  relationships: readonly GraphRelationship[],
  ctx: StyleContext,
  seed: (node: GraphNode, index: number) => { x: number; y: number },
  hidden: Readonly<Record<string, number>> = {},
  leaving: ReadonlySet<string> = new Set(),
): VisibleDiff {
  const diff = diffVisible(graph, nodes, leaving)
  diff.added.forEach((node, index) => {
    if (graph.hasNode(node.id)) return
    graph.addNode(node.id, { ...nodeAttributes(node, seed(node, index), ctx, hidden[node.id]), size: 0 })
  })
  for (const [id, count] of Object.entries(hidden)) {
    if (graph.hasNode(id)) graph.setNodeAttribute(id, 'hiddenCount', count)
  }
  // Edges: drop those whose key is gone, add new ones, curve parallel edges apart.
  const wanted = new Map<string, GraphRelationship>()
  for (const r of relationships) {
    if (graph.hasNode(r.source) && graph.hasNode(r.target)) wanted.set(edgeId(r.source, r.target, r.type), r)
  }
  graph.forEachEdge((key) => {
    if (!wanted.has(key)) graph.dropEdge(key)
  })
  const parallel = new Map<string, number>()
  for (const [key, r] of wanted) {
    const pair = r.source < r.target ? `${r.source}|${r.target}` : `${r.target}|${r.source}`
    const index = parallel.get(pair) ?? 0
    parallel.set(pair, index + 1)
    if (graph.hasEdge(key)) continue
    graph.addEdgeWithKey(key, r.source, r.target, {
      size: 1,
      color: ctx.edgeColor,
      type: index === 0 ? 'arrow' : 'curvedArrow',
      ...(index === 0 ? {} : { curvature: 0.25 * index }),
      label: r.type,
    })
  }
  // Degree-driven size for nodes that are not growing in. Growing nodes get their size at tween time.
  const maxDegree = graph
    .nodes()
    .reduce((m, id) => Math.max(m, graph.degree(id) + (graph.getNodeAttribute(id, 'hiddenCount') ?? 0)), 0)
  graph.forEachNode((id, attrs) => {
    if (attrs.size > 0 || diff.added.every((n) => n.id !== id)) {
      graph.setNodeAttribute(id, 'mass', 1 + graph.degree(id))
    }
  })
  graph.setAttribute('maxDegree', maxDegree)
  return diff
}

/** Target size of a node once visible. */
export function targetSize(graph: ViewGraph, id: string): number {
  const max = (graph.getAttribute('maxDegree') as number | undefined) ?? 0
  return sizeForDegree(graph.degree(id) + (graph.getNodeAttribute(id, 'hiddenCount') ?? 0), max)
}

/** Recolor in place after a theme, schema or overlay change. */
export function restyleAll(graph: ViewGraph, nodes: readonly GraphNode[], ctx: StyleContext): void {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  graph.forEachNode((id) => {
    const node = byId.get(id)
    if (!node) return
    const style = styleOfNode(node, ctx)
    graph.mergeNodeAttributes(id, {
      color: colorOf(style, { isDark: ctx.isDark }),
      type: style.shape,
      classKey: style.classIri,
      classLabel: style.label,
      labelColor: ctx.labelColor,
    })
  })
  graph.forEachEdge((key) => {
    graph.setEdgeAttribute(key, 'color', ctx.edgeColor)
  })
}
