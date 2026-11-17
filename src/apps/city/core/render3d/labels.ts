/**
 * @file labels.ts
 * @description Canvas-generated textures for the 3D city (part of the
 * render3d/ split, T025): building nameplates, character tags and speech
 * bubbles, reserved-plot labels, and the facade window/emissive maps. Every
 * texture is generated from shared world data — no label owns facts of its
 * own. Colours that encode a fact come from the one encoding table (R025).
 */
import * as THREE from 'three'
import { encodingColor } from '../encoding'

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

/** Building nameplate sprite texture (the SERVED dot marks served packs). */
export function nameplateTexture(name: string, colorHex: number, served: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 96
  const g = ctx2d(c)
  g.fillStyle = 'rgba(10,14,22,0.82)'
  roundRect(g, 4, 4, 504, 88, 18)
  g.fill()
  g.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`
  g.lineWidth = 4
  roundRect(g, 4, 4, 504, 88, 18)
  g.stroke()
  g.fillStyle = '#ffffff'
  g.font = '600 40px system-ui, sans-serif'
  g.textBaseline = 'middle'
  const label = served ? name.slice(0, 22) : name
  g.fillText(label, served ? 110 : 24, 50)
  if (served) {
    g.fillStyle = '#3ddc84'
    g.beginPath()
    g.arc(60, 48, 14, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#0a1226'
    g.font = '700 20px system-ui, sans-serif'
    g.fillText('SERVED', 26, 84)
  }
  return new THREE.CanvasTexture(c)
}

/** Character name tag sprite texture; the state dot is the caller's colour. */
export function characterTagTexture(name: string, npc: boolean, stateColor: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 96
  const g = ctx2d(c)
  const border = npc ? '#ffd166' : '#37d0c3'
  g.fillStyle = 'rgba(10,14,22,0.85)'
  roundRect(g, 4, 10, 504, 76, 16)
  g.fill()
  g.strokeStyle = border
  g.lineWidth = 4
  roundRect(g, 4, 10, 504, 76, 16)
  g.stroke()
  g.fillStyle = stateColor
  g.beginPath()
  g.arc(40, 48, 13, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ffffff'
  g.font = '600 34px system-ui, sans-serif'
  g.textBaseline = 'middle'
  g.fillText(name, 72, 50)
  return new THREE.CanvasTexture(c)
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

/** Faint label for a reserved (registered, not yet built) plot. */
export function reservedLabelTexture(name: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 48
  const g = ctx2d(c)
  g.font = '600 22px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = 'rgba(232,236,244,0.75)'
  g.fillText(name.length > 16 ? `${name.slice(0, 15)}…` : name, 128, 24)
  return new THREE.CanvasTexture(c)
}

/**
 * Building facade materials: base colour, a window map and an emissive window
 * map. The emissive windows light up from the 'lit-windows' encoding (R025)
 * — in-flight tool calls at the building, with a night ambience floor.
 */
export function facadeSet(color: number): THREE.MeshStandardMaterial[] {
  const hex = `#${color.toString(16).padStart(6, '0')}`
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 192
  const g = ctx2d(c)
  g.fillStyle = hex
  g.fillRect(0, 0, 128, 192)
  g.fillStyle = 'rgba(255,255,255,0.28)'
  g.fillRect(0, 0, 128, 16)
  g.fillStyle = '#20283a'
  for (let r = 0; r < 4; r++) for (let col = 0; col < 3; col++) g.fillRect(16 + col * 38, 36 + r * 38, 26, 28)
  g.fillStyle = '#171d2b'
  g.fillRect(46, 156, 36, 36)
  const map = new THREE.CanvasTexture(c)
  const ec = document.createElement('canvas')
  ec.width = 128
  ec.height = 192
  const eg = ctx2d(ec)
  eg.fillStyle = '#000'
  eg.fillRect(0, 0, 128, 192)
  eg.fillStyle = `#${encodingColor('lit-windows').toString(16).padStart(6, '0')}`
  for (let r = 0; r < 4; r++)
    for (let col = 0; col < 3; col++) if (Math.random() < 0.45) eg.fillRect(16 + col * 38, 36 + r * 38, 26, 28)
  const emissiveMap = new THREE.CanvasTexture(ec)
  const side = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.9,
    emissive: 0xffffff,
    emissiveMap,
    emissiveIntensity: 0,
  })
  const top = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 1 })
  return [side, side.clone(), top, top, side.clone(), side.clone()]
}
