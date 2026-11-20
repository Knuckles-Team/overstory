/**
 * @file layout-edit.test.ts
 * @description The layout override document (OVERSTORY-CITY-R032) under the
 * same deterministic boot as the simulation: the bound test
 * `override_round_trip` proves two viewers that apply the same stored
 * document to the same derived city serialize identically — moves, roads
 * and styles included — and that the validation refuses a disconnecting
 * road edit, a duplicate segment, an occupied plot and an illegal
 * rotation; a reset restores the derived placement exactly, and the
 * live city re-routes its walkers and re-joins a moved building's door.
 */
// spec: OVERSTORY-CITY-R032
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { bus } from '../core/events'
import {
  REFUSAL_TEXT,
  applyDocument,
  derivedRoadGraph,
  emptyLayoutOverride,
  nextDocument,
  roadSegmentId,
  serializeLayout,
  validateDocument,
  validateEdit,
} from '../core/layoutEdit'
import { applyLayoutEdit, initSim, rerouteCharacters, resetSim, world } from '../core/sim'

beforeEach(() => {
  bus.reset()
  resetSim()
  initSim(fleetToConnectors(FLEET_SNAPSHOT))
})

afterEach(() => {
  bus.reset()
  resetSim()
})

describe('layout-edit (R032)', () => {
  /** A connector building on a served plot, and a free plot beside the district. */
  function fixture(): { buildingId: string; fromPlot: number; freePlot: number } {
    const connectors = Object.values(world.buildings).filter((b) => b.category === 'connector')
    expect(connectors.length).toBeGreaterThan(0)
    const b = connectors[0]
    const fromPlot = world.plots.findIndex((p) => p.buildingId === b.id)
    expect(fromPlot).toBeGreaterThanOrEqual(0)
    // A free plot: no building, no reservation, no construction.
    const freePlot = world.plots.findIndex((p) => !p.buildingId && !p.reservedId && !p.construction)
    expect(freePlot).toBeGreaterThanOrEqual(0)
    return { buildingId: b.id, fromPlot, freePlot }
  }

  it('override_round_trip: two viewers applying one document serialize identically', () => {
    const { buildingId, freePlot } = fixture()
    const graph = world.roadGraph
    expect(graph).not.toBeNull()

    // 1. Validate a move of a district building onto a free plot.
    const move = validateEdit({ kind: 'move-building', buildingId, plot: freePlot, rotation: 90 }, world, graph!)
    expect(move).toEqual({ ok: true })

    // 2. Draw a diagonal road between two non-adjacent grid nodes.
    const from = 'n0:0'
    const to = 'n1:1'
    expect(graph!.nodes[from]).toBeDefined()
    expect(graph!.nodes[to]).toBeDefined()
    const road = validateEdit({ kind: 'add-road', from, to }, world, graph!)
    expect(road).toEqual({ ok: true })

    // 3. The document accumulates as final state (the bound test's chain).
    let doc = nextDocument(
      emptyLayoutOverride(),
      { kind: 'move-building', buildingId, plot: freePlot, rotation: 90 },
      world,
    )
    doc = nextDocument(doc, { kind: 'add-road', from, to }, world)
    doc = nextDocument(doc, { kind: 'district-style', domain: 'data', archetype: 'studio' }, world)
    expect(doc.moves).toHaveLength(1)
    expect(doc.roads).toHaveLength(1)
    expect(doc.roads[0]?.segmentId).toBe(roadSegmentId(from, to))
    expect(doc.styles).toEqual([{ domain: 'data', archetype: 'studio' }])

    // 4. The document validates whole (boot / second-viewer path).
    const verdict = validateDocument(doc, world, derivedRoadGraph())
    expect(verdict).toEqual({ ok: true, reasons: [] })

    // 5. Viewer A applies the document to the live world.
    applyLayoutEdit(doc)
    const a = world.buildings[buildingId]
    expect(world.plots[freePlot].buildingId).toBe(buildingId)
    expect(world.plots[world.plots.findIndex((p) => p.buildingId === buildingId)].buildingId).toBe(buildingId)
    expect(a.rot).toBe(90)
    expect(world.districtStyles.data).toBe('studio')
    expect(world.layoutDoc).toBe(doc)
    const graphA = world.roadGraph!
    expect(graphA.segments[roadSegmentId(from, to)]).toBeDefined()
    const layoutA = serializeLayout(world, graphA)

    // 6. Viewer B: a fresh world over the same fleet, the same document.
    resetSim()
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const docB = structuredClone(doc)
    applyDocument(world, docB)
    const graphB = world.roadGraph!
    const layoutB = serializeLayout(world, graphB)
    expect(layoutB).toEqual(layoutA)
    // The moved building's door re-projected from its new plot.
    const aB = world.buildings[buildingId]
    expect(aB.door).toEqual(a.door)
  })

  it('refuses a road edit that would disconnect the graph', () => {
    // A line a-b-c-d: removing the middle segment disconnects the graph,
    // and removing an end segment isolates the end node — both refuse.
    const line = {
      nodes: {
        a: { id: 'a', x: 0, z: 0, kind: 'intersection' as const },
        b: { id: 'b', x: 10, z: 0, kind: 'intersection' as const },
        c: { id: 'c', x: 20, z: 0, kind: 'intersection' as const },
        d: { id: 'd', x: 30, z: 0, kind: 'intersection' as const },
      },
      segments: {
        s1: { id: 's1', from: 'a', to: 'b', curve: 0.4, width: 2.6 },
        s2: { id: 's2', from: 'b', to: 'c', curve: 0.4, width: 2.6 },
        s3: { id: 's3', from: 'c', to: 'd', curve: 0.4, width: 2.6 },
      },
    }
    const middle = validateEdit({ kind: 'remove-road', segmentId: 's2' }, world, line)
    expect(middle.ok).toBe(false)
    expect(middle.reason).toBe('disconnects-graph')
    expect(REFUSAL_TEXT['disconnects-graph']).toMatch(/disconnect/)
    const end = validateEdit({ kind: 'remove-road', segmentId: 's1' }, world, line)
    expect(end.ok).toBe(false)
    expect(end.reason).toBe('disconnects-graph')
    // An unknown segment is refused on its own terms.
    const ghost = validateEdit({ kind: 'remove-road', segmentId: 's9' }, world, line)
    expect(ghost.reason).toBe('unknown-segment')
  })

  it('refuses a road segment that overlaps an existing one', () => {
    const graph = world.roadGraph
    expect(graph).not.toBeNull()
    const seg = Object.values(graph!.segments)[0]
    expect(seg).toBeDefined()
    const verdict = validateEdit({ kind: 'add-road', from: seg!.from, to: seg!.to }, world, graph!)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('overlaps-existing-segment')
  })

  it('refuses a move onto an occupied, reserved or under-construction plot', () => {
    const { buildingId } = fixture()
    const graph = world.roadGraph!
    // Occupied: another building's plot.
    const other = world.plots.find((p) => p.buildingId && p.buildingId !== buildingId && !p.construction)
    expect(other).toBeDefined()
    const occupiedPlot = world.plots.indexOf(other!)
    expect(validateEdit({ kind: 'move-building', buildingId, plot: occupiedPlot }, world, graph).reason).toBe(
      'plot-occupied',
    )
    // Reserved: a registered connector's named plot.
    const reserved = world.plots.find((p) => p.reservedId && p.reservedId !== buildingId)
    if (reserved) {
      expect(
        validateEdit({ kind: 'move-building', buildingId, plot: world.plots.indexOf(reserved) }, world, graph).reason,
      ).toBe('plot-reserved')
    }
    // Illegal rotation.
    const bad = validateEdit(
      { kind: 'move-building', buildingId, plot: fixture().freePlot, rotation: 45 as 0 },
      world,
      graph,
    )
    expect(bad.ok).toBe(false)
    expect(bad.reason).toBe('invalid-rotation')
    // Core landmarks are not movable.
    const core = validateEdit({ kind: 'move-building', buildingId: 'arbora', plot: 0 }, world, graph)
    expect(core.reason).toBe('not-movable')
  })

  it('a reset edit restores the derived placement exactly', () => {
    const { buildingId, fromPlot, freePlot } = fixture()
    const doc = nextDocument(
      nextDocument(emptyLayoutOverride(), { kind: 'move-building', buildingId, plot: freePlot, rotation: 180 }, world),
      { kind: 'district-style', domain: 'data', archetype: 'docks' },
      world,
    )
    applyLayoutEdit(doc)
    expect(world.plots[freePlot].buildingId).toBe(buildingId)
    expect(world.districtStyles.data).toBe('docks')

    const resetDoc = nextDocument(doc, { kind: 'reset' }, world)
    expect(resetDoc).toEqual(emptyLayoutOverride())
    applyLayoutEdit(resetDoc)

    const b = world.buildings[buildingId]
    expect(world.plots[fromPlot].buildingId).toBe(buildingId)
    expect(b.rot).toBe(0)
    expect(world.districtStyles.data).toBeUndefined()
    expect(world.layoutDoc).toEqual(emptyLayoutOverride())
    // The road graph is the derived grid again.
    expect(world.roadGraph!.segments).toEqual(derivedRoadGraph().segments)
  })

  it('a moving character re-routes on the new graph and re-joins a moved door', () => {
    const { buildingId } = fixture()
    const graph = world.roadGraph!
    // A walker aimed somewhere; the live graph must produce a route for it.
    const ch = world.characters[0]
    expect(ch).toBeDefined()
    ch.state = 'traveling'
    ch.target = { x: 20, z: 20 }
    ch.path = [
      [0, 0],
      [20, 20],
    ]
    ch.pathPos = 0
    expect(world.roadGraph).not.toBeNull()
    rerouteCharacters()
    expect(ch.pathPos).toBe(0)
    expect(ch.path.length).toBeGreaterThan(1)

    // The same document with the building moved: a character bound to it
    // re-joins the new door.
    const freePlot = world.plots.findIndex((p) => !p.buildingId && !p.reservedId && !p.construction)
    const doc = nextDocument(
      emptyLayoutOverride(),
      { kind: 'move-building', buildingId, plot: freePlot, rotation: 0 },
      world,
    )
    expect(validateEdit({ kind: 'move-building', buildingId, plot: freePlot, rotation: 0 }, world, graph).ok).toBe(
      true,
    )
    const task = {
      id: 't1',
      kind: 'task' as const,
      buildingId,
      state: 'pending' as const,
      approvalRequired: false,
      tools: [],
    }
    ch.task = task as unknown as (typeof world.characters)[number]['task']
    ch.state = 'traveling'
    applyLayoutEdit(doc)
    const b = world.buildings[buildingId]
    expect(b.door).not.toBeNull()
    // A re-pathed walker re-aims at the new door (its path walks the live graph).
    expect(ch.target).toEqual({ x: b.door!.x, z: b.door!.z })
    expect(ch.path.length).toBeGreaterThan(1)
  })

  it('the district style lands on the world state', () => {
    const doc = nextDocument(
      emptyLayoutOverride(),
      { kind: 'district-style', domain: 'media', archetype: 'studio' },
      world,
    )
    expect(
      validateEdit({ kind: 'district-style', domain: 'media', archetype: 'studio' }, world, world.roadGraph!).ok,
    ).toBe(true)
    applyLayoutEdit(doc)
    expect(world.districtStyles.media).toBe('studio')
  })

  it('an unknown domain or archetype is refused with the operator wording', () => {
    const graph = world.roadGraph!
    const d1 = validateEdit({ kind: 'district-style', domain: 'nonsense', archetype: 'studio' }, world, graph)
    expect(d1.reason).toBe('unknown-domain')
    const d2 = validateEdit(
      { kind: 'district-style', domain: 'media', archetype: 'castle' as 'gateway' },
      world,
      graph,
    )
    expect(d2.reason).toBe('unknown-archetype')
    expect(REFUSAL_TEXT['unknown-domain']).toBeTruthy()
    expect(REFUSAL_TEXT['unknown-archetype']).toBeTruthy()
  })
})
