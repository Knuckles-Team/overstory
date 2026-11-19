/**
 * @file characters.test.ts
 * @description The shared character rig (OVERSTORY-DESIGN-R012.4): every
 * character has all eight clips of the shared rig, a rig missing a clip
 * fails loudly, state switches crossfade in at most 0.25 s, foot speed
 * matches travel speed (no foot sliding), and a character is never frozen
 * in a bind pose.
 */
// spec: OVERSTORY-DESIGN-R012.4
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  CLIP_SET,
  MAX_CROSSFADE_S,
  bindRig,
  clipWalkSpeed,
  createClipBlender,
  stateToClip,
  travelSpeedFor,
  type RigClips,
} from '../characters'

/** One synthetic clip: a root position track over `durationS`. */
function makeClip(name: string, durationS: number, endX = 0): THREE.AnimationClip {
  const track = new THREE.VectorKeyframeTrack('.position', [0, durationS], [0, 0, 0, endX, 0, 0])
  return new THREE.AnimationClip(name, durationS, [track])
}

/** The full shared clip set on one rig. */
function fullClipSet(durationS = 10): RigClips {
  const clips = {} as RigClips
  for (const id of CLIP_SET) clips[id] = makeClip(`clip-${id}`, durationS)
  return clips
}

describe('the shared character rig (R012.4)', () => {
  it('clip_coverage_and_blending: every character has all eight clips, crossfades are at most 0.25 s, and foot-speed error stays under 10 percent along a walked path', () => {
    // The shared rig's clip set is exactly the eight the row names.
    expect(CLIP_SET).toEqual(['idle', 'walk', 'run', 'work', 'carry', 'talk', 'celebrate', 'fail'])

    // Coverage: a rig with the full set binds all eight clips, idle
    // playing from creation, the rest at zero weight.
    const root = new THREE.Group()
    const mixer = new THREE.AnimationMixer(root)
    const clips = fullClipSet()
    const actions = bindRig(mixer, clips)
    expect(actions).toHaveLength(8)
    const idle = actions.find((a) => a.getClip().name === 'clip-idle')
    expect(idle).toBeDefined()
    expect(idle!.getEffectiveWeight()).toBe(1)
    for (const action of actions) {
      if (action === idle) continue
      expect(action.getEffectiveWeight()).toBe(0)
    }
    // A character is never frozen in a bind pose: the mixer advances.
    mixer.update(0.1)
    expect(idle!.time).toBeGreaterThan(0)

    // Coverage failure: a rig missing a clip fails loudly, naming it.
    const missing: Partial<RigClips> = { ...fullClipSet() }
    delete missing.fail
    expect(() => bindRig(new THREE.AnimationMixer(root), missing)).toThrow(/fail/)

    // Crossfade ceiling: a state switch fades in at most 0.25 s, no
    // matter how long the clips are.
    const fadeIn = vi.spyOn(THREE.AnimationAction.prototype, 'fadeIn')
    const fadeOut = vi.spyOn(THREE.AnimationAction.prototype, 'fadeOut')
    const blender = createClipBlender(new THREE.AnimationMixer(new THREE.Group()), fullClipSet(10))
    blender.playState('working')
    expect(blender.current()).toBe('work')
    const fades = [...fadeIn.mock.calls.map((c) => c[0] as number), ...fadeOut.mock.calls.map((c) => c[0] as number)]
    expect(fades).toHaveLength(2)
    for (const fade of fades) expect(fade, 'crossfade ceiling').toBeLessThanOrEqual(MAX_CROSSFADE_S)
    expect(MAX_CROSSFADE_S).toBe(0.25)
    // The state → clip mapping covers the city's states; an unknown
    // state never freezes (it idles).
    expect(stateToClip('working')).toBe('work')
    expect(stateToClip('failure')).toBe('fail')
    expect(stateToClip('something-unknown')).toBe('idle')
    blender.dispose()
    fadeIn.mockRestore()
    fadeOut.mockRestore()
  })

  it('foot speed matches travel speed along a walked path', () => {
    // A walk clip that carries 2 m of root displacement over 2 s: the
    // measured foot speed is 1 m/s, and travel uses it.
    const walk = new THREE.AnimationClip('walk', 2, [
      new THREE.VectorKeyframeTrack('.position', [0, 1, 2], [0, 0, 0, 1, 0, 0, 2, 0, 0]),
    ])
    const measured = clipWalkSpeed(walk)
    expect(measured).toBeCloseTo(1.0)
    const declared = 1.05
    expect(Math.abs(declared - (measured as number)) / (measured as number)).toBeLessThan(0.1)
    const speed = travelSpeedFor(walk, declared)
    expect(speed).toBeCloseTo(1.0) // the measured speed wins
    // A full period of travel covers the clip's net displacement: the
    // feet stay under the body over the walked path.
    const travel = speed * walk.duration
    expect(
      Math.abs(travel - (measured as number) * walk.duration) / ((measured as number) * walk.duration),
    ).toBeLessThan(0.1)
    // A bone (non-root) track is not the walk: the root track wins.
    const withBone = new THREE.AnimationClip('walk-bone', 2, [
      new THREE.VectorKeyframeTrack('bones/hip.position', [0, 2], [0, 0, 0, 9, 0, 0]),
      new THREE.VectorKeyframeTrack('.position', [0, 2], [0, 0, 0, 2, 0, 0]),
    ])
    expect(clipWalkSpeed(withBone)).toBeCloseTo(1.0)
    // An in-place cycle carries no displacement: travel falls back to
    // the declared speed.
    const inPlace = new THREE.AnimationClip('idle', 2, [
      new THREE.VectorKeyframeTrack('.position', [0, 2], [0, 0, 0, 0, 0, 0]),
    ])
    expect(clipWalkSpeed(inPlace)).toBeNull()
    expect(travelSpeedFor(inPlace, 0.8)).toBe(0.8)
  })
})
