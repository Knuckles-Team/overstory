import type { OverlayKind, OverlayState } from '@/lib/graph-overlays'
import { OVERLAY_KINDS } from '@/lib/graph-overlays'

const LABELS: Record<OverlayKind, string> = {
  community: 'Communities',
  centrality: 'Centrality',
  path: 'Find path',
  shape: 'Shape validity',
}

interface GraphOverlayMenuProps {
  overlays: Record<OverlayKind, OverlayState>
  stale: Record<OverlayKind, boolean>
  /** True when two nodes are selected, which a path needs. */
  canFindPath: boolean
  pathMessage: string | null
  onRun: (kind: OverlayKind) => void
  onClear: (kind: OverlayKind) => void
}

/**
 * Menu of the analytic overlays (OVERSTORY-APPS-R030.12). Each button asks the engine through Arbora.
 * A refused or absent overlay says why and leaves the graph as it was; a stale one offers Refresh.
 */
export function GraphOverlayMenu({
  overlays,
  stale,
  canFindPath,
  pathMessage,
  onRun,
  onClear,
}: GraphOverlayMenuProps) {
  return (
    <details
      aria-label="Graph overlays"
      data-testid="graph-overlay-menu"
      className="absolute left-4 top-14 z-20 max-w-[16rem] rounded-lg border border-border bg-card/90 p-2 text-xs shadow-lg backdrop-blur-sm"
    >
      <summary className="cursor-pointer font-semibold text-foreground">Overlays</summary>
      <div className="mt-1 flex flex-col gap-1">
        {OVERLAY_KINDS.map((kind) => {
          const state = overlays[kind]
          const on = state.status === 'ready'
          const disabled = (kind === 'path' && !canFindPath) || state.status === 'loading'
          return (
            <div key={kind} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`graph-overlay-${kind}`}
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => {
                    if (on) onClear(kind)
                    else onRun(kind)
                  }}
                  className="flex-1 rounded border border-border px-2 py-1 text-left text-foreground hover:bg-accent disabled:opacity-50 aria-pressed:bg-accent"
                >
                  {LABELS[kind]}
                  {state.status === 'loading' ? ' …' : ''}
                </button>
                {stale[kind] ? (
                  <>
                    <span
                      data-testid={`graph-overlay-${kind}-stale`}
                      className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-600 dark:text-amber-400"
                    >
                      Stale
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onRun(kind)
                      }}
                      className="rounded border border-border px-1.5 py-0.5 hover:bg-accent"
                    >
                      Refresh
                    </button>
                  </>
                ) : null}
              </div>
              {state.status === 'unavailable' || state.status === 'refused' ? (
                <p data-testid={`graph-overlay-${kind}-reason`} className="px-1 text-muted-foreground">
                  {state.status === 'unavailable' ? 'Not available' : 'Refused'}: {state.reason ?? 'no reason given'}
                </p>
              ) : null}
            </div>
          )
        })}
        {kindHelp(canFindPath)}
        {pathMessage ? (
          <p data-testid="graph-path-message" role="status" className="px-1 font-medium text-foreground">
            {pathMessage}
          </p>
        ) : null}
      </div>
    </details>
  )
}

function kindHelp(canFindPath: boolean) {
  return canFindPath ? null : (
    <p className="px-1 text-[10px] text-muted-foreground">
      Select a node, then Shift+click a second one to find a path.
    </p>
  )
}
