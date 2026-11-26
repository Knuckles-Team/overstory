import { vi } from 'vitest'
import type { LayoutBatch, LayoutRequest } from '../layout-core'
import type { LayoutWorkerLike } from '../layout-client'

/** A layout worker double: it answers a run with the positions it was given, spread on a ring, in two batches. */
export function fakeWorker(spy?: (request: LayoutRequest) => void): LayoutWorkerLike {
  const worker: LayoutWorkerLike = {
    onmessage: null,
    terminate: () => undefined,
    postMessage: (message) => {
      if (message.type !== 'run') return
      spy?.(message)
      queueMicrotask(() => {
        const ids = message.nodes.map((n) => n.id)
        const positions = new Float32Array(ids.length * 2)
        message.nodes.forEach((n, i) => {
          positions[i * 2] = Math.cos(i) * 100 + n.x * 0.1
          positions[i * 2 + 1] = Math.sin(i) * 100 + n.y * 0.1
        })
        const base = { runId: message.runId, ids, positions, avgDisplacement: 0, elapsedMs: 1, iterations: 20 }
        worker.onmessage?.({ data: { ...base, type: 'batch' } as LayoutBatch } as MessageEvent<LayoutBatch>)
        worker.onmessage?.({ data: { ...base, type: 'done' } as LayoutBatch } as MessageEvent<LayoutBatch>)
      })
    },
  }
  return worker
}

export type OpHandler = (params: Record<string, unknown>) => {
  status?: number
  result?: unknown
  error?: { code: string }
}

/** A fetch double for the Arbora transport: a session endpoint and one handler per operation id. */
export function fakeArbora(handlers: Record<string, OpHandler>) {
  const calls: { op: string; params: Record<string, unknown> }[] = []
  const meta = { registry_digest: 'd', api_version: '1' }
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.endsWith('/auth/session')) {
      return Promise.resolve(new Response(JSON.stringify({ authenticated: true, csrf_token: 'tok' }), { status: 200 }))
    }
    const op = url.split('/api/v1/ops/')[1]
    const params = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    calls.push({ op, params })
    const handler = handlers[op] as OpHandler | undefined
    if (!handler) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: 'OPERATION_NOT_FOUND', source: 'arbora', message: 'x', retryable: false },
            meta,
          }),
          {
            status: 404,
          },
        ),
      )
    }
    const out = handler(params)
    if (out.error) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: false,
            error: { ...out.error, source: 'engine', message: out.error.code, retryable: false },
            meta,
          }),
          {
            status: out.status ?? 400,
          },
        ),
      )
    }
    return Promise.resolve(new Response(JSON.stringify({ ok: true, result: out.result, meta }), { status: 200 }))
  })
  return { fn, calls }
}

/** A NeighborhoodResult as the engine sends it. */
export const neighborhood = (
  nodes: { id: string; node_type?: string; name?: string }[],
  edges: { source: string; target: string; relationship: string }[],
  hidden: { node_id: string; count: number }[] = [],
) => ({
  nodes: nodes.map((n) => ({ id: n.id, properties: { node_type: n.node_type, name: n.name } })),
  edges: edges.map((e) => ({ source: e.source, target: e.target, properties: { relationship: e.relationship } })),
  hidden,
  next_cursor: null,
  truncated: false,
  graph_revision: 1,
})
