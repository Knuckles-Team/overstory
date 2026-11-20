/**
 * @file render2d.test.ts
 * @description The 2D schematic fallback (OVERSTORY-CITY-R015): the same
 * city graph (plots, reserved-plot names, buildings, characters) reaches
 * the fallback renderer, the WebGL probe selects the renderer, and the
 * renderer exposes the full CityRenderer handle including dispose.
 */
// spec: OVERSTORY-CITY-R015
import { afterEach, describe, expect, it } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { init2D, supportsWebGL } from '../core/render2d'
import { initSim, resetSim, world } from '../core/sim'

function installRecording2D(): { texts: string[]; rects: number; restore: () => void } {
  const texts: string[] = []
  let rects = 0
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    contextId: string,
    ...args: unknown[]
  ): RenderingContext | null {
    if (contextId === '2d') {
      const target: Record<string, unknown> = { canvas: this }
      return new Proxy(target, {
        get(t, prop) {
          if (prop in t) return (t as Record<string, unknown>)[prop as string]
          if (prop === 'fillText') return (text: unknown) => texts.push(String(text))
          if (prop === 'fillRect') return () => rects++
          return () => undefined
        },
      }) as unknown as RenderingContext
    }
    if (typeof original === 'function') {
      return (original as (id: string, ...a: unknown[]) => RenderingContext | null).call(this, contextId, ...args)
    }
    return null
  } as typeof HTMLCanvasElement.prototype.getContext
  return {
    texts,
    rects,
    restore: () => {
      HTMLCanvasElement.prototype.getContext = original
    },
  }
}

describe('supportsWebGL probe (R015)', () => {
  it('reports true when the test environment provides a GL context', () => {
    expect(supportsWebGL()).toBe(true)
  })

  it('reports false when no GL context can be created', () => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
    try {
      expect(supportsWebGL()).toBe(false)
    } finally {
      HTMLCanvasElement.prototype.getContext = original
    }
  })

  it('reports false when context creation throws', () => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => {
      throw new Error('no GL')
    }) as typeof HTMLCanvasElement.prototype.getContext
    try {
      expect(supportsWebGL()).toBe(false)
    } finally {
      HTMLCanvasElement.prototype.getContext = original
    }
  })
})

describe('init2D (R015)', () => {
  afterEach(() => {
    resetSim()
  })

  it('renders the same city graph the 3D view uses', () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const { texts, restore } = installRecording2D()
    try {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const renderer = init2D(container, world, { onSelect: () => undefined })
      expect(container.children).toHaveLength(1)
      expect((container.firstChild as HTMLElement | null)?.tagName).toBe('CANVAS')

      renderer.render(0.016)
      // Every character of the shared world is drawn with its name.
      for (const ch of world.characters) {
        expect(texts).toContain(ch.name)
      }
      // Every built connector building is drawn with its name.
      expect(texts).toContain('Mealie')
      expect(texts).toContain('Arbora')
      // Reserved (not yet built) plots carry the connector's name label.
      expect(texts).toContain('Searxng')
      expect(texts).toContain('Uptime')
      restore()
      renderer.dispose()
      expect(container.children).toHaveLength(0)
    } finally {
      restore()
    }
  })

  it('exposes the full CityRenderer handle', () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const { restore } = installRecording2D()
    try {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const renderer = init2D(container, world, { onSelect: () => undefined })
      expect(() => {
        renderer.render(0.016)
      }).not.toThrow()
      expect(() => {
        renderer.onResize(800, 600)
      }).not.toThrow()
      expect(() => {
        renderer.focus(0, 0)
      }).not.toThrow()
      expect(() => {
        renderer.overview()
      }).not.toThrow()
      expect(() => {
        renderer.setSelected({ kind: 'building', id: 'arbora' })
      }).not.toThrow()
      expect(() => {
        renderer.say('player', 'hello')
      }).not.toThrow()
      renderer.dispose()
    } finally {
      restore()
    }
  })

  it('selects characters and buildings by picking against the shared world', () => {
    initSim(fleetToConnectors(FLEET_SNAPSHOT))
    const { restore } = installRecording2D()
    try {
      const container = document.createElement('div')
      Object.defineProperty(container, 'clientWidth', { value: 800 })
      Object.defineProperty(container, 'clientHeight', { value: 600 })
      document.body.appendChild(container)
      let hit: unknown = null
      const renderer = init2D(container, world, {
        onSelect: (h) => {
          hit = h
        },
      })
      renderer.onResize(800, 600)
      const canvas = container.firstChild as HTMLCanvasElement
      // With the fitted view (scale 4, world centre at 490,260) the arbora
      // landmark at (0,0) is under that pointer; every character spawns on
      // a 4.5 m radius (> 16 px pick bound) around it.
      const center = { clientX: 490, clientY: 260 }
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: center.clientX, clientY: center.clientY }))
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: center.clientX, clientY: center.clientY }))
      expect(hit).toEqual({ kind: 'building', id: 'arbora' })
      renderer.dispose()
    } finally {
      restore()
    }
  })
})
