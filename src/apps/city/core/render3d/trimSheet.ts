/**
 * @file trimSheet.ts
 * @description The shared trim sheet and the city's authored textures
 * (OVERSTORY-CITY-R031 / OVERSTORY-DESIGN-R012.2, R012.10): the 1024×1024
 * sheet the kit geometry samples (disjoint bands per `TRIM_SHEET`), the two
 * emissive sheets that carry the R025 window and error channels, and the
 * small authored maps (park, water, wood, metal) the static surfaces use.
 * Every colour comes from the style guide's palette
 * (`src/lib/scene3d/palette.ts`) or from the one encoding table — the
 * material audit (R012.2) enforces that no non-marker surface in the scene
 * is flat-colour. Drawing is deterministic (seeded from the kit's PRNG), so
 * the sheet is byte-identical on every boot (R014).
 */
import * as THREE from 'three'
import { encodingColor } from '../encoding'
import { mulberry32 } from '@/lib/scene3d/generators'
import { SCENE_COLORS, TRIM_SHEET } from '@/lib/scene3d/palette'

/** The trim-sheet size in pixels (R012.10's shared sheet, RGBA8). */
const SIZE = TRIM_SHEET.sizePx

/** The canvas y for one UV v (canvas y grows downward, texture v upward). */
function yOf(v: number): number {
  return (1 - v) * SIZE
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d')
  if (!g) throw new Error('2D canvas context unavailable')
  return g
}

/** The hex of one palette role as a canvas fill style. */
function paletteColor(role: string): string {
  return SCENE_COLORS[role].hex
}

/**
 * The shared trim sheet (R012.2/R012.10): the building band (one column per
 * building: wall row, window row, roof row), the prop band (one row per
 * kind) and the road band (asphalt with the centre line, tileable along the
 * run). Drawn from the style guide's palette; the generators' UVs are pinned
 * to exactly these bands, and the asset lock verifies the layout.
 */
export function trimSheetTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const g = ctx2d(c)
  const rand = mulberry32(20261119)

  // ---- Building band (v 0.25–0.75): the generator's three rows -------------
  // Wall row v 0.25–0.50, window row v 0.50–0.70, roof row v 0.70–0.75 — the
  // building generator maps exactly these UVs (one column per building), so
  // the sheet's row boundaries pin the kit's mapping and vice versa.
  const colW = SIZE / 4
  const wallY = yOf(0.5) // canvas y at the wall/window split
  const winY = yOf(0.7) // canvas y at the window/roof split
  const roofY = yOf(0.75) // canvas y at the band's top edge
  for (let col = 0; col < 4; col++) {
    const x0 = col * colW
    // Wall row (v 0.25–0.50): a light neutral the per-archetype tint
    // multiplies; faint floor lines and bay seams break visible tiling.
    g.fillStyle = paletteColor('wall-datahall')
    g.fillRect(x0, wallY, colW, yOf(0.25) - wallY)
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.fillRect(x0, wallY, colW, yOf(0.25) - wallY)
    g.fillStyle = 'rgba(0,0,0,0.06)'
    for (let f = 1; f < 5; f++) g.fillRect(x0, wallY + ((yOf(0.25) - wallY) * f) / 5, colW, 2)
    for (let s = 1; s < 8; s++) g.fillRect(x0 + (colW * s) / 8, wallY, 2, yOf(0.25) - wallY)
    // Window row (v 0.50–0.70): the glass from the field, mullioned.
    g.fillStyle = paletteColor('window-glass')
    g.fillRect(x0, winY, colW, wallY - winY)
    const brighten = (rand() - 0.5) * 0.08
    g.fillStyle = `rgba(${brighten >= 0 ? 255 : 0},${brighten >= 0 ? 255 : 0},${brighten >= 0 ? 255 : 0},${Math.abs(brighten)})`
    g.fillRect(x0, winY, colW, wallY - winY)
    g.fillStyle = 'rgba(10,16,24,0.28)'
    for (let m = 1; m < 6; m++) g.fillRect(x0 + (colW * m) / 6, winY, 2, wallY - winY)
    g.fillRect(x0, winY + (wallY - winY) / 2, colW, 2)
    // Roof row (v 0.70–0.75): the dark roofline.
    g.fillStyle = paletteColor('roof')
    g.fillRect(x0, roofY, colW, winY - roofY)
    g.fillStyle = 'rgba(255,255,255,0.05)'
    for (let r = 0; r < 12; r++) g.fillRect(x0 + rand() * colW, roofY + rand() * (winY - roofY), 2, 2)
  }

  // ---- Prop band (v 0.02–0.20): one 0.036 row per kind --------------------
  const { 'prop-band': pb } = TRIM_SHEET.bands
  const rowH = 0.036
  const propRows: [string, string][] = [
    ['tree', paletteColor('park')],
    ['streetlamp', 'rgba(38,46,56,1)'],
    ['bench', paletteColor('wall-workshop')],
    ['sign', paletteColor('wall-studio')],
    ['bin', paletteColor('road')],
  ]
  propRows.forEach(([role, fill], r) => {
    const vTop = pb[0] + rowH * (r + 1)
    const y0 = yOf(vTop)
    const h = rowH * SIZE
    g.fillStyle = fill
    g.fillRect(0, y0, SIZE, h)
    g.fillStyle = 'rgba(255,255,255,0.14)'
    g.fillRect(0, y0, SIZE, 2)
    if (role === 'tree' || role === 'bench') {
      g.fillStyle = 'rgba(0,0,0,0.12)'
      for (let p = 1; p < 5; p++) g.fillRect(0, y0 + (h * p) / 5, SIZE, 1)
    }
  })

  // ---- Road band (v 0.78–0.98): asphalt, centre line, tileable ------------
  const { 'road-band': rb } = TRIM_SHEET.bands
  const yTop = yOf(rb[1])
  const yBot = yOf(rb[0])
  g.fillStyle = paletteColor('road')
  g.fillRect(0, yTop, SIZE, yBot - yTop)
  g.fillStyle = 'rgba(0,0,0,0.10)'
  for (let s = 0; s < 90; s++) g.fillRect(rand() * SIZE, yTop + rand() * (yBot - yTop), 2, 2)
  // The ivory centre dashes (u across the width, v along the run).
  g.fillStyle = paletteColor('road-marking')
  for (let d = 0; d < 6; d++) g.fillRect(SIZE / 2 - 5, yTop + (yBot - yTop) * (d / 6 + 0.12), 10, (yBot - yTop) / 12)
  // Faint wheel ruts.
  g.fillStyle = 'rgba(0,0,0,0.08)'
  g.fillRect(SIZE / 2 - 90, yTop, 4, yBot - yTop)
  g.fillRect(SIZE / 2 + 86, yTop, 4, yBot - yTop)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * The emissive sheet for the 'lit-windows' channel (R025): black everywhere
 * except the building window rows, painted in the table's lit colour. Every
 * building material shares it; the per-building emissive intensity is the
 * in-flight call count — one channel, one fact.
 */
export function litWindowSheet(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const g = ctx2d(c)
  g.fillStyle = '#000'
  g.fillRect(0, 0, SIZE, SIZE)
  g.fillStyle = `#${encodingColor('lit-windows').toString(16).padStart(6, '0')}`
  const colW = SIZE / 4
  // The window row (v 0.50–0.70) — exactly the band the building generator
  // maps its window panels onto, so only windows ever light.
  for (let col = 0; col < 4; col++) {
    g.fillRect(col * colW, yOf(0.7), colW, yOf(0.5) - yOf(0.7))
  }
  return new THREE.CanvasTexture(c)
}

/**
 * The emissive sheet for the 'error-flash' channel (R025): black everywhere
 * except the building roof rows, painted in the table's red. The per-
 * building roof material shares it; its emissive intensity is the fresh-
 * error factor.
 */
export function roofFlashSheet(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const g = ctx2d(c)
  g.fillStyle = '#000'
  g.fillRect(0, 0, SIZE, SIZE)
  g.fillStyle = `#${encodingColor('error-flash').toString(16).padStart(6, '0')}`
  const colW = SIZE / 4
  // The roof row (v 0.70–0.75) — exactly the band the building generator
  // maps its roof onto, so only roofs ever flash.
  for (let col = 0; col < 4; col++) {
    g.fillRect(col * colW, yOf(0.75), colW, yOf(0.7) - yOf(0.75))
  }
  return new THREE.CanvasTexture(c)
}

/** The zebra texture one crosswalk stripe uses (the road band's stripes). */
export function zebraTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = ctx2d(c)
  g.fillStyle = paletteColor('road')
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = paletteColor('road-marking')
  // The stripes run across the walk (canvas u) and repeat along the run
  // (canvas v) — the orientation the crosswalk instances map the sheet with.
  for (let s = 0; s < 4; s++) g.fillRect(4, 4 + s * 16, 56, 10)
  return new THREE.CanvasTexture(c)
}

/** The ground park map: the palette's green with a seeded subtle mottle. */
export function parkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = ctx2d(c)
  g.fillStyle = paletteColor('park')
  g.fillRect(0, 0, 256, 256)
  const rand = mulberry32(77)
  for (let s = 0; s < 400; s++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
    g.fillRect(rand() * 256, rand() * 256, 2 + rand() * 3, 2 + rand() * 3)
  }
  return new THREE.CanvasTexture(c)
}

/** The water map: the palette's slate blue with a seeded wave line. */
export function waterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = ctx2d(c)
  g.fillStyle = paletteColor('water')
  g.fillRect(0, 0, 256, 256)
  const rand = mulberry32(11)
  g.strokeStyle = 'rgba(255,255,255,0.10)'
  for (let w = 0; w < 14; w++) {
    g.beginPath()
    const y = w * 18 + rand() * 8
    g.moveTo(0, y)
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x / 24 + w) * 3)
    g.stroke()
  }
  return new THREE.CanvasTexture(c)
}

/** The deck map: the palette's taupe in planks (pier, hulls, benches). */
export function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = ctx2d(c)
  g.fillStyle = paletteColor('wall-workshop')
  g.fillRect(0, 0, 128, 128)
  const rand = mulberry32(5)
  for (let p = 0; p < 8; p++) {
    g.fillStyle = p % 2 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)'
    g.fillRect(0, p * 16, 128, 14)
    g.fillStyle = 'rgba(0,0,0,0.12)'
    g.fillRect(0, p * 16 + 14, 128, 2)
  }
  for (let s = 0; s < 40; s++) {
    g.fillStyle = 'rgba(0,0,0,0.05)'
    g.fillRect(rand() * 128, rand() * 128, 2, 1)
  }
  return new THREE.CanvasTexture(c)
}

/** The hull/metal map: the palette's slate with a faint panel line. */
export function metalTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = ctx2d(c)
  g.fillStyle = paletteColor('road')
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(255,255,255,0.10)'
  for (let p = 0; p < 6; p++) g.fillRect(0, p * 24 + 22, 128, 2)
  g.fillStyle = 'rgba(0,0,0,0.10)'
  for (let p = 0; p < 6; p++) g.fillRect(0, p * 24, 128, 2)
  return new THREE.CanvasTexture(c)
}

/**
 * Remap every UV of a geometry into one rectangle of the sheet (for the
 * bespoke landmark meshes and the static surfaces): the box faces' 0–1 UVs
 * all sample the same small region, so the surface reads one authored patch
 * — a base-colour map, never a flat colour (R012.2).
 */
export function remapUVs(geometry: THREE.BufferGeometry, u0: number, v0: number, u1: number, v1: number): void {
  const uv = geometry.getAttribute('uv')
  const arr = uv.array as Float32Array
  for (let i = 0; i < arr.length; i += 2) {
    arr[i] = u0 + arr[i] * (u1 - u0)
    arr[i + 1] = v0 + arr[i + 1] * (v1 - v0)
  }
  uv.needsUpdate = true
}

/**
 * Rewrite a road run plane's UVs onto the sheet's road band: the sheet's u
 * is always across the road width (the centre line sits at the run's
 * middle), and the sheet's v runs along the run, tiled every 10 m so the
 * dashes repeat at a street scale. `uIsLength` says which of the plane's
 * axes is the run.
 */
export function roadRunUVs(geometry: THREE.PlaneGeometry, lengthM: number, uIsLength: boolean): void {
  const uv = geometry.getAttribute('uv')
  const arr = uv.array as Float32Array
  const { 'road-band': rb } = TRIM_SHEET.bands
  const tiles = Math.max(1, Math.round(lengthM / 10))
  for (let i = 0; i < arr.length; i += 2) {
    const u = arr[i]
    const v = arr[i + 1]
    const across = uIsLength ? v : u
    const along = uIsLength ? u : v
    arr[i] = 0.02 + across * 0.96
    arr[i + 1] = rb[0] + ((along * tiles) % 1) * (rb[1] - rb[0])
  }
  uv.needsUpdate = true
}

/** The day sky dome gradient (the palette's day sky to the field horizon). */
export function skyDayTexture(): THREE.CanvasTexture {
  return skyGradient(paletteColor('sky-day'), paletteColor('wall-datahall'))
}

/** The night sky dome gradient (the palette's night sky to the field floor). */
export function skyNightTexture(): THREE.CanvasTexture {
  return skyGradient(paletteColor('sky-night'), '#243529')
}

/** A vertical gradient between two colours (the sky domes). */
function skyGradient(top: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = ctx2d(c)
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, top)
  grad.addColorStop(1, bottom)
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 256)
  return new THREE.CanvasTexture(c)
}
