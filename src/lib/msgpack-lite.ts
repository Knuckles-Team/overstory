/**
 * Minimal MessagePack encoder for JSON-shaped values (null, boolean, number,
 * string, array, string-keyed map). The engine takes node properties as a
 * MessagePack byte string; this is the only encoder the browser needs, so no
 * general-purpose library is added.
 */

const encoder = new TextEncoder()

function pushHeader(out: number[], small: number, base: number, length: number, sizes: readonly [number, number]) {
  if (length < small) out.push(base + length)
  else if (length < 0x10000) out.push(sizes[0], length >> 8, length & 0xff)
  else out.push(sizes[1], (length >>> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff)
}

function pushNumber(out: number[], value: number) {
  if (Number.isInteger(value) && value >= 0 && value < 0x80) {
    out.push(value)
    return
  }
  if (Number.isInteger(value) && value < 0 && value >= -32) {
    out.push(0x100 + value)
    return
  }
  if (Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
    const view = new DataView(new ArrayBuffer(9))
    view.setUint8(0, value >= 0 ? 0xcf : 0xd3)
    if (value >= 0) view.setBigUint64(1, BigInt(value))
    else view.setBigInt64(1, BigInt(value))
    out.push(...new Uint8Array(view.buffer))
    return
  }
  const view = new DataView(new ArrayBuffer(9))
  view.setUint8(0, 0xcb)
  view.setFloat64(1, value)
  out.push(...new Uint8Array(view.buffer))
}

function write(out: number[], value: unknown): void {
  if (value === null || value === undefined) {
    out.push(0xc0)
    return
  }
  if (typeof value === 'boolean') {
    out.push(value ? 0xc3 : 0xc2)
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('msgpack: non-finite number')
    pushNumber(out, value)
    return
  }
  if (typeof value === 'string') {
    const bytes = encoder.encode(value)
    if (bytes.length < 32) out.push(0xa0 + bytes.length)
    else if (bytes.length < 0x100) out.push(0xd9, bytes.length)
    else pushHeader(out, 0, 0, bytes.length, [0xda, 0xdb])
    for (const byte of bytes) out.push(byte)
    return
  }
  if (Array.isArray(value)) {
    pushHeader(out, 16, 0x90, value.length, [0xdc, 0xdd])
    for (const item of value) write(out, item)
    return
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
    pushHeader(out, 16, 0x80, entries.length, [0xde, 0xdf])
    for (const [key, item] of entries) {
      write(out, key)
      write(out, item)
    }
    return
  }
  throw new TypeError(`msgpack: unsupported ${typeof value}`)
}

/** Encode a JSON-shaped value as MessagePack bytes. */
export function encodeMsgpack(value: unknown): number[] {
  const out: number[] = []
  write(out, value)
  return out
}
