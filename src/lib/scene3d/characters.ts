/**
 * @file characters.ts
 * @description The shared character rig (OVERSTORY-DESIGN-R012.4): every
 * character in every scene is a skinned mesh on one shared rig with a
 * blended clip set — idle, walk, run, work, carry, talk, celebrate and fail.
 * Clips crossfade in at most 0.25 s, foot speed matches travel speed (no foot
 * sliding), turns are eased, and a character is never frozen in a bind pose.
 * The library owns the clip binding, the crossfade policy and the walk-speed
 * measurement; the consumer's scene module drives movement along its road
 * graph and maps its states to clips.
 */
import * as THREE from 'three'

/** The blended clip set (R012.4): every character carries all eight. */
export const CLIP_SET = ['idle', 'walk', 'run', 'work', 'carry', 'talk', 'celebrate', 'fail'] as const
export type ClipId = (typeof CLIP_SET)[number]

/** The crossfade ceiling (R012.4): clips crossfade in at most 0.25 s. */
export const MAX_CROSSFADE_S = 0.25

/** One rig binding: the shared rig's clip set, ready to play. */
export type RigClips = Record<ClipId, THREE.AnimationClip>

/**
 * The city's agent state → clip mapping (R012.4): the state a character is
 * in plays exactly one clip from the shared set. A character with no state
 * still plays `idle` — it is never frozen in a bind pose.
 */
export const STATE_CLIP: Record<string, ClipId> = {
  idle: 'idle',
  tasked: 'walk',
  traveling: 'walk',
  working: 'work',
  committing: 'carry',
  awaiting: 'talk',
  sleeping: 'idle',
  patrolling: 'walk',
  success: 'celebrate',
  failure: 'fail',
}

/** The clip an agent state plays (R012.4); unknown states fall back to idle. */
export function stateToClip(state: string): ClipId {
  return state in STATE_CLIP ? STATE_CLIP[state] : 'idle'
}

/**
 * Bind the shared rig's clip set to a mixer (R012.4): every clip in
 * CLIP_SET is registered and the `idle` clip starts at weight 1, so the
 * character is never frozen in a bind pose. Throws when a clip is missing —
 * a rig without the full clip set fails the bar loudly, not silently.
 */
export function bindRig(mixer: THREE.AnimationMixer, clips: Partial<RigClips>): THREE.AnimationAction[] {
  const actions: THREE.AnimationAction[] = []
  for (const id of CLIP_SET) {
    const clip = clips[id]
    if (!clip) throw new Error(`shared rig is missing clip: ${id}`)
    const action = mixer.clipAction(clip)
    action.play()
    // setEffectiveWeight (not raw .weight): the effective weight is what
    // the mixer blends with, and it syncs immediately here.
    action.setEffectiveWeight(id === 'idle' ? 1 : 0)
    actions.push(action)
  }
  return actions
}

export interface ClipBlenderApi {
  /** Switch the character to the clip a state plays, crossfading in at most MAX_CROSSFADE_S. */
  playState(state: string): void
  /** The clip currently at the highest weight, or null before the first update. */
  current(): ClipId | null
  /** One frame of the mixer (call with real dt, seconds). */
  update(dtS: number): void
  dispose(): void
}

/**
 * The bounded crossfade policy (R012.4): switching states crossfades the
 * previous clip out and the new one in over at most 0.25 s — the fade
 * duration is clamped to the ceiling no matter how long the clips are, so
 * the scene can never linger in a mixed state longer than the bar allows.
 */
export function createClipBlender(mixer: THREE.AnimationMixer, clips: RigClips): ClipBlenderApi {
  const actions = bindRig(mixer, clips)
  const byClip = new Map<ClipId, THREE.AnimationAction>()
  CLIP_SET.forEach((id, i) => {
    byClip.set(id, actions[i])
  })
  let active: ClipId = 'idle'

  return {
    playState(state: string): void {
      const next = stateToClip(state)
      if (next === active) return
      const from = byClip.get(active)
      const to = byClip.get(next)
      if (!from || !to) return
      // The crossfade is clamped to the ceiling: short clips fade in full,
      // long clips only ever fade for MAX_CROSSFADE_S (R012.4).
      const fade = Math.min(MAX_CROSSFADE_S, Math.min(from.getClip().duration, to.getClip().duration) / 2)
      to.reset()
      to.setEffectiveWeight(1)
      to.fadeIn(fade)
      from.fadeOut(fade)
      active = next
    },
    current(): ClipId | null {
      return active
    },
    update(dtS: number): void {
      mixer.update(dtS)
    },
    dispose(): void {
      for (const action of byClip.values()) action.stop()
      mixer.stopAllAction()
    },
  }
}

/**
 * The walk speed a clip actually carries (R012.4: foot speed matches travel
 * speed). Measured from the clip itself: the average forward displacement
 * per second over its root position track (falling back to the first
 * position track that moves). Returns null when the clip does not displace
 * anything (a pure in-place cycle) — the consumer then drives travel at the
 * clip's stride, keeping the feet under the body.
 */
export function clipWalkSpeed(clip: THREE.AnimationClip): number | null {
  let bestTrack: THREE.VectorKeyframeTrack | null = null
  let bestIsRoot = false
  for (const track of clip.tracks) {
    if (!(track instanceof THREE.VectorKeyframeTrack)) continue
    if (track.getValueSize() !== 3) continue
    const values = track.values
    let moved = 0
    for (let i = 0; i + 3 <= values.length; i += 3) {
      moved += Math.abs(values[i]) + Math.abs(values[i + 1]) + Math.abs(values[i + 2])
    }
    if (moved <= 1e-4) continue
    // Prefer the node's own position (the root) over any moving position.
    const isRoot = track.name.endsWith('.position') && !track.name.includes('bones/')
    if (bestTrack === null || (isRoot && !bestIsRoot)) {
      bestTrack = track
      bestIsRoot = isRoot
    }
  }
  if (!bestTrack) return null
  const times = bestTrack.times
  const values = bestTrack.values
  const n = Math.floor(values.length / 3)
  if (n < 2) return null
  const start = new THREE.Vector3(values[0], values[1], values[2])
  const end = new THREE.Vector3(values[(n - 1) * 3], values[(n - 1) * 3 + 1], values[(n - 1) * 3 + 2])
  const dt = times[n - 1] - times[0]
  if (dt <= 1e-6) return null
  // A looping clip's net displacement over its period is its stride per
  // second — the speed travel must use so the feet do not slide.
  return start.distanceTo(end) / dt
}

/**
 * The travel speed that matches a clip's foot speed (R012.4): the measured
 * clip speed, or the consumer's declared walk speed when the clip is an
 * in-place cycle. `declared` is the speed the consumer would use; the
 * error between the two is what the bound test keeps under 10 %.
 */
export function travelSpeedFor(clip: THREE.AnimationClip, declared: number): number {
  return clipWalkSpeed(clip) ?? declared
}
