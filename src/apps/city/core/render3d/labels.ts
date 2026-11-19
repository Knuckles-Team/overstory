/**
 * @file labels.ts
 * @description Canvas-generated textures for the 3D city (part of the
 * render3d/ split, T025): the transient speech bubble the character layer
 * renders above one character for a couple of seconds. Building and
 * character names are screen-space labels (labelLayer.ts, R012.7), not
 * in-scene sprites; the facade maps are the shared trim sheet
 * (trimSheet.ts, R012.2). Every texture here is generated from shared
 * world data — no label owns facts of its own.
 */
import * as THREE from 'three'

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d')
  if (!g) throw new Error('2D canvas context unavailable')
  return g
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Speech bubble sprite texture. */
export function bubbleTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 96
  const g = ctx2d(c)
  g.fillStyle = 'rgba(250,250,245,0.95)'
  roundRect(g, 8, 8, 496, 64, 24)
  g.fill()
  g.beginPath()
  g.moveTo(240, 72)
  g.lineTo(260, 72)
  g.lineTo(250, 92)
  g.closePath()
  g.fill()
  g.fillStyle = '#141a26'
  g.font = '600 30px system-ui, sans-serif'
  g.textBaseline = 'middle'
  g.fillText(text.length > 24 ? `${text.slice(0, 23)}…` : text, 24, 40)
  return new THREE.CanvasTexture(c)
}
