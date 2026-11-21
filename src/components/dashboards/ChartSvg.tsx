/**
 * @file ChartSvg.tsx
 * @description A small accessible SVG line or bar chart (OVERSTORY-DASH-R014). Series use
 * theme tokens (`currentColor` from `text-primary`), line charts add point markers, and
 * the figure carries a text summary, so no meaning rests on color alone.
 */
const W = 400
const H = 180
const PAD = { l: 44, r: 12, t: 12, b: 28 }

export interface ChartSvgProps {
  kind: 'line' | 'bar' | 'pie'
  labels: readonly string[]
  values: readonly number[]
  summary: string
}

function ticks(min: number, max: number): number[] {
  if (min === max) return [min]
  return [min, (min + max) / 2, max]
}

function fmt(value: number): string {
  return Math.abs(value) >= 1_000
    ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : String(Math.round(value * 100) / 100)
}

const PIE_R = 70
const SLICE_CLASSES = [
  'fill-primary',
  'fill-primary/80',
  'fill-primary/60',
  'fill-primary/45',
  'fill-primary/30',
  'fill-primary/20',
]

/** Pie slices over the positive values, each with its label and share in the legend (no color-only meaning). */
function PieChart({ labels, values, summary }: Omit<ChartSvgProps, 'kind'>) {
  const slices = values.flatMap((value, index) => (value > 0 ? [{ value, label: labels[index] ?? '', index }] : []))
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  let angle = -Math.PI / 2
  const arcs = slices.map((slice, order) => {
    const share = slice.value / total
    const start = angle
    angle += share * 2 * Math.PI
    const end = angle
    const point = (a: number) => `${String(100 + PIE_R * Math.cos(a))},${String(90 + PIE_R * Math.sin(a))}`
    const large = share > 0.5 ? 1 : 0
    const d =
      share >= 1
        ? `M100,${String(90 - PIE_R)} a${String(PIE_R)},${String(PIE_R)} 0 1,1 -0.01,0 z`
        : `M100,90 L${point(start)} A${String(PIE_R)},${String(PIE_R)} 0 ${String(large)},1 ${point(end)} z`
    return { ...slice, share, d, className: SLICE_CLASSES[order % SLICE_CLASSES.length] }
  })
  return (
    <div className="flex flex-wrap items-center gap-3">
      <svg viewBox="0 0 200 180" role="img" aria-label={summary} className="h-auto w-40 text-primary">
        {arcs.map((arc) => (
          <path key={`${String(arc.index)}-${arc.label}`} d={arc.d} className={`${arc.className} stroke-background`} />
        ))}
      </svg>
      <ul aria-label="Pie legend" className="text-xs">
        {arcs.map((arc) => (
          <li key={`${String(arc.index)}-${arc.label}`}>
            {arc.label}: {fmt(arc.value)} ({String(Math.round(arc.share * 1000) / 10)}%)
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ChartSvg({ kind, labels, values, summary }: ChartSvgProps) {
  if (kind === 'pie') return <PieChart labels={labels} values={values} summary={summary} />
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const span = hi - lo === 0 ? 1 : hi - lo
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const y = (v: number) => PAD.t + innerH - ((v - lo) / span) * innerH
  const step = values.length > 1 ? innerW / (values.length - 1) : innerW
  const barW = Math.max(2, (innerW / Math.max(values.length, 1)) * 0.7)
  const xLine = (i: number) => PAD.l + (values.length > 1 ? i * step : innerW / 2)
  const xBar = (i: number) => PAD.l + (i + 0.5) * (innerW / values.length)
  const labelEvery = Math.max(1, Math.ceil(values.length / 6))
  return (
    <svg
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      role="img"
      aria-label={summary}
      className="h-auto w-full text-primary"
    >
      {ticks(lo, hi).map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
          <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
            {fmt(t)}
          </text>
        </g>
      ))}
      {kind === 'line' ? (
        <>
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            points={values.map((v, i) => `${String(xLine(i))},${String(y(v))}`).join(' ')}
          />
          {values.map((v, i) => (
            <circle key={`${String(i)}-${labels[i] ?? ''}`} cx={xLine(i)} cy={y(v)} r={3} fill="currentColor" />
          ))}
        </>
      ) : (
        values.map((v, i) => (
          <rect
            key={`${String(i)}-${labels[i] ?? ''}`}
            x={xBar(i) - barW / 2}
            width={barW}
            y={Math.min(y(v), y(0))}
            height={Math.abs(y(v) - y(0))}
            fill="currentColor"
          />
        ))
      )}
      {labels.map((label, i) =>
        i % labelEvery === 0 ? (
          <text
            key={`${String(i)}-${label}`}
            x={kind === 'line' ? xLine(i) : xBar(i)}
            y={H - 10}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px]"
          >
            {label.slice(0, 10)}
          </text>
        ) : null,
      )}
    </svg>
  )
}
