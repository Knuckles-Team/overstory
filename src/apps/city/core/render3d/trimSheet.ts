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

/** Canvas pixels are authored as sRGB CSS colours, never linear-light data. */
function authoredTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
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
    // The atlas columns are deliberately different material families.  The
    // building seed picks a column, so an otherwise similar block receives
    // a reproducible facade variation instead of the old white repetition.
    // These are material families, not semantic role colours.  The latter
    // are intentionally reserved for signs and live-state accents; using
    // them as full facades is what made the city read as striped toy blocks.
    g.fillStyle = paletteColor(['facade-ocean', 'facade-sand', 'facade-stone', 'facade-sage'][col])
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
  // The input token's base road colour was too close to tropical grass at
  // city zoom. Keep the same family but use the authored asphalt derivative
  // so a continuous street network reads as pavement, not green tiles.
  g.fillStyle = paletteColor('asphalt')
  g.fillRect(0, yTop, SIZE, yBot - yTop)
  g.fillStyle = 'rgba(0,0,0,0.10)'
  for (let s = 0; s < 90; s++) g.fillRect(rand() * SIZE, yTop + rand() * (yBot - yTop), 2, 2)
  // Crosswalks and junction assets own the visible white paint. A repeating
  // centre dash on every short generated segment looked like hundreds of
  // miniature zebra tiles from the overview, so local asphalt keeps only
  // the dark wheel-rut cue below. Arterial lane paint lands with the future
  // road-class mesh, not this universal atlas patch.
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
  return authoredTexture(c)
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
  return authoredTexture(c)
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
  for (let s = 0; s < 4; s++) g.fillRect(7, 6 + s * 14, 50, 6)
  return authoredTexture(c)
}

/** Warm concrete with joints and a darker curb edge for the public realm. */
export function sidewalkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = ctx2d(c)
  g.fillStyle = paletteColor('sidewalk')
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(70,62,48,0.15)'
  for (let x = 0; x <= 128; x += 32) g.fillRect(x, 0, 1, 128)
  for (let y = 0; y <= 128; y += 24) g.fillRect(0, y, 128, 1)
  g.fillStyle = paletteColor('curb')
  g.fillRect(0, 0, 128, 5)
  return authoredTexture(c)
}

/** The ground park map: the palette's green with a seeded subtle mottle. */
export function parkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = ctx2d(c)
  g.fillStyle = paletteColor('tropical-forest')
  g.fillRect(0, 0, 256, 256)
  const rand = mulberry32(77)
  for (let s = 0; s < 400; s++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(255,230,150,0.07)' : 'rgba(0,35,20,0.10)'
    g.fillRect(rand() * 256, rand() * 256, 2 + rand() * 3, 2 + rand() * 3)
  }
  return authoredTexture(c)
}

/**
 * A macro terrain map for the regional world: grass, soil and scrub bands
 * avoid the monochrome grey field while remaining deterministic and cheap.
 */
export function terrainTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = ctx2d(c)
  // Terrain hue is supplied by deterministic vertex biomes. This authored
  // neutral detail map contributes grain without forcing every island region
  // back to the same green texture.
  g.fillStyle = paletteColor('facade-cloud')
  g.fillRect(0, 0, 512, 512)
  const rand = mulberry32(20261120)
  // Turquoise is reserved for actual water surfaces; mixing it into the
  // entire land map made the city read as a dirty, desaturated field.
  const colors = ['rgba(60,72,64,0.22)', 'rgba(255,255,255,0.16)', 'rgba(92,72,44,0.15)']
  for (let i = 0; i < 180; i++) {
    g.globalAlpha = 0.3 + rand() * 0.25
    g.fillStyle = colors[i % colors.length]
    const x = rand() * 512
    const y = rand() * 512
    const r = 10 + rand() * 48
    g.beginPath()
    g.ellipse(x, y, r, r * (0.35 + rand() * 0.35), rand() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  return authoredTexture(c)
}

/** The water map: the palette's slate blue with a seeded wave line. */
export function waterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = ctx2d(c)
  g.fillStyle = paletteColor('tropical-sea')
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
  return authoredTexture(c)
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
  return authoredTexture(c)
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
  return authoredTexture(c)
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
  return skyGradient(paletteColor('tropical-sky'), '#d6f4ff')
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
  return authoredTexture(c)
}
