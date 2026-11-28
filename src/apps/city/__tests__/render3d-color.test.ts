// spec: OVERSTORY-CITY-R031.1
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  litWindowSheet,
  metalTexture,
  parkTexture,
  roofFlashSheet,
  skyDayTexture,
  skyNightTexture,
  trimSheetTexture,
  waterTexture,
  woodTexture,
  zebraTexture,
} from '../core/render3d/trimSheet'

describe('city 3D colour management', () => {
  const original = HTMLCanvasElement.prototype.getContext

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string) {
      const context = original.call(this, contextId) as CanvasRenderingContext2D | null
      if (context && contextId === '2d') {
        context.createLinearGradient = () => ({ addColorStop: () => undefined }) as CanvasGradient
      }
      return context
    } as typeof HTMLCanvasElement.prototype.getContext
  })

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = original
  })

  it('marks every canvas-authored colour or emissive map as sRGB', () => {
    const textures = [
      trimSheetTexture(),
      litWindowSheet(),
      roofFlashSheet(),
      zebraTexture(),
      parkTexture(),
      waterTexture(),
      woodTexture(),
      metalTexture(),
      skyDayTexture(),
      skyNightTexture(),
    ]
    expect(textures.every((texture) => texture.colorSpace === THREE.SRGBColorSpace)).toBe(true)
  })
})
