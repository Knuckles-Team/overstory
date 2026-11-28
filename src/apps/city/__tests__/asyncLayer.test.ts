// spec: OVERSTORY-CITY-R048.6.1
import { describe, expect, it, vi } from 'vitest'
import { createAsyncLayerSlot } from '../core/render3d/asyncLayer'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('async scene layer lifecycle', () => {
  it('keeps the latest replacement and disposes an older result that finishes later', async () => {
    const initial = { dispose: vi.fn() },
      old = { dispose: vi.fn() },
      latest = { dispose: vi.fn() }
    const first = deferred<typeof old>(),
      second = deferred<typeof latest>()
    const slot = createAsyncLayerSlot(initial)
    const firstLoad = slot.replace(() => first.promise)
    const secondLoad = slot.replace(() => second.promise)
    second.resolve(latest)
    await secondLoad
    first.resolve(old)
    await firstLoad
    expect(slot.current).toBe(latest)
    expect(initial.dispose).toHaveBeenCalledOnce()
    expect(old.dispose).toHaveBeenCalledOnce()
    expect(latest.dispose).not.toHaveBeenCalled()
    slot.dispose()
    slot.dispose()
    expect(latest.dispose).toHaveBeenCalledOnce()
  })
  it('disposes a layer that resolves after the renderer has closed', async () => {
    const initial = { dispose: vi.fn() },
      late = { dispose: vi.fn() }
    const pending = deferred<typeof late>()
    const slot = createAsyncLayerSlot(initial)
    const load = slot.replace(() => pending.promise)
    slot.dispose()
    pending.resolve(late)
    await load
    expect(initial.dispose).toHaveBeenCalledOnce()
    expect(late.dispose).toHaveBeenCalledOnce()
  })
})
