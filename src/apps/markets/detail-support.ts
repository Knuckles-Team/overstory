/**
 * @file detail-support.ts
 * @description Typed detail-view contract (OVERSTORY-R001.1, OVERSTORY-R008.1). The
 * instrument detail view offers Chart, Rates, News, Notes, Dividends, and
 * Analysis tabs, but only the tabs, intervals, and data types the
 * underlying series actually supports; every unsupported combination gets
 * an explanatory reason rather than being silently rendered or hidden with
 * no explanation. Wiring these pure checks into ChartPage/tab components is
 * OVERSTORY-R001.2 / OVERSTORY-R008.2.
 */
import { TIMEFRAMES, type ChartResponse, type Timeframe } from './schemas'

export const DETAIL_TABS = ['chart', 'rates', 'news', 'notes', 'dividends', 'analysis'] as const
export type DetailTabId = (typeof DETAIL_TABS)[number]

/** What an instrument's series actually supports, independent of any UI. */
export interface SeriesCapabilities {
  dataTypes: readonly ('line' | 'candle')[]
  supportedTimeframes: readonly Timeframe[]
  hasVolume: boolean
  hasRates: boolean
  hasDividends: boolean
}

export interface ModeDecision {
  allowed: boolean
  reason?: string
}

/** Rates and Dividends tabs depend on instrument data; the rest are always offered. */
export function supportedDetailTabs(
  capabilities: SeriesCapabilities,
): ModeDecision & { tabs: readonly DetailTabId[] } {
  const tabs = DETAIL_TABS.filter((tab) => {
    if (tab === 'rates') return capabilities.hasRates
    if (tab === 'dividends') return capabilities.hasDividends
    return true
  })
  return { allowed: tabs.length > 0, tabs }
}

/** A requested chart mode is allowed only when the series capabilities actually support it. */
export function supportedChartMode(
  capabilities: SeriesCapabilities,
  requested: { timeframe: Timeframe; dataType: 'line' | 'candle'; showVolume: boolean },
): ModeDecision {
  if (!capabilities.dataTypes.includes(requested.dataType)) {
    return { allowed: false, reason: `${requested.dataType} data is not available for this instrument` }
  }
  if (!capabilities.supportedTimeframes.includes(requested.timeframe)) {
    return { allowed: false, reason: `${requested.timeframe} is not a supported interval for this instrument` }
  }
  if (requested.showVolume && !capabilities.hasVolume) {
    return { allowed: false, reason: 'volume is not available for this instrument' }
  }
  return { allowed: true }
}

/**
 * What the loaded series supports, read from the response itself. The engine
 * rolls a finer series up to any coarser timeframe, so an interval is
 * supported when it is the listing's own or coarser than its finest one. A
 * listing that reports no timeframe supports only the one on screen. Rates
 * and dividends are not served on this response, so they are reported absent.
 */
export function capabilitiesFromChart(chart: ChartResponse): SeriesCapabilities {
  const finest = TIMEFRAMES.findIndex((timeframe) => chart.listing.timeframes.includes(timeframe))
  return {
    dataTypes: ['candle'],
    supportedTimeframes: TIMEFRAMES.filter(
      (timeframe, index) => (finest >= 0 && index >= finest) || timeframe === chart.timeframe,
    ),
    hasVolume: chart.bars.some((bar) => bar.v > 0),
    hasRates: false,
    hasDividends: false,
  }
}
