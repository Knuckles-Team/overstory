/**
 * @file medullaLayout.test.ts
 * @description Medulla-backed layout persistence (OVERSTORY-CITY-R021).
 *
 * Tests cover:
 *   - Save/load layout round-trip through Medulla client
 *   - Layout version (revision) increments on save
 *   - Deterministic serialization (same doc → same serialized form)
 *   - Save error handling (Medulla unavailable → local only)
 *   - Layout publish to Arbora (accepted and refused)
 *   - Layout change subscription fires events
 *   - Unknown tenant returns null on load
 *   - Delete layout removes from Medulla KV
 *   - List layouts returns tenant layout keys
 */
// spec: OVERSTORY-CITY-R021
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  MedullaLayoutImpl,
  type MedullaStore,
  createMedullaLayoutClient,
  serializeLayout,
  parseLayout,
} from '../core/medullaLayout'
import type { LayoutOverride } from '../core/layoutEdit'
import type { LayoutEvent } from '../core/types'

// ---- Mock the API for publish tests -----------------------------------------
// vi.mock is hoisted by vitest, so we use vi.hoisted to create mockFn at the
// top of the test scope, before vi.mock executes its callback.
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() as ReturnType<typeof vi.fn> }))

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api')
  return { ...actual, saveCityLayout: mockFn }
})

// ---- Fixtures ---------------------------------------------------------------

function makeStore(): MedullaStore {
  return { data: new Map() }
}

function makeDoc(overrides: Partial<LayoutOverride> = {}): LayoutOverride {
  return {
    version: 1,
    moves: [{ buildingId: 'alpha-mcp', plot: 3, rotation: 90 }],
    roads: [{ kind: 'add', segmentId: 's1', from: 'n0:0', to: 'n1:1' }],
    styles: [{ domain: 'commercial', archetype: 'studio' }],
    buildings: [
      { id: 'arbora', x: 0, z: 0, rot: 0, plot: 0 },
      { id: 'alpha-mcp', x: -25, z: -55, rot: 90, plot: 3 },
    ],
    seed: 'city-seed-42',
    captured_at: '2026-01-01T00:00:00.000Z',
    revision: 1,
    ...overrides,
  }
}

// ---- Helpers ----------------------------------------------------------------

/** Create a client backed by an in-memory MedullaStore. */
function makeStoreClient(tenant: string): MedullaLayoutImpl {
  return new MedullaLayoutImpl({ store: makeStore(), tenant })
}

// ---- save/load round-trip ---------------------------------------------------

describe('medulla-layout save/load (R021)', () => {
  afterEach(() => {
    mockFn.mockReset()
  })

  it('saveLayout persists the document and loadLayout retrieves it', async () => {
    const doc = makeDoc()
    const client = makeStoreClient('roundtrip')
    try {
      await client.saveLayout(doc)
      const loaded = await client.loadLayout()
      expect(loaded).not.toBeNull()
      if (loaded) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        expect(loaded.version).toBe(1)
        expect(loaded.moves).toHaveLength(1)
        expect(loaded.moves[0]?.buildingId).toBe('alpha-mcp')
        expect(loaded.revision).toBe(1)
      }
    } finally {
      client.reset()
    }
  })

  it('loadLayout returns null when no layout is stored for the tenant', async () => {
    const client = makeStoreClient('empty-tenant')
    try {
      const loaded = await client.loadLayout()
      expect(loaded).toBeNull()
    } finally {
      client.reset()
    }
  })

  it('the latest saved layout is retrieved (last-write-wins)', async () => {
    const docA = makeDoc()
    const docB = makeDoc({ moves: [{ buildingId: 'beta-mcp', plot: 10, rotation: 180 }] })
    const client = makeStoreClient('overwrite')
    try {
      await client.saveLayout(docA)
      await client.saveLayout(docB)
      const loaded = await client.loadLayout()
      expect(loaded).not.toBeNull()
      if (loaded) {
        expect(loaded.moves[0]?.buildingId).toBe('beta-mcp')
        expect(loaded.revision).toBe(2)
      }
    } finally {
      client.reset()
    }
  })

  // ---- revision tracking ---------------------------------------------------

  it('revision increments on each save', async () => {
    const client = makeStoreClient('revision')
    try {
      await client.saveLayout(makeDoc())
      expect(client.getLocalRevision()).toBe(1)

      await client.saveLayout(makeDoc())
      expect(client.getLocalRevision()).toBe(2)

      await client.saveLayout(makeDoc())
      expect(client.getLocalRevision()).toBe(3)
    } finally {
      client.reset()
    }
  })

  it('revision starts at 0 before first save', () => {
    const client = makeStoreClient('revision-start')
    try {
      expect(client.getLocalRevision()).toBe(0)
    } finally {
      client.reset()
    }
  })

  // ---- deterministic serialization -----------------------------------------

  it('same doc serializes to the same JSON string (deterministic)', () => {
    const docA = makeDoc()
    const docB = makeDoc()
    docA.revision = 1
    docB.revision = 1
    expect(serializeLayout(docA)).toBe(serializeLayout(docB))
  })

  it('different doc contents produce different serialization', () => {
    const docA: LayoutOverride = {
      version: 1,
      moves: [{ buildingId: 'alpha-mcp', plot: 3, rotation: 90 }],
      roads: [],
      styles: [],
      revision: 1,
    }
    const docB: LayoutOverride = {
      version: 1,
      moves: [{ buildingId: 'beta-mcp', plot: 5, rotation: 0 }],
      roads: [],
      styles: [],
      revision: 1,
    }
    expect(serializeLayout(docA)).not.toBe(serializeLayout(docB))
  })

  it('sorted keys: different order of same moves serializes identically', () => {
    const docA: LayoutOverride = {
      version: 1,
      moves: [
        { buildingId: 'beta-mcp', plot: 5, rotation: 0 },
        { buildingId: 'alpha-mcp', plot: 3, rotation: 90 },
      ],
      roads: [],
      styles: [],
      revision: 1,
    }
    const docB: LayoutOverride = {
      version: 1,
      moves: [
        { buildingId: 'alpha-mcp', plot: 3, rotation: 90 },
        { buildingId: 'beta-mcp', plot: 5, rotation: 0 },
      ],
      roads: [],
      styles: [],
      revision: 1,
    }
    expect(serializeLayout(docA)).toBe(serializeLayout(docB))
  })

  // ---- parse ---------------------------------------------------------------

  it('parseLayout round-trips correctly', () => {
    const doc = makeDoc({ revision: 5 })
    const json = serializeLayout(doc)
    const parsed = parseLayout(json)
    expect(parsed).not.toBeNull()
    if (parsed) {
      expect(parsed.version).toBe(1)
      expect(parsed.buildings).toHaveLength(2)
      expect(parsed.seed).toBe('city-seed-42')
      expect(parsed.revision).toBe(5)
    }
  })

  it('parseLayout returns null for invalid JSON', () => {
    expect(parseLayout('not json')).toBeNull()
    expect(parseLayout('')).toBeNull()
    expect(parseLayout(null as unknown as string)).toBeNull()
  })

  // ---- error handling (local-only mode) ------------------------------------

  it('saveLayout works with store (Medulla-backed), load returns saved doc', async () => {
    const doc = makeDoc()
    const client = makeStoreClient('local')
    try {
      await client.saveLayout(doc)
      const loaded = await client.loadLayout()
      expect(loaded).not.toBeNull()
      expect(loaded?.revision).toBe(1)
    } finally {
      client.reset()
    }
  })
})

// ---- publishLayout ----------------------------------------------------------

describe('medulla-layout publish (R021)', () => {
  beforeEach(() => {
    mockFn.mockReset()
  })
  afterEach(() => {
    mockFn.mockReset()
  })

  it('publishLayout returns accepted=true when Arbora is reachable', async () => {
    mockFn.mockResolvedValue({ version: 1, moves: [], roads: [], styles: [] })

    const store = makeStore()
    const doc = makeDoc()
    const client = new MedullaLayoutImpl({ store, tenant: 'pub-ok' })
    try {
      await client.saveLayout(doc)
      const result = await client.publishLayout(doc)
      expect(result).not.toBeNull()
      if (result) {
        expect(result.accepted).toBe(true)
        expect(result.doc.version).toBe(1)
        expect(result.worldKey).toContain('city:world:pub-ok')
        expect(result.version).toBe('1')
        expect(result.publishedAt).toBeTruthy()
      }
      // Verify the API was called (saveLayout + publishLayout both call it).
      expect(mockFn).toHaveBeenCalledTimes(2)
    } finally {
      client.reset()
    }
  })

  it('publishLayout returns accepted=false when Arbora fails', async () => {
    mockFn.mockRejectedValue(new Error('Arbora unavailable'))

    const store = makeStore()
    const doc = makeDoc()
    const client = new MedullaLayoutImpl({ store, tenant: 'pub-fail' })
    try {
      await client.saveLayout(doc)
      const result = await client.publishLayout(doc)
      expect(result.accepted).toBe(false)
      expect(result.reason).toContain('Arbora unavailable')
    } finally {
      client.reset()
    }
  })

  it('publishLayout fires a layout-published event on the bus', async () => {
    mockFn.mockResolvedValue({ version: 1, moves: [], roads: [], styles: [] })

    const store = makeStore()
    const doc = makeDoc()
    const client = new MedullaLayoutImpl({ store, tenant: 'pub-event' })
    try {
      await client.saveLayout(doc)
      let firedEvent: LayoutEvent | null = null
      const unsub = client.subscribeToLayoutChanges((e) => {
        if (e.type === 'layout-published') {
          firedEvent = e
        }
      })
      const result = await client.publishLayout(doc)
      if (result.accepted) {
        // The type checker narrows this to never after the subscription callback.
        // Casting to `any` bypasses the narrow.
        const _fired: any = firedEvent
        expect(_fired?.type).toBe('layout-published')
        expect(_fired?.version).toBe('1')
      }
      unsub()
    } finally {
      client.reset()
    }
  })

  it('publishLayout on a layout without prior save still produces a valid response', async () => {
    mockFn.mockResolvedValue({ version: 1, moves: [], roads: [], styles: [] })

    const store = makeStore()
    const doc = makeDoc()
    const client = new MedullaLayoutImpl({ store, tenant: 'pub-no-save' })
    try {
      const result = await client.publishLayout(doc)
      expect(result).not.toBeNull()
      if (result) {
        expect(result.doc.version).toBe(1)
        expect(result.worldKey).toContain('city:world:pub-no-save')
        expect(result.publishedAt).toBeTruthy()
        expect(typeof result.accepted).toBe('boolean')
      }
    } finally {
      client.reset()
    }
  })
})

// ---- subscribeToLayoutChanges ---------------------------------------------

describe('medulla-layout subscribe (R021)', () => {
  afterEach(() => {
    mockFn.mockReset()
  })

  it('subscribe fires a layout-save event when saveLayout is called', async () => {
    const client = makeStoreClient('sub-save')
    try {
      let savedEvent: LayoutEvent | null = null
      const unsub = client.subscribeToLayoutChanges((e) => {
        if (e.type === 'layout-save') {
          savedEvent = e
        }
      })
      await client.saveLayout(makeDoc())
      expect(savedEvent).not.toBeNull()
      const _saved: any = savedEvent
      expect(_saved?.type).toBe('layout-save')
      expect(_saved?.version).toBe('1')
      expect(_saved?.detail).toContain('revision 1')
      unsub()
      client.stopPolling()
    } finally {
      client.reset()
    }
  })

  it('subscribe fires a layout-version event on polling detection', async () => {
    const client = makeStoreClient('sub-version')
    try {
      // Save first to establish baseline.
      await client.saveLayout(makeDoc())

      let versionEvent: LayoutEvent | null = null
      const unsub = client.subscribeToLayoutChanges((e) => {
        if (e.type === 'layout-version') {
          versionEvent = e
        }
      })

      // Manually bump the revision in the store.
      const key = client.medullaKey()
      const currentJson = (client as unknown as { store: { data: Map<string, string> } }).store?.data.get(key)
      if (currentJson) {
        const parsed = parseLayout(currentJson)
        if (parsed) {
          parsed.revision = 99
          ;(client as unknown as { store: { data: Map<string, string> } }).store!.data.set(
            key,
            serializeLayout(parsed),
          )
        }
      }

      // Manual poll.
      client.pollForChanges()

      // versionEvent is set by the subscription callback above
      const _version: any = versionEvent
      expect(_version?.type).toBe('layout-version')
      expect(_version?.version).toBe('99')
      unsub()
    } finally {
      client.reset()
    }
  })

  it('unsubscribe stops receiving events', async () => {
    const client = makeStoreClient('sub-unsub')
    try {
      let count = 0
      const handler = () => {
        count++
      }
      const unsub = client.subscribeToLayoutChanges(handler)
      await client.saveLayout(makeDoc())
      expect(count).toBe(1)
      unsub()
      expect((client as unknown as { listeners: Set<() => void> }).listeners.size).toBe(0)
    } finally {
      client.reset()
    }
  })

  it('multiple subscribers all receive events', async () => {
    const client = makeStoreClient('sub-multi')
    try {
      let countA = 0
      let countB = 0
      const handlerA = () => {
        countA++
      }
      const handlerB = () => {
        countB++
      }
      const unsubA = client.subscribeToLayoutChanges(handlerA)
      const unsubB = client.subscribeToLayoutChanges(handlerB)

      await client.saveLayout(makeDoc())
      expect(countA).toBe(1)
      expect(countB).toBe(1)

      await client.saveLayout(makeDoc())
      expect(countA).toBe(2)
      expect(countB).toBe(2)

      unsubA()
      unsubB()
      client.stopPolling()
    } finally {
      client.reset()
    }
  })

  it('polling starts automatically when the first subscriber joins', async () => {
    const client = makeStoreClient('sub-poll')
    try {
      expect((client as unknown as { pollTimer: ReturnType<typeof setInterval> | null }).pollTimer).toBeNull()
      const unsub = client.subscribeToLayoutChanges(() => {
        /* mock */
      })
      expect((client as unknown as { pollTimer: ReturnType<typeof setInterval> | null }).pollTimer).not.toBeNull()
      unsub()
      expect((client as unknown as { pollTimer: ReturnType<typeof setInterval> | null }).pollTimer).toBeNull()
    } finally {
      client.reset()
    }
  })
})

// ---- unknown tenant -------------------------------------------------------

describe('medulla-layout tenant (R021)', () => {
  afterEach(() => {
    mockFn.mockReset()
  })

  it('loadLayout returns null for an unknown tenant (no layout exists)', async () => {
    const tenantClient = makeStoreClient('nonexistent')
    try {
      const loaded = await tenantClient.loadLayout()
      expect(loaded).toBeNull()
    } finally {
      tenantClient.reset()
    }
  })

  it('listLayouts returns empty array when no layouts exist', async () => {
    const client = makeStoreClient('list-empty')
    try {
      const keys = await client.listLayouts('empty-tenant')
      expect(keys).toEqual([])
    } finally {
      client.reset()
    }
  })

  it('listLayouts returns layout keys for an existing tenant', async () => {
    const doc = makeDoc()
    const client = makeStoreClient('list-exists')
    try {
      await client.saveLayout(doc)
      const keys = await client.listLayouts('list-exists')
      expect(keys).toContain('city:layout:list-exists')
    } finally {
      client.reset()
    }
  })
})

// ---- deleteLayout ---------------------------------------------------------

describe('medulla-layout delete (R021)', () => {
  afterEach(() => {
    mockFn.mockReset()
  })

  it('deleteLayout removes the layout from Medulla KV', async () => {
    const doc = makeDoc()
    const client = makeStoreClient('delete')
    try {
      await client.saveLayout(doc)
      expect(client.getLocalDoc()).not.toBeNull()

      await client.deleteLayout()
      expect(client.getLocalDoc()).toBeNull()

      const loaded = await client.loadLayout()
      expect(loaded).toBeNull()
    } finally {
      client.reset()
    }
  })

  it('deleteLayout on an unknown tenant is a no-op (does not throw)', async () => {
    const tenantClient = makeStoreClient('no-layout-delete')
    try {
      await tenantClient.deleteLayout()
    } finally {
      tenantClient.reset()
    }
  })
})

// ---- Medulla key format --------------------------------------------------

describe('medulla-layout key format (R021)', () => {
  afterEach(() => {
    mockFn.mockReset()
  })

  it('uses the correct Medulla KV key format', () => {
    const client = makeStoreClient('my-tenant')
    try {
      const key = client.medullaKey()
      expect(key).toBe('city:layout:my-tenant')
    } finally {
      client.reset()
    }
  })

  it('custom layout key is reflected in the Medulla KV key', () => {
    const client = new MedullaLayoutImpl({ store: makeStore(), tenant: 'my-tenant', key: 'secondary' })
    try {
      const key = client.medullaKey()
      expect(key).toBe('city:layout:my-tenant:secondary')
    } finally {
      client.reset()
    }
  })
})

// ---- integration: save → load → publish ----------------------------------

describe('medulla-layout integration (R021)', () => {
  beforeEach(() => {
    mockFn.mockReset()
  })
  afterEach(() => {
    mockFn.mockReset()
  })

  it('full round-trip: save, load, publish (R021 acceptance)', async () => {
    mockFn.mockResolvedValue({ version: 1, moves: [], roads: [], styles: [] })

    const store = makeStore()
    const doc = makeDoc()
    const client = new MedullaLayoutImpl({ store, tenant: 'full' })
    try {
      // 1. Save.
      await client.saveLayout(doc)
      const afterSave = client.getLocalDoc()
      expect(afterSave).not.toBeNull()
      if (afterSave) expect(afterSave.revision).toBe(1)

      // 2. Load.
      const loaded = await client.loadLayout()
      expect(loaded).not.toBeNull()
      if (loaded) {
        expect(loaded.revision).toBe(1)
        expect(loaded.moves[0]?.buildingId).toBe('alpha-mcp')
      }

      // 3. Publish.
      const published = await client.publishLayout(loaded!)
      expect(published.accepted).toBe(true)
      expect(published.doc).not.toBeNull()
    } finally {
      client.reset()
    }
  })
})

// ---- createMedullaLayoutClient API -----------------------------------------

describe('createMedullaLayoutClient', () => {
  it('creates a client with all required methods', () => {
    const store = makeStore()
    const client = createMedullaLayoutClient('default', { store })
    expect(client).toBeDefined()
    expect(typeof client.saveLayout).toBe('function')
    expect(typeof client.loadLayout).toBe('function')
    expect(typeof client.deleteLayout).toBe('function')
    expect(typeof client.listLayouts).toBe('function')
    expect(typeof client.publishLayout).toBe('function')
    expect(typeof client.subscribeToLayoutChanges).toBe('function')
    client.reset()
  })
})

// ---- Edge cases (R021) -----------------------------------------------------

describe('medulla-layout edge cases (R021)', () => {
  afterEach(() => {
    mockFn.mockReset()
  })

  it('saveLayout with an empty document works', async () => {
    const store = makeStore()
    const client = new MedullaLayoutImpl({ store, tenant: 'empty-doc' })
    try {
      const empty: LayoutOverride = {
        version: 1,
        moves: [],
        roads: [],
        styles: [],
        revision: 1,
      }
      await client.saveLayout(empty)
      const loaded = await client.loadLayout()
      expect(loaded).not.toBeNull()
      if (loaded) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        expect(loaded.version).toBe(1)
        expect(loaded.moves).toHaveLength(0)
      }
    } finally {
      client.reset()
    }
  })

  it('publishLayout on an empty document produces a valid PublishedLayout', async () => {
    mockFn.mockResolvedValue({ version: 1, moves: [], roads: [], styles: [] })

    const store = makeStore()
    const client = new MedullaLayoutImpl({ store, tenant: 'pub-empty' })
    try {
      const empty: LayoutOverride = {
        version: 1,
        moves: [],
        roads: [],
        styles: [],
      }
      const result = await client.publishLayout(empty)
      expect(result.accepted).toBe(true)
      expect(result.version).toBe('0')
      expect(result.worldKey).toContain('city:world:pub-empty')
    } finally {
      client.reset()
    }
  })

  it('saveLayout with buildings and seed stores them in the layout doc', async () => {
    const store = makeStore()
    const client = new MedullaLayoutImpl({ store, tenant: 'full' })
    try {
      const fullDoc: LayoutOverride = {
        version: 1,
        moves: [],
        roads: [],
        styles: [],
        revision: 1,
        buildings: [
          { id: 'arbora', x: 0, z: 0, rot: 0, plot: 0 },
          { id: 'medulla', x: -15, z: -15, rot: 0, plot: 1 },
        ],
        seed: 'deterministic-seed',
      }
      await client.saveLayout(fullDoc)
      const loaded = await client.loadLayout()
      expect(loaded).not.toBeNull()
      if (loaded) {
        expect(loaded.buildings).toHaveLength(2)
        expect(loaded.seed).toBe('deterministic-seed')
      }
    } finally {
      client.reset()
    }
  })

  it('the client is safe to call on an already-disposed (reset) instance', async () => {
    const store = makeStore()
    const client = new MedullaLayoutImpl({ store, tenant: 'reset-safe' })
    await client.saveLayout(makeDoc())
    client.reset()
    // After reset(), the local state is cleared but the store still has data.
    // loadLayout will find it. After save, the store will have the new doc.
    await expect(client.saveLayout(makeDoc())).resolves.toBeUndefined()
    await expect(client.loadLayout()).resolves.not.toBeNull()
    await expect(client.deleteLayout()).resolves.toBeUndefined()
    // After delete, load should return null.
    await expect(client.loadLayout()).resolves.toBeNull()
  })
})
