/**
 * Browser adapter for the Arbora `query.uql` operation. OVERSTORY-API-R012:
 * replaces the host's `/api/enhanced/graph/query` route. The text is UQL; no
 * Cypher reaches the operation, and read-only enforcement is Arbora's.
 */
import { z } from 'zod'
import { invoke } from './invoke'

const uqlResultSchema = z.unknown()
const ROW_KEYS = ['results', 'hits', 'items', 'rows', 'tasks', 'sources', 'servers'] as const

/** Project an operation value onto a list of row objects. */
export function uqlRows(value: unknown): Record<string, unknown>[] {
  let rows: unknown = value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const key = ROW_KEYS.find((k) => Array.isArray(record[k]))
    rows = key ? record[key] : [record]
  }
  if (!Array.isArray(rows)) return []
  return rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
}

/** Run one UQL text and return its rows. */
export async function runUql(
  text: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const value = await invoke('query.uql', { text, params }, uqlResultSchema, { signal })
  return uqlRows(value)
}
