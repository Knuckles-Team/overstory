/**
 * @file query-kinds.ts
 * @description The panel query runners for natural-language, fleet-call and engine-operation
 * queries (OVERSTORY-DASH-R005). Each runner re-validates its arguments with a strict
 * schema, then calls one arbora served operation through the shared `invoke`; the
 * browser contacts no source. Every kind returns the same row set a UQL panel does.
 */
import { z } from 'zod'
import { invoke } from '@/lib/arbora-api/invoke'
import { uqlRows } from '@/lib/arbora-api/uql'
import { QuerySchema, type PanelQuery } from './model'
import type { Cell, QueryOutcome } from './query'

export const PANEL_ROW_CAP = 500

type NlQuery = Extract<PanelQuery, { kind: 'nl' }>
type FleetCallQuery = Extract<PanelQuery, { kind: 'fleet-call' }>
type EgOpQuery = Extract<PanelQuery, { kind: 'eg-op' }>

const resultSchema = z.unknown()

function cell(value: unknown): Cell {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return JSON.stringify(value).slice(0, 200)
}

/** Shape an operation value into a panel outcome: ok, or an honest empty note. */
export function outcomeFromValue(value: unknown): QueryOutcome {
  const rows = uqlRows(value)
    .slice(0, PANEL_ROW_CAP)
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, v]) => [key, cell(v)])))
  if (rows.length === 0) return { state: 'empty', note: 'The query returned no rows.' }
  return { state: 'ok', data: { columns: [...new Set(rows.flatMap((row) => Object.keys(row)))], rows } }
}

/** `eg.query.NlQuery`: the engine's natural-language planner; the graph comes from the session. */
export async function runNlQuery(query: NlQuery, signal: AbortSignal): Promise<QueryOutcome> {
  const checked = QuerySchema.parse(query)
  if (checked.kind !== 'nl') throw new Error('not a natural-language query')
  return outcomeFromValue(await invoke('eg.query.NlQuery', { text: checked.text }, resultSchema, { signal }))
}

/** `fleet.call`: one named tool of one fleet server; the result is projected onto rows. */
export async function runFleetCall(query: FleetCallQuery, signal: AbortSignal): Promise<QueryOutcome> {
  const checked = QuerySchema.parse(query)
  if (checked.kind !== 'fleet-call') throw new Error('not a fleet-call query')
  const value = await invoke(
    'fleet.call',
    { server: checked.server, tool: checked.tool, arguments: checked.arguments },
    z.object({ value: z.unknown() }).loose(),
    { signal },
  )
  return outcomeFromValue(value.value)
}

/** A named `eg.query.*` operation with its own parameters. */
export async function runEgOp(query: EgOpQuery, signal: AbortSignal): Promise<QueryOutcome> {
  const checked = QuerySchema.parse(query)
  if (checked.kind !== 'eg-op') throw new Error('not an engine-operation query')
  return outcomeFromValue(await invoke(checked.op, checked.params, resultSchema, { signal }))
}
