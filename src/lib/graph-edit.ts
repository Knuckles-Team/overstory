/**
 * Closed client-side model for graph edit requests and presentation verdicts.
 *
 * The browser only describes an intended edit here. Arbora remains
 * responsible for authorization, mutation and the authoritative result.
 */
import { z } from 'zod'
import { ArboraApiError, invoke } from '@/lib/arbora-api/invoke'
import { encodeMsgpack } from '@/lib/msgpack-lite'

export const GRAPH_EDIT_KINDS = ['add', 'update', 'delete'] as const
export type GraphEditKind = (typeof GRAPH_EDIT_KINDS)[number]

export type GraphEditRequest =
  | {
      kind: 'add'
      labels: string[]
      properties: Record<string, unknown>
    }
  | {
      kind: 'update'
      id: string
      properties: Record<string, unknown>
    }
  | {
      kind: 'delete'
      id: string
    }

export const GRAPH_EDIT_VERDICTS = ['applied', 'refused', 'unavailable'] as const
export type GraphEditVerdict = (typeof GRAPH_EDIT_VERDICTS)[number]

export const VIEW_PERSONAS = ['operator', 'analyst', 'reader'] as const
export type ViewPersona = (typeof VIEW_PERSONAS)[number]

/** What a person sees after an edit: the engine verdict and its reason, never a local decision. */
export interface GraphEditResult {
  verdict: GraphEditVerdict
  /** The engine's reason for a refusal, or why the operation is not available. */
  reason: string
  /** The node id the engine accepted, for an applied add. */
  id?: string
}

/** One row of the visible edit log: the request, the verdict and the engine reason. */
export interface GraphEditLogEntry {
  sequence: number
  request: GraphEditRequest
  result: GraphEditResult
}

export const NOT_AVAILABLE_REASON = 'not available'

/** How a persona presents the same fetched graph. A persona never widens what the engine returns. */
export interface PersonaPresentation {
  label: string
  /** How many edit-log rows are shown. */
  logRows: number
  /** Node types preferred as the default filter, used only when the engine reports them. */
  preferredTypes: readonly string[]
}

export const PERSONA_PRESENTATION: Readonly<Record<ViewPersona, PersonaPresentation>> = {
  operator: { label: 'Operator', logRows: 50, preferredTypes: ['Agent', 'Service', 'WorkItem', 'RuntimeSignal'] },
  analyst: { label: 'Analyst', logRows: 10, preferredTypes: ['Concept', 'Document', 'Dataset', 'Entity'] },
  reader: { label: 'Reader', logRows: 3, preferredTypes: ['Document', 'Concept'] },
}

/** The default type filter of a persona: its first preferred type the engine actually reports, else none. */
export function personaDefaultFilter(persona: ViewPersona, reportedTypes: readonly string[]): string | null {
  return PERSONA_PRESENTATION[persona].preferredTypes.find((type) => reportedTypes.includes(type)) ?? null
}

/** Keep the nodes whose label or visible text contains `query`; an empty query keeps all. Narrows only. */
export function filterByLabelText<T extends { labels: string[]; properties: Record<string, unknown> }>(
  nodes: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...nodes]
  return nodes.filter((node) => {
    if (node.labels.some((label) => label.toLowerCase().includes(needle))) return true
    return Object.values(node.properties).some(
      (value) => typeof value === 'string' && value.toLowerCase().includes(needle),
    )
  })
}

const ADD_NODE = 'eg.graph.AddNode'
const REMOVE_NODE = 'eg.graph.RemoveNode'
const UNAVAILABLE_CODES = new Set(['UNKNOWN_OP', 'UNAVAILABLE', 'NOT_IMPLEMENTED', 'HTTP_UNAVAILABLE'])

function refusalReason(error: ArboraApiError): string {
  const detail = error.details.message ?? error.details.reason
  return typeof detail === 'string' && detail ? `${error.code}: ${detail}` : error.code
}

function toResult(error: unknown): GraphEditResult {
  if (error instanceof ArboraApiError) {
    if (UNAVAILABLE_CODES.has(error.code) || [404, 501, 503].includes(error.status))
      return { verdict: 'unavailable', reason: NOT_AVAILABLE_REASON }
    return { verdict: 'refused', reason: refusalReason(error) }
  }
  return { verdict: 'unavailable', reason: NOT_AVAILABLE_REASON }
}

const anyResult = z.unknown()

/**
 * Send one edit to Arbora and return the engine verdict. Nothing is decided
 * here: a refusal carries the engine's code, and an absent operation reads
 * "not available". An update has no served mutation shape yet, so it is
 * reported unavailable rather than guessed.
 */
export async function sendGraphEdit(request: GraphEditRequest, signal?: AbortSignal): Promise<GraphEditResult> {
  const options = { signal, idempotencyKey: crypto.randomUUID() }
  try {
    if (request.kind === 'add') {
      const id = `node_${crypto.randomUUID()}`
      const properties = { ...request.properties, labels: request.labels }
      await invoke(ADD_NODE, { node_id: id, properties_msgpack: encodeMsgpack(properties) }, anyResult, options)
      return { verdict: 'applied', reason: '', id }
    }
    if (request.kind === 'delete') {
      await invoke(REMOVE_NODE, { node_id: request.id }, anyResult, options)
      return { verdict: 'applied', reason: '', id: request.id }
    }
    return { verdict: 'unavailable', reason: NOT_AVAILABLE_REASON }
  } catch (error) {
    return toResult(error)
  }
}
