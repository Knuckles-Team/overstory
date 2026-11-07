/**
 * Browser adapter for the Arbora memory operations (`memory.write`,
 * `memory.delete`). OVERSTORY-API-R012: replaces the host's
 * `/api/enhanced/graph/memory` routes, which only forwarded to these
 * operations.
 */
import { z } from 'zod'
import { invoke } from './invoke'

const memoryResultSchema = z.object({}).loose()

/** Create or replace one memory entry under the caller's own principal. */
export async function writeMemory(key: string, value: Record<string, unknown>): Promise<void> {
  await invoke('memory.write', { key, value }, memoryResultSchema, { idempotencyKey: crypto.randomUUID() })
}

/** Delete one memory entry under the caller's own principal. */
export async function deleteMemory(key: string): Promise<void> {
  await invoke('memory.delete', { key }, memoryResultSchema, { idempotencyKey: crypto.randomUUID() })
}
