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
}

/** The user actions the UI panel invokes on behalf of the page. */
export interface CityActions {
  dispatch(): void
  onboard(connectorId: string): void
  focus(x: number, z: number): void
  overview(): void
  setSelected(hit: SelectionHit | null): void
  speed(value: number): void
}

/** The static DOM handles the UI layer renders into (the page owns them). */
export interface CityUiElements {
  popList: HTMLElement
  inspector: HTMLElement
  feedList: HTMLElement
  clock: HTMLElement
  mode: HTMLElement
  banner: HTMLElement
  modal: HTMLElement
  statPop: HTMLElement
  statKnow: HTMLElement
  statTools: HTMLElement
  statIncidents: HTMLElement
  statConnectors: HTMLElement
  btnDispatch: HTMLElement
  btnOverview: HTMLElement
  btnOnboard: HTMLElement
  speedButtons: HTMLElement[]
}
