/**
 * @file labelLayer.ts
 * @description The city's screen-space label layer (OVERSTORY-DESIGN-R012.7 /
 * OVERSTORY-CITY-R031): labels are a 2D canvas overlay driven by the shared
 * label resolver — no two visible labels overlap, text never drops below the
 * 12 px floor, and the visible set changes with the semantic-zoom band
 * (city → district signage, district → building names, building →
 * characters and tools). Candidates are projected from the world state by
 * {@link collectLabelCandidates}; the layer projects nothing itself.
 */
// spec: OVERSTORY-DESIGN-R012.7, OVERSTORY-CITY-R031
import * as THREE from 'three'
import { LABEL_SETS, resolveLabelSet, type LabelCandidate, type Viewport, type ZoomBand } from '@/lib/scene3d/labels'
import { CONNECTOR_DISTRICT, domainOf } from '../ecosystem'
import { stateColor } from '../encoding'
import type { world as SimWorld } from '../sim'

export type World = typeof SimWorld

/** One city label: a resolved screen-space candidate plus its plate styling. */
export interface CityLabel extends LabelCandidate {
  /** The plate text (drawn by the layer). */
  text: string
  /** The plate border / state-dot colour (hex), when the candidate carries one. */
  colorHex?: number
}

/** The plate height in CSS px (font floor 12 px + padding). */
export const LABEL_PLATE_H = 26

/**
 * Collect every label candidate from the world state, projected into screen
 * space by the camera (R012.7): district signs, core landmark names,
 * building names, construction state, character names and tool chips. A
 * candidate behind the camera is dropped.
 */
export function collectLabelCandidates(world: World, camera: THREE.Camera, viewport: Viewport): CityLabel[] {
  const out: CityLabel[] = []
  const v3 = new THREE.Vector3()
  const project = (x: number, y: number, z: number): { x: number; y: number } | null => {
    v3.set(x, y, z).project(camera)
    if (v3.z > 1) return null
    return { x: ((v3.x + 1) / 2) * viewport.width, y: ((1 - v3.y) / 2) * viewport.height }
  }
  const push = (
    id: string,
    kind: string,
    x: number,
    y: number,
    z: number,
    text: string,
    priority: number,
    colorHex?: number,
  ): void => {
    const p = project(x, y, z)
    if (!p) return
    out.push({
      id,
      kind,
      x: p.x,
      y: p.y,
      width: 16 + text.length * 8, // deterministic plate size (no measureText in unit tests)
      height: LABEL_PLATE_H,
      priority,
      text,
      colorHex,
    })
  }

  // District signs: one per domain, at the domain's plot centroid.
  for (const d of CONNECTOR_DISTRICT) {
    let cx = 0
    let cz = 0
    let n = 0
    for (const p of world.plots) {
      const rid = p.reservedId ?? p.buildingId
      if (rid && domainOf(rid) === d.id) {
        cx += p.x
        cz += p.z
        n++
      }
    }
    if (n === 0) continue
    push(`district:${d.id}`, 'district-sign', cx / n, 9, cz / n, d.id, 100)
  }

  // Buildings: core landmarks at city zoom, connector names below it.
  for (const b of Object.values(world.buildings)) {
    if (b.category === 'core') push(b.id, 'core-landmark', b.x, 13, b.z, b.name, 100)
    else push(b.id, 'building-name', b.x, Math.max(4, b.w * 0 + 5), b.z, b.name, 40)
  }

  // Construction state: registered (not yet built) plots and live sites.
  for (const p of world.plots) {
    if (p.buildingId || !p.reservedName) continue
    const label = p.construction
      ? `${p.reservedName} (${Math.round(p.construction.progress * 100)}%)`
      : `${p.reservedName} — registered`
    push(`plot:${p.x}:${p.z}`, 'construction-state', p.x, 4, p.z, label, 50)
  }

  // Characters: one persistent name per agent, the state colour from the table.
  for (const c of world.characters) {
    if (!c.visible) continue
    push(c.id, 'character-name', c.pos.x, 2, c.pos.z, c.name, 30, parseInt(stateColor(c.state, c.kind).slice(1), 16))
  }

  // Tool chips: the in-flight tool at each working building (building zoom).
  for (const t of world.tasks) {
    if (t.state !== 'active') continue
    const b = t.buildingId in world.buildings ? world.buildings[t.buildingId] : null
    if (!b) continue
    push(`task:${t.id}`, 'tool-chip', b.x + 3, 2.5, b.z, t.tool, 20)
  }

  return out
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

export interface LabelLayerApi {
  /** Resolve and draw the visible labels for one zoom band. */
  update(candidates: CityLabel[], viewport: Viewport, band: ZoomBand): void
  /** Fit the overlay to a new container size (CSS pixels). */
  setSize(width: number, height: number): void
  /** Remove the overlay from the container. */
  dispose(): void
}

/**
 * Create the screen-space label overlay: an absolutely positioned,
 * pointer-transparent canvas inside the container. The layer resolves the
 * visible set through the shared collision resolver (R012.7) and draws the
 * plates at a fixed font at or above the 12 px floor.
 */
export function createLabelLayer(container: HTMLElement): LabelLayerApi {
  const host = document.createElement('div')
  host.style.position = 'absolute'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  host.style.overflow = 'hidden'
  host.style.zIndex = '2'
  const canvas = document.createElement('canvas')
  host.appendChild(canvas)
  container.appendChild(host)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for the label layer')
  // A dedicated const so the closures below see the non-null context type.
  const g: CanvasRenderingContext2D = context

  function setSize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function update(candidates: CityLabel[], viewport: Viewport, band: ZoomBand): void {
    setSize(viewport.width, viewport.height)
    g.clearRect(0, 0, viewport.width, viewport.height)
    const allowed = LABEL_SETS[band]
    const filtered = candidates.filter((c) => allowed.includes(c.kind))
    // The resolver passes candidates through by reference, so the plate
    // fields (text, colour) of the city labels survive the resolution.
    const { visible } = resolveLabelSet(filtered, viewport) as unknown as {
      visible: CityLabel[]
    }
    for (const l of visible) {
      // A deterministic plate position: centred above the projected point.
      const x = l.x - l.width / 2
      const y = l.y - l.height
      g.font = '600 14px system-ui, sans-serif'
      g.textBaseline = 'middle'
      g.fillStyle = 'rgba(10,14,22,0.78)'
      roundRect(g, x, y, l.width, l.height, 8)
      g.fill()
      g.strokeStyle =
        l.colorHex !== undefined ? `#${l.colorHex.toString(16).padStart(6, '0')}` : 'rgba(232,236,244,0.65)'
      g.lineWidth = 2
      roundRect(g, x, y, l.width, l.height, 8)
      g.stroke()
      if (l.kind === 'character-name' && l.colorHex !== undefined) {
        g.fillStyle = `#${l.colorHex.toString(16).padStart(6, '0')}`
        g.beginPath()
        g.arc(x + 12, y + l.height / 2, 5, 0, Math.PI * 2)
        g.fill()
        g.fillText(l.text, x + 22, y + l.height / 2)
      } else {
        g.fillStyle = '#ffffff'
        g.fillText(l.text, x + 12, y + l.height / 2)
      }
    }
  }

  return {
    update,
    setSize,
    dispose: (): void => {
      container.removeChild(host)
    },
  }
}

/** The minimum font the layer draws with (R012.7's floor, asserted in tests). */
export const LABEL_FONT_PX = 14
