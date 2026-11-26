import React, { useEffect, useMemo, useState } from 'react'
import type { GraphNode, GraphRelationship } from './GraphAdapter'
import { GraphOverlayUI } from './GraphOverlayUI'
import { GraphLegend } from './GraphLegend'
import { GraphOverlayMenu } from './GraphOverlayMenu'
import { GraphNodeTable } from './GraphNodeTable'
import { renderGraphNodesOnlyViaEngine } from './engineGraphRender'
import { adaptVizResult } from '../views/dashboards/queries'
import { resolveThemeColors, useIsDarkMode } from './theme-colors'
import { useGraphScene } from './useGraphScene'
import type { LayoutWorkerFactory } from './layout-client'
import type { ClassesState } from './graph-read'
import { AccessibleImage } from '@/components/ai-elements/image'
import { STARTING_GRAPH_BUDGET, readGraphBudget, startsClustered, type GraphBudgetState } from '@/lib/graph-budget'
import { readClusterLevel, type ClusterReadState } from '@/lib/graph-expand'

interface GraphCanvasBaseProps {
  nodes: GraphNode[]
  relationships: GraphRelationship[]
  selectedNodeExternally?: GraphNode | null
  onSelectNode: (node: GraphNode | null) => void
  /**
   * Edge keys (`${source}|${target}`) that are expired at the current view.
   * Used by the temporal scrubber: matching edges render greyed + dashed via a
   * Sigma edge reducer. Optional — omitting it leaves edges rendered normally.
   */
  expiredEdges?: ReadonlySet<string>
  /** Render color for expired edges (defaults to the design-system grey). */
  expiredEdgeColor?: string
  /**
   * How many nodes the whole graph holds. The loaded `nodes` are a bounded sample, so the clustered start
   * is decided on this when it is known (OVERSTORY-APPS-R030.13.3).
   */
  totalNodes?: number
  /** Owner-published limits (OVERSTORY-APPS-R030.13.1). Absent means the starting defaults. */
  limits?: unknown
  /** Test seam: a layout worker factory. The default is the bundled worker. */
  layoutFactory?: LayoutWorkerFactory
  /** Class hierarchy read by the explore hook. Null colors by the hash of the type string. */
  classes?: ClassesState | null
}

/** Read-only consumers cannot provide mutation callbacks. Selection and camera remain available. */
type GraphCanvasProps = GraphCanvasBaseProps &
  (
    | { readOnly: true; onUpdateNode?: never; onDeleteNode?: never; onAddNode?: never }
    | {
        readOnly?: false
        onUpdateNode: (id: string, properties: Record<string, unknown>) => void
        onDeleteNode: (id: string) => void
        onAddNode: (labels: string[], properties: Record<string, unknown>) => void
      }
  )

/** Stable key for an edge, matching graphology's source/target ordering. */
export const edgeKey = (source: string, target: string): string => `${source}|${target}`

/**
 * Composite sigma's layered canvases (edges/nodes/labels/hovers/…, each a
 * separate `<canvas>` — `Sigma.getCanvases()`) into a single PNG data URL, so
 * a "Download PNG" button works for ANY view built on this canvas (report
 * row #31: PNG/screenshot export). Draws each layer 1:1 at its own native
 * pixel size (no CSS-vs-devicePixelRatio rescaling needed) over an opaque
 * background matching the canvas's current theme background so the export
 * isn't transparent. Returns `null` when sigma has no layers yet (nothing
 * rendered).
 */
export function compositeSigmaCanvasesToPngDataUrl(
  canvases: Record<string, HTMLCanvasElement>,
  backgroundColor = '#0f172a',
): string | null {
  const keys = Object.keys(canvases)
  if (keys.length === 0) return null
  const out = document.createElement('canvas')
  out.width = canvases[keys[0]].width
  out.height = canvases[keys[0]].height
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, out.width, out.height)
  // Known back-to-front render order first; any other/future layer key still
  // gets drawn (just potentially mis-ordered relative to the known layers).
  // `Object.hasOwn` (not a value-truthiness check) since every layer canvas
  // is itself always truthy — what varies is whether the key is present.
  const knownOrder = ['edges', 'edgeLabels', 'nodes', 'labels', 'hovers']
  for (const key of knownOrder) {
    if (Object.hasOwn(canvases, key)) ctx.drawImage(canvases[key], 0, 0)
  }
  for (const key of keys) {
    if (!knownOrder.includes(key)) ctx.drawImage(canvases[key], 0, 0)
  }
  return out.toDataURL('image/png')
}

// ── Renderer mode seam (D-VZ-1/GOC-88 KG-view adoption) ────────────────────
// Below the cluster threshold the interactive renderer is the default (hover/click/drag/select, animated
// expand and collapse). Above it the view opens on the engine's cluster nodes and expands by cluster
// (OVERSTORY-APPS-R030.13.3). When the engine refuses or cannot serve clusters, the view falls back to the
// node-only engine preview and says why; a preview never looks like a complete graph, and switching to it
// is also an explicit, visibly labeled user action from the toolbar.
type RenderMode = 'interactive' | 'clustered' | 'engine-preview'

type EnginePreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unavailable'; detail: string }
  | { status: 'no-data' }
  | { status: 'error'; message: string }
  | { status: 'ready'; dataUrl: string; rowCount: number }

/** Own the engine-preview render's async lifecycle: trigger it, and reset it whenever it would go stale. */
function useEnginePreview(nodeCount: number, effectiveMode: RenderMode) {
  const [enginePreview, setEnginePreview] = useState<EnginePreviewState>({ status: 'idle' })

  const runEnginePreview = async () => {
    setEnginePreview({ status: 'loading' })
    const r = await renderGraphNodesOnlyViaEngine(nodeCount, { title: 'Knowledge graph — node overview' })
    if (r.unavailable) {
      setEnginePreview({ status: 'unavailable', detail: r.error ?? '/graph/viz is not activated on this backend' })
      return
    }
    if (!r.ok) {
      setEnginePreview({ status: 'error', message: r.error ?? 'render failed' })
      return
    }
    const adapted = adaptVizResult(r.data)
    if (!adapted) {
      setEnginePreview({ status: 'error', message: 'Response did not carry a recognisable rendered image.' })
      return
    }
    if (adapted.rowCount === 0) {
      setEnginePreview({ status: 'no-data' })
      return
    }
    setEnginePreview({ status: 'ready', dataUrl: adapted.dataUrl, rowCount: adapted.rowCount })
  }

  // Reset the preview when the underlying node set changes size-class or the
  // component is asked to re-enter engine-preview mode — a stale image from a
  // previous graph must never linger under a "ready" caption.
  useEffect(() => {
    setEnginePreview({ status: 'idle' })
  }, [nodeCount, effectiveMode])

  return { enginePreview, runEnginePreview }
}

/** The clustered start: one level of engine clusters, read only when the graph is above the threshold. */
function useClusterStart(enabled: boolean): ClusterReadState | null {
  const [state, setState] = useState<ClusterReadState | null>(null)
  useEffect(() => {
    if (!enabled) {
      setState(null)
      return
    }
    const abort = new AbortController()
    readClusterLevel(1, abort.signal)
      .then((next) => {
        if (!abort.signal.aborted) setState(next)
      })
      .catch(() => {
        if (!abort.signal.aborted) setState({ status: 'unavailable', reason: 'not available' })
      })
    return () => {
      abort.abort()
    }
  }, [enabled])
  return state
}

interface EnginePreviewPaneProps {
  nodeCount: number
  enginePreview: EnginePreviewState
  onRunPreview: () => void
  /** Why the clustered start was not used, when it was refused or unavailable. */
  clusterReason?: string
}

/** The engine at-scale render mode's overlay: warning, trigger, and one state-typed result pane. */
function EnginePreviewPane({
  nodeCount,
  enginePreview,
  onRunPreview,
  clusterReason,
}: EnginePreviewPaneProps): React.ReactElement {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-card">
      <div className="max-w-lg w-full space-y-3 text-sm">
        {clusterReason ? (
          <div
            data-testid="graph-cluster-fallback"
            className="rounded-md border border-amber-500/50 bg-amber-50/10 p-3 text-foreground"
          >
            The clustered start is not available ({clusterReason}), so this view shows the node-only engine preview.
          </div>
        ) : null}
        <div className="rounded-md border border-amber-500/50 bg-amber-50/10 p-3 flex items-start gap-2">
          <span aria-hidden className="mt-0.5">
            ⚠
          </span>
          <p className="text-foreground">
            {String(nodeCount)} nodes exceeds the interactive layout's recommended size. The engine's graph-native
            render surface can preview node positions at scale, but{' '}
            <strong>cannot yet accept the graph&apos;s edges</strong> — a real, currently-open engine wire-contract
            limitation (only one dataset per render request; see{' '}
            <span className="font-mono">engineGraphRender.ts</span>), not a bug in this view. A preview never looks
            like a complete graph: it renders nodes only, and says so.
          </p>
        </div>

        {enginePreview.status === 'idle' ? (
          <div className="flex gap-2">
            <button
              data-testid="graph-engine-preview-run"
              onClick={onRunPreview}
              className="bg-slate-800 text-white px-3 py-2 rounded shadow hover:bg-slate-700 text-sm"
            >
              Preview node positions (engine, no edges)
            </button>
          </div>
        ) : enginePreview.status === 'loading' ? (
          <p className="text-muted-foreground">Rendering…</p>
        ) : enginePreview.status === 'unavailable' ? (
          <div
            data-testid="graph-engine-preview-unavailable"
            className="rounded-md border border-amber-500/50 bg-amber-50/10 p-3 text-foreground"
          >
            The <span className="font-mono">/graph/viz</span> route is not activated on this backend yet.{' '}
            {enginePreview.detail}
          </div>
        ) : enginePreview.status === 'no-data' ? (
          <div
            data-testid="graph-engine-preview-no-data"
            className="rounded-md border border-amber-500/50 bg-amber-50/10 p-3 text-foreground"
          >
            The engine returned zero rendered nodes for this dataset — not a fabricated empty image.
          </div>
        ) : enginePreview.status === 'error' ? (
          <pre
            data-testid="graph-engine-preview-error"
            className="rounded border border-destructive/50 bg-destructive/10 p-3 text-xs text-red-200 whitespace-pre-wrap break-words"
          >
            {enginePreview.message}
          </pre>
        ) : (
          <div className="space-y-2">
            <AccessibleImage
              src={enginePreview.dataUrl}
              alt={`Engine node-position preview of ${String(enginePreview.rowCount)} nodes (no edges)`}
              className="max-w-full rounded-md border border-border"
              data-testid="graph-engine-preview-image"
            />
            <p className="text-slate-400 text-xs">
              Engine preview — {enginePreview.rowCount.toLocaleString()} node positions only, edges omitted (engine
              limitation, not this graph's real topology).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  relationships,
  readOnly = false,
  onUpdateNode,
  onDeleteNode,
  onAddNode,
  selectedNodeExternally,
  onSelectNode,
  expiredEdges,
  expiredEdgeColor = '#4b5563',
  totalNodes,
  limits,
  layoutFactory,
  classes = null,
}) => {
  // Live theme: drives node/edge/label colors below and re-renders the
  // canvas the instant the user (or the system) toggles dark/light — see
  // theme-colors.ts's module doc for why sigma needs this pushed to it
  // explicitly (it draws on raw <canvas>, which can't see CSS variables).
  const isDark = useIsDarkMode()
  const budget: GraphBudgetState = useMemo(() => readGraphBudget(limits), [limits])

  const wholeGraph = totalNodes ?? nodes.length
  // The clustered start is decided on the size of the whole graph, so it needs that size: a caller that
  // only holds a loaded sample keeps the node-only preview recommendation for a sample above the threshold.
  const wantsClusters =
    totalNodes !== undefined && budget.status === 'ready' && startsClustered(budget.budget, totalNodes)
  const sampleTooLarge = nodes.length > STARTING_GRAPH_BUDGET.clusterThreshold
  const recommendedMode: RenderMode = wantsClusters ? 'clustered' : sampleTooLarge ? 'engine-preview' : 'interactive'
  const [modeOverride, setModeOverride] = useState<'auto' | RenderMode>('auto')
  const requestedMode: RenderMode = modeOverride === 'auto' ? recommendedMode : modeOverride
  const clusterState = useClusterStart(requestedMode === 'clustered')
  // Until the cluster read answers, nothing is drawn; a refusal or an absent operation falls back to the preview.
  const clusterFailed = clusterState !== null && clusterState.status !== 'ready'
  const effectiveMode: RenderMode = requestedMode === 'clustered' && clusterFailed ? 'engine-preview' : requestedMode
  const clusterReason = requestedMode === 'clustered' && clusterFailed ? clusterState.reason : undefined

  const sceneNodes = effectiveMode === 'clustered' && clusterState?.status === 'ready' ? clusterState.nodes : nodes
  const sceneRels =
    effectiveMode === 'clustered' && clusterState?.status === 'ready' ? clusterState.relationships : relationships

  const { enginePreview, runEnginePreview } = useEnginePreview(wholeGraph, effectiveMode)

  const scene = useGraphScene({
    nodes: sceneNodes,
    relationships: sceneRels,
    active: effectiveMode !== 'engine-preview',
    isDark,
    classes,
    budget,
    selectedExternally: selectedNodeExternally ?? null,
    onSelectNode,
    expiredEdges,
    expiredEdgeColor,
    layoutFactory,
    clustered: effectiveMode === 'clustered',
  })

  const downloadPng = () => {
    if (!scene.sigmaRef.current) return
    // Match the exported PNG's background to whatever the canvas is
    // actually showing right now (theme-resolved), not a permanently-dark
    // default — a light-mode export with a dark-navy background would look
    // broken next to the on-screen canvas.
    const layers: Record<string, HTMLCanvasElement> = { ...scene.sigmaRef.current.getCanvases() }
    if (scene.paintRef.current) layers.overlay = scene.paintRef.current
    const dataUrl = compositeSigmaCanvasesToPngDataUrl(layers, resolveThemeColors(isDark).card)
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `graph-${String(Date.now())}.png`
    link.click()
  }

  const noticeHere = scene.notice !== null && scene.notice.nodeId === scene.selectedId ? scene.notice : null
  const selectedHasRecord = scene.selectedId !== null && scene.extra.records.has(scene.selectedId)
  const modeLabel =
    effectiveMode === 'interactive'
      ? 'Renderer: Interactive (sigma)'
      : effectiveMode === 'clustered'
        ? 'Renderer: Clustered start (engine clusters)'
        : 'Renderer: At-scale (engine) — node preview'

  return (
    // `bg-card` (not a hardcoded slate) — this is the fix for the reported
    // defect: the canvas background now tracks the active theme (light/dark/
    // glass), and every color drawn onto it below (node fills, labels, edges)
    // is computed against THIS token, so they stay legible regardless of
    // which theme is active.
    <div className="relative w-full h-full bg-card rounded-lg overflow-hidden z-0">
      {/* The sigma container stays mounted in ALL modes (never unmount/remount
          it — sigma's own ref would otherwise go stale) — it's simply given no
          graph to attach to while in engine-preview mode, and visually covered by the
          engine-preview overlay below. */}
      <div
        ref={scene.containerRef}
        data-testid="graph-canvas"
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
      />
      {/* The one 2D layer above the renderer: badges, selection ring, shape rings and the path reveal. */}
      <canvas
        ref={scene.paintRef}
        aria-hidden
        data-testid="graph-paint-layer"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      {/* Polite live region: expand and collapse results stay available with motion off. */}
      <div aria-live="polite" aria-atomic="true" data-testid="graph-live-region" className="sr-only">
        {scene.live}
      </div>

      {/* Renderer-mode badge + manual override — ALWAYS visible, in every
          mode, so the active renderer is never ambiguous (silent switching
          between two renderers with different capabilities is its own
          defect). */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <span
          data-testid="graph-render-mode-badge"
          className="bg-slate-800/90 text-white text-xs px-2 py-1 rounded shadow"
        >
          {modeLabel}
          {modeOverride === 'auto' ? ` · ${String(wholeGraph)} nodes` : ' · manual'}
        </span>
        <button
          data-testid="graph-render-mode-toggle"
          onClick={() => {
            setModeOverride(effectiveMode === 'engine-preview' ? 'interactive' : 'engine-preview')
          }}
          className="bg-slate-800 text-white px-2 py-1 rounded shadow hover:bg-slate-700 text-xs"
        >
          Switch to {effectiveMode === 'engine-preview' ? 'interactive' : 'at-scale (engine)'}
        </button>
        {modeOverride !== 'auto' ? (
          <button
            onClick={() => {
              setModeOverride('auto')
            }}
            className="bg-slate-800 text-white px-2 py-1 rounded shadow hover:bg-slate-700 text-xs"
          >
            Reset to auto
          </button>
        ) : null}
      </div>

      {effectiveMode !== 'engine-preview' ? (
        <>
          {classes?.status === 'unavailable' ? (
            <p
              data-testid="graph-classes-notice"
              className="absolute left-4 top-24 z-10 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300"
            >
              {classes.notice}
            </p>
          ) : null}
          {budget.status === 'unavailable' ? (
            <p
              data-testid="graph-limits-notice"
              className="absolute left-4 top-32 z-10 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300"
            >
              {budget.notice}
            </p>
          ) : null}
          {requestedMode === 'clustered' && clusterState === null ? (
            <p className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 text-sm text-muted-foreground">
              Reading clusters…
            </p>
          ) : null}

          <GraphOverlayMenu
            overlays={scene.overlays}
            stale={scene.stale}
            canFindPath={scene.selectedId !== null && scene.pathEnd !== null}
            pathMessage={scene.pathMessage}
            onRun={(kind) => {
              void scene.runOverlayKind(kind)
            }}
            onClear={scene.clearOverlay}
          />

          {/* Per-node actions: the keyboard and pointer path to expand and collapse. */}
          {scene.selectedId ? (
            <div
              role="group"
              aria-label="Selected node actions"
              data-testid="graph-node-actions"
              className="absolute right-4 top-12 z-10 flex items-center gap-1 rounded-lg border border-border bg-card/90 p-1.5 text-xs shadow-lg backdrop-blur-sm"
            >
              <span className="max-w-[10rem] truncate px-1 font-medium text-foreground">
                {scene.labelOf(scene.selectedId)}
              </span>
              <button
                type="button"
                data-testid="graph-expand"
                onClick={() => {
                  if (scene.selectedId) void scene.expand(scene.selectedId)
                }}
                className="rounded border border-border px-2 py-1 hover:bg-accent"
              >
                Expand
              </button>
              <button
                type="button"
                data-testid="graph-collapse"
                disabled={!selectedHasRecord}
                onClick={() => {
                  if (scene.selectedId) scene.collapse(scene.selectedId)
                }}
                className="rounded border border-border px-2 py-1 hover:bg-accent disabled:opacity-50"
              >
                Collapse
              </button>
              {noticeHere ? (
                <span
                  data-testid="graph-expand-notice"
                  role="status"
                  className="px-1 text-amber-700 dark:text-amber-300"
                >
                  {noticeHere.text}
                </span>
              ) : null}
            </div>
          ) : scene.notice ? (
            <span
              data-testid="graph-expand-notice"
              role="status"
              className="absolute right-4 top-12 z-10 rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-700 dark:text-amber-300"
            >
              {scene.notice.text}
            </span>
          ) : null}

          {/* HUD Controls */}
          <div className="absolute bottom-4 right-4 flex gap-2 z-10">
            <button
              onClick={scene.relayout}
              className="bg-slate-800 text-white px-4 py-2 rounded shadow hover:bg-slate-700 text-sm"
            >
              Untangle Graph
            </button>
            <button
              onClick={scene.resetCamera}
              className="bg-slate-800 text-white px-4 py-2 rounded shadow hover:bg-slate-700 text-sm"
            >
              Reset View
            </button>
            <button
              onClick={downloadPng}
              className="bg-slate-800 text-white px-4 py-2 rounded shadow hover:bg-slate-700 text-sm"
            >
              Download PNG
            </button>
          </div>

          <GraphLegend
            nodes={scene.displayNodes}
            isDark={isDark}
            classIndex={classes?.status === 'ready' ? classes.index : null}
            hiddenClasses={scene.hiddenClasses}
            isolated={scene.isolated}
            onToggle={scene.toggleClass}
            onIsolate={scene.isolateClass}
          />

          <GraphNodeTable
            nodes={scene.displayNodes}
            graph={scene.graph}
            revision={scene.revision}
            selectedId={scene.selectedId}
            rings={null}
            onSelect={(id) => {
              scene.selectNode(id, true)
            }}
            onExpand={(id) => {
              void scene.expand(id)
            }}
            onCollapse={scene.collapse}
            canCollapse={(id) => scene.extra.records.has(id)}
          />

          {!readOnly && onUpdateNode && (
            <GraphOverlayUI
              selectedNode={selectedNodeExternally ?? null}
              onClose={() => {
                onSelectNode(null)
              }}
              onSave={(updatedProps: Record<string, unknown>) => {
                if (selectedNodeExternally) onUpdateNode(selectedNodeExternally.id, updatedProps)
                onSelectNode(null)
              }}
              onDelete={() => {
                if (selectedNodeExternally) onDeleteNode(selectedNodeExternally.id)
                onSelectNode(null)
              }}
              onAddNode={onAddNode}
            />
          )}
        </>
      ) : (
        <EnginePreviewPane
          nodeCount={wholeGraph}
          enginePreview={enginePreview}
          clusterReason={clusterReason}
          onRunPreview={() => {
            void runEnginePreview()
          }}
        />
      )}
    </div>
  )
}
