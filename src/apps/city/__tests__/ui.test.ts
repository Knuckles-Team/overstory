/**
 * @file ui.test.ts
 * @description The operator UI layer (OVERSTORY-CITY-R010/R027/R029) over a
 * real DOM: the population list is created once per character and patched
 * in place at the panel refresh (node identity survives the 4 Hz tick, and
 * so does the selection), the inspector patches its dynamic slots instead of
 * rebuilding, and every feed row carries the bus-stamped provenance and
 * replay marks.
 */
// spec: OVERSTORY-CITY-R010, OVERSTORY-CITY-R027, OVERSTORY-CITY-R029
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { bus, injectLive, setReplaying } from '../core/events'
import { initSim, resetSim, world } from '../core/sim'
import { initUI } from '../core/ui'
import type { CityActions, CityRenderer, CityUiElements } from '../core/types'

function fakeRenderer(): CityRenderer {
  return {
    render: () => undefined,
    dispose: () => undefined,
    focus: () => undefined,
    overview: () => undefined,
    say: () => undefined,
    onResize: () => undefined,
    setSelected: () => undefined,
  }
}

const noopActions: CityActions = {
  dispatch: () => undefined,
  onboard: () => undefined,
  focus: () => undefined,
  overview: () => undefined,
  setSelected: () => undefined,
  speed: () => undefined,
  setActivity: () => undefined,
  setAudio: () => undefined,
  enterBuilding: () => undefined,
  exitInterior: () => undefined,
  setView: () => undefined,
  scrub: () => undefined,
  startTour: () => undefined,
  layoutEdit: async () => ({ ok: true }),
}

function makeEls(): CityUiElements {
  const el = (tag: string): HTMLElement => {
    const e = document.createElement(tag)
    document.body.appendChild(e)
    return e
  }
  return {
    popList: el('ol'),
    inspector: el('div'),
    feedList: el('div'),
    simBadge: el('div'),
    activityBadge: el('span'),
    clock: el('span'),
    mode: el('span'),
    banner: el('div'),
    modal: el('div'),
    legend: el('div'),
    tour: el('div'),
    statPop: el('span'),
    statKnow: el('span'),
    statTools: el('span'),
    statIncidents: el('span'),
    statConnectors: el('span'),
    btnDispatch: el('button'),
    btnOverview: el('button'),
    btnOnboard: el('button'),
    btnDemo: el('button'),
    btnAudio: el('button'),
    btnView2d: el('button'),
    btnView3d: el('button'),
    scrubber: document.createElement('input'),
    scrubberReadout: el('span'),
    btnTour: el('button'),
    btnEdit: el('button'),
    editPanel: el('div'),
    speedButtons: [],
  }
}

let els: CityUiElements | null = null

beforeEach(() => {
  bus.reset()
  resetSim()
  initSim(fleetToConnectors(FLEET_SNAPSHOT))
  els = makeEls()
})

afterEach(() => {
  document.body.innerHTML = ''
  bus.reset()
  resetSim()
  els = null
})

describe('population list (R027: in place, never rebuilt)', () => {
  it('creates each row once and patches it in place across 4 Hz refreshes', () => {
    const ui = initUI(world, fakeRenderer(), noopActions, els!)
    const rows = Array.from(els!.popList.children)
    expect(rows).toHaveLength(world.characters.length)
    const first = rows[0]
    // Two panel refreshes (each over the 250 ms budget): same node instances.
    ui.tick(0.3)
    ui.tick(0.3)
    const again = Array.from(els!.popList.children)
    expect(again).toHaveLength(world.characters.length)
    expect(again[0]).toBe(first) // node identity: no rebuild
    // The dynamic parts track the world: a state change re-colors the dot.
    const ch = world.characters[0]
    const stateBefore = ch.state
    if (stateBefore === 'idle') ch.state = 'tasked'
    else ch.state = 'idle'
    ui.tick(0.3)
    const dot = again[0].querySelector<HTMLElement>('.dot')
    expect(dot?.style.background).toBeTruthy()
    // And the refresh does not lose the listeners: the row still selects.
    again[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    ui.dispose()
  })

  it('a selection survives the 4 Hz refresh on the same row node', () => {
    const ui = initUI(world, fakeRenderer(), noopActions, els!)
    const ch = world.characters[0]
    ui.select({ kind: 'character', id: ch.id })
    const row = els!.popList.querySelector<HTMLElement>(`[data-id="${ch.id}"]`)
    expect(row?.classList.contains('selected')).toBe(true)
    ui.tick(0.3)
    ui.tick(0.3)
    const same = els!.popList.querySelector<HTMLElement>(`[data-id="${ch.id}"]`)
    expect(same).toBe(row) // the selection did not move to a new node
    expect(same?.classList.contains('selected')).toBe(true)
    ui.select(null)
    ui.dispose()
  })
})

describe('inspector (in-place patching)', () => {
  it('enters and exits a selected building through the stable inspector action', () => {
    const calls: string[] = []
    const actions: CityActions = {
      ...noopActions,
      enterBuilding: (id) => calls.push(`enter:${id}`),
      exitInterior: () => calls.push('exit'),
    }
    const ui = initUI(world, fakeRenderer(), actions, els!)
    const building = Object.values(world.buildings)[0]
    expect(building).toBeTruthy()
    if (!building) return
    ui.select({ kind: 'building', id: building.id })
    const enter = els!.inspector.querySelector<HTMLButtonElement>('[data-interior-action="enter"]')
    expect(enter?.textContent).toBe('Enter interior')
    enter?.click()
    expect(calls).toEqual([`enter:${building.id}`])
    const exit = els!.inspector.querySelector<HTMLButtonElement>('[data-interior-action="exit"]')
    exit?.click()
    expect(calls).toEqual([`enter:${building.id}`, 'exit'])
    ui.dispose()
  })

  it('patches the dynamic slots instead of rebuilding the scaffold', () => {
    const ui = initUI(world, fakeRenderer(), noopActions, els!)
    const ch = world.characters[0]
    ui.select({ kind: 'character', id: ch.id })
    const stateBefore = els!.inspector.querySelector<HTMLElement>('[data-slot="state"]')
    expect(stateBefore?.textContent).toBe(ch.state)
    // Change the world, refresh: same scaffold node, patched value.
    if (ch.state === 'idle') ch.state = 'tasked'
    else ch.state = 'idle'
    ch.mood = 'test mood'
    ch.context = 42
    ui.tick(0.3)
    const state = els!.inspector.querySelector<HTMLElement>('[data-slot="state"]')
    expect(state).toBe(stateBefore) // no rebuild
    expect(state?.textContent).toBe(ch.state)
    expect(els!.inspector.querySelector<HTMLElement>('[data-slot="mood"]')?.textContent).toBe('test mood')
    expect(els!.inspector.querySelector<HTMLElement>('[data-slot="context"]')?.textContent).toBe('42%')
    ui.dispose()
  })

  it('the recent-activity slot re-renders only when a new event lands', () => {
    const ui = initUI(world, fakeRenderer(), noopActions, els!)
    const ch = world.characters[0]
    ui.select({ kind: 'character', id: ch.id })
    const eventsBefore = els!.inspector.querySelector<HTMLElement>('[data-slot="events"]')
    ui.tick(0.3)
    expect(els!.inspector.querySelector<HTMLElement>('[data-slot="events"]')).toBe(eventsBefore)
    ch.events.push({ type: 'task.queued', detail: 'new event' })
    ui.tick(0.3)
    const events = els!.inspector.querySelector<HTMLElement>('[data-slot="events"]')
    expect(events).toBe(eventsBefore) // same container
    expect(events?.textContent).toContain('new event')
    ui.dispose()
  })
})

describe('feed rows carry the bus-stamped marks (R010/R029)', () => {
  it('every row shows its provenance mark: SIM for the simulation', () => {
    const ui = initUI(world, fakeRenderer(), noopActions, els!)
    bus.emit({ type: 'task.queued', detail: 'simulated row', provenance: 'simulated' })
    const rows = els!.feedList.querySelectorAll('.feed-item')
    const row = rows[0] // the newest row is prepended
    expect(row.querySelector('.prov-chip.sim')?.textContent).toBe('SIM')
    expect(row.querySelector('.prov-chip.live')).toBeNull()
    expect(row.querySelector('.prov-chip.replay')).toBeNull()
    ui.dispose()
  })

  it('a live-injected row is marked LIVE', () => {
    const ui = initUI(world, fakeRenderer(), noopActions, els!)
    expect(injectLive({ type: 'tool.call', detail: 'from the fleet' })).toBe(true)
    const rows = els!.feedList.querySelectorAll('.feed-item')
    const row = rows[0] // the newest row is prepended
    expect(row.querySelector('.prov-chip.live')?.textContent).toBe('LIVE')
    expect(row.querySelector('.prov-chip.sim')).toBeNull()
    ui.dispose()
  })

  it('rows emitted inside the replay window carry the REPLAY mark', () => {
    const ui = initUI(world, fakeRenderer(), noopActions, els!)
    setReplaying(true)
    try {
      bus.emit({ type: 'task.assigned', detail: 'inside the replay', provenance: 'simulated' })
    } finally {
      setReplaying(false)
    }
    const rows = els!.feedList.querySelectorAll('.feed-item')
    const row = rows[0] // the newest row is prepended
    expect(row.querySelector('.prov-chip.replay')?.textContent).toBe('REPLAY')
    // The provenance mark stays honest too: the replayed world is simulated.
    expect(row.querySelector('.prov-chip.sim')).not.toBeNull()
    ui.dispose()
  })
})
