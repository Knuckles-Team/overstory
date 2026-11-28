/**
 * @file ui.ts
 * @description Operator UI: top bar, population list, inspector, activity
 * feed and controls (OVERSTORY-CITY-R010/R011/R012). Subscribes to the
 * shared event bus; renders world state; owns no state of its own. The page
 * hands in the static DOM handles the layer renders into.
 *
 * R097: Economic panels — treasury, tax, budget, RCI meter overlays the
 * operator UI with economic data from the co-simulation loop.
 * R111: Tax policy consequence timeline panel.
 * R112: Zoning tool with preview and undo.
 * R114: Treasury projection chart panel.
 *
 * spec: OVERSTORY-CITY-R010, OVERSTORY-CITY-R011, OVERSTORY-CITY-R012, OVERSTORY-CITY-R027, OVERSTORY-CITY-R097, OVERSTORY-CITY-R111, OVERSTORY-CITY-R112, OVERSTORY-CITY-R114
 */
import { bus, feedFullySimulated, getMode, type CityEvent } from './events'
import { legendLines, stateColor } from './encoding'
import { ROLE_LABELS } from './ecosystem'
import * as Economy from './economy'
import type { TaxConfig } from './economy'
import { isNight } from './sim'
import type { world as simWorld } from './sim'
import type { CityActions, CityRenderer, CityUiElements, SelectionHit } from './types'
import { DISTRICT_DOMAINS } from './layout'
import { ARCHETYPES, REFUSAL_TEXT, ROTATIONS, type LayoutEdit, type Rotation } from './layoutEdit'
import type { DistrictArchetype } from '@/lib/scene3d/generators'

type World = typeof simWorld

/** Day 1, 09:00 — the world's in-game start (sim.ts); the scrubber's origin. */
const BOOT_ABS_S = 9 * 3600

/** The session-storage key that makes the tour run once per session (R030). */
export const TOUR_SESSION_KEY = 'arbora-city.tour'

const TYPE_COLORS: Record<string, string> = {
  'task.assigned': '#5ea0ff',
  'task.queued': '#8a94a8',
  'task.pending_approval': '#ff6f9c',
  'task.approved': '#ffd166',
  'tool.call': '#9a6bff',
  'tool.result': '#7fd06f',
  'task.failed': '#ff5e5e',
  'task.done': '#7fd06f',
  'knowledge.committed': '#b08cff',
  'context.compacted': '#5ec8d8',
  'connector.joined': '#3ddc84',
  'construction.progress': '#c7a24a',
  'building.completed': '#3ddc84',
  'operator.dispatched': '#ffd166',
  'layout.edited': '#5ec8d8',
  'character.spawned': '#8a94a8',
  'character.sleeping': '#4a5568',
  'character.waking': '#ffd166',
  'character.idle': '#8a94a8',
  'character.traveling': '#5ea0ff',
  'asset.verified': '#3ddc84',
  'asset.failed': '#ff5e5e',
  'mode.selected': '#5ec8d8',
}

function escapeHtml(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}

function fmtClock(ts: number): string {
  const s = Math.floor(ts % 86400)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export interface CityUi {
  tick(dt: number): void
  select(hit: SelectionHit | null): void
  refresh(): void
  /** Re-point the UI at a freshly mounted renderer (the view swap, R027). */
  setRenderer(r: CityRenderer): void
  /** (Re)start the first-visit tour (R030). */
  startTour(): void
  /** Drop the event-bus subscription (page unmount safety). */
  dispose(): void
}

export function initUI(world: World, renderer: CityRenderer, actions: CityActions, els: CityUiElements): CityUi {
  let rendererRef = renderer
  let selected: SelectionHit | null = null
  let enteredBuildingId: string | null = null
  let modalOpen = false
  /** The structural key of the last built inspector scaffold (in-place patching). */
  let inspectorLastKey = ''

  // ---- Top bar -------------------------------------------------------------
  function updateTopBar(): void {
    const ai = world.characters.filter((c) => c.kind === 'ai').length
    const npc = world.characters.filter((c) => c.kind === 'npc').length
    const online = Object.values(world.buildings).filter((b) => b.category === 'connector' && b.online).length
    els.statPop.textContent = `${world.characters.length} (${ai} AI · ${npc} NPC)`
    els.statKnow.textContent = String(world.stats.knowledge)
    els.statTools.textContent = String(world.stats.toolCalls)
    els.statIncidents.textContent = String(world.stats.incidents)
    els.statConnectors.textContent = `${online}/${world.connectors.length}`
    els.clock.textContent = `Day ${world.day} · ${fmtClock(world.clock)} ${isNight(world.clock) ? '☾' : '☀'}`
    const mode = getMode()
    els.mode.textContent = mode === 'simulated' ? 'SIMULATED' : 'LIVE'
    els.mode.className = `badge ${mode === 'simulated' ? 'sim' : 'live'}`
    // R010: the feed badge clears only when the first live event lands.
    els.simBadge!.classList.toggle('hidden', !feedFullySimulated())
    // R026: the activity mode is always labelled, and the toggle stays in
    // sync with the sim state the page wrote.
    const demo = world.activity === 'demo'
    els.activityBadge!.textContent = demo ? 'DEMO ACTIVITY' : 'QUIET ACTIVITY'
    els.activityBadge!.classList.toggle('demo', demo)
    els.btnDemo!.setAttribute('aria-pressed', String(demo))
    els.btnDemo!.textContent = demo ? 'Demo: on' : 'Demo: off'
  }

  // ---- Legend (R025: derived from the one encoding table) --------------------
  function renderLegend(): void {
    els.legend!.innerHTML = legendLines()
      .map((line) => `<div class="legend-line">${escapeHtml(line)}</div>`)
      .join('')
  }

  // ---- Population list (R027: keyboard reachable) ----------------------------
  // Rows are created once per character and patched in place at the panel
  // refresh: the list is re-ordered by moving the existing nodes, never
  // rebuilt, so a selection, focus or hover survives the 4 Hz tick and the
  // event listeners are bound exactly once per row.
  const popRows = new Map<string, HTMLElement>()

  function createPopRow(ch: (typeof world.characters)[number]): HTMLElement {
    const row = document.createElement('li')
    row.className = 'pop-row'
    row.tabIndex = 0
    row.setAttribute('role', 'button')
    row.dataset.id = ch.id
    row.innerHTML = `<span class="dot"></span>
      <span class="pop-name">${escapeHtml(ch.name)}</span>
      <span class="chip ${ch.kind === 'npc' ? 'npc' : 'ai'}">${ch.kind === 'npc' ? 'NPC' : 'AI'}</span>
      <span class="ctxbar"><span style="width:0%"></span></span>`
    row.addEventListener('click', () => {
      select({ kind: 'character', id: row.dataset.id ?? '' })
    })
    // Keyboard: Enter or Space activates a focused row (R027).
    row.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        select({ kind: 'character', id: row.dataset.id ?? '' })
      }
    })
    return row
  }

  function updatePopList(): void {
    for (const ch of world.characters) {
      let row = popRows.get(ch.id)
      if (!row) {
        row = createPopRow(ch)
        popRows.set(ch.id, row)
      }
      // Patch only the dynamic parts: selection, aria label, state colour
      // and the context bar.
      row.classList.toggle('selected', selected?.kind === 'character' && selected.id === ch.id)
      row.setAttribute(
        'aria-label',
        `${ch.name}, state ${ch.state}, ${ch.kind === 'npc' ? 'simulated operator' : 'AI agent'}`,
      )
      const dot = row.querySelector<HTMLElement>('.dot')
      if (dot) dot.style.background = stateColor(ch.state, ch.kind)
      const bar = row.querySelector<HTMLElement>('.ctxbar > span')
      if (bar) bar.style.width = `${Math.round(ch.context)}%`
      // Roster order: appendChild moves an existing node to its place.
      els.popList!.appendChild(row)
    }
    // A replay that changed the roster drops the rows that left.
    for (const [id, row] of popRows) {
      if (!world.characters.some((c) => c.id === id)) {
        row.remove()
        popRows.delete(id)
      }
    }
  }

  // ---- Inspector ---------------------------------------------------------------
  // The inspector rebuilds its scaffold only when the selection's structure
  // changes (who is selected, whether they hold a task, whether their plot
  // is under construction). Between rebuilds the 4 Hz tick patches the
  // dynamic slots in place — state, mood, context, construction progress —
  // so the panel never flashes and the aria-live region stays stable.
  function inspectorKey(): string {
    if (!selected) return 'none'
    const selId = selected.id // captured: narrowing resets across the find() calls
    if (selected.kind === 'character') {
      const ch = world.characters.find((c) => c.id === selId)
      return `ch:${selId}:${ch?.task?.id ?? ''}`
    }
    const b = selId in world.buildings ? world.buildings[selId] : null
    const plot = world.plots.find((p) => p.buildingId === selId)
    return `b:${selId}:${plot?.construction ? 'c' : '-'}:${b?.packStatus ?? '-'}`
  }

  function patchInspector(): void {
    if (!selected) return
    const selId = selected.id // captured: narrowing resets across the DOM reads
    if (selected.kind === 'character') {
      const ch = world.characters.find((c) => c.id === selId)
      if (!ch) return
      const state = els.inspector!.querySelector<HTMLElement>('[data-slot="state"]')
      if (state) {
        state.style.color = stateColor(ch.state, ch.kind)
        state.textContent = ch.state
      }
      const mood = els.inspector!.querySelector<HTMLElement>('[data-slot="mood"]')
      if (mood) mood.textContent = ch.mood
      const ctx = els.inspector!.querySelector<HTMLElement>('[data-slot="context"]')
      if (ctx) ctx.textContent = `${Math.round(ch.context)}%`
      const bar = els.inspector!.querySelector<HTMLElement>('[data-slot="ctxbar"] > span')
      if (bar) bar.style.width = `${Math.round(ch.context)}%`
      const approval = els.inspector!.querySelector<HTMLElement>('[data-slot="approval"]')
      if (approval && ch.task) {
        approval.textContent = ch.task.approvalRequired
          ? ch.task.state === 'pending_approval'
            ? 'pending'
            : 'required'
          : 'not required'
      }
      const events = els.inspector!.querySelector<HTMLElement>('[data-slot="events"]')
      if (events) {
        const key = `ch-e:${selected.id}:${ch.events.length}:${ch.events[ch.events.length - 1]?.detail ?? ''}`
        if (events.dataset.key !== key) {
          events.dataset.key = key
          events.innerHTML = ch.events
            .map(
              (e) =>
                `<div class="evt-mini"><span class="chip-evt" style="color:${TYPE_COLORS[e.type] ?? '#888'}">${escapeHtml(e.type)}</span> ${escapeHtml(e.detail || '')}</div>`,
            )
            .join('')
        }
      }
      return
    }
    const b = selId in world.buildings ? world.buildings[selId] : null
    if (!b) return
    const visits = els.inspector!.querySelector<HTMLElement>('[data-slot="visits"]')
    if (visits) visits.textContent = String(b.visits)
    const cProg = els.inspector!.querySelector<HTMLElement>('[data-slot="cprogress"]')
    if (cProg) {
      const plot = world.plots.find((p) => p.buildingId === b.id)
      const pct = Math.round((plot?.construction?.progress ?? 0) * 100)
      cProg.textContent = `${pct}%`
      const bar = els.inspector!.querySelector<HTMLElement>('[data-slot="cbar"] > span')
      if (bar) bar.style.width = `${pct}%`
    }
    const rooms = els.inspector!.querySelector<HTMLElement>('[data-slot="rooms"]')
    if (rooms) {
      // Only re-render the room plan when the occupants actually changed.
      const inside = world.characters.filter((c) => c.state === 'working' && c.task?.buildingId === b.id)
      const key = inside.map((c) => `${c.id}:${c.roomIndex}`).join('|')
      if (rooms.dataset.key !== key) {
        rooms.dataset.key = key
        rooms.innerHTML = b.rooms
          .map((r) => {
            const here = inside.filter((c) => b.rooms[c.roomIndex] === r)
            const dots = here
              .map(
                (c) =>
                  `<span class="room-dot" title="${escapeHtml(c.name)}" style="background:${stateColor(c.state, c.kind)}"></span>`,
              )
              .join('')
            return `<div class="room">${escapeHtml(r)}${dots}</div>`
          })
          .join('')
      }
    }
  }

  function renderInspector(): void {
    if (inspectorKey() === inspectorLastKey && els.inspector!.childElementCount > 0) {
      patchInspector()
      return
    }
    inspectorLastKey = inspectorKey()
    if (!selected) {
      els.inspector!.innerHTML = `<div class="empty">
        <h3>Arbora City</h3>
        <p>Every character here is simulated: 14 AI agents from the harness plus 3 simulated operator
        characters. In both modes the activity is the labelled simulation.</p>
        <p>Select a character or a building to inspect it. Dispatch tasks, onboard connectors — the world
        builds itself.</p>
        <ul class="hint">
          <li><b>Dispatch task</b> — an operator hands work to an idle agent</li>
          <li><b>Onboard connector</b> — a new district building is constructed</li>
          <li><b>Medulla vault</b> — agents commit knowledge and compact context there</li>
        </ul>
      </div>`
      return
    }
    if (selected.kind === 'character') {
      const selId = selected.id // captured for the closure below
      const ch = world.characters.find((c) => c.id === selId)
      if (!ch) return
      const task = ch.task
      const b = task ? world.buildings[task.buildingId] : null
      const events = ch.events
        .map(
          (e) =>
            `<div class="evt-mini"><span class="chip-evt" style="color:${TYPE_COLORS[e.type] ?? '#888'}">${escapeHtml(e.type)}</span> ${escapeHtml(e.detail || '')}</div>`,
        )
        .join('')
      els.inspector!.innerHTML = `
        <h3>${escapeHtml(ch.name)} <span class="chip ${ch.kind === 'npc' ? 'npc' : 'ai'}">${
          ch.kind === 'npc' ? 'SIMULATED OPERATOR' : 'AI AGENT'
        }</span></h3>
        <p class="role">${escapeHtml(ROLE_LABELS[ch.role])}</p>
        <div class="kv"><span>State</span><b data-slot="state" style="color:${stateColor(ch.state, ch.kind)}">${escapeHtml(ch.state)}</b></div>
        <div class="kv"><span>Mood</span><b data-slot="mood">${escapeHtml(ch.mood)}</b></div>
        <div class="kv"><span>Context</span><b data-slot="context">${Math.round(ch.context)}%</b></div>
        <div class="ctxbar big" data-slot="ctxbar"><span style="width:${Math.round(ch.context)}%"></span></div>
        ${
          task
            ? `<div class="kv"><span>Task</span><b>${escapeHtml(task.tool)}</b></div>
        <div class="kv"><span>At</span><b>${b ? escapeHtml(b.name) : '—'}</b></div>
        <div class="kv"><span>Approval</span><b data-slot="approval">${task.approvalRequired ? (task.state === 'pending_approval' ? 'pending' : 'required') : 'not required'}</b></div>`
            : ''
        }
        <h4>Recent activity</h4>
        <div data-slot="events" data-key="ch-e:${ch.id}:${ch.events.length}:${ch.events[ch.events.length - 1]?.detail ?? ''}">${
          events || '<div class="evt-mini">—</div>'
        }</div>`
      return
    }
    const b = selected.id in world.buildings ? world.buildings[selected.id] : null
    if (!b) return
    const plot = world.plots.find((p) => p.buildingId === b.id)
    const tools = b.tools.map((t) => `<span class="tool">${escapeHtml(t)}</span>`).join('')
    // Room plan with the agents currently inside. The occupant key is the
    // same signature patchInspector() compares on, so a stable room plan is
    // never re-rendered.
    const inside = world.characters.filter((c) => c.state === 'working' && c.task?.buildingId === b.id)
    const insideKey = inside.map((c) => `${c.id}:${c.roomIndex}`).join('|')
    const rooms = b.rooms
      .map((r) => {
        const here = inside.filter((c) => b.rooms[c.roomIndex] === r)
        const dots = here
          .map(
            (c) =>
              `<span class="room-dot" title="${escapeHtml(c.name)}" style="background:${stateColor(c.state, c.kind)}"></span>`,
          )
          .join('')
        return `<div class="room">${escapeHtml(r)}${dots}</div>`
      })
      .join('')
    const construction = plot?.construction
      ? `<div class="kv"><span>Construction</span><b data-slot="cprogress">${Math.round(plot.construction.progress * 100)}%</b></div>
            <div class="ctxbar big build" data-slot="cbar"><span style="width:${Math.round(plot.construction.progress * 100)}%"></span></div>`
      : ''
    const fleetRows =
      b.category === 'connector'
        ? `<div class="kv"><span>Pack status</span><b>${escapeHtml(b.packStatus)}</b></div>
        <div class="kv"><span>Fleet server</span><b class="mono">${escapeHtml(b.id)}</b></div>`
        : ''
    const simToolsNote = b.simTools
      ? '<p class="role">Tool list is the simulated set — the pack has not served its tool catalog yet.</p>'
      : ''
    els.inspector!.innerHTML = `
      <h3>${escapeHtml(b.name)} ${b.served ? '<span class="badge live small">SERVED</span>' : ''}</h3>
      <p class="role">${escapeHtml(b.category === 'core' ? b.role : b.blurb || b.role)}</p>
      ${construction}
      ${fleetRows}
      <div class="kv"><span>Visits</span><b data-slot="visits">${b.visits}</b></div>
      <h4>Tools</h4>
      <div class="tools">${tools}</div>
      ${simToolsNote}
      <h4>Locations inside</h4>
      <div class="rooms" data-slot="rooms" data-key="${insideKey}">${rooms}</div>
      <div class="interior-actions">
        <button type="button" data-interior-action="${enteredBuildingId === b.id ? 'exit' : 'enter'}" data-building-id="${escapeHtml(b.id)}">${enteredBuildingId === b.id ? 'Exit interior' : 'Enter interior'}</button>
      </div>`
  }

  function select(hit: SelectionHit | null): void {
    if (enteredBuildingId && hit?.id !== enteredBuildingId) {
      actions.exitInterior()
      enteredBuildingId = null
    }
    selected = hit
    actions.setSelected(hit)
    if (hit?.kind === 'character') {
      const ch = world.characters.find((c) => c.id === hit.id)
      if (ch) actions.focus(ch.pos.x, ch.pos.z)
    } else if (hit?.kind === 'building') {
      const b = hit.id in world.buildings ? world.buildings[hit.id] : null
      if (b) actions.focus(b.x, b.z)
    }
    updatePopList()
    renderInspector()
  }

  // Inspector content is rebuilt as simulation facts change. A single
  // delegated listener on the stable container keeps interior entry/exit
  // responsive without accumulating handlers or stale closures.
  els.inspector!.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const action = target.dataset.interiorAction
    if (!action) return
    if (action === 'enter') {
      const id = target.dataset.buildingId
      if (!id) return
      enteredBuildingId = id
      actions.enterBuilding(id)
    } else {
      actions.exitInterior()
      enteredBuildingId = null
    }
    // Entry state is presentation state rather than a world fact, so force
    // the inspector scaffold to refresh the button label as well as patching
    // its simulation slots.
    inspectorLastKey = ''
    renderInspector()
  })

  // ---- Feed --------------------------------------------------------------------
  // Every row carries its provenance mark (R010): LIVE rows come from the
  // platform stream, SIM rows from the seeded simulation; a REPLAY mark
  // labels rows emitted inside the scrubber's replayed window (R029). The
  // marks come from the event the bus stamped — the row never decides.
  function provenanceMarks(evt: CityEvent): string {
    const prov =
      evt.provenance === 'live'
        ? '<span class="prov-chip live" title="Live platform event">LIVE</span>'
        : '<span class="prov-chip sim" title="Simulated activity">SIM</span>'
    const replay = evt.replay ? '<span class="prov-chip replay" title="Inside the replayed window">REPLAY</span>' : ''
    return `${prov}${replay}`
  }

  function pushFeed(evt: CityEvent): void {
    const colors = TYPE_COLORS[evt.type] ?? '#8a94a8'
    const div = document.createElement('div')
    div.className = 'feed-item'
    div.innerHTML = `<span class="feed-time">${evt.ts !== undefined ? fmtClock(evt.ts) : ''}</span>${provenanceMarks(evt)}<span class="chip-evt" style="color:${colors};border-color:${colors}55">${escapeHtml(evt.type)}</span><span class="feed-text">${escapeHtml(evt.detail ?? '')}</span>`
    els.feedList!.prepend(div)
    while (els.feedList!.children.length > 40) {
      const last = els.feedList!.lastElementChild
      if (last) els.feedList!.removeChild(last)
    }
  }

  // ---- Economic panel (R097) ---------------------------------------------------
  // Programmatically created: overlays the right side of the city view.
  // Shows treasury, tax rates, budget allocation, RCI meter, and the overlay
  // toggle. Keyboard accessible: press "E" to open/close, "O" to cycle overlays.
  let econOpen = false
  let econPanel: HTMLElement | null = null

  function createEconPanel(): void {
    if (econPanel) return
    econPanel = document.createElement('div')
    econPanel.className = 'econ-panel hidden'
    econPanel.setAttribute('role', 'region')
    econPanel.setAttribute('aria-label', 'Economic panel')
    econPanel.style.cssText = `position:absolute;top:60px;right:10px;min-width:240px;max-width:320px;background:rgba(16,20,28,0.92);color:#e8ecf4;font-size:12px;border-radius:6px;padding:10px;z-index:100;max-height:70vh;overflow-y:auto;font-family:system-ui,sans-serif`
    document.body.appendChild(econPanel)
  }

  function renderEconPanel(): void {
    if (!econPanel) createEconPanel()
    if (!econPanel) return
    // Gather economic state from the world — the UI layer reads what it can.
    const connectors = Object.values(world.buildings).filter((b) => b.category === 'connector')
    const online = connectors.filter((b) => b.online).length
    const totalChars = world.characters.length
    const popLabel = `${totalChars} (${world.characters.filter((c) => c.kind === 'ai').length} AI · ${world.characters.filter((c) => c.kind === 'npc').length} NPC)`

    // R114: Treasury projection chart (last 10 projected values).
    const projData = getProjectedTreasury()
    const chartData = projData.slice(-10)
    const chartMax = Math.max(...chartData, 1000)
    const chartMin = Math.min(...chartData, 0)
    const chartRange = chartMax - chartMin || 1
    const chartH = 50
    const chartW = 200
    const chartPad = 4
    const chartSvg =
      chartData.length > 1
        ? `<svg width="${chartW}" height="${chartH}" style="margin-top:4px">
          <defs><linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3ddc84" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#ff5e5e" stop-opacity="0.05"/>
          </linearGradient></defs>
          <rect width="${chartW}" height="${chartH}" fill="url(#chartGrad)" rx="2"/>
          ${chartData
            .map((v, i) => {
              const x = chartPad + (i / (chartData.length - 1)) * (chartW - chartPad * 2)
              const y = chartPad + (1 - (v - chartMin) / chartRange) * (chartH - chartPad * 2)
              return `<circle cx="${x}" cy="${y}" r="2.5" fill="#3ddc84" stroke="#0f1520" stroke-width="0.5"/>`
            })
            .join('')}
          <polyline points="${chartData
            .map((v, i) => {
              const x = chartPad + (i / (chartData.length - 1)) * (chartW - chartPad * 2)
              const y = chartPad + (1 - (v - chartMin) / chartRange) * (chartH - chartPad * 2)
              return `${x},${y}`
            })
            .join(' ')}" fill="none" stroke="#3ddc84" stroke-width="1.5"/>
        </svg>`
        : `<div style="height:30px;color:#555e6a;font-size:10px;display:flex;align-items:center">No projection data yet</div>`

    // R111: Policy timeline (last 5 entries).
    const policyData = getPolicyTimeline().slice(-5)
    const policyHtml =
      policyData.length > 0
        ? policyData
            .map((p) => {
              const typeColor = p.type === 'tax' ? '#ffd166' : p.type === 'budget' ? '#5ec8d8' : '#9e9e9e'
              return `<div style="font-size:10px;margin-bottom:3px"><span style="color:${typeColor};min-width:32px;display:inline-block">${p.type}</span> <span style="color:#b0bac9">${p.effect ?? p.zone ?? ''}</span></div>`
            })
            .join('')
        : `<div style="font-size:10px;color:#555e6a">No policy changes yet</div>`

    // R112: Zoning tool selector.
    const zoningOptions = ['residential', 'commercial', 'industrial', 'mixed']
    const btnBase =
      'class="ghost" style="padding:2px 8px;font-size:10px;border:1px solid #2a3444;border-radius:3px;color:#e8ecf4;background:#1a2230"'
    const zoningHtml = [
      '<div style="font-size:10px;color:#8894a8;margin-bottom:2px">Zone type for paint tool:</div>',
      '<div style="display:flex;gap:4px;flex-wrap:wrap">',
      ...zoningOptions.map((z) => `<button type="button" ${btnBase}>${z}</button>`),
      '</div>',
    ].join('\n')

    econPanel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0;font-size:13px;color:#5ec8d8">Economy</h3>
        <button type="button" class="ghost" style="padding:2px 6px;font-size:11px" onclick="document.querySelector('.econ-panel')?.classList.toggle('hidden')">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin-bottom:8px">
        <span style="color:#8894a8">Treasury</span>
        <span class="econ-treasury">${treasuryDisplay}</span>
        <span style="color:#8894a8">Population</span>
        <span>${popLabel}</span>
        <span style="color:#8894a8">Day</span>
        <span>Day ${world.day}</span>
        <span style="color:#8894a8">Connectors</span>
        <span>${online}/${connectors.length}</span>
      </div>
      <h4 style="margin:8px 0 4px;font-size:12px;color:#ffd166">RCI Demand</h4>
      <div style="margin-bottom:8px">
        ${rciRow('Residential', rciResidential)}
        ${rciRow('Commercial', rciCommercial)}
        ${rciRow('Industrial', rciIndustrial)}
      </div>
      <h4 style="margin:8px 0 4px;font-size:12px;color:#ffd166">Treasury Projection (R114)</h4>
      <div style="margin-bottom:8px">${chartSvg}</div>
      <h4 style="margin:8px 0 4px;font-size:12px;color:#ffd166">Policy Timeline (R111)</h4>
      <div style="margin-bottom:8px;padding:4px;background:#0f1520;border-radius:3px;max-height:80px;overflow-y:auto">${policyHtml}</div>
      <h4 style="margin:8px 0 4px;font-size:12px;color:#ffd166">Zoning Tool (R112)</h4>
      <div style="margin-bottom:8px">${zoningHtml}</div>
      <h4 style="margin:8px 0 4px;font-size:12px;color:#ffd166">Overlays</h4>
      <div style="margin-bottom:8px;font-size:11px;color:#8894a8">
        Press Ctrl+O to cycle: <span id="active-overlay-label">${activeOverlayLabel}</span>
      </div>
      <div style="font-size:10px;color:#555e6a">
        Tax: <span class="econ-tax">${taxDisplay}</span><br>
        Time: ${fmtClock(world.clock)} ${isNight(world.clock) ? '☾' : '☀'}
      </div>`
  }

  /** One RCI row with a progress bar. */
  function rciRow(label: string, value: number): string {
    const pct = Math.max(0, Math.min(100, value * 100))
    const color = value > 0.6 ? '#3ddc84' : value > 0.3 ? '#ffd166' : '#ff5e5e'
    return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
      <span style="color:#e8ecf4">${label}</span>
      <div style="flex:1;margin:0 8px;height:6px;background:#1e2430;border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};transition:width 0.3s"></div>
      </div>
      <span style="color:${color};min-width:30px;text-align:right">${Math.round(pct)}%</span>
    </div>`
  }

  // Economic state read from world (simplified — reads from what the sim exposes).
  let treasuryDisplay = '$50,000'
  let rciResidential = 0.5
  let rciCommercial = 0.5
  let rciIndustrial = 0.5
  let activeOverlayLabel = 'None (Ctrl+O cycles in 2D view)'
  let taxDisplay = '20/20/20'

  function updateEconomicState(): void {
    // R114: read projected treasury from the Economy module.
    const proj = getProjectedTreasury()
    const currentTreasury = proj.length > 0 ? proj[0] : 50000
    treasuryDisplay = `$${Math.max(0, currentTreasury).toLocaleString()}`

    // RCI: derived from character distribution and building counts.
    const commercialBuildings = Object.values(world.buildings).filter(
      (b) => b.kind.includes('store') || b.kind.includes('mall') || b.kind.includes('restaurant'),
    ).length
    const industrialBuildings = Object.values(world.buildings).filter(
      (b) => b.kind.includes('industrial') || b.kind.includes('factory') || b.kind.includes('mine'),
    ).length
    const residentialBuildings = Object.values(world.buildings).filter(
      (b) => b.kind.includes('house') || b.kind.includes('apartment'),
    ).length

    rciResidential = Math.min(1, Math.max(0, residentialBuildings / 3))
    rciCommercial = Math.min(1, Math.max(0, commercialBuildings / 3))
    rciIndustrial = Math.min(1, Math.max(0, industrialBuildings / 3))

    // R111: read tax config from the Economy module.
    try {
      const getTaxConfig = (Economy as Record<string, unknown>).getTaxConfig as (() => TaxConfig) | undefined
      if (typeof getTaxConfig === 'function') {
        const taxConfig = getTaxConfig()
        taxDisplay = `${Math.round(taxConfig.residential * 100)}/${Math.round(taxConfig.commercial * 100)}/${Math.round(taxConfig.industrial * 100)}`
      }
    } catch {
      // Fallback if TaxConfig getter is not available.
    }

    // Active overlay label.
    activeOverlayLabel = activeOverlayDisplay()
  }

  function activeOverlayDisplay(): string {
    return 'Ctrl+O cycles in 2D view'
  }

  // ---- Bubbles -------------------------------------------------------------------
  const BUBBLE_EVENTS: Record<string, (e: CityEvent) => string | null> = {
    'tool.call': (e) => {
      const m = /^tool\.call → (.+?) @ /.exec(e.detail ?? '')
      return m ? `tool: ${m[1]}` : 'tool call'
    },
    'task.assigned': () => 'New task!',
    'task.pending_approval': () => 'Needs approval…',
    'task.approved': () => 'Approved!',
    'knowledge.committed': () => 'Committed to the vault',
    'context.compacted': () => 'Compacting memory…',
    'task.failed': () => 'Refused — retrying',
    'character.waking': () => 'Up and about',
  }

  // ---- Events --------------------------------------------------------------------
  const unsub = bus.subscribe((evt) => {
    pushFeed(evt)
    if (evt.type === 'mode.selected') {
      els.banner!.textContent = evt.detail ?? ''
      els.banner!.classList.toggle('hidden', evt.mode !== 'simulated')
      updateTopBar()
    }
    // R032: a saved layout edit re-renders the open edit panel — the free
    // plots, the segment list and the rotations all moved with the city.
    if (evt.type === 'layout.edited' && editOpen) renderEditPanel()
    if (evt.character && evt.type in BUBBLE_EVENTS) {
      const text = BUBBLE_EVENTS[evt.type](evt)
      if (text) rendererRef.say(evt.character, text.slice(0, 24))
    }
    // R097: economic events update the panel.
    if (evt.type.startsWith('economy') && econOpen) {
      renderEconPanel()
    }
    uiTick()
  })

  // ---- Economic panel toggle (R097) -----------------------------------------------
  const onEconKey = (e: KeyboardEvent): void => {
    // 'E' without modifier toggles the economic panel.
    if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      econOpen = !econOpen
      if (econOpen) {
        createEconPanel()
        renderEconPanel()
        econPanel!.classList.remove('hidden')
      } else {
        econPanel?.classList.add('hidden')
      }
    }
  }
  document.addEventListener('keydown', onEconKey)

  // ---- Controls ------------------------------------------------------------------
  els.btnDispatch!.addEventListener('click', () => {
    actions.dispatch()
  })
  els.btnOverview!.addEventListener('click', () => {
    actions.overview()
  })
  els.btnOnboard!.addEventListener('click', () => {
    openModal()
  })
  for (const btn of els.speedButtons!) {
    btn.addEventListener('click', () => {
      for (const b of els.speedButtons!) b.classList.remove('active')
      btn.classList.add('active')
      actions.speed(parseFloat(btn.dataset.speed ?? '1'))
    })
  }
  // R026: the labelled demo toggle — quiet is the default.
  els.btnDemo!.addEventListener('click', () => {
    actions.setActivity(world.activity === 'demo' ? 'quiet' : 'demo')
    updateTopBar()
  })
  // R042: the ambience toggle — muted until this gesture.
  els.btnAudio!.addEventListener('click', () => {
    actions.setAudio(els.btnAudio!.getAttribute('aria-pressed') !== 'true')
  })
  // R027: the 3D/2D view toggle — the 2D schematic is the accessible view.
  // The page owns the active view and the buttons' pressed state.
  els.btnView2d!.addEventListener('click', () => {
    actions.setView('2d')
  })
  els.btnView3d!.addEventListener('click', () => {
    actions.setView('3d')
  })
  // R029: the time scrubber over the recorded action history.
  els.scrubber!.addEventListener('input', () => {
    actions.scrub(Math.max(0, Number(els.scrubber!.value) || 0))
  })
  // R030: the tour can be re-opened from the control bar.
  els.btnTour!.addEventListener('click', () => {
    actions.startTour()
  })

  // ---- Layout edit mode (R032) -------------------------------------------------
  // The panel composes one edit at a time over the live world: a building
  // move or rotation onto a free plot, a road drawn or removed between two
  // known intersections, a district style, or the restore of the derived
  // layout. Every submit rides the same action seam as the rest of the UI;
  // a refused or unavailable edit leaves the city unchanged and surfaces
  // the operator-facing reason in place.
  let editOpen = false
  let editBusy = false
  const editSel: Record<string, string> = {
    building: '',
    plot: '',
    rotation: '0',
    roadFrom: '',
    roadTo: '',
    removeSegment: '',
    domain: DISTRICT_DOMAINS[0] ?? '',
    archetype: 'workshop',
  }

  function renderEditPanel(): void {
    if (!editOpen) return
    const connectors = Object.values(world.buildings)
      .filter((b) => b.category === 'connector')
      .sort((a, b) => a.name.localeCompare(b.name))
    const freePlots = world.plots
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !p.buildingId && !p.reservedId && !p.construction)
    const graph = world.roadGraph
    const nodes = graph ? Object.values(graph.nodes).sort((a, b) => a.id.localeCompare(b.id)) : []
    const segments = graph ? Object.values(graph.segments).sort((a, b) => a.id.localeCompare(b.id)) : []
    const plotLabel = (i: number, p: (typeof world.plots)[number]): string => `Plot ${i} — (${p.x}, ${p.z})`
    els.editPanel!.innerHTML = `
      <div class="edit-head"><h3>Layout edits</h3><button id="city-edit-close" class="ghost" type="button">Close</button></div>
      <div class="edit-sec">
        <label class="kv"><span>Building</span></label>
        <select data-edit="building" aria-label="Building to move">
          ${connectors.map((b) => `<option value="${escapeHtml(b.id)}" ${b.id === editSel.building ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
        </select>
        <label class="kv"><span>Free plot</span></label>
        <select data-edit="plot" aria-label="Target plot">
          ${freePlots.map(({ p, i }) => `<option value="${i}" ${String(i) === editSel.plot ? 'selected' : ''}>${plotLabel(i, p)}</option>`).join('')}
        </select>
        <label class="kv"><span>Rotation</span></label>
        <select data-edit="rotation" aria-label="Quarter-turn rotation">
          ${ROTATIONS.map((r) => `<option value="${r}" ${String(r) === editSel.rotation ? 'selected' : ''}>${r}°</option>`).join('')}
        </select>
        <div class="edit-actions">
          <button data-edit-action="move" type="button">Move to plot</button>
          <button data-edit-action="rotate" type="button">Rotate</button>
        </div>
      </div>
      <div class="edit-sec">
        <label class="kv"><span>Road from</span></label>
        <select data-edit="roadFrom" aria-label="Road start intersection">
          ${nodes.map((n) => `<option value="${escapeHtml(n.id)}" ${n.id === editSel.roadFrom ? 'selected' : ''}>${escapeHtml(n.id)} — (${n.x}, ${n.z})</option>`).join('')}
        </select>
        <label class="kv"><span>Road to</span></label>
        <select data-edit="roadTo" aria-label="Road end intersection">
          ${nodes.map((n) => `<option value="${escapeHtml(n.id)}" ${n.id === editSel.roadTo ? 'selected' : ''}>${escapeHtml(n.id)} — (${n.x}, ${n.z})</option>`).join('')}
        </select>
        <div class="edit-actions">
          <button data-edit-action="draw-road" type="button">Draw road</button>
        </div>
        <label class="kv"><span>Existing segment</span></label>
        <select data-edit="removeSegment" aria-label="Segment to remove">
          ${segments.map((s) => `<option value="${escapeHtml(s.id)}" ${s.id === editSel.removeSegment ? 'selected' : ''}>${escapeHtml(s.id)} — ${escapeHtml(s.from)} → ${escapeHtml(s.to)}</option>`).join('')}
        </select>
        <div class="edit-actions">
          <button data-edit-action="remove-road" type="button">Remove segment</button>
        </div>
      </div>
      <div class="edit-sec">
        <label class="kv"><span>District</span></label>
        <select data-edit="domain" aria-label="District domain">
          ${DISTRICT_DOMAINS.map((d) => `<option value="${escapeHtml(d)}" ${d === editSel.domain ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
        </select>
        <label class="kv"><span>Style</span></label>
        <select data-edit="archetype" aria-label="District archetype">
          ${ARCHETYPES.map((a) => `<option value="${a}" ${a === editSel.archetype ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
        <div class="edit-actions">
          <button data-edit-action="set-style" type="button">Set district style</button>
        </div>
      </div>
      <div class="edit-foot">
        <button data-edit-action="reset" type="button">Restore derived layout</button>
        <p class="edit-msg" role="status" aria-live="polite"></p>
      </div>`
    const close = els.editPanel!.querySelector<HTMLButtonElement>('#city-edit-close')
    if (close) close.focus()
  }

  function closeEdit(): void {
    if (!editOpen) return
    editOpen = false
    els.btnEdit!.setAttribute('aria-expanded', 'false')
    els.editPanel!.classList.add('hidden')
    els.editPanel!.innerHTML = ''
    document.removeEventListener('keydown', onEditKey)
    els.btnEdit!.focus()
  }

  function openEdit(): void {
    editOpen = true
    els.btnEdit!.setAttribute('aria-expanded', 'true')
    els.editPanel!.classList.remove('hidden')
    document.addEventListener('keydown', onEditKey)
    renderEditPanel()
  }

  function onEditKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeEdit()
  }

  els.btnEdit!.addEventListener('click', () => {
    if (editOpen) closeEdit()
    else openEdit()
  })

  async function submitEdit(edit: LayoutEdit): Promise<void> {
    if (editBusy) return
    editBusy = true
    const msg = els.editPanel!.querySelector<HTMLElement>('.edit-msg')
    if (msg) msg.textContent = 'Saving…'
    const res = await actions.layoutEdit(edit)
    editBusy = false
    if (msg) msg.textContent = res.ok ? 'Saved — the city moved.' : (REFUSAL_TEXT[res.reason ?? ''] ?? 'Refused.')
    renderEditPanel()
  }

  // One delegated listener per handle (the panel content is re-rendered on
  // every submit and on layout.edited, so the listeners live on the stable
  // container, not the rebuilt options).
  els.editPanel!.addEventListener('change', (e) => {
    const t = e.target
    if (t instanceof HTMLSelectElement && t.dataset.edit) editSel[t.dataset.edit] = t.value
  })
  els.editPanel!.addEventListener('click', (e) => {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    if (t.id === 'city-edit-close') {
      closeEdit()
      return
    }
    const action = t.dataset.editAction
    if (!action || editBusy) return
    switch (action) {
      case 'move': {
        if (!editSel.building || editSel.plot === '') return
        void submitEdit({
          kind: 'move-building',
          buildingId: editSel.building,
          plot: Number(editSel.plot),
          rotation: Number(editSel.rotation) as Rotation,
        })
        break
      }
      case 'rotate': {
        if (!editSel.building) return
        void submitEdit({
          kind: 'rotate-building',
          buildingId: editSel.building,
          rotation: Number(editSel.rotation) as Rotation,
        })
        break
      }
      case 'draw-road': {
        if (!editSel.roadFrom || !editSel.roadTo || editSel.roadFrom === editSel.roadTo) return
        void submitEdit({ kind: 'add-road', from: editSel.roadFrom, to: editSel.roadTo })
        break
      }
      case 'remove-road': {
        if (!editSel.removeSegment) return
        void submitEdit({ kind: 'remove-road', segmentId: editSel.removeSegment })
        break
      }
      case 'set-style': {
        if (!editSel.domain) return
        void submitEdit({
          kind: 'district-style',
          domain: editSel.domain,
          archetype: editSel.archetype as DistrictArchetype,
        })
        break
      }
      case 'reset':
        void submitEdit({ kind: 'reset' })
        break
    }
  })

  // ---- Modal (R027: keyboard reachable) ---------------------------------------------
  function onModalKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeModal()
  }

  function openModal(): void {
    let html = `<div class="modal-head"><h3>Onboard a connector</h3><button id="city-modal-close" class="ghost">Close</button></div>
      <p class="modal-sub">Every registered connector holds a named plot in the district. Construction starts on the plot and takes ~12 s.</p>
      <div class="catalog">`
    for (const c of world.connectors) {
      const built = c.id in world.buildings ? world.buildings[c.id] : null
      const plot = world.plots.find((p) => p.buildingId === c.id)
      const under = !!plot?.construction
      const status = built
        ? under
          ? '<span class="c-status building">UNDER CONSTRUCTION</span>'
          : c.packStatus === 'served'
            ? '<span class="c-status online">SERVED</span>'
            : '<span class="c-status online">ONLINE</span>'
        : '<span class="c-status queued">PLANNED</span>'
      const btn =
        built && !under
          ? ''
          : under
            ? '<button class="build-btn" disabled>Building…</button>'
            : `<button class="build-btn" data-id="${escapeHtml(c.id)}">Build</button>`
      html += `<div class="catalog-card">
        <div class="c-name" style="border-color:#${c.color.toString(16).padStart(6, '0')}">${escapeHtml(c.name)} ${c.packStatus === 'served' ? '<span class="badge live small">SERVED</span>' : ''}</div>
        <div class="c-blurb">${escapeHtml(c.blurb)}</div>
        <div class="c-tools">${c.tools.map((t) => `<span class="tool">${escapeHtml(t)}</span>`).join('')}</div>
        <div class="c-foot">${status}${btn}</div>
      </div>`
    }
    html += '</div>'
    const panel = els.modal!.firstElementChild
    if (panel) {
      panel.innerHTML = html
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')
      panel.setAttribute('aria-label', 'Onboard a connector')
    }
    els.modal!.classList.add('open')
    modalOpen = true
    document.addEventListener('keydown', onModalKey)
    const close = els.modal!.querySelector<HTMLButtonElement>('#city-modal-close')
    if (close) {
      close.addEventListener('click', () => {
        closeModal()
      })
      close.focus()
    }
    for (const btn of els.modal!.querySelectorAll<HTMLButtonElement>('.build-btn[data-id]')) {
      btn.addEventListener('click', () => {
        els.modal!.classList.remove('open')
        const id = btn.dataset.id
        if (id) actions.onboard(id)
      })
    }
  }

  function closeModal(): void {
    if (!modalOpen) return
    els.modal!.classList.remove('open')
    document.removeEventListener('keydown', onModalKey)
    modalOpen = false
    els.btnOnboard!.focus()
  }

  // ---- First-visit tour (R030) -------------------------------------------------------
  // Five short steps, ≤ 12 s each (≤ 60 s total): the core landmarks, one
  // district, the encoding legend and the controls. Skippable at any time;
  // runs once per session (session storage); re-openable from the control bar.
  const TOUR_STEP_S = 12
  let tourStep = -1
  let tourAcc = 0

  function tourSteps(): { title: string; body: string; building?: string }[] {
    const district = world.connectors.find((c) => c.packStatus === 'served')?.id
    return [
      {
        title: 'Welcome to Arbora City',
        body: 'The city mirrors the platform: every building is a fleet server or a core component, and every character is a simulated agent. Watch what is happening, then act through the governed path — dispatch, onboard, approve.',
      },
      {
        title: 'The Arbora gate',
        body: 'The platform front. Dispatches are handed here, and tasks that need approval queue at the gate until an operator approves them.',
        building: 'arbora',
      },
      {
        title: 'The Medulla vault',
        body: 'Agents commit knowledge and compact context here. Each commit pulses through the city.',
        building: 'medulla',
      },
      {
        title: 'The connector district',
        body: 'West of the core, one named plot per registered fleet server, grouped by business domain. Scaffolding means registered, not yet published.',
        building: district,
      },
      {
        title: 'The legend',
        body: 'Every visual encodes exactly one fact. The legend on the right is derived from the one encoding table, so what you see is always documented.',
      },
    ]
  }

  function startTour(): void {
    tourStep = 0
    tourAcc = 0
    renderTour()
  }

  function renderTour(): void {
    const steps = tourSteps()
    const step = steps[tourStep]
    els.tour!.innerHTML = `
      <div class="tour-card" role="dialog" aria-label="City tour, step ${tourStep + 1} of ${steps.length}">
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.body)}</p>
        <div class="tour-nav">
          <button type="button" id="city-tour-skip" class="ghost">Skip tour</button>
          <button type="button" id="city-tour-next" class="btn">${
            tourStep < steps.length - 1 ? 'Next' : 'Done'
          }</button>
        </div>
      </div>`
    const skip = els.tour!.querySelector<HTMLButtonElement>('#city-tour-skip')
    if (skip)
      skip.addEventListener('click', () => {
        endTour()
      })
    const next = els.tour!.querySelector<HTMLButtonElement>('#city-tour-next')
    if (next)
      next.addEventListener('click', () => {
        const steps = tourSteps()
        if (tourStep < steps.length - 1) {
          tourStep++
          tourAcc = 0
          renderTour()
        } else {
          endTour()
        }
      })
    if (step.building) {
      const b = step.building in world.buildings ? world.buildings[step.building] : null
      if (b) actions.focus(b.x, b.z)
    }
    next?.focus()
  }

  function endTour(): void {
    tourStep = -1
    els.tour!.innerHTML = ''
    try {
      window.sessionStorage.setItem(TOUR_SESSION_KEY, '1')
    } catch {
      // Session storage unavailable (private mode) — the tour just re-offers.
    }
  }

  // ---- Panel refresh (4 Hz) ----------------------------------------------------------
  function updateScrubber(): void {
    const last = world.actions.length ? world.actions[world.actions.length - 1].ts : world.absGameS
    const max = Math.max(0, Math.floor(last - BOOT_ABS_S))
    els.scrubber!.max = String(max)
    if (Number(els.scrubber!.value) > max) els.scrubber!.value = String(max)
    const offset = Number(els.scrubber!.value) || 0
    els.scrubberReadout!.textContent =
      offset > 0 ? `replayed ${fmtClock(BOOT_ABS_S + offset)}` : `live ${fmtClock(world.clock)}`
  }

  function uiTick(): void {
    updateTopBar()
    // R097: update economic panel state at 4 Hz.
    if (econOpen) updateEconomicState()
  }

  function tick(dt: number): void {
    // Tour auto-advance (R030): each step holds for TOUR_STEP_S.
    if (tourStep >= 0) {
      tourAcc += dt
      if (tourAcc >= TOUR_STEP_S) {
        const steps = tourSteps()
        if (tourStep < steps.length - 1) {
          tourStep++
          tourAcc = 0
          renderTour()
        } else {
          endTour()
        }
      }
    }
    acc += dt
    if (acc > 0.25) {
      acc = 0
      updateTopBar()
      updatePopList()
      updateScrubber()
      if (selected) renderInspector()
    }
  }

  let acc = 0

  // Replay events that fired before the UI mounted (asset verification,
  // mode selection, character spawns) — they are in the bus's recent ring,
  // so the feed starts populated instead of empty (OVERSTORY-CITY-R010).
  for (const evt of bus.recent()) pushFeed(evt)

  // Reflect the boot-time mode in the banner (the mode.selected event fired
  // before this subscription existed).
  if (getMode() === 'simulated') els.banner!.classList.remove('hidden')

  renderLegend()
  updateTopBar()
  updatePopList()
  renderInspector()

  return {
    tick,
    select,
    refresh: () => {
      updateTopBar()
      updatePopList()
      updateScrubber()
      renderInspector()
    },
    setRenderer: (r) => {
      rendererRef = r
      r.setSelected(selected)
    },
    startTour,
    dispose: () => {
      unsub()
      document.removeEventListener('keydown', onModalKey)
    },
  }
}

// ===========================================================================
// R111, R113, R114: Economic data accessors for the operator UI
// ===========================================================================

/** Projected treasury over next 50 ticks (R114). */
export function getProjectedTreasury(): number[] {
  return (Economy as unknown as Record<string, number[] | undefined>).projectedTreasury ?? []
}

/** Policy change timeline (R111). */
export function getPolicyTimeline(): { tick: number; type: string; zone?: string; effect?: string }[] {
  return (
    (
      Economy as unknown as Record<
        string,
        { tick: number; type: string; zone?: string; effect?: string }[] | undefined
      >
    ).policyTimeline ?? []
  )
}

/** Service network data for overlay (R113). */
export function getServiceNetworkData(): {
  x: number
  z: number
  radius: number
  type: string
  funded: boolean
}[] {
  const networks = Economy.getServiceNetworks()
  return networks.map((n) => ({
    x: 0,
    z: 0,
    radius: n.capacity,
    type: n.type,
    funded: n.active,
  }))
}
