/**
 * Browser adapter for the Arbora fleet status operation (`fleet.status`).
 * OVERSTORY-API-R012: replaces the host's `/api/enhanced/ecosystem/services`
 * route, which only forwarded to this operation.
 */
import { z } from 'zod'
import { invoke } from './invoke'

const fleetStatusSchema = z
  .object({ value: z.object({ children: z.record(z.string(), z.unknown()) }).loose() })
  .loose()

/** Names of the fleet servers Arbora reports, sorted and de-duplicated. */
export async function listFleetServices(): Promise<string[]> {
  const status = await invoke('fleet.status', {}, fleetStatusSchema)
  return Object.keys(status.value.children)
    .filter((name) => name.length > 0 && name.length <= 256)
    .sort()
}
