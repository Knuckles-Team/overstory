/**
 * @file webmcp.test.ts
 * @description The City's WebMCP operator surface (OVERSTORY-CITY-R034,
 * constitution R-IV): every operator-facing city capability is a namespaced
 * tool with a bounded output schema, each dispatches through the same
 * action seam the UI consumes, strict validation rejects out-of-bounds
 * inputs, a refused layout edit resolves with its operator-facing reason,
 * and the read context is the live page state.
 */
// spec: OVERSTORY-CITY-R034, OVERSTORY-CITY-R042
import { describe, expect, it, vi } from 'vitest'
import type { LayoutEdit } from '../core/layoutEdit'
import type { CityActions } from '../core/types'
import { createCityTools, type CityToolContext, type CityToolController } from '../webmcp'

const signal = new AbortController().signal

const context: CityToolContext = {
  mode: 'SIMULATED',
  activity: 'quiet',
  speed: 1,
  view: '3d',
  clock: 3600,
  day: 1,
  selection: null,
  characters: [{ id: 'agent-01', kind: 'ai', role: 'operations', state: 'walking', context: 42 }],
  buildings: [
    {
      id: 'arbora',
      name: 'Arbora Core',
      category: 'core',
      online: true,
      packStatus: 'served',
      toolCount: 12,
    },
  ],
  recentEvents: [{ type: 'boot', detail: 'the city woke', provenance: 'simulated' }],
}

function controller(): CityToolController {
  const actions: CityActions = {
    dispatch: vi.fn(),
    onboard: vi.fn(),
    focus: vi.fn(),
    overview: vi.fn(),
    setSelected: vi.fn(),
    speed: vi.fn(),
    setActivity: vi.fn(),
    setAudio: vi.fn(),
    enterBuilding: vi.fn(),
    exitInterior: vi.fn(),
    setView: vi.fn(),
    scrub: vi.fn(),
    startTour: vi.fn(),
    toggleFirstPerson: vi.fn(),
    layoutEdit: vi.fn(async (_edit: LayoutEdit) => ({ ok: true })),
    openDialogue: vi.fn(),
    sendDialogue: vi.fn(),
    closeDialogue: vi.fn(),
    npcDialogue: vi.fn(async () => ({
      npcId: '',
      npcName: '',
      role: '',
      district: '',
      response: '',
      emotion: 'neutral' as const,
      gesture: 'nod' as const,
      duration: 5,
    })),
    npcNearby: vi.fn(() => []),
  }
  return { actions, readContext: () => context }
}

const tool = (control: CityToolController, name: string) => {
  const found = createCityTools(control).find((t) => t.name === name)
  expect(found, `the city surface must expose ${name}`).toBeDefined()
  return found as NonNullable<typeof found>
}

describe('city_webmcp_surface', () => {
  it('exposes the full operator surface as namespaced tools with output schemas', () => {
    const tools = createCityTools(controller())
    expect(tools.map((t) => t.name)).toEqual([
      'overstory.apps.city.get-context',
      'overstory.apps.city.set-view',
      'overstory.apps.city.focus',
      'overstory.apps.city.overview',
      'overstory.apps.city.select',
      'overstory.apps.city.clear-selection',
      'overstory.apps.city.start-tour',
      'overstory.apps.city.set-speed',
      'overstory.apps.city.set-activity-mode',
      'overstory.apps.city.scrub',
      'overstory.apps.city.audio',
      'overstory.apps.city.dispatch',
      'overstory.apps.city.onboard',
      'overstory.apps.city.layout-edit',
      // OVERSTORY-CITY-R022: NPC dialogue tools
      'overstory.apps.city.npc-dialogue',
      'overstory.apps.city.npc-nearby',
    ])
    for (const t of tools) {
      expect(t.capability?.outputSchema, `${t.name} must carry a capability output schema`).toBeTruthy()
    }
  })

  it('dispatches every mutation through the same action seam as the UI', async () => {
    const control = controller()
    await expect(tool(control, 'overstory.apps.city.dispatch').execute({}, { signal })).resolves.toEqual({
      updated: true,
    })
    expect(control.actions.dispatch).toHaveBeenCalledTimes(1)
    await expect(
      tool(control, 'overstory.apps.city.onboard').execute({ connectorId: 'alpha-mcp' }, { signal }),
    ).resolves.toEqual({ updated: true })
    expect(control.actions.onboard).toHaveBeenCalledWith('alpha-mcp')
    await expect(tool(control, 'overstory.apps.city.set-view').execute({ view: '2d' }, { signal })).resolves.toEqual({
      updated: true,
    })
    expect(control.actions.setView).toHaveBeenCalledWith('2d')
    await expect(tool(control, 'overstory.apps.city.set-speed').execute({ speed: 4 }, { signal })).resolves.toEqual({
      updated: true,
    })
    expect(control.actions.speed).toHaveBeenCalledWith(4)
    await expect(
      tool(control, 'overstory.apps.city.set-activity-mode').execute({ mode: 'demo' }, { signal }),
    ).resolves.toEqual({ updated: true })
    expect(control.actions.setActivity).toHaveBeenCalledWith('demo')
    await expect(tool(control, 'overstory.apps.city.audio').execute({ enabled: true }, { signal })).resolves.toEqual({
      updated: true,
    })
    expect(control.actions.setAudio).toHaveBeenCalledWith(true)
    await expect(tool(control, 'overstory.apps.city.scrub').execute({ offsetS: 120 }, { signal })).resolves.toEqual({
      updated: true,
    })
    expect(control.actions.scrub).toHaveBeenCalledWith(120)
    await expect(tool(control, 'overstory.apps.city.focus').execute({ x: 10, z: -4 }, { signal })).resolves.toEqual({
      updated: true,
    })
    expect(control.actions.focus).toHaveBeenCalledWith(10, -4)
    await expect(tool(control, 'overstory.apps.city.overview').execute({}, { signal })).resolves.toEqual({
      updated: true,
    })
    expect(control.actions.overview).toHaveBeenCalledTimes(1)
    await expect(
      tool(control, 'overstory.apps.city.select').execute({ kind: 'building', id: 'arbora' }, { signal }),
    ).resolves.toEqual({ updated: true })
    expect(control.actions.setSelected).toHaveBeenCalledWith({ kind: 'building', id: 'arbora' })
    await expect(tool(control, 'overstory.apps.city.clear-selection').execute({}, { signal })).resolves.toEqual({
      updated: true,
    })
    expect(control.actions.setSelected).toHaveBeenLastCalledWith(null)
    await expect(tool(control, 'overstory.apps.city.start-tour').execute({}, { signal })).resolves.toEqual({
      updated: true,
    })
    expect(control.actions.startTour).toHaveBeenCalledTimes(1)
  })

  it('submits layout edits through the seam with their exact edit object', async () => {
    const control = controller()
    const edit = { kind: 'move-building', buildingId: 'alpha-mcp', plot: 3 } as const
    await expect(tool(control, 'overstory.apps.city.layout-edit').execute(edit, { signal })).resolves.toEqual({
      ok: true,
    })
    expect(control.actions.layoutEdit).toHaveBeenCalledWith(edit)
  })

  it('reports a refused layout edit as a result, not an error', async () => {
    const control = controller()
    vi.mocked(control.actions.layoutEdit).mockResolvedValueOnce({ ok: false, reason: 'plot-occupied' })
    await expect(
      tool(control, 'overstory.apps.city.layout-edit').execute(
        { kind: 'move-building', buildingId: 'alpha-mcp', plot: 7 },
        { signal },
      ),
    ).resolves.toEqual({ ok: false, reason: 'plot-occupied' })
  })

  it('rejects out-of-bounds inputs without dispatching', async () => {
    const control = controller()
    await expect(tool(control, 'overstory.apps.city.set-speed').execute({ speed: 3 }, { signal })).rejects.toThrow()
    await expect(tool(control, 'overstory.apps.city.set-view').execute({ view: '4d' }, { signal })).rejects.toThrow()
    await expect(
      tool(control, 'overstory.apps.city.onboard').execute({ connectorId: 'x'.repeat(201) }, { signal }),
    ).rejects.toThrow()
    await expect(
      tool(control, 'overstory.apps.city.layout-edit').execute(
        { kind: 'move-building', buildingId: 'alpha-mcp', plot: -1 },
        { signal },
      ),
    ).rejects.toThrow()
    await expect(
      tool(control, 'overstory.apps.city.layout-edit').execute({ kind: 'explode-the-city' }, { signal }),
    ).rejects.toThrow()
    expect(control.actions.speed).not.toHaveBeenCalled()
    expect(control.actions.setView).not.toHaveBeenCalled()
    expect(control.actions.onboard).not.toHaveBeenCalled()
    expect(control.actions.layoutEdit).not.toHaveBeenCalled()
  })

  it('classifies the read as a read and the rest as confirmed local mutations', () => {
    const classes = Object.fromEntries(
      createCityTools(controller()).map((t) => [t.name.split('.').at(-1), t.capability?.mutationClass]),
    )
    expect(classes).toEqual({
      'get-context': 'read',
      'set-view': 'local-ui-mutation',
      audio: 'local-ui-mutation',
      focus: 'local-ui-mutation',
      overview: 'local-ui-mutation',
      select: 'local-ui-mutation',
      'clear-selection': 'local-ui-mutation',
      'start-tour': 'local-ui-mutation',
      'set-speed': 'local-ui-mutation',
      'set-activity-mode': 'local-ui-mutation',
      scrub: 'local-ui-mutation',
      dispatch: 'local-ui-mutation',
      onboard: 'local-ui-mutation',
      'layout-edit': 'local-ui-mutation',
      // OVERSTORY-CITY-R022
      'npc-dialogue': 'local-ui-mutation',
      'npc-nearby': 'read',
    })
  })

  it('reads the live page context through the controller', async () => {
    const control = controller()
    const readContext = vi.spyOn(control, 'readContext')
    await expect(tool(control, 'overstory.apps.city.get-context').execute({}, { signal })).resolves.toEqual(context)
    expect(readContext).toHaveBeenCalledTimes(1)
  })
})
