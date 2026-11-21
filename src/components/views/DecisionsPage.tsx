import DecisionsView from '@/components/views/DecisionsView'
import { arboraDecisionsTransport } from '@/components/decisions/arbora-decisions-transport'

/** Route entry: mounts the decisions view on the Arbora transport (OVERSTORY-DECIDE-R001). */
export default function DecisionsPage() {
  return <DecisionsView transport={arboraDecisionsTransport} />
}
