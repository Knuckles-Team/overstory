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
