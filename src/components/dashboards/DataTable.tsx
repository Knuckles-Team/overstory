/**
 * @file DataTable.tsx
 * @description The text alternative every panel kind carries: a captioned table of the rows.
 */
import type { RowSet } from '@/lib/dashboards/query'

const TABLE_ROWS = 50

export function DataTable({ data, caption }: { data: RowSet; caption: string }) {
  const rows = data.rows.slice(0, TABLE_ROWS)
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {data.columns.map((c) => (
              <th key={c} scope="col" className="sticky top-0 border-b bg-card px-2 py-1 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-muted/40">
              {data.columns.map((c) => (
                <td key={c} className="px-2 py-1 align-top">
                  {String(row[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.rows.length > TABLE_ROWS && (
        <p className="p-1 text-xs text-muted-foreground">
          Showing {TABLE_ROWS} of {data.rows.length} rows.
        </p>
      )}
    </div>
  )
}
