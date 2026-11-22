/**
 * @file DetailTabStrip.tsx
 * @description The instrument detail view's six tabs (OVERSTORY-R001.2.1):
 * Chart, Rates, News, Notes, Dividends and Analysis. `supportedDetailTabs`
 * (OVERSTORY-R001.1) decides the offered set from the instrument's series
 * capabilities; a withheld tab stays visible and disabled, and the list
 * below the strip states why — the same convention as the chart toolbar's
 * unavailable options.
 */
import { cn } from '@/lib/utils'
import { DETAIL_TABS, type DetailTabId } from '../detail-support'

const TAB_LABEL: Record<DetailTabId, string> = {
  chart: 'Chart',
  rates: 'Rates',
  news: 'News',
  notes: 'Notes',
  dividends: 'Dividends',
  analysis: 'Analysis',
}

/** The one reason each tab can be withheld with; the offered tabs have none. */
const WITHHELD_REASON: Record<DetailTabId, string> = {
  chart: '',
  rates: 'Rates are not available for this instrument',
  news: '',
  notes: '',
  dividends: 'Dividends are not available for this instrument',
  analysis: '',
}

export function DetailTabStrip({
  offered,
  value,
  onChange,
}: {
  offered: readonly DetailTabId[]
  value: DetailTabId
  onChange: (next: DetailTabId) => void
}) {
  const isOffered = (tab: DetailTabId) => offered.includes(tab)
  return (
    <div role="group" aria-label="Detail tabs" className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            disabled={!isOffered(tab)}
            aria-pressed={value === tab}
            onClick={() => {
              onChange(tab)
            }}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              value === tab ? 'bg-primary/15 font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent',
              !isOffered(tab) && 'cursor-not-allowed opacity-50 hover:bg-transparent',
            )}
          >
            {TAB_LABEL[tab]}
          </button>
        ))}
      </div>
      {!isOffered('rates') || !isOffered('dividends') ? (
        <ul aria-label="Unavailable tabs" className="text-xs text-muted-foreground">
          {!isOffered('rates') && <li>Rates: {WITHHELD_REASON.rates}</li>}
          {!isOffered('dividends') && <li>Dividends: {WITHHELD_REASON.dividends}</li>}
        </ul>
      ) : null}
    </div>
  )
}
