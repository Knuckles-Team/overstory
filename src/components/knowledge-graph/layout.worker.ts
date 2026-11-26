/// <reference lib="webworker" />
/**
 * Layout worker (OVERSTORY-APPS-R030.10.2, R030.13.2). The main thread never runs a layout step.
 * A new `run` message replaces the one in flight.
 */
import { runLayout, type LayoutBatch, type LayoutRequest } from './layout-core'

let current = 0

self.onmessage = (event: MessageEvent<LayoutRequest | { type: 'cancel' }>) => {
  const message = event.data
  if (message.type === 'cancel') {
    current = -1
    return
  }
  current = message.runId
  const runId = message.runId
  runLayout(
    message,
    (batch: LayoutBatch) => {
      ;(self as unknown as { postMessage: (m: LayoutBatch, t: Transferable[]) => void }).postMessage(batch, [
        batch.positions.buffer,
      ])
    },
    () => performance.now(),
    () => current !== runId,
  )
}
