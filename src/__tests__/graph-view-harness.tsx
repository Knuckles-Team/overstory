import type { ReactNode } from 'react'
import GraphView from '@/components/views/GraphView'
import { PageContextProvider } from '@/lib/page-context'
import { renderWithProviders } from '@/__tests__/fixtures'

/** Shared mount for the graph edit tests: GraphView with the force canvas replaced by edit buttons. */
export function renderGraphView(ui: ReactNode = <GraphView />) {
  return renderWithProviders(
    <PageContextProvider route="/graph" view="graph">
      {ui}
    </PageContextProvider>,
  )
}
