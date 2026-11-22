/**
 * @file roads.test.ts
 * @description The road network the operator can shape
 * (OVERSTORY-DESIGN-R012.6 / OVERSTORY-CITY-R032): the generated graph is
 * connected, every intersection carries crosswalks, an edit is refused
 * when it disconnects the graph, and an accepted edit persists as a valid
 * network and re-routes traffic. (Storage of the edit as a served layout
 * override is the host-side half, proven by the city's layout-edit test.)
 */
// spec: OVERSTORY-DESIGN-R012.6
import { describe, expect, it } from 'vitest'
import { crosswalksFor, deriveRoadGraph, graphConnected, route } from '../roads'
import type { RoadGraph } from '../roads'
import { validateRoadEdit } from '../roads'
import { sampleRoadCurve } from '@/apps/city/core/render3d/roads'

// The bundled fixture grid (the city's layout road grid, in metres).
const X_ROADS = [-80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30]
const Z_ROADS = [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70]

describe('the road network (R012.6)', () => {
  it('uses one deterministic curved centreline for asphalt and traffic', () => {
    const samples = sampleRoadCurve(0, 0, 20, 0, 1, 'traffic-proof', 2)
    expect(samples.length).toBeGreaterThan(8)
    // The curve is real geometry, not a rectangular texture illusion.
    expect(samples.some((sample) => Math.abs(sample.z) > 0.1)).toBe(true)
    // Endpoint continuity means a route can hand a car between segments
    // without teleporting it to a hidden straight-lane origin.
    expect(samples[0]).toMatchObject({ x: 0, z: 0 })
    expect(samples[samples.length - 1]).toMatchObject({ x: 20, z: 0 })
  })

  it('network_and_edits: the generated graph is connected, every intersection has crosswalks, and an edit is refused when it disconnects the graph and otherwise persists and re-routes', () => {
    const graph = deriveRoadGraph(X_ROADS, Z_ROADS)
    // The generated grid is connected.
    expect(graphConnected(graph)).toBe(true)
    // Every intersection carries a crosswalk band per connected arm.
    for (const node of Object.values(graph.nodes)) {
      if (node.kind !== 'intersection') continue
      const arms = Object.values(graph.segments).filter((s) => s.from === node.id || s.to === node.id).length
      expect(arms, `${node.id} arms`).toBeGreaterThanOrEqual(2)
      expect(crosswalksFor(graph, node.id).length, `${node.id} crosswalks`).toBe(arms)
    }

    // An edit that disconnects the graph is refused. A two-segment chain
    // is a bridge: removing either segment isolates a node.
    const chain = deriveRoadGraph([0, 10, 20], [0])
    expect(validateRoadEdit(chain, { kind: 'remove-segment', segment: chain.segments['s-x0:0'] })).toEqual({
      ok: false,
      reason: 'disconnects-graph',
    })
    // A duplicate segment is refused (it overlaps the existing one).
    expect(
      validateRoadEdit(chain, {
        kind: 'add-segment',
        segment: { id: 'dup', from: 'n0:0', to: 'n1:0', curve: 0, width: 2.6 },
      }),
    ).toEqual({ ok: false, reason: 'overlaps-existing-segment' })
    // A segment to an unknown node is refused.
    expect(
      validateRoadEdit(graph, {
        kind: 'add-segment',
        segment: { id: 'ghost', from: 'n0:0', to: 'nowhere', curve: 0, width: 2.6 },
      }),
    ).toEqual({ ok: false, reason: 'unknown-node' })

    // An accepted edit persists (the network stays connected after the
    // edit is applied) and re-routes traffic: take a segment out of the
    // current shortest route and route again — the new route differs.
    const start = 'n0:0'
    const end = 'n11:13'
    const before = route(graph, start, end)
    if (!before) throw new Error('no route over the generated grid')
    const firstSeg = Object.values(graph.segments).find(
      (s) => (s.from === before[0] && s.to === before[1]) || (s.to === before[0] && s.from === before[1]),
    )
    if (!firstSeg) throw new Error('no segment on the first route step')
    const verdict = validateRoadEdit(graph, { kind: 'remove-segment', segment: firstSeg })
    expect(verdict.ok).toBe(true) // the grid has cycles: one run removed stays connected
    const next: RoadGraph = {
      nodes: { ...graph.nodes },
      segments: Object.fromEntries(Object.entries(graph.segments).filter(([id]) => id !== firstSeg.id)),
    }
    expect(graphConnected(next)).toBe(true)
    const after = route(next, start, end)
    if (!after) throw new Error('no route after the accepted edit')
    expect(after.join(' ')).not.toBe(before.join(' '))
  })

  it('routes across a disconnected network are refused, not guessed', () => {
    const chain = deriveRoadGraph([0, 10, 20], [0])
    const next: RoadGraph = { nodes: { ...chain.nodes }, segments: { ...chain.segments } }
    delete next.segments['s-x0:0']
    expect(graphConnected(next)).toBe(false)
    expect(route(next, 'n0:0', 'n2:0')).toBeNull()
    // The remaining connected pair still routes.
    expect(route(next, 'n1:0', 'n2:0')).not.toBeNull()
  })
})
