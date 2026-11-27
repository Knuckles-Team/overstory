import { createRoot } from 'react-dom/client'
import HostLogView from '../../../src/components/views/HostLogView'
import { fetchAuthSession } from '../../../src/lib/auth'
import { installCsrfToken } from '../../../src/lib/csrf'

// The production view with the app's own session bootstrap: the session's CSRF token
// is installed on the shared fetch, exactly as the identity session does at startup.
// Automatic polling is off so the journey drives each read.
async function start() {
  const { session } = await fetchAuthSession()
  installCsrfToken(session?.csrf_token ?? null)
  createRoot(document.getElementById('root')!).render(<HostLogView pollMs={0} />)
}

start().catch(() => undefined)
