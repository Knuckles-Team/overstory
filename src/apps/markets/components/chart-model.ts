/**
 * @file chart-model.ts
 * @description The ChartRenderer contract: one typed model any OHLC renderer
 * draws, and the registry the Markets pages and Atlas both resolve a renderer
 * from. The shipped renderer is SVG (no third-party chart runtime, testable in
 * the DOM, readable by assistive technology); another engine such as a canvas
 * library registers against the same interface without touching a caller.
 */
import type { ComponentType } from 'react'
import { decimate } from '../chart-contract'
import { tickDecimals } from '../format'
import type { ChartOverlay } from '../overlay-strategy'
import { alignOverlaysToBars, type AlignedOverlay } from '../overlay-wiring'
import type { ChartView, FlipMarker, LinePoint, MacroEvent, OhlcBar, TrailPoint } from '../schemas'

export type ChartPalette = 'convention' | 'cvd'

export interface ChartLine {
  id: string
  label: string
  points: LinePoint[]
}

export interface EventMarker {
  id: string
  t: number
  action: string
  title: string
}

export interface ChartModel {
  title: string
  timeframe: string
  bars: OhlcBar[]
  trail: TrailPoint[]
  /** Lines on the price scale (e.g. the 200-bar SMA). */
  overlays: ChartLine[]
  /** Lines in their own pane and scale (e.g. ATR): never a second y-axis. */
  panes: ChartLine[]
  /** Versioned, simulation-flagged markers, each pinned to a bar present in `bars`. */
  markers: AlignedOverlay[]
  flips: FlipMarker[]
  events: EventMarker[]
  showVolume: boolean
  showFlips: boolean
  /** The current trailing line: the flip level a close must cross. */
  flipLevel: number | null
  /** Price precision from the series' tick size; null lets the formatter choose. */
  priceDecimals: number | null
}

export interface ChartRendererProps {
  model: ChartModel
  palette: ChartPalette
}

export interface ChartRenderer {
  readonly id: string
  readonly label: string
  readonly component: ComponentType<ChartRendererProps>
}

const renderers = new Map<string, ChartRenderer>()

export function registerChartRenderer(renderer: ChartRenderer): void {
  renderers.set(renderer.id, renderer)
}

/** The named renderer, else the first registered one. */
export function resolveChartRenderer(id?: string): ChartRenderer | null {
  return (id ? renderers.get(id) : undefined) ?? renderers.values().next().value ?? null
}

function eventMarkers(events: readonly MacroEvent[]): EventMarker[] {
  return events
    .map((event) => ({ id: event.id, t: Date.parse(event.announced_at), action: event.action, title: event.title }))
    .filter((event) => Number.isFinite(event.t))
}

/** The most bars the renderer draws; a longer series is thinned for display only. */
export const MAX_DISPLAY_BARS = 2000

/** The engine's finalized flips as versioned overlay markers (never simulated). */
export function flipOverlays(chart: ChartView): ChartOverlay[] {
  return chart.flips.map((flip) => ({
    kind: 'flip',
    at: flip.at,
    bar_open_time: flip.bar_open,
    strategy_version: chart.state.indicator_version,
    simulated: false,
  }))
}

/**
 * The model for a Markets chart response and the layers the person chose.
 * Bars are thinned with `decimate` past `maxBars`; trail, flips and signal
 * state are passed through untouched, so decimation never changes the
 * finalized output. Overlay markers are aligned onto the surviving bars.
 */
export function chartModel(
  title: string,
  chart: ChartView,
  layers: ReadonlySet<string>,
  events: readonly MacroEvent[],
  options: { maxBars?: number; extraOverlays?: readonly ChartOverlay[] } = {},
): ChartModel {
  const bars = decimate(chart.bars, options.maxBars ?? MAX_DISPLAY_BARS)
  const overlays = layers.has('flips')
    ? [...flipOverlays(chart), ...(options.extraOverlays ?? [])]
    : [...(options.extraOverlays ?? [])]
  return {
    title,
    timeframe: chart.timeframe,
    bars,
    markers: alignOverlaysToBars(
      overlays,
      bars.map((bar) => bar.t),
    ),
    trail: layers.has('trail') ? chart.trail : [],
    overlays: layers.has('sma200') ? [{ id: 'sma200', label: 'SMA 200', points: chart.sma200 }] : [],
    panes: layers.has('atr') ? [{ id: 'atr', label: 'ATR 14', points: chart.atr }] : [],
    flips: chart.flips,
    events: layers.has('macro') ? eventMarkers(events) : [],
    showVolume: layers.has('volume'),
    showFlips: layers.has('flips'),
    flipLevel: layers.has('trail') ? chart.state.line : null,
    priceDecimals: tickDecimals(chart.tick_size),
  }
}
