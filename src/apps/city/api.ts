/**
 * @file api.ts
 * @description The City app's typed client (`/api/apps/city/*`). Every
 * response passes its Zod schema at `fetchValidated`, the repo's one runtime
 * validation boundary (OVERSTORY-CITY-R003).
 */
import { fetchValidated } from '@/lib/api-validation'
import { cityFleetSchema, cityStatusSchema } from './schemas'

const BASE = '/api/apps/city'

export function fetchCityStatus() {
  return fetchValidated(`${BASE}/status`, cityStatusSchema).then((data) => data)
}

export function fetchCityFleet() {
  return fetchValidated(`${BASE}/fleet`, cityFleetSchema).then((data) => data)
}
