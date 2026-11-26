// spec: OVERSTORY-APPS-R030.11.2
// spec: OVERSTORY-APPS-R030.11.4
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArboraApiError } from '@/lib/arbora-api/invoke'
import { CLASSES_UNAVAILABLE, readGraphClasses, resetClassesCache } from '../graph-read'
import { classIriFor, styleFor, styleForTypeString } from '@/lib/graph-semantics'

type Read = Parameters<typeof readGraphClasses>[2]
const pages = (...results: unknown[]) => {
  const fn = vi.fn()
  for (const r of results)
    fn.mockImplementationOnce((_o: string, _p: unknown, schema: { parse: (v: unknown) => unknown }) =>
      Promise.resolve(schema.parse(r)),
    )
  return fn
}

describe('graph classes read', () => {
  beforeEach(() => {
    resetClassesCache()
  })

  it('test_ancestry_cached_per_digest_and_style_applied', async () => {
    const read = pages(
      { composed_digest: 'd1', next_cursor: 'c2', terms: [{ iri: 'urn:Thing', kind: 'class', local_name: 'Thing' }] },
      {
        composed_digest: 'd1',
        next_cursor: null,
        terms: [{ iri: 'urn:Person', kind: 'class', local_name: 'Person', parents: ['urn:Thing'] }],
      },
    )
    const state = await readGraphClasses(undefined, 'd1', read as unknown as Read)
    expect(read).toHaveBeenCalledTimes(2)
    expect(read.mock.calls[0][1]).toEqual({ kind: 'class', limit: 1000 })
    expect(read.mock.calls[1][1]).toEqual({ kind: 'class', limit: 1000, cursor: 'c2' })
    if (state.status !== 'ready') throw new Error('not ready')
    const iri = classIriFor('Person', state.index)
    expect(iri).toBe('urn:Person')
    const person = styleFor(iri ?? '', state.index.ancestry)
    const thing = styleFor('urn:Thing', state.index.ancestry)
    expect(person.slot).toBe(thing.slot)
    expect(person.depth).toBe(1)
    // The same digest is served from memory.
    await readGraphClasses(undefined, 'd1', read as unknown as Read)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('test_unavailable_schema_falls_back_without_invented_ancestry', async () => {
    const read = vi.fn(() => Promise.reject(new ArboraApiError('HTTP_UNAVAILABLE', 404, false, {})))
    const state = await readGraphClasses(undefined, 'x', read as unknown as Read)
    expect(state).toEqual({ status: 'unavailable', notice: CLASSES_UNAVAILABLE })
    expect(CLASSES_UNAVAILABLE).toBe('Class hierarchy unavailable')
    const fallback = styleForTypeString('Person')
    expect(fallback.depth).toBe(0)
    expect(fallback.rootIri).toBe('Person')
    expect(styleFor('Missing', new Map()).label).toBe('unclassified')
  })
})
