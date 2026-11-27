import { createRoot } from 'react-dom/client'
import HostLogView from '../../../src/components/views/HostLogView'

// The production view; automatic polling is off so the journey drives each read.
createRoot(document.getElementById('root')!).render(<HostLogView pollMs={0} />)
