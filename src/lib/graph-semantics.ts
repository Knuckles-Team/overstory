/**
 * Color and shape of a node from its ontology class (OVERSTORY-APPS-R030.11.1).
 *
 * A root class takes one of 8 palette slots by the SHA-256 of its IRI, so the
 * slot is the same in every session. The shape follows the slot. A subclass keeps
 * its root slot and steps lightness by 8 percent per depth level, to depth 3.
 * A class with no ancestry takes the neutral slot. The client invents no ancestry.
 */

export const CLASS_SHAPES = ['circle', 'square', 'diamond', 'triangle', 'hexagon', 'cross', 'star', 'ring'] as const
export type ClassShape = (typeof CLASS_SHAPES)[number]

export const PALETTE_SLOTS = 8
export const NEUTRAL_SLOT = -1
export const MAX_DEPTH_STEPS = 3
export const LIGHTNESS_STEP = 0.08

export interface ClassStyle {
  classIri: string
  rootIri: string
  /** 0..7, or -1 for the neutral slot. */
  slot: number
  depth: number
  shape: ClassShape
  label: string
}

/** Class IRI to its chain of superclass IRIs, nearest first. A class absent from the map is unclassified. */
export type ClassAncestry = ReadonlyMap<string, readonly string[]>

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
])

/** Synchronous SHA-256 of a UTF-8 string, as 32 bytes. The slot must not wait on SubtleCrypto. */
export function sha256(text: string): Uint8Array {
  const data = new TextEncoder().encode(text)
  const bitLength = data.length * 8
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(padded.length - 4, bitLength >>> 0)
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] += a
    h[1] += b
    h[2] += c
    h[3] += d
    h[4] += e
    h[5] += f
    h[6] += g
    h[7] += hh
  }
  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  h.forEach((value, i) => {
    outView.setUint32(i * 4, value)
  })
  return out
}

/** The palette slot of a root class IRI, stable across sessions. */
export function slotOf(rootIri: string): number {
  const digest = sha256(rootIri)
  return (((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0) % PALETTE_SLOTS
}

function localName(iri: string): string {
  const cut = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'))
  return cut >= 0 && cut < iri.length - 1 ? iri.slice(cut + 1) : iri
}

export const UNCLASSIFIED_LABEL = 'unclassified'

/** The style of a class. No ancestry for the class means the neutral slot and the label `unclassified`. */
export function styleFor(classIri: string, ancestry: ClassAncestry): ClassStyle {
  const chain = ancestry.get(classIri)
  if (chain === undefined) {
    return { classIri, rootIri: classIri, slot: NEUTRAL_SLOT, depth: 0, shape: 'circle', label: UNCLASSIFIED_LABEL }
  }
  const rootIri = chain.length > 0 ? chain[chain.length - 1] : classIri
  const slot = slotOf(rootIri)
  return {
    classIri,
    rootIri,
    slot,
    depth: Math.min(chain.length, MAX_DEPTH_STEPS),
    shape: CLASS_SHAPES[slot],
    label: localName(classIri),
  }
}

/** Fallback when the schema is unavailable: hash the type string. No ancestry is invented. */
export function styleForTypeString(type: string): ClassStyle {
  const slot = slotOf(type)
  return { classIri: type, rootIri: type, slot, depth: 0, shape: CLASS_SHAPES[slot], label: type }
}

/**
 * The 8 slot colors, as OKLCH-derived hex for light and dark backgrounds.
 * Hues are spread for color-vision separation; lightness is fixed per theme so a
 * node holds a contrast ratio of at least 3 to 1 against the canvas.
 */
export const SLOT_HUES = [255, 25, 145, 75, 305, 195, 345, 105] as const

export interface SlotColorOptions {
  isDark: boolean
  forcedColors?: boolean
}

/** Convert OKLCH to a hex string (kept local so this module stays free of component imports). */
export function oklchHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m_ = Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s_ = Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3)
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  const enc = (v: number) => {
    const c01 = Math.min(1, Math.max(0, v))
    const g = c01 <= 0.0031308 ? 12.92 * c01 : 1.055 * Math.pow(c01, 1 / 2.4) - 0.055
    return Math.round(g * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${enc(lin[0])}${enc(lin[1])}${enc(lin[2])}`
}

/** The neutral slot color. */
export const NEUTRAL_LIGHT = '#6b7280'
export const NEUTRAL_DARK = '#9ca3af'

/** Hex color of a style: the root slot, with lightness stepped by 8 percent per depth level. */
export function colorOf(style: Pick<ClassStyle, 'slot' | 'depth'>, { isDark }: SlotColorOptions): string {
  if (style.slot === NEUTRAL_SLOT) return isDark ? NEUTRAL_DARK : NEUTRAL_LIGHT
  // Light theme starts mid-dark and steps darker; dark theme starts mid-light and steps lighter.
  // Both directions move away from the canvas, so the 3 to 1 floor holds at every depth.
  const base = isDark ? 0.66 : 0.56
  const l = base + LIGHTNESS_STEP * Math.min(style.depth, MAX_DEPTH_STEPS) * (isDark ? 1 : -1)
  return oklchHex(l, 0.16, SLOT_HUES[style.slot])
}

/** A class term of the composed schema, as `eg.reasoning.GraphSchemaClasses` returns it. Parents are read when the engine sends them. */
export interface SchemaTerm {
  iri: string
  local_name?: string
  kind?: string
  [key: string]: unknown
}

export interface ClassIndex {
  ancestry: ClassAncestry
  /** Local name to IRI, so a node typed `Person` finds its class. */
  byName: ReadonlyMap<string, string>
}

const PARENT_KEYS = [
  'parents',
  'super_classes',
  'superclasses',
  'sub_class_of',
  'subclass_of',
  'parent_iris',
  'parent_iri',
  'parent',
]

function parentsOf(term: SchemaTerm): string[] {
  for (const key of PARENT_KEYS) {
    const v = term[key]
    if (typeof v === 'string') return [v]
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  }
  return []
}

/**
 * Build the ancestry map from schema terms. A chain walks the first parent upward (nearest first, root last)
 * and stops at a cycle. A term with no parents is its own root. Nothing is invented for a class the schema lacks.
 */
export function buildClassIndex(terms: readonly SchemaTerm[]): ClassIndex {
  const classes = terms.filter((t) => (t.kind ?? 'class').toLowerCase().includes('class'))
  const parents = new Map(classes.map((t) => [t.iri, parentsOf(t)]))
  const ancestry = new Map<string, string[]>()
  for (const term of classes) {
    const chain: string[] = []
    const seen = new Set([term.iri])
    let next = parents.get(term.iri)?.[0]
    while (next !== undefined && !seen.has(next)) {
      chain.push(next)
      seen.add(next)
      next = parents.get(next)?.[0]
    }
    ancestry.set(term.iri, chain)
  }
  const byName = new Map<string, string>()
  for (const term of classes) byName.set(term.local_name ?? localName(term.iri), term.iri)
  return { ancestry, byName }
}

/** The class IRI of a node's type string, or null when the schema has no such class. */
export function classIriFor(type: string, index: ClassIndex): string | null {
  if (index.ancestry.has(type)) return type
  return index.byName.get(type) ?? null
}
