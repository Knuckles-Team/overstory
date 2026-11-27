/**
 * @file api.ts
 * @description The City app's typed client (`/api/apps/city/*`). Every
 * response passes its Zod schema at `fetchValidated`, the repo's one runtime
 * validation boundary (OVERSTORY-CITY-R003).
 */
import { fetchValidated } from '@/lib/api-validation'
import { cityFleetSchema, cityLayoutSchema, cityStatusSchema, layoutSavedSchema, type LayoutDoc } from './schemas'

const BASE = '/api/apps/city'

export function fetchCityStatus() {
  return fetchValidated(`${BASE}/status`, cityStatusSchema).then((data) => data)
}

export function fetchCityFleet() {
  return fetchValidated(`${BASE}/fleet`, cityFleetSchema).then((data) => data)
}

/** The stored layout override document (R032); a 503 absence rejects. */
export function fetchCityLayout() {
  return fetchValidated(`${BASE}/layout`, cityLayoutSchema).then((data) => data)
}

/**
 * Persist one layout override document through the served write operation
 * (R032); the ack carries the stored doc. A refusal or 503 rejects — the
 * caller leaves the city unchanged and reports the reason.
 */
export function saveCityLayout(doc: LayoutDoc) {
  return fetchValidated(`${BASE}/layout`, layoutSavedSchema, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(doc),
  }).then((data) => data)
}

// ---- Avatar presence (OVERSTORY-CITY-R023) ----------------------------------

/**
 * Publish one avatar heartbeat to the city-state (R023).
 * In sandbox mode the call is a no-op; in live mode it POSTs to the
 * avatar heartbeat endpoint.
 */
export async function publishAvatarHeartbeat(heartbeat: {
  avatarId: string
  position: { x: number; z: number }
  heading: number
  activity: string
  timestamp: number
  zone: string
}): Promise<void> {
  try {
    await fetch(`${BASE}/avatar/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(heartbeat),
    })
  } catch {
    console.warn('[city-avatar] heartbeat POST failed')
  }
}

/**
 * Connect to the presence event stream (R023). Returns a function to
 * close the connection.  Each presence event fires `callback` with an
 * array of presence updates.
 */
export function subscribeAvatarPresence(
  callback: (
    updates: { type: 'heartbeat' | 'joined' | 'left' | 'updated'; avatar: Record<string, unknown> }[],
  ) => void,
): () => void {
  let closed = false
  try {
    const source = new EventSource(`${BASE}/avatar/presence`)
    source.addEventListener('presence-update', (event: MessageEvent) => {
      if (closed) return
      try {
        const data = JSON.parse(event.data as string) as { type: string; avatar: Record<string, unknown> }
        callback([{ ...data, type: data.type as 'heartbeat' | 'joined' | 'left' | 'updated' }])
      } catch {
        console.warn('[city-avatar] malformed presence event:', event.data)
      }
    })
    source.onerror = () => {
      // Stream error — the caller can retry; we do not crash the city.
      console.warn('[city-avatar] presence stream error')
    }
    return () => {
      closed = true
      source.close()
    }
  } catch {
    console.warn('[city-avatar] presence stream unavailable')
    return () => {
      /* absent: no-op */
    }
  }
}
