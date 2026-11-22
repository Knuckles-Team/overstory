/** Own exactly one current layer while async replacements may finish out of order. */
export function createAsyncLayerSlot<T extends { dispose(): void }>(initial: T) {
  let current = initial
  let revision = 0
  let disposed = false
  return {
    get current(): T {
      return current
    },
    async replace(load: () => Promise<T>): Promise<void> {
      if (disposed) return
      const requested = ++revision
      const next = await load()
      if (requested !== revision) {
        next.dispose()
        return
      }
      const previous = current
      current = next
      previous.dispose()
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      revision++
      current.dispose()
    },
  }
}
