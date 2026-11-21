/**
 * @file MapPanel.tsx
 * @description The map panel (OVERSTORY-DASH-R003): plots rows that carry latitude and
 * longitude columns on a plain equirectangular grid. No tile service is contacted.
 * Rows with a missing or out-of-range coordinate are listed as skipped, and the
 * points always come with a data-table alternative.
 */
import type { RowSet } from '@/lib/dashboards/query'
import { DataTable } from './DataTable'

const W = 400
const H = 200
const LAT_NAMES = ['latitude', 'lat']
const LON_NAMES = ['longitude', 'lon', 'lng', 'long']

function findColumn(columns: readonly string[], names: readonly string[]): string | null {
  return columns.find((column) => names.includes(column.toLowerCase())) ?? null
}

function coordinate(value: unknown, limit: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null
}

export function MapPanel({ title, data }: { title: string; data: RowSet }) {
  const latColumn = findColumn(data.columns, LAT_NAMES)
  const lonColumn = findColumn(data.columns, LON_NAMES)
  if (!latColumn || !lonColumn) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        A map needs a latitude column and a longitude column; this result has {data.columns.join(', ') || 'none'}.
      </p>
    )
  }
  const points = data.rows.flatMap((row) => {
    const lat = coordinate(row[latColumn], 90)
    const lon = coordinate(row[lonColumn], 180)
    return lat === null || lon === null ? [] : [{ lat, lon }]
  })
  const skipped = data.rows.length - points.length
  const summary = `Map of ${title}: ${String(points.length)} point${points.length === 1 ? '' : 's'} by ${latColumn} and ${lonColumn}.`
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label={summary} className="h-auto w-full">
        <rect width={W} height={H} className="fill-muted/40 stroke-border" />
        <line x1={W / 2} x2={W / 2} y1={0} y2={H} className="stroke-border" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-border" />
        {points.map((point, index) => (
          <circle
            key={`${String(index)}-${String(point.lat)}-${String(point.lon)}`}
            cx={((point.lon + 180) / 360) * W}
            cy={((90 - point.lat) / 180) * H}
            r={3}
            className="fill-primary"
          />
        ))}
      </svg>
      {skipped > 0 && (
        <p role="status" className="text-xs text-muted-foreground">
          {String(skipped)} row{skipped === 1 ? '' : 's'} skipped: missing or out-of-range coordinates.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Data table</summary>
        <DataTable data={data} caption={`${title} data`} />
      </details>
    </figure>
  )
}
