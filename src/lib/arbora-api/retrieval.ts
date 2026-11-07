/**
 * Browser adapter for the Arbora `retrieval.search` operation.
 * OVERSTORY-API-R012: replaces the host's `/api/enhanced/graph/magma` and
 * `/api/enhanced/graph/search` routes, which only forwarded to it.
 */
import { z } from 'zod'
import { invoke } from './invoke'

const retrievalSchema = z
  .object({
    value: z
      .object({
        hits: z.array(z.object({ ref: z.string(), text: z.string(), tokens: z.number() }).loose()),
      })
      .loose(),
  })
  .loose()

export interface RetrievalHit {
  readonly ref: string
  readonly text: string
  readonly tokens: number
}

/** Retrieve passages for a query under the caller's own tenant and authority. */
export async function searchRetrieval(query: string): Promise<RetrievalHit[]> {
  const result = await invoke('retrieval.search', { query }, retrievalSchema)
  return result.value.hits.map(({ ref, text, tokens }) => ({ ref, text, tokens }))
}
