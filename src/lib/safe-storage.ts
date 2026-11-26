/**
 * @file safe-storage.ts
 * @description Browser storage that survives a denied `localStorage` (a sandboxed
 * or third-party frame, a blocked-storage policy). Reading the `localStorage`
 * property itself throws there, so the probe is guarded; on failure an in-memory map
 * answers instead and `persistent` is false so a view can say that settings
 * will not persist (OVERSTORY-DESIGN-R004.1).
 */

export interface SafeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** False when values live only in memory and are lost on reload. */
  readonly persistent: boolean
}

export function createSafeStorage(open: () => Storage = () => window.localStorage): SafeStorage {
  try {
    const store = open()
    const probe = '__overstory_storage_probe__'
    store.setItem(probe, probe)
    store.removeItem(probe)
    return {
      persistent: true,
      getItem: (key) => store.getItem(key),
      setItem: (key, value) => {
        store.setItem(key, value)
      },
      removeItem: (key) => {
        store.removeItem(key)
      },
    }
  } catch {
    const memory = new Map<string, string>()
    return {
      persistent: false,
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value)
      },
      removeItem: (key) => {
        memory.delete(key)
      },
    }
  }
}
