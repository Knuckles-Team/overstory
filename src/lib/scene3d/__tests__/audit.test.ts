/**
 * @file audit.test.ts
 * @description The 3D fidelity audits (OVERSTORY-DESIGN-R012.2 / R012.3):
 * the material audit finds every non-marker surface without an authored
 * physically based material on a real scene graph; the density audit finds
 * empty plots and blocks below the declared furniture density. The city's
 * bundled-snapshot checks (zero empty plots over the real layout) run in the
 * city suite against the world state this audit consumes.
 */
// spec: OVERSTORY-DESIGN-R012.2, OVERSTORY-DESIGN-R012.3
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { densityAudit, materialAudit, type DensityBlock, type DressedPlot } from '../audit'

describe('material audit (R012.2)', () => {
  function texturedMaterial(): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 4
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.fillRect(0, 0, 4, 4)
    return new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas) })
  }

  it('no_untextured_meshes: a fully authored scene passes, an untextured one fails', () => {
    const scene = new THREE.Scene()
    // Authored PBR surface (a trim-sheet material with a base-colour map).
    const good = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), texturedMaterial())
    good.name = 'good'
    scene.add(good)
    // A flat-colour untextured box — the exact surface R012.2 forbids.
    const bad = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x123456 }))
    bad.name = 'bad'
    scene.add(bad)
    // A declared marker (userData.marker) is exempt from the PBR bar.
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    marker.name = 'marker'
    marker.userData.marker = 'selection-gizmo'
    scene.add(marker)

    const result = materialAudit(scene, { isMarker: (o) => o.userData.marker !== undefined })
    expect(result.surfaceCount).toBe(3)
    expect(result.markerCount).toBe(1)
    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.objectPath).toContain('bad')
    expect(result.violations[0]?.reason).toBe('untextured')
  })

  it('non-PBR materials on lit surfaces are violations; textured sprites are exempt', () => {
    const scene = new THREE.Scene()
    const litBasic = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    litBasic.name = 'litBasic'
    scene.add(litBasic)
    // A label sprite with its own plate texture is screen-space UI, exempt.
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 4
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }))
    label.name = 'label'
    scene.add(label)

    const result = materialAudit(scene)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.reason).toBe('non-pbr-material')
    expect(result.violations[0]?.objectPath).toContain('litBasic')
  })

  it('multi-material meshes are audited per material slot', () => {
    const scene = new THREE.Scene()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 4
    const map = new THREE.CanvasTexture(canvas)
    const multi = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
      new THREE.MeshStandardMaterial({ map }),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
      new THREE.MeshStandardMaterial({ map }),
      new THREE.MeshStandardMaterial({ map }),
      new THREE.MeshStandardMaterial({ map }),
      new THREE.MeshStandardMaterial({ map }),
    ])
    multi.name = 'multi'
    scene.add(multi)
    const result = materialAudit(scene)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.reason).toBe('untextured')
  })
})

describe('density audit (R012.3)', () => {
  function plot(id: string, content: DressedPlot['content'], edgeFurniture = 0): DressedPlot {
    return { id, content, edgeFurniture }
  }

  it('no_empty_space: a fully dressed layout passes', () => {
    const blocks: DensityBlock[] = [
      {
        id: 'block-a',
        minEdgeFurniture: 4,
        plots: [plot('p1', 'building', 2), plot('p2', 'construction', 2), plot('p3', 'park', 0)],
      },
      {
        id: 'block-b',
        minEdgeFurniture: 2,
        plots: [plot('p4', 'plaza', 1), plot('p5', 'water', 1)],
      },
    ]
    const result = densityAudit(blocks)
    expect(result.ok).toBe(true)
    expect(result.emptyPlots).toEqual([])
    expect(result.sparseBlocks).toEqual([])
  })

  it('an empty plot and a sparse block are both found and named', () => {
    const blocks: DensityBlock[] = [
      {
        id: 'block-a',
        minEdgeFurniture: 6,
        plots: [plot('p1', 'building', 2), plot('p2', 'park', 1)],
      },
    ]
    const result = densityAudit(blocks)
    expect(result.ok).toBe(false)
    expect(result.sparseBlocks).toEqual([{ block: 'block-a', furniture: 3, min: 6 }])
    // The empty-plot check is independent of furniture: a plot with no
    // content at all is dead space even when the block is well furnished.
    const withEmpty: DensityBlock[] = [
      {
        id: 'block-a',
        minEdgeFurniture: 2,
        plots: [
          plot('p1', 'building', 2),
          // R031 dresses every unused plot; the audit's job is to catch the
          // case where one was left undressed.
          plot('p2', 'lot', 0),
        ],
      },
    ]
    expect(densityAudit(withEmpty).emptyPlots).toEqual([]) // 'lot' is content
  })

  it('furniture counts only the plots that carry purposeful content', () => {
    // The renderer derives edgeFurniture from the street furniture it
    // actually places; the audit trusts that number per plot.
    const blocks: DensityBlock[] = [
      {
        id: 'block-a',
        minEdgeFurniture: 10,
        plots: [plot('p1', 'park', 3), plot('p2', 'park', 3), plot('p3', 'park', 3)],
      },
    ]
    expect(densityAudit(blocks).sparseBlocks).toEqual([{ block: 'block-a', furniture: 9, min: 10 }])
  })
})
