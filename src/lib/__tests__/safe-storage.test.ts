// spec: OVERSTORY-DESIGN-R004.1.2
import { describe, expect, it } from 'vitest'
import { createSafeStorage } from '@/lib/safe-storage'

describe('createSafeStorage', () => {
  it('persists when storage is available', () => {
    const backing = new Map<string, string>()
    const storage = createSafeStorage(
      () =>
        ({
          getItem: (k: string) => backing.get(k) ?? null,
          setItem: (k: string, v: string) => {
            backing.set(k, v)
          },
          removeItem: (k: string) => {
            backing.delete(k)
          },
        }) as unknown as Storage,
    )
    storage.setItem('a', '1')
    expect(storage.persistent).toBe(true)
    expect(backing.get('a')).toBe('1')
  })

  it('falls back to memory when the storage property throws', () => {
    const storage = createSafeStorage(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError')
    })
    storage.setItem('a', '1')
    expect(storage.persistent).toBe(false)
    expect(storage.getItem('a')).toBe('1')
    storage.removeItem('a')
    expect(storage.getItem('a')).toBeNull()
  })

  it('falls back when writes are refused', () => {
    const storage = createSafeStorage(
      () =>
        ({
          getItem: () => null,
          setItem: () => {
            throw new DOMException('quota', 'QuotaExceededError')
          },
          removeItem: () => undefined,
        }) as unknown as Storage,
    )
    expect(storage.persistent).toBe(false)
  })
})
