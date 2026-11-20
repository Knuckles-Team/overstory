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
export function bindRig(
  mixer: THREE.AnimationMixer,
  clips: Partial<RigClips>,
  once: ClipId[] = [],
): THREE.AnimationAction[] {
  const actions: THREE.AnimationAction[] = []
  for (const id of CLIP_SET) {
    const clip = clips[id]
    if (!clip) throw new Error(`shared rig is missing clip: ${id}`)
    const action = mixer.clipAction(clip)
    // One-shot clips (a fail beat) play once and clamp at their end — the
    // loop mode lives on the action (three r155+ moved it off the clip);
    // r186's setLoop takes the repetition count (1 for a single play).
    if (once.includes(id)) action.setLoop(THREE.LoopOnce, 1)
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
export function createClipBlender(mixer: THREE.AnimationMixer, clips: RigClips, once: ClipId[] = []): ClipBlenderApi {
  const actions = bindRig(mixer, clips, once)
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

/**
 * The shared rig's clip-set completion (R012.4): a pinned rig ships a set
 * of authored clips under its own names; this maps them onto the shared
 * eight-clip set and completes whatever is missing so every character
 * carries the full blended set. The locomotion core — idle, walk, run —
 * cannot be invented and must come from the rig (missing ones fail
 * loudly); the remaining clips derive, when unshipped, as deterministic
 * keyframe layers over the rig's own skeleton rest pose, so no character
 * is ever frozen in a bind pose.
 */

/** One clip's authored names (case-insensitive): the first alias present in the rig wins. */
const CLIP_ALIASES: Record<ClipId, string[]> = {
  idle: ['idle', 'standing'],
  walk: ['walk', 'walking'],
  run: ['run', 'running'],
  work: ['work', 'punch'],
  carry: ['carry'],
  talk: ['talk', 'wave'],
  celebrate: ['celebrate', 'dance'],
  fail: ['fail', 'death'],
}

/** The clips a rig must ship itself: locomotion cannot be derived. */
const LOCOMOTION_CORE: ClipId[] = ['idle', 'walk', 'run']

/** Semantic bone → the rig-specific names to try, in order. */
const BONE_ALIASES: Record<string, string[]> = {
  head: ['Head', 'head', 'HeadRoll', 'Neck', 'neck'],
  spine: ['Torso_1', 'Spine1', 'Spine', 'spine', 'chest', 'Abdomen'],
  hips: ['Hips', 'hips', 'Pelvis', 'pelvis'],
  armL: ['UpperArmL', 'UpperArmLeft', 'upper_arm_l', 'LeftArm'],
  armR: ['UpperArmR', 'UpperArmRight', 'upper_arm_r', 'RightArm'],
  foreL: ['LowerArmL', 'LowerArmLeft', 'forearm_l', 'LeftForeArm'],
  foreR: ['LowerArmR', 'LowerArmRight', 'forearm_r', 'RightForeArm'],
}

/**
 * Find the rig's bones by semantic role (first alias present wins). The
 * rig's own names win over the generic fallbacks, so the same completion
 * works across rigs.
 */
export function findRigBones(rigRoot: THREE.Object3D): Record<string, THREE.Bone> {
  const byName = new Map<string, THREE.Object3D>()
  rigRoot.traverse((o) => {
    if (o instanceof THREE.Bone && o.name) byName.set(o.name, o)
  })
  const out: Record<string, THREE.Bone> = {}
  for (const [semantic, aliases] of Object.entries(BONE_ALIASES)) {
    for (const alias of aliases) {
      const bone = byName.get(alias)
      if (bone) {
        out[semantic] = bone as THREE.Bone
        break
      }
    }
  }
  return out
}

/**
 * One derived clip: deterministic keyframe layers over the rig's skeleton
 * rest pose. `pose` yields, for each phase p ∈ (0, 1] of the clip, the
 * offset angles (radians, local axes x/y/z) to layer over each semantic
 * bone's rest quaternion; bones the rig lacks are skipped. The consumer
 * marks a clip one-shot at bind time (bindRig's `once`), not here.
 */
function deriveClip(
  id: ClipId,
  rigRoot: THREE.Object3D,
  spec: { duration: number; pose: (p: number) => Partial<Record<string, [number, number, number]>> },
): THREE.AnimationClip {
  const bones = findRigBones(rigRoot)
  const rest = new Map<string, THREE.Quaternion>()
  for (const [semantic, bone] of Object.entries(bones)) {
    rest.set(semantic, bone.quaternion.clone())
  }
  const samples = 24
  const times = new Float32Array(samples + 1)
  const layers: { semantic: string; values: number[] }[] = []
  for (let i = 1; i <= samples; i++) {
    const p = i / samples
    times[i] = spec.duration * p
    const pose = spec.pose(p)
    for (const [semantic, axisAngles] of Object.entries(pose)) {
      if (!axisAngles || !rest.has(semantic)) continue
      let values = layers.find((l) => l.semantic === semantic)?.values
      if (!values) {
        values = []
        layers.push({ semantic, values })
      }
      const restQ = rest.get(semantic)!
      const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(axisAngles[0], axisAngles[1], axisAngles[2]))
      const q = restQ.clone().multiply(offset)
      values.push(q.x, q.y, q.z, q.w)
    }
  }
  // The first keyframe is the pure rest pose for every layered bone.
  for (const { semantic, values } of layers) {
    const r = rest.get(semantic)!
    values.unshift(r.x, r.y, r.z, r.w)
  }
  times[0] = 0
  const tracks: THREE.KeyframeTrack[] = layers.map(({ semantic, values }) => {
    const bone = bones[semantic]
    return new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, [...times], values)
  })
  // A rig with none of the semantic bones still gets a living clip: a
  // subtle root bob, so a character never sits frozen in a bind pose.
  if (tracks.length === 0) {
    const values: number[] = []
    for (let i = 0; i <= samples; i++) {
      const p = i / samples
      values.push(0, 0.02 * Math.sin(Math.PI * 2 * p), 0)
    }
    tracks.push(new THREE.VectorKeyframeTrack('.position', [...times], values))
  }
  const clip = new THREE.AnimationClip(id, spec.duration, tracks)
  return clip
}

/** The derived-clip recipes for the set's non-locomotion clips. */
const DERIVED_RECIPES: Record<
  Exclude<ClipId, 'idle' | 'walk' | 'run'>,
  { duration: number; pose: (p: number) => Partial<Record<string, [number, number, number]>> }
> = {
  // A working effort cycle: bent spine, one arm driving, the other bracing.
  work: {
    duration: 1.4,
    pose: (p) => {
      const w = Math.sin(Math.PI * 2 * p)
      return {
        spine: [0.28 + 0.08 * w, 0, 0],
        armR: [-0.9 + 0.3 * w, 0, 0],
        foreR: [-0.5 + 0.25 * w, 0, 0],
        armL: [-0.7 - 0.3 * w, 0, 0],
      }
    },
  },
  // A carry hold: arms forward at chest, spine forward, a gentle bob —
  // the city drives the travel, the clip keeps the load steady.
  carry: {
    duration: 2.4,
    pose: (p) => {
      const b = Math.sin(Math.PI * 2 * p)
      return {
        spine: [0.18 + 0.03 * b, 0, 0],
        armL: [-1.45 + 0.05 * b, 0, 0],
        armR: [-1.55 + 0.05 * Math.sin(Math.PI * 2 * p + Math.PI), 0, 0],
        foreL: [-0.6 + 0.04 * b, 0, 0],
        foreR: [-0.6 + 0.04 * Math.sin(Math.PI * 2 * p + Math.PI), 0, 0],
        head: [0.08, 0, 0],
        hips: [-0.04 * b, 0, 0],
      }
    },
  },
  // Talking: a head nod and a light chest sway.
  talk: {
    duration: 2.0,
    pose: (p) => ({
      head: [0.08 * Math.sin(Math.PI * 2 * p), 0, 0],
      spine: [0.03 * Math.sin(Math.PI * 2 * p + 0.5), 0, 0],
    }),
  },
  // A success beat: arms up, head up, a light spin sway.
  celebrate: {
    duration: 0.9,
    pose: (p) => ({
      armL: [-2.4, 0, -0.25 * Math.sin(Math.PI * 2 * p)],
      armR: [-2.4, 0, 0.25 * Math.sin(Math.PI * 2 * p)],
      head: [-0.15, 0, 0],
      spine: [0, 0.08 * Math.sin(Math.PI * 2 * p), 0],
    }),
  },
  // A failure: the body folds over the first 60 % of the clip and holds
  // (played as a one-shot by the consumer through bindRig's `once`).
  fail: {
    duration: 1.2,
    pose: (p) => {
      const f = Math.pow(Math.min(p / 0.6, 1), 1.5)
      return {
        spine: [0.65 * f, 0, 0],
        head: [0.5 * f, 0, 0],
        armL: [0.9 * f, 0, 0],
        armR: [0.9 * f, 0, 0],
        hips: [0.3 * f, 0, 0],
      }
    },
  },
}

/**
 * Complete a shared rig's bundled clips into the full eight-clip set
 * (R012.4). `rigRoot` is the loaded rig's scene node (its bones must be
 * in their rest pose — call this before any mixer has played), and
 * `bundled` the clips the file ships. Returns the full `RigClips`; throws
 * when a locomotion clip (idle/walk/run) is missing — a rig without its
 * locomotion core fails the bar loudly, not silently.
 */
export function completeClipSet(rigRoot: THREE.Object3D, bundled: THREE.AnimationClip[]): RigClips {
  const byName = new Map<string, THREE.AnimationClip>()
  for (const clip of bundled) byName.set(clip.name.toLowerCase(), clip)
  const out = {} as RigClips
  for (const id of CLIP_SET) {
    const shipped = CLIP_ALIASES[id].map((a) => byName.get(a)).find((c) => c !== undefined)
    if (shipped) {
      shipped.name = id
      out[id] = shipped
      continue
    }
    if (LOCOMOTION_CORE.includes(id)) {
      throw new Error(`shared rig is missing its locomotion clip: ${id}`)
    }
    // id is narrowed past the locomotion core by the check above.
    out[id] = deriveClip(id, rigRoot, DERIVED_RECIPES[id as Exclude<ClipId, 'idle' | 'walk' | 'run'>])
  }
  return out
}
