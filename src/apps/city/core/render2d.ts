/**
 * @file render2d.ts
 * @description 2D schematic fallback for clients without WebGL
 * (OVERSTORY-CITY-R015). Same city graph, same characters, same events — a
 * view over the shared world state, never a second system.
 */
import { WATER_Z, PLOT_W, HOUSES, PARKS, PIER } from './layout'
import { encodingColor, stateColor } from './encoding'
import { world as simWorld } from './sim'
import type { CityRenderer, SelectionHit } from './types'

/**
 * WebGL probe (OVERSTORY-CITY-R015): the page mounts the 3D scene only when
 * the client can create a GL context; anything else gets the 2D schematic
 * of the same city graph.
 */
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function init2D(
  container: HTMLElement,
  world: typeof simWorld,
  opts: { onSelect: (hit: SelectionHit | null) => void },
): CityRenderer {
  const { onSelect } = opts
  const canvas = document.createElement('canvas')
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  container.appendChild(canvas)
  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) throw new Error('2D canvas context unavailable')
  // Captured under its narrowed type so the closures below see a non-null
  // context (narrowing does not cross function boundaries).
  const ctx: CanvasRenderingContext2D = maybeCtx

  // The city spans the full grid plus the connector district west and the
  // waterfront south (see layout.ts); the fitted view covers all of it.
  const WORLD = { x0: -90, x1: 45, z0: -65, z1: 85 }
  let scale = 6
  let ox = 0
  let oz = 0

  let cssW = 0
  let cssH = 0
  // Pan is a CSS-pixel offset applied on top of the fitted view.
  let panX = 0
  let panY = 0
  let panTX = 0
  let panTY = 0

  function resize(): void {
    canvas.width = container.clientWidth * (window.devicePixelRatio || 1)
    canvas.height = container.clientHeight * (window.devicePixelRatio || 1)
    const dpr = window.devicePixelRatio || 1
    cssW = canvas.width / dpr
    cssH = canvas.height / dpr
    scale = Math.min(cssW / (WORLD.x1 - WORLD.x0), cssH / (WORLD.z1 - WORLD.z0))
    // Centre the world's midpoint on the canvas (the standalone prototype's
    // symmetric bounds made the old midpoint formula a no-op).
    ox = cssW / 2 - ((WORLD.x1 - WORLD.x0) / 2) * scale
    oz = cssH / 2 - ((WORLD.z1 - WORLD.z0) / 2) * scale
  }
  resize()

  const px = (x: number): number => ox + (x - WORLD.x0) * scale + panX
  const pz = (z: number): number => oz + (z - WORLD.z0) * scale + panY

  function drawBuilding(b: (typeof world.buildings)[string], selected: boolean): void {
    // The building's quarter-turn rotation (R032): the rect rotates about the
    // building's centre in screen space — the canvas y axis points down, so
    // the sign is the 3D rotY's opposite. The label stays unrotated.
    ctx.save()
    ctx.translate(px(b.x), pz(b.z))
    ctx.rotate((-b.rot * Math.PI) / 180)
    ctx.fillStyle = selected ? '#ffffff' : `#${b.color.toString(16).padStart(6, '0')}`
    ctx.globalAlpha = b.category === 'core' ? 0.95 : 0.85
    ctx.fillRect((-b.w / 2) * scale, (-b.d / 2) * scale, b.w * scale, b.d * scale)
    ctx.globalAlpha = 1
    if (selected) {
      ctx.strokeStyle = '#37d0c3'
      ctx.lineWidth = 2
      ctx.strokeRect((-b.w / 2) * scale, (-b.d / 2) * scale, b.w * scale, b.d * scale)
    }
    ctx.restore()
    ctx.fillStyle = '#10141c'
    ctx.font = `${Math.max(9, scale * 1.6)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(b.name, px(b.x), pz(b.z) - 4)
  }

  let selectedId: string | null = null

  function render(): void {
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const W = canvas.width / dpr
    const H = canvas.height / dpr
    const t = world.clock / 86400
    const elev = Math.sin((t - 0.25) * Math.PI * 2)
    const night = Math.max(0, Math.min(1, (-elev + 0.06) * 3))

    ctx.fillStyle = `rgb(${Math.round(121 - 100 * night)}, ${Math.round(169 - 145 * night)}, ${Math.round(107 - 74 * night)})`
    ctx.fillRect(0, 0, W, H)

    // Water.
    ctx.fillStyle = `rgb(${Math.round(61 - 35 * night)}, ${Math.round(127 - 85 * night)}, ${Math.round(181 - 110 * night)})`
    ctx.fillRect(0, pz(WATER_Z), W, H - pz(WATER_Z))

    // Roads: drawn from the live road graph (R032) — a saved layout edit
    // swaps the derived grid for the overrides' segments and this view
    // follows; the derived city draws the same grid it has always shown.
    const graph = world.roadGraph
    if (graph) {
      ctx.strokeStyle = '#3a3f47'
      ctx.lineCap = 'round'
      for (const seg of Object.values(graph.segments)) {
        const a = seg.from in graph.nodes ? graph.nodes[seg.from] : null
        const b = seg.to in graph.nodes ? graph.nodes[seg.to] : null
        if (!a || !b) continue
        ctx.lineWidth = Math.max(1, seg.width * scale)
        ctx.beginPath()
        ctx.moveTo(px(a.x), pz(a.z))
        ctx.lineTo(px(b.x), pz(b.z))
        ctx.stroke()
      }
    }

    // Pier.
    ctx.fillStyle = '#8a6f4d'
    ctx.fillRect(px(PIER.x - PIER.w / 2), pz(PIER.z0), PIER.w * scale, (PIER.z1 - PIER.z0) * scale)

    // Parks.
    ctx.fillStyle = '#85b874'
    for (const pk of PARKS) {
      ctx.beginPath()
      ctx.arc(px(pk.x), pz(pk.z), 4.5 * scale, 0, Math.PI * 2)
      ctx.fill()
    }

    // Plots: under construction (progress fill) or reserved (faint marker +
    // the connector's name — every registered pack holds a named plot).
    for (const plot of world.plots) {
      if (plot.buildingId && !plot.construction) continue
      const x = px(plot.x - PLOT_W / 2)
      const z = pz(plot.z - PLOT_W / 2)
      ctx.fillStyle = plot.construction ? 'rgba(199,162,74,0.4)' : 'rgba(255,255,255,0.07)'
      ctx.fillRect(x, z, PLOT_W * scale, PLOT_W * scale)
      if (plot.construction) {
        // Scaffolding colour comes from the one encoding table (R025).
        ctx.fillStyle = `#${encodingColor('scaffolding').toString(16).padStart(6, '0')}`
        const p = plot.construction.progress
        ctx.fillRect(x, z + (1 - p) * PLOT_W * scale, PLOT_W * scale, p * PLOT_W * scale)
      }
      if (!plot.buildingId && !plot.construction && plot.reservedName) {
        ctx.fillStyle = 'rgba(232,236,244,0.55)'
        ctx.font = `${Math.max(7, scale * 1.1)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(plot.reservedName, px(plot.x), pz(plot.z) + (PLOT_W / 2) * scale + Math.max(9, scale * 1.4))
      }
    }

    // Houses.
    for (const h of HOUSES) {
      ctx.fillStyle = '#b8987c'
      ctx.fillRect(px(h.x - 2), pz(h.z - 2), 4 * scale, 4 * scale)
      if (night > 0.5) {
        ctx.fillStyle = '#ffd98a'
        ctx.fillRect(px(h.x - 0.8), pz(h.z - 0.8), 1.6 * scale, 1.6 * scale)
      }
    }

    // Buildings.
    for (const b of Object.values(world.buildings)) {
      const plot = world.plots.find((p) => p.buildingId === b.id)
      if (plot?.construction) continue
      drawBuilding(b, selectedId === b.id)
    }

    // Characters.
    for (const ch of world.characters) {
      if (!ch.visible) continue
      const x = px(ch.pos.x)
      const z = pz(ch.pos.z)
      ctx.fillStyle = stateColor(ch.state, ch.kind)
      ctx.beginPath()
      ctx.arc(x, z, Math.max(3, scale * 0.9), 0, Math.PI * 2)
      ctx.fill()
      if (ch.kind === 'npc') {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      if (selectedId === ch.id) {
        ctx.strokeStyle = '#37d0c3'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, z, Math.max(6, scale * 1.6), 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = '#e8ecf4'
      ctx.font = `${Math.max(8, scale * 1.3)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(ch.name, x, z - Math.max(5, scale * 1.4))
    }

    // Night overlay.
    if (night > 0) {
      ctx.fillStyle = `rgba(10, 16, 38, ${0.35 * night})`
      ctx.fillRect(0, 0, W, H)
    }

    // Ease the pan toward its target.
    panX += (panTX - panX) * 0.15
    panY += (panTY - panY) * 0.15
  }

  // ---- Interaction ----------------------------------------------------------

  function pick(e: { clientX: number; clientY: number }): SelectionHit | null {
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let best: SelectionHit | null = null
    let bd = 16 * 16
    for (const ch of world.characters) {
      if (!ch.visible) continue
      const d = (px(ch.pos.x) - mx) ** 2 + (pz(ch.pos.z) - my) ** 2
      if (d < bd) {
        bd = d
        best = { kind: 'character', id: ch.id }
      }
    }
    if (best) return best
    for (const b of Object.values(world.buildings)) {
      if (Math.abs(px(b.x) - mx) < (b.w / 2) * scale + 4 && Math.abs(pz(b.z) - my) < (b.d / 2) * scale + 10) {
        return { kind: 'building', id: b.id }
      }
    }
    return null
  }

  let downAt: [number, number] | null = null
  const onDown = (e: PointerEvent): void => {
    downAt = [e.clientX, e.clientY]
  }
  const onUp = (e: PointerEvent): void => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return
    const hit = pick(e)
    onSelect(hit)
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)

  function focus(x: number, z: number): void {
    // Centre the target: pan so its screen position lands at the view centre.
    panTX = cssW / 2 - (ox + (x - WORLD.x0) * scale)
    panTY = cssH / 2 - (oz + (z - WORLD.z0) * scale)
    // Keep the pan within a reasonable range of the fitted view.
    const lim = Math.min(cssW, cssH) * 0.5
    panTX = Math.max(-lim, Math.min(lim, panTX))
    panTY = Math.max(-lim, Math.min(lim, panTY))
  }

  function overview(): void {
    panTX = 0
    panTY = 0
  }

  function dispose(): void {
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointerup', onUp)
    container.removeChild(canvas)
  }

  return {
    render,
    dispose,
    focus,
    overview,
    say: () => undefined,
    onResize: resize,
    setSelected: (hit) => {
      selectedId = hit ? hit.id : null
    },
  }
}
