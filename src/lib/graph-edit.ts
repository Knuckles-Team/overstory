/**
 * Closed client-side model for graph edit requests and presentation verdicts.
 *
 * The browser only describes an intended edit here. Graph OS/Arbora remains
 * responsible for authorization, mutation and the authoritative result.
 */

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
