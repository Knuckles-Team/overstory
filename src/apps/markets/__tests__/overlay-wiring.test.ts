import { describe, expect, it } from 'vitest'
import { alignOverlaysToBars, decimationPreservesOverlayIdentity } from '../overlay-wiring'
import type { ChartOverlay } from '../overlay-strategy'
import { chartModel } from '../components/chart-model'
import { CHART } from './fixtures'

const FULL_BARS = [100, 200, 300, 400, 500, 600, 700, 800]
const DECIMATED_BARS = [100, 400, 800]

const TREND_FLIP: ChartOverlay = { kind: 'flip', at: 300, bar_open_time: 300, strategy_version: '4', simulated: false }
const DCA_BUY: ChartOverlay = { kind: 'dca_buy', at: 200, bar_open_time: 200, strategy_version: '4', simulated: false }
const COST_BASIS: ChartOverlay = {
  kind: 'cost_basis',
  at: 500,
  bar_open_time: 500,
  strategy_version: '4',
  simulated: false,
}
const MARGIN_SIM: ChartOverlay = {
  kind: 'margin_liquidation',
  at: 700,
  bar_open_time: 700,
  strategy_version: '2',
  simulated: true,
}
const FIXTURE = [TREND_FLIP, DCA_BUY, COST_BASIS, MARGIN_SIM]

describe('overlay-wiring (OVERSTORY-R010.2)', () => {
  // spec: OVERSTORY-R010.2
  it('aligns markers to the correct bars and versions in both full-resolution and decimated views', () => {
    const full = alignOverlaysToBars(FIXTURE, FULL_BARS)
    expect(full).toEqual([
      { overlay: TREND_FLIP, barOpenTime: 300 },
      { overlay: DCA_BUY, barOpenTime: 200 },
      { overlay: COST_BASIS, barOpenTime: 500 },
      { overlay: MARGIN_SIM, barOpenTime: 700 },
    ])

    const decimated = alignOverlaysToBars(FIXTURE, DECIMATED_BARS)
    // Each overlay pins to its nearest surviving bar, keeping kind/version/simulated intact.
    expect(decimated).toEqual([
      { overlay: TREND_FLIP, barOpenTime: 400 },
      { overlay: DCA_BUY, barOpenTime: 100 },
      { overlay: COST_BASIS, barOpenTime: 400 },
      { overlay: MARGIN_SIM, barOpenTime: 800 },
    ])
  })

  // spec: OVERSTORY-R010.2
  it('never changes an overlay kind, version, or simulation flag when the view is decimated', () => {
    expect(decimationPreservesOverlayIdentity(FIXTURE, FULL_BARS, DECIMATED_BARS)).toBe(true)
  })
})

// spec: OVERSTORY-R010.2
describe('overlay_wiring', () => {
  it('pins versioned markers onto bars of the full and the decimated chart model', () => {
    const layers = new Set(['flips'])
    const extra: ChartOverlay[] = [
      {
        kind: 'dca_buy',
        at: CHART.bars[1].t,
        bar_open_time: CHART.bars[1].t,
        strategy_version: '4',
        simulated: false,
      },
      {
        kind: 'margin_liquidation',
        at: CHART.bars[3].t,
        bar_open_time: CHART.bars[3].t,
        strategy_version: '4',
        simulated: true,
      },
    ]
    const full = chartModel('t', CHART, layers, [], { extraOverlays: extra })
    const thinned = chartModel('t', CHART, layers, [], { extraOverlays: extra, maxBars: 3 })
    expect(full.markers.map((m) => m.overlay.kind)).toEqual(['flip', 'dca_buy', 'margin_liquidation'])
    expect(full.markers[0].overlay.strategy_version).toBe(CHART.state.indicator_version)
    expect(full.markers[0].barOpenTime).toBe(CHART.flips[0].bar_open)
    const surviving = thinned.bars.map((bar) => bar.t)
    for (const marker of thinned.markers) expect(surviving).toContain(marker.barOpenTime)
    expect(thinned.markers.map((m) => [m.overlay.kind, m.overlay.strategy_version, m.overlay.simulated])).toEqual(
      full.markers.map((m) => [m.overlay.kind, m.overlay.strategy_version, m.overlay.simulated]),
    )
  })
})
