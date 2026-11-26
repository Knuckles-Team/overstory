import { useMemo } from 'react'
import type { GraphNode } from './GraphAdapter'
import { styleOfNode } from './graph-sync'
import { colorOf, type ClassIndex, type ClassShape } from '@/lib/graph-semantics'

interface GraphLegendProps {
  nodes: GraphNode[]
  isDark: boolean
  /** Ontology classes of the composed schema; without them the legend colors by the hash of the type string. */
  classIndex?: ClassIndex | null
  /** Top-N distinct classes to name individually before collapsing the rest
   * into a single "Other" bucket — the KG has ~46 distinct node_type values
   * in production (RuntimeSignal, WorkItem, Concept, ... down a long tail),
   * so a 46-row legend would be useless; this keeps it scannable. */
  maxEntries?: number
  /** Classes the user switched off. Their nodes fade out and their edges follow. */
  hiddenClasses?: ReadonlySet<string>
  /** The class shown alone, if any. */
  isolated?: string | null
  onToggle?: (classKey: string) => void
  onIsolate?: (classKey: string) => void
}

interface LegendEntry {
  classKey: string
  label: string
  count: number
  color: string
  shape: ClassShape
}

/** SVG path of each class shape in a 10 x 10 box, so the legend repeats the shape channel of the canvas. */
const SHAPE_PATHS: Record<ClassShape, string> = {
  circle: 'M5 0.8a4.2 4.2 0 1 0 0.01 0z',
  square: 'M1.2 1.2h7.6v7.6H1.2z',
  diamond: 'M5 0.5L9.5 5L5 9.5L0.5 5z',
  triangle: 'M5 0.8L9.4 8.8H0.6z',
  hexagon: 'M2.6 1h4.8L9.6 5L7.4 9H2.6L0.4 5z',
  cross: 'M3.6 0.8h2.8v2.8h2.8v2.8H6.4v2.8H3.6V6.4H0.8V3.6h2.8z',
  star: 'M5 0.6l1.2 2.9 3.1.2-2.4 2 .8 3-2.7-1.7-2.7 1.7.8-3-2.4-2 3.1-.2z',
  ring: 'M5 0.8a4.2 4.2 0 1 0 0.01 0zM5 3a2 2 0 1 1-0.01 0z',
}

function ShapeGlyph({ shape, color }: { shape: ClassShape; color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 10 10" className="size-3 shrink-0">
      <path d={SHAPE_PATHS[shape]} fill={color} fillRule="evenodd" />
    </svg>
  )
}

/**
 * Class key for the legend: stable across theme changes and shared with the canvas fade.
 * Colors come from the SAME `styleOfNode` and `colorOf` the canvas uses, so the legend cannot drift.
 */
export function GraphLegend({
  nodes,
  isDark,
  classIndex = null,
  maxEntries = 8,
  hiddenClasses,
  isolated = null,
  onToggle,
  onIsolate,
}: GraphLegendProps) {
  const { entries, otherCount, otherTypeCount } = useMemo(() => {
    const counts = new Map<string, LegendEntry>()
    for (const node of nodes) {
      const style = styleOfNode(node, { classIndex })
      const key = style.classIri
      const existing = counts.get(key)
      if (existing) existing.count += 1
      else {
        counts.set(key, {
          classKey: key,
          label: style.label === 'unclassified' ? 'unclassified' : classIndex ? style.label : style.classIri,
          count: 1,
          color: colorOf(style, { isDark }),
          shape: style.shape,
        })
      }
    }
    const sorted = [...counts.values()].sort((a, b) => b.count - a.count)
    const top = sorted.slice(0, maxEntries)
    const rest = sorted.slice(maxEntries)
    return {
      entries: top,
      otherCount: rest.reduce((sum, e) => sum + e.count, 0),
      otherTypeCount: rest.length,
    }
  }, [nodes, isDark, maxEntries, classIndex])

  if (entries.length === 0) return null

  return (
    <div
      data-testid="graph-legend"
      className="absolute bottom-4 left-4 z-10 max-w-[13rem] rounded-lg border border-border bg-card/90 backdrop-blur-sm p-2.5 text-xs shadow-lg"
    >
      {/* "In view", not "Node types". These counts describe the bounded page
          of nodes the canvas is holding — not the graph. Labelling them as a
          type breakdown is exactly how a 256-row sample came to be read as the
          distribution of a 25,121-node graph; the real distribution now has its
          own panel (`NodeTypeBreakdown`, fed by `/graph/node-types`). */}
      <p className="mb-1.5 font-semibold text-foreground">In view</p>
      <p className="mb-1.5 text-[10px] leading-tight text-muted-foreground">
        Class key for the nodes on screen. Click toggles a class; Alt+click shows one alone.
      </p>
      <ul className="flex flex-col gap-1">
        {entries.map((entry) => {
          const off = hiddenClasses?.has(entry.classKey) === true || (isolated !== null && isolated !== entry.classKey)
          return (
            <li key={entry.classKey}>
              <button
                type="button"
                data-testid={`graph-legend-class-${entry.classKey}`}
                aria-pressed={!off}
                aria-label={`${entry.label}, ${String(entry.count)} ${entry.count === 1 ? 'node' : 'nodes'}, ${off ? 'hidden' : 'shown'}`}
                onClick={(e) => {
                  if (e.altKey) onIsolate?.(entry.classKey)
                  else onToggle?.(entry.classKey)
                }}
                className={`flex w-full items-center gap-1.5 rounded px-0.5 text-left text-foreground/90 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${off ? 'opacity-40 line-through' : ''}`}
              >
                <span data-testid="graph-legend-swatch" style={{ color: entry.color }} className="inline-flex">
                  <ShapeGlyph shape={entry.shape} color={entry.color} />
                </span>
                <span className="truncate" title={entry.label}>
                  {entry.label}
                </span>
                <span className="ml-auto tabular-nums text-muted-foreground">{entry.count}</span>
              </button>
            </li>
          )
        })}
        {otherCount > 0 && (
          <li className="flex items-center gap-1.5 text-muted-foreground" data-testid="graph-legend-other">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full border border-dashed border-muted-foreground"
            />
            <span className="truncate" title={`${String(otherTypeCount)} more class(es)`}>
              Other ({otherTypeCount})
            </span>
            <span className="ml-auto tabular-nums">{otherCount}</span>
          </li>
        )}
      </ul>
    </div>
  )
}
