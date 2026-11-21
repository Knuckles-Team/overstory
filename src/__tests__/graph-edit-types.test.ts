import { describe, expect, it } from 'vitest'
import {
  GRAPH_EDIT_KINDS,
  GRAPH_EDIT_VERDICTS,
  PERSONA_PRESENTATION,
  VIEW_PERSONAS,
  type GraphEditRequest,
} from '@/lib/graph-edit'

describe('graph edit types', () => {
  // spec: OVERSTORY-APPS-R030.1
  it('test_edit_types_closed', () => {
    expect([...GRAPH_EDIT_KINDS]).toEqual(['add', 'update', 'delete'])
    expect([...GRAPH_EDIT_VERDICTS]).toEqual(['applied', 'refused', 'unavailable'])
    expect([...VIEW_PERSONAS]).toEqual(['operator', 'analyst', 'reader'])
    expect(Object.keys(PERSONA_PRESENTATION).sort()).toEqual([...VIEW_PERSONAS].sort())
    const requests: GraphEditRequest[] = [
      { kind: 'add', labels: ['Concept'], properties: { name: 'a' } },
      { kind: 'update', id: 'n1', properties: { name: 'b' } },
      { kind: 'delete', id: 'n1' },
    ]
    expect(requests.map((request) => request.kind)).toEqual([...GRAPH_EDIT_KINDS])
  })
})
