/**
 * @file types.ts
 * @description Shared shapes between the city renderers and the UI layer
 * (OVERSTORY-CITY-R011/R015). Both renderers expose the same
 * {@link CityRenderer} handle so the page and the UI own no view-specific
 * code; the simulation core is the only writer of world state.
 */

/** What a click on a renderer hit: one character or one building. */
export interface SelectionHit {
  kind: 'character' | 'building'
  id: string
}

/** One renderer (3D scene or 2D schematic) of the same city. */
export interface CityRenderer {
  /** Draw one frame; `dtReal` is the real elapsed seconds. */
  render(dtReal: number): void
  /** Tear down all handles, listeners and GPU resources. */
  dispose(): void
  /** Ease the view toward one ground point (x, z). */
  focus(x: number, z: number): void
  /** Ease the view back to the city overview. */
  overview(): void
  /** Show a speech bubble above one character for a couple of seconds. */
  say(charId: string, text: string): void
  /** Fit the renderer to a new container size (CSS pixels). */
  onResize(width: number, height: number): void
  /** Reflect the current selection (ring / outline). */
  setSelected(hit: SelectionHit | null): void
  /**
   * Rebind layer references after the world was replaced (the replay seek,
   * R029). Stateless renderers (the 2D schematic) need no rebind.
   */
  resync?(): void
}

/** The activity mode the sim runs in (R026): quiet is the default. */
export type ActivityMode = 'quiet' | 'demo'

/** The user actions the UI panel invokes on behalf of the page. */
export interface CityActions {
  dispatch(): void
  onboard(connectorId: string): void
  focus(x: number, z: number): void
  overview(): void
  setSelected(hit: SelectionHit | null): void
  speed(value: number): void
  /** Switch the activity mode (R026); the page syncs the simulation. */
  setActivity(mode: ActivityMode): void
  /**
   * Swap the renderer view (R027): the 2D schematic is the top zoom level
   * and the accessible non-canvas view, not only a fallback.
   */
  setView(view: '3d' | '2d'): void
  /** Seek the recorded history to `offsetS` in-game seconds after boot (R029). */
  scrub(offsetS: number): void
  /** (Re)start the first-visit tour (R030). */
  startTour(): void
}

/** The static DOM handles the UI layer renders into (the page owns them). */
export interface CityUiElements {
  popList: HTMLElement
  inspector: HTMLElement
  feedList: HTMLElement
  /** R010: the "simulated activity" badge on the feed (clears on the first live event). */
  simBadge: HTMLElement
  /** R026: the activity-mode badge (quiet / demo). */
  activityBadge: HTMLElement
  clock: HTMLElement
  mode: HTMLElement
  banner: HTMLElement
  modal: HTMLElement
  /** R025: the always-available legend, derived from the one encoding table. */
  legend: HTMLElement
  /** R030: the first-visit tour panel. */
  tour: HTMLElement
  statPop: HTMLElement
  statKnow: HTMLElement
  statTools: HTMLElement
  statIncidents: HTMLElement
  statConnectors: HTMLElement
  btnDispatch: HTMLElement
  btnOverview: HTMLElement
  btnOnboard: HTMLElement
  /** R026: the labelled demo toggle. */
  btnDemo: HTMLElement
  /** R027: the 3D/2D view toggle. */
  btnView2d: HTMLElement
  btnView3d: HTMLElement
  /** R029: the time scrubber over the recorded action history. */
  scrubber: HTMLInputElement
  /** R029: the scrubber readout (replayed clock). */
  scrubberReadout: HTMLElement
  /** R030: the tour re-open control. */
  btnTour: HTMLElement
  speedButtons: HTMLElement[]
}
