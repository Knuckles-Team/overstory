/**
 * Main-thread side of the layout worker (OVERSTORY-APPS-R030.10.2, R030.13.2).
 * It posts the graph, receives batches and resolves with the final positions. It computes nothing.
 */
import type { LayoutBatch, LayoutRequest } from './layout-core'

export interface LayoutWorkerLike {
  postMessage: (message: LayoutRequest | { type: 'cancel' }) => void
  terminate: () => void
  onmessage: ((event: MessageEvent<LayoutBatch>) => void) | null
}

export type LayoutWorkerFactory = () => LayoutWorkerLike | null

/** Creates the bundled worker, or null where workers do not exist. */
export const defaultLayoutWorker: LayoutWorkerFactory = () => {
  if (typeof Worker === 'undefined') return null
  return new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
}

export type LayoutOutcome =
  | { status: 'settled'; positions: Map<string, { x: number; y: number }>; batches: number; elapsedMs: number }
  | { status: 'superseded' }
  | { status: 'unavailable' }

export class LayoutClient {
  private worker: LayoutWorkerLike | null = null
  private runId = 0
  private resolveActive: ((outcome: LayoutOutcome) => void) | null = null
  private readonly factory: LayoutWorkerFactory

  constructor(factory: LayoutWorkerFactory = defaultLayoutWorker) {
    this.factory = factory
  }

  /** Lay out `request`. A later call supersedes an earlier one that has not settled. */
  run(request: Omit<LayoutRequest, 'type' | 'runId'>, onBatch?: (batch: LayoutBatch) => void): Promise<LayoutOutcome> {
    this.worker ??= this.factory()
    const worker = this.worker
    if (!worker) return Promise.resolve({ status: 'unavailable' })
    this.resolveActive?.({ status: 'superseded' })
    const runId = ++this.runId
    let batches = 0
    return new Promise<LayoutOutcome>((resolve) => {
      this.resolveActive = resolve
      worker.onmessage = (event) => {
        const batch = event.data
        if (batch.runId !== runId) return
        batches += 1
        onBatch?.(batch)
        if (batch.type === 'done') {
          const positions = new Map<string, { x: number; y: number }>()
          batch.ids.forEach((id, i) => {
            positions.set(id, { x: batch.positions[i * 2], y: batch.positions[i * 2 + 1] })
          })
          this.resolveActive = null
          resolve({ status: 'settled', positions, batches, elapsedMs: batch.elapsedMs })
        }
      }
      worker.postMessage({ ...request, type: 'run', runId })
    })
  }

  dispose(): void {
    this.resolveActive?.({ status: 'superseded' })
    this.resolveActive = null
    this.worker?.terminate()
    this.worker = null
  }
}
