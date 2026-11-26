import { createArboraStore } from '@/lib/dashboards/store-arbora'
import DashboardsView from './DashboardsView'

/** One arbora store per page load, so each save sends the revision the last one returned. */
const arboraStore = createArboraStore()

/** Route entry: the Dashboards page saves through arbora and keeps the local fallback (OVERSTORY-DASH-R010). */
export default function DashboardsPage() {
  return <DashboardsView remote={arboraStore} />
}
