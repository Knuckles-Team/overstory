// spec: OVERSTORY-APPS-R030.1

import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  GRAPH_EDIT_KINDS,
  GRAPH_EDIT_VERDICTS,
  VIEW_PERSONAS,
  type GraphEditRequest,
  type GraphEditVerdict,
  type ViewPersona,
} from '@/lib/graph-edit'

describe('graph edit model', () => {
  it('test_edit_types_closed', () => {
    expect(GRAPH_EDIT_KINDS).toEqual(['add', 'update', 'delete'])
    expect(GRAPH_EDIT_VERDICTS).toEqual(['applied', 'refused', 'unavailable'])
    expect(VIEW_PERSONAS).toEqual(['operator', 'analyst', 'reader'])

    const requests: GraphEditRequest[] = [
      { kind: 'add', labels: ['Person'], properties: { name: 'Ada' } },
      { kind: 'update', id: 'person-1', properties: { name: 'Grace' } },
      { kind: 'delete', id: 'person-1' },
    ]
    expect(requests).toHaveLength(3)

    expectTypeOf<GraphEditVerdict>().toEqualTypeOf<'applied' | 'refused' | 'unavailable'>()
    expectTypeOf<ViewPersona>().toEqualTypeOf<'operator' | 'analyst' | 'reader'>()
    expectTypeOf<Extract<GraphEditRequest, { kind: 'add' }>>().toEqualTypeOf<{
      kind: 'add'
      labels: string[]
      properties: Record<string, unknown>
    }>()
    expectTypeOf<Extract<GraphEditRequest, { kind: 'update' }>>().toEqualTypeOf<{
      kind: 'update'
      id: string
      properties: Record<string, unknown>
    }>()
    expectTypeOf<Extract<GraphEditRequest, { kind: 'delete' }>>().toEqualTypeOf<{
      kind: 'delete'
      id: string
    }>()
  })
})
