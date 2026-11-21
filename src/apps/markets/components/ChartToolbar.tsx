/**
 * @file ChartToolbar.tsx
 * @description Timeframe, history range, layers and colour choice for a chart.
 */
import { supportedChartMode, type SeriesCapabilities } from '../detail-support'
import { LAYERS, RANGES, type Layer, type RangeCode, type Timeframe } from '../schemas'
import type { ChartSettings } from '../view-state'
import type { ChartPalette } from './chart-model'
import { Chips } from './Chips'

const TIMEFRAME_LABELS: { value: Timeframe; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '12h', label: '12h' },
  { value: '1D', label: 'D' },
  { value: '1W', label: 'W' },
  { value: '1M', label: 'M' },
]
const RANGE_LABELS = RANGES.map((value) => ({ value, label: value === 'all' ? 'All' : value }))
const LAYER_LABELS: Record<Layer, string> = {
  trail: 'Trend line',
  flips: 'Flip labels',
  volume: 'Volume',
  atr: 'ATR 14',
  sma200: 'SMA 200',
  macro: 'Macro events',
}

function toggled(layers: Layer[], layer: Layer): Layer[] {
  return layers.includes(layer)
    ? layers.filter((item) => item !== layer)
    : LAYERS.filter((item) => item === layer || layers.includes(item))
}

export function ChartToolbar({
  settings,
  onChange,
  palette,
  onPalette,
  capabilities,
}: {
  settings: ChartSettings
  onChange: (next: ChartSettings) => void
  palette: ChartPalette
  onPalette: (next: ChartPalette) => void
  /** What the loaded series supports; unsupported options are disabled with a visible reason. */
  capabilities?: SeriesCapabilities
}) {
  const timeframeReasons: Partial<Record<Timeframe, string>> = {}
  const layerReasons: Partial<Record<Layer, string>> = {}
  if (capabilities) {
    for (const { value } of TIMEFRAME_LABELS) {
      const decision = supportedChartMode(capabilities, { timeframe: value, dataType: 'candle', showVolume: false })
      if (!decision.allowed && decision.reason) timeframeReasons[value] = decision.reason
    }
    const volume = supportedChartMode(capabilities, {
      timeframe: settings.timeframe,
      dataType: 'candle',
      showVolume: true,
    })
    if (!volume.allowed && capabilities.supportedTimeframes.includes(settings.timeframe) && volume.reason) {
      layerReasons.volume = volume.reason
    }
  }
  const explained = [...Object.entries(timeframeReasons), ...Object.entries(layerReasons)]
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Chips
        label="Timeframe"
        options={TIMEFRAME_LABELS}
        selected={new Set([settings.timeframe])}
        disabledReasons={timeframeReasons}
        onToggle={(timeframe) => {
          onChange({ ...settings, timeframe })
        }}
      />
      <Chips
        label="History"
        options={RANGE_LABELS}
        selected={new Set<RangeCode>([settings.range])}
        onToggle={(range) => {
          onChange({ ...settings, range })
        }}
      />
      <Chips
        label="Layers"
        options={LAYERS.map((value) => ({ value, label: LAYER_LABELS[value] }))}
        selected={new Set(settings.layers)}
        disabledReasons={layerReasons}
        onToggle={(layer) => {
          onChange({ ...settings, layers: toggled(settings.layers, layer) })
        }}
      />
      <Chips
        label="Colours"
        options={[{ value: 'cvd', label: 'Colour-blind safe' }]}
        selected={new Set(palette === 'cvd' ? ['cvd'] : [])}
        onToggle={() => {
          onPalette(palette === 'cvd' ? 'convention' : 'cvd')
        }}
      />
      {explained.length > 0 && (
        <ul aria-label="Unavailable options" className="w-full text-xs text-muted-foreground">
          {explained.map(([option, reason]) => (
            <li key={option}>
              {option}: {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
