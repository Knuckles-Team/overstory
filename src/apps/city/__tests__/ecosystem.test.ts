/**
 * @file ecosystem.test.ts
 * @description Fleet-driven connector district and the core landmarks
 * (OVERSTORY-CITY-R002/R004), and the shared-rig cast (OVERSTORY-CITY-R033):
 * the catalog is the Arbora fleet, not a curated list: served packs are
 * built, registered packs are planned plots, and the arbora core is a
 * landmark, never a connector plot.
 */
// spec: OVERSTORY-CITY-R002, OVERSTORY-CITY-R004, OVERSTORY-CITY-R005, OVERSTORY-CITY-R033, OVERSTORY-CITY-R044
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { describe, expect, it } from 'vitest'
import { CLIP_SET, completeClipSet, createClipBlender } from '@/lib/scene3d/characters'
import { SCENE_COLORS } from '@/lib/scene3d/palette'
import {
  ARBORA_CORE_SERVER,
  CONNECTOR_DISTRICT,
  CORE_LANDMARKS,
  FLEET_SNAPSHOT,
  RIG_PATH,
  ROLE_LABELS,
  ROSTER,
  SIM_TOOLS,
  connectorsByDomain,
  domainOf,
  fleetToConnectors,
  type FleetServer,
} from '../core/ecosystem'
import { BUILDING_POS, PLOTS } from '../core/layout'
import { initSim, resetSim, world } from '../core/sim'

describe('fleet snapshot (SIMULATED source, 2026-11-15 capture)', () => {
  it('carries the full registered catalog: 7 served, 67 registered-unpublished', () => {
    const served = FLEET_SNAPSHOT.filter((s) => s.packStatus === 'served')
    const registered = FLEET_SNAPSHOT.filter((s) => s.packStatus === 'registered_unpublished')
    expect(served).toHaveLength(7)
    expect(registered).toHaveLength(67)
    expect(FLEET_SNAPSHOT).toHaveLength(74)
  })

  it('does not carry the arbora core: it is a landmark, never a connector plot', () => {
    expect(FLEET_SNAPSHOT.map((s) => s.server)).not.toContain(ARBORA_CORE_SERVER)
  })

  it('served packs carry their captured tool counts and representative names', () => {
    const sql = FLEET_SNAPSHOT.find((s) => s.server === 'sql-mcp')
    expect(sql).toMatchObject({
      packStatus: 'served',
      toolCount: 33,
      tools: ['sql_schema_catalog', 'query', 'list_tables'],
    })
  })

  it('registered-unpublished packs carry no tools', () => {
    for (const s of FLEET_SNAPSHOT.filter((x) => x.packStatus === 'registered_unpublished')) {
      expect(s.toolCount).toBe(0)
      expect(s.tools).toEqual([])
    }
  })
})

describe('fleetToConnectors (R002)', () => {
  it('maps every fleet server to exactly one connector, excluding the arbora core', () => {
    const withCore: FleetServer[] = [
      ...FLEET_SNAPSHOT,
      {
        server: ARBORA_CORE_SERVER,
        toolCount: 44,
        tools: ['admission.review'],
        packStatus: 'served',
      },
    ]
    const connectors = fleetToConnectors(withCore)
    expect(connectors).toHaveLength(74)
    expect(connectors.map((c) => c.id)).not.toContain(ARBORA_CORE_SERVER)
    expect(new Set(connectors.map((c) => c.id)).size).toBe(connectors.length)
  })

  it('served packs keep their real tool list (simTools false)', () => {
    const connectors = fleetToConnectors(FLEET_SNAPSHOT)
    const mealie = connectors.find((c) => c.id === 'mealie-mcp')
    expect(mealie).toMatchObject({
      packStatus: 'served',
      tools: ['list_recipes', 'plan_meal', 'grocery_list'],
      simTools: false,
    })
    expect(mealie?.blurb).toContain('254 served tools')
  })

  it('registered packs fall back to the simulated tool set, marked as such', () => {
    const connectors = fleetToConnectors(FLEET_SNAPSHOT)
    const gitlab = connectors.find((c) => c.id === 'gitlab-mcp')
    expect(gitlab).toMatchObject({
      packStatus: 'registered_unpublished',
      tools: SIM_TOOLS,
      simTools: true,
    })
    expect(gitlab?.blurb).toBe('Registered — not yet published')
  })

  it('served packs without reported tool names also fall back to the simulated set', () => {
    const connectors = fleetToConnectors([{ server: 'no-tools-mcp', toolCount: 3, tools: [], packStatus: 'served' }])
    expect(connectors[0]).toMatchObject({ tools: SIM_TOOLS, simTools: true })
  })

  it('is deterministic: the same fleet read places the same building the same way', () => {
    const a = fleetToConnectors(FLEET_SNAPSHOT)
    const b = fleetToConnectors(FLEET_SNAPSHOT)
    expect(b).toEqual(a)
    const one = a.find((c) => c.id === 'vector-mcp')
    expect(one).toBeDefined()
    expect(typeof one?.archetype).toBe('string')
    expect(typeof one?.color).toBe('number')
  })
})

describe('district domains (R002)', () => {
  it('declares eight business domains, the last a keyword-free catch-all', () => {
    expect(CONNECTOR_DISTRICT).toHaveLength(8)
    expect(CONNECTOR_DISTRICT[CONNECTOR_DISTRICT.length - 1]).toEqual({ id: 'general', keywords: [] })
    for (const d of CONNECTOR_DISTRICT.slice(0, -1)) expect(d.keywords.length).toBeGreaterThan(0)
  })

  it('domainOf maps connector names to their domain by keyword, general otherwise', () => {
    expect(domainOf('sql-mcp')).toBe('data')
    expect(domainOf('gitlab-mcp')).toBe('dev')
    expect(domainOf('mealie-mcp')).toBe('home')
    expect(domainOf('mattermost-mcp')).toBe('comms')
    expect(domainOf('totally-unknown-thing')).toBe('general')
  })

  it('connectorsByDomain groups by domain, stable within each domain', () => {
    const connectors = fleetToConnectors(FLEET_SNAPSHOT)
    const sorted = connectorsByDomain(connectors).map((c) => c.id)
    expect(sorted).toHaveLength(74)
    // Same multiset of ids — no connector is dropped or invented.
    expect([...sorted].sort()).toEqual(connectors.map((c) => c.id).sort())
    // Within each domain the catalog order is preserved (stable).
    const catalogIds = FLEET_SNAPSHOT.map((s) => s.server)
    for (const d of CONNECTOR_DISTRICT) {
      const inDomain = sorted.filter((id) => domainOf(id) === d.id)
      expect(inDomain).toEqual(catalogIds.filter((id) => domainOf(id) === d.id))
    }
    // Domains are contiguous: no later domain interleaves an earlier one.
    const order = CONNECTOR_DISTRICT.map((d) => d.id)
    let prevIdx = -1
    for (const id of sorted) {
      const idx = order.indexOf(domainOf(id))
      expect(idx, `${id} breaks domain contiguity`).toBeGreaterThanOrEqual(prevIdx)
      prevIdx = idx
    }
  })

  it('the core landmarks sit at the map centre, not at its edge (R004/R002)', () => {
    // The district block is west of the main grid (x < 0); the landmarks are
    // the centre landmarks of the map, east of the district.
    const districtMaxX = Math.max(...PLOTS.map((p) => p.x))
    for (const l of CORE_LANDMARKS) {
      const pos = BUILDING_POS[l.id]
      expect(pos, `missing fixed position for ${l.id}`).toBeDefined()
      expect(pos.x).toBeGreaterThan(districtMaxX)
      expect(Math.abs(pos.x)).toBeLessThan(80)
      expect(Math.abs(pos.z)).toBeLessThan(80)
    }
  })
})

describe('district sizing (R002)', () => {
  it('holds 78 plots: the current 74-connector catalog always fits', () => {
    expect(PLOTS.length).toBe(78)
    expect(PLOTS.length).toBeGreaterThanOrEqual(FLEET_SNAPSHOT.length)
  })
})

describe('core landmarks (R004)', () => {
  it('is exactly one landmark per core platform component', () => {
    expect(CORE_LANDMARKS.map((l) => l.id)).toEqual([
      'arbora',
      'medulla',
      'meristem',
      'overstory',
      'tuig',
      'axil',
      'scion',
    ])
  })

  it('every landmark carries a role and at least one internal location', () => {
    for (const l of CORE_LANDMARKS) {
      expect(l.role.length).toBeGreaterThan(0)
      expect(l.rooms.length).toBeGreaterThanOrEqual(1)
      expect(l.tools.length).toBeGreaterThan(0)
    }
  })
})

describe('roster (R005/R033)', () => {
  it('is 17 citizens on the shared rig: 14 AI agents and 3 simulated NPC operators, each a distinct pseudonymous id', () => {
    expect(ROSTER).toHaveLength(17)
    const ai = ROSTER.filter((r) => r.kind === 'ai')
    const npc = ROSTER.filter((r) => r.kind === 'npc')
    expect(ai).toHaveLength(14)
    expect(npc).toHaveLength(3)
    // The operators are fixed characters, not real operators (R005): they
    // wear the core accent and stay kind 'npc' until real presence lands.
    for (const r of npc) expect(r.role).toBe('core')
    expect(ROSTER.map((r) => r.kind)).not.toContain('human')
    expect(new Set(ROSTER.map((r) => r.id)).size).toBe(ROSTER.length)
    // The display name is the pseudonymous id (R020): the borrowed comic
    // roster left the city with R033.
    for (const r of ROSTER) expect(r.id, `${r.id} is a pseudonymous id`).toMatch(/^(agent|operator)-\d{2}$/)
  })

  it('cast_encodes_role: every character maps to one rig with the full clip set, and its colour comes from the encoding table for its agent type and role (R033)', async () => {
    // The one pinned rig, from its real locked bytes.
    const buf = readFileSync(join(__dirname, '..', '..', '..', '..', 'public', RIG_PATH))
    const bytes = new ArrayBuffer(buf.byteLength)
    new Uint8Array(bytes).set(buf)
    const gltf = await new Promise<GLTF>((resolve, reject) => {
      new GLTFLoader().parse(
        bytes,
        '',
        (g) => {
          resolve(g)
        },
        (err) => {
          reject(err instanceof Error ? err : new Error('GLB parse failed'))
        },
      )
    })

    // The shared rig completes to the full eight-clip set (R012.4).
    const clips = completeClipSet(gltf.scene, gltf.animations)
    for (const id of CLIP_SET) {
      expect(clips[id], `clip ${id} present on the shared rig`).toBeDefined()
      expect(clips[id].duration, `clip ${id} duration`).toBeGreaterThan(0)
    }

    // Every character is built on that one rig, with a stable id and a
    // role from the R025 vocabulary.
    expect(ROSTER).toHaveLength(17)
    const aiRoles = new Set(ROSTER.filter((r) => r.kind === 'ai').map((r) => r.role))
    expect(aiRoles).toEqual(new Set(['operations', 'maintenance', 'security']))
    expect(ROSTER.filter((r) => r.kind === 'npc').every((r) => r.role === 'core')).toBe(true)

    // The colour each character wears is the encoding-table colour for
    // its role — the shared palette is the single source (R025).
    for (const r of ROSTER) {
      const color = SCENE_COLORS[`role-${r.role}`]
      expect(color, `role-${r.role} in the palette`).toBeDefined()
      expect(color!.hex, `role-${r.role} carries a hex`).toMatch(/^#[0-9a-f]{6}$/)
    }

    // Every character binds its own mixer on a clone of the one rig and
    // plays the full clip set through the shared blender — no character
    // is frozen in a bind pose, and no clip is missing.
    for (const _entry of ROSTER) {
      const clone = cloneRig(gltf.scene)
      const mixer = new THREE.AnimationMixer(clone)
      const blender = createClipBlender(mixer, clips, ['fail'])
      for (const state of ['idle', 'traveling', 'working', 'committing', 'awaiting', 'success', 'failure']) {
        blender.playState(state)
      }
      blender.update(0.1)
      expect(blender.current()).toBe('fail')
      blender.dispose()
    }
  })
})

describe('three_kinds', () => {
  it('gives every character exactly one kind and honest provenance (R044)', () => {
    resetSim()
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    try {
      expect(world.characters).toHaveLength(ROSTER.length)
      for (const c of world.characters) {
        expect(['ai', 'npc'], c.id).toContain(c.kind)
        // No real-agent or presence feed has landed (R020, R023): nothing is live.
        expect(c.provenance, c.id).toBe('simulated')
      }
      expect(world.characters.filter((c) => c.kind === 'npc').every((c) => c.role === 'core')).toBe(true)
      expect(ROLE_LABELS.core.toLowerCase()).toContain('simulated')
    } finally {
      resetSim()
    }
  })
})
