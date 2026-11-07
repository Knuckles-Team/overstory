/**
 * Browser adapter for the Arbora `models.list` operation. OVERSTORY-API-R012:
 * replaces the host's `/api/enhanced/models`, `/llm/models` and
 * `/llm/embedding-models` routes. The operation uses the registry read scope, so
 * an ordinary session can list models; rows carry identity fields only.
 */
import { z } from 'zod'
import { invoke } from './invoke'

export type ModelKind = 'chat' | 'embedding'

const modelsResultSchema = z.object({
  value: z.object({ models: z.array(z.record(z.string(), z.unknown())) }).loose(),
})

/** The configured models of one kind as identity rows. */
export async function listModels(kind: ModelKind, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  const result = await invoke('models.list', { kind }, modelsResultSchema, { signal })
  return result.value.models
}
