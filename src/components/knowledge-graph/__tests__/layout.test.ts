// spec: OVERSTORY-APPS-R030.10.2
// spec: OVERSTORY-APPS-R030.13.2
import { describe, expect, it } from 'vitest'
import { runLayout, type LayoutBatch } from '../layout-core'
import { LayoutClient, type LayoutWorkerLike } from '../layout-client'

const ring = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `n${String(i)}`, x: Math.cos(i) * 10, y: Math.sin(i) * 10 }))

describe('layout core', () => {
  it('posts batches, keeps pinned nodes in place and stops when settled or out of time', () => {
    const nodes = ring(20)
    const edges = nodes.slice(1).map((n) => ({ source: 'n0', target: n.id }))
    const batches: LayoutBatch[] = []
    const last = runLayout({ type: 'run', runId: 1, nodes, edges, pinned: ['n3'] }, (b) => batches.push(b))
    expect(batches.length).toBeGreaterThanOrEqual(1)
    expect(batches.at(-1)?.type).toBe('done')
    expect(batches.slice(0, -1).every((b) => b.type === 'batch')).toBe(true)
    expect(last.ids).toHaveLength(20)
    const i = last.ids.indexOf('n3')
    expect(last.positions[i * 2]).toBeCloseTo(nodes[3].x, 5)
    expect(last.positions[i * 2 + 1]).toBeCloseTo(nodes[3].y, 5)

    // The time cap stops a layout that never settles.
    let t = 0
    const capped = runLayout(
      { type: 'run', runId: 2, nodes, edges, pinned: [], settleBelow: -1, maxMs: 1500 },
      () => undefined,
      () => (t += 400),
    )
    expect(capped.type).toBe('done')
    expect(capped.elapsedMs).toBeGreaterThanOrEqual(1500)
  })
})

describe('layout client', () => {
  it('test_layout_runs_in_the_worker_and_resolves_final_positions', async () => {
    const posted: unknown[] = []
    const worker: LayoutWorkerLike = {
      onmessage: null,
      terminate: () => undefined,
      postMessage: (m) => {
        posted.push(m)
        if (m.type !== 'run') return
        queueMicrotask(() => {
          const make = (type: 'batch' | 'done', x: number): MessageEvent<LayoutBatch> =>
            ({
              data: {
                type,
                runId: m.runId,
                ids: ['a'],
                positions: new Float32Array([x, 2]),
                avgDisplacement: 0,
                elapsedMs: 5,
                iterations: 20,
              },
            }) as MessageEvent<LayoutBatch>
          worker.onmessage?.(make('batch', 1))
          worker.onmessage?.(make('done', 7))
        })
      },
    }
    const client = new LayoutClient(() => worker)
    const outcome = await client.run({ nodes: [{ id: 'a', x: 0, y: 0 }], edges: [], pinned: [] })
    expect(outcome).toMatchObject({ status: 'settled', batches: 2 })
    if (outcome.status === 'settled') expect(outcome.positions.get('a')).toEqual({ x: 7, y: 2 })
    expect(posted).toHaveLength(1)
    // With no worker available the client says so; it never lays out on the main thread.
    expect(await new LayoutClient(() => null).run({ nodes: [], edges: [], pinned: [] })).toEqual({
      status: 'unavailable',
    })
  })
})
