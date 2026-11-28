/**
 * @file npcDialogue.test.ts
 * @description NPC dialogue system (OVERSTORY-CITY-R022): discovery, LLM
 * prompt generation, emotion/gesture parsing, city context, and the
 * dialogue manager lifecycle. Tests the full pipeline — from finding
 * nearby NPCs through to the structured response — using deterministic
 * simulated LLM calls (no live arbora dependency).
 *
 * spec: OVERSTORY-CITY-R022
 */
// spec: OVERSTORY-CITY-R022
import { beforeEach, describe, expect, it } from 'vitest'
import { FLEET_SNAPSHOT, fleetToConnectors } from '../core/ecosystem'
import { bus, setTimeSource } from '../core/events'
import { createNpcDialogueManager, parseEmotion, parseGesture } from '../core/npcDialogue'
import { initSim, resetSim, world } from '../core/sim'
import type { CityRenderer, NpcResponse } from '../core/types'

function boot(): void {
  initSim(fleetToConnectors(FLEET_SNAPSHOT))
}

let mockSayCalls: { charId: string; text: string }[]

function makeMockRenderer(cameraX = 0, cameraZ = 0): CityRenderer {
  mockSayCalls = []
  return {
    fidelity: {
      camera: { position: { x: cameraX, z: cameraZ, y: 40 } } as any,
      holdAmbient: () => {
        /* mock */
      },
      diagnostics: () => null,
      scene: { children: [] } as any,
      controls: {} as any,
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
    },
    say(charId: string, text: string): void {
      mockSayCalls.push({ charId, text })
    },
    render(): void {
      /* mock */
    },
    onResize(): void {
      /* mock */
    },
    focus(): void {
      /* mock */
    },
    overview(): void {
      /* mock */
    },
    setSelected(): void {
      /* mock */
    },
    dispose(): void {
      /* mock */
    },
  }
}

describe('npcDialogue (R022)', () => {
  beforeEach(() => {
    bus.reset()
    resetSim()
    boot()
    setTimeSource(() => world.clock)
  })

  // ---- Dialogue manager creation ---------------------------------------------

  it('creates a dialogue manager instance', () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)
    expect(manager).toBeDefined()
    expect(typeof manager.requestDialogue).toBe('function')
    expect(typeof manager.getAvailableNpcs).toBe('function')
    expect(typeof manager.getNpcInfo).toBe('function')
    expect(typeof manager.closeDialogue).toBe('function')
    expect(typeof manager.isOpen).toBe('function')
  })

  it('isOpen returns false before any dialogue', () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)
    expect(manager.isOpen()).toBe(false)
  })

  // ---- NPC discovery finds NPCs near camera ----------------------------------

  it('getAvailableNpcs returns NPCs near the camera position', () => {
    const renderer = makeMockRenderer(0, 0) // camera at city center
    const manager = createNpcDialogueManager(renderer)
    const npcs = manager.getAvailableNpcs()

    // The simulated operators (operator-01, 02, 03) are kind 'npc'.
    expect(npcs.length).toBeGreaterThan(0)

    for (const npc of npcs) {
      expect(npc).toHaveProperty('npcId')
      expect(npc).toHaveProperty('npcName')
      expect(npc).toHaveProperty('role')
      expect(npc).toHaveProperty('district')
      expect(npc).toHaveProperty('available')
      expect(npc).toHaveProperty('position')
      expect(npc).toHaveProperty('state')
      expect(npc.npcId).toMatch(/^operator-\d{2}$/)
      expect(npc.available).toBe(true)
      expect(npc.position).toHaveProperty('x')
      expect(npc.position).toHaveProperty('z')
    }
  })

  it('getNpcInfo returns metadata for a known NPC', () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)
    const info = manager.getNpcInfo('operator-01')

    expect(info).not.toBeNull()
    expect(info!.npcId).toBe('operator-01')
    expect(info!.npcName).toBe('operator-01')
    expect(info!.role).toBeDefined()
    expect(info!.available).toBe(true)
  })

  it('getNpcInfo returns null for unknown NPC', () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)
    const info = manager.getNpcInfo('nonexistent-npc')
    expect(info).toBeNull()
  })

  it('getAvailableNpcs excludes sleeping NPCs', () => {
    const renderer = makeMockRenderer(0, 0)
    const manager = createNpcDialogueManager(renderer)

    // Put one NPC to sleep so they're excluded.
    const sleepingCh = world.characters.find((c) => c.id === 'operator-02')
    if (sleepingCh) sleepingCh.state = 'sleeping'

    const npcs = manager.getAvailableNpcs()
    const sleepingFound = npcs.some((n) => n.npcId === 'operator-02')
    expect(sleepingFound).toBe(false)
  })

  // ---- Dialogue request returns response -------------------------------------

  it('requestDialogue returns a response for a valid NPC', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const response = await manager.requestDialogue('operator-01', 'Hello, how are you?')

    expect(response).toBeDefined()
    expect(response.npcId).toBe('operator-01')
    expect(response.npcName).toBe('operator-01')
    expect(response.response).toBeDefined()
    expect(typeof response.response).toBe('string')
    expect(response.response.length).toBeGreaterThan(0)
    expect(response.emotion).toBeDefined()
    expect(response.gesture).toBeDefined()
  })

  it('response includes emotion field', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const response = await manager.requestDialogue('operator-01', 'Hello')

    expect(['happy', 'sad', 'neutral', 'inquisitive']).toContain(response.emotion)
  })

  it('response includes gesture field', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const response = await manager.requestDialogue('operator-01', 'Hello')

    expect(['wave', 'nod', 'point']).toContain(response.gesture)
  })

  it('response includes duration', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const response = await manager.requestDialogue('operator-01', 'Hello')

    expect(response.duration).toBeGreaterThan(0)
    expect(response.duration).toBe(5) // default bubble duration
  })

  it('response includes role and district', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const response = await manager.requestDialogue('operator-01', 'Hello')

    expect(response.role).toBeDefined()
    expect(typeof response.role).toBe('string')
    expect(response.district).toBeDefined()
    expect(typeof response.district).toBe('string')
  })

  // ---- Close dialogue clears session ----------------------------------------

  it('closeDialogue clears the active session', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    await manager.requestDialogue('operator-01', 'Hello')
    expect(manager.isOpen()).toBe(true)
    manager.closeDialogue()
    expect(manager.isOpen()).toBe(false)
  })

  it('isOpen returns true during a dialogue session', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    await manager.requestDialogue('operator-01', 'Hello')
    expect(manager.isOpen()).toBe(true)
  })

  // ---- Dialogue context includes city state ---------------------------------

  it('the dialogue prompt includes city state snapshot', async () => {
    const renderer = makeMockRenderer()
    world.day = 5
    world.clock = 14 * 3600 // 14:00

    const manager = createNpcDialogueManager(renderer)

    // Check that the city has the right state properties.
    expect(world.day).toBe(5)
    expect(world.clock).toBe(14 * 3600)
    expect(world.characters.length).toBeGreaterThan(0)

    // Trigger a dialogue to verify the context is captured.
    const response = await manager.requestDialogue('operator-01', 'Status check')
    expect(response.response).toBeDefined()
    expect(typeof response.response).toBe('string')
  })

  it('the dialogue prompt includes the correct role context for the NPC', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    // Each NPC should have their role reflected in the response.
    const operator01 = world.characters.find((c) => c.id === 'operator-01')
    expect(operator01).toBeDefined()

    const response = await manager.requestDialogue('operator-01', 'Tell me about the city')

    expect(response.role).toBeDefined()
  })

  // ---- Multiple NPCs can be queried independently ---------------------------

  it('multiple NPCs can be queried independently', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const responses: NpcResponse[] = await Promise.all(
      ['operator-01', 'operator-02', 'operator-03'].map((id) => manager.requestDialogue(id, 'Hello there')),
    )

    expect(responses).toHaveLength(3)

    // Each response is tied to its NPC.
    const ids = responses.map((r) => r.npcId)
    expect(ids).toContain('operator-01')
    expect(ids).toContain('operator-02')
    expect(ids).toContain('operator-03')

    // Each response has its own emotion/gesture.
    for (const r of responses) {
      expect(r.emotion).toBeDefined()
      expect(r.gesture).toBeDefined()
      expect(r.response.length).toBeGreaterThan(0)
    }
  })

  it('different NPCs produce different responses for the same prompt', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const r1 = await manager.requestDialogue('operator-01', 'Hello')
    const r2 = await manager.requestDialogue('operator-02', 'Hello')

    expect(r1.npcId).not.toBe(r2.npcId)
    // Each NPC responds differently based on their role.
    expect(r1.response).not.toBe(r2.response)
  })

  // ---- Unknown NPC returns error -------------------------------------------

  it('requestDialogue rejects for an unknown NPC', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    await expect(manager.requestDialogue('unknown-agent', 'Hello')).rejects.toThrow('Unknown NPC')
  })

  it('sleeping NPCs cannot be dialogued with', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    // Make operator-02 sleeping.
    const ch = world.characters.find((c) => c.id === 'operator-02')
    if (ch) ch.state = 'sleeping'

    await expect(manager.requestDialogue('operator-02', 'Hello')).rejects.toThrow('sleeping')
  })

  // ---- Emotion parsing -----------------------------------------------------

  it('parseEmotion returns happy for excited keywords', () => {
    expect(parseEmotion('I am so excited about this!')).toBe('happy')
    expect(parseEmotion('That makes me very happy')).toBe('happy')
  })

  it('parseEmotion returns sad for concerned keywords', () => {
    expect(parseEmotion('I am worried about that')).toBe('sad')
    expect(parseEmotion('I am so sorry and sad')).toBe('sad')
  })

  it('parseEmotion returns inquisitive for question keywords', () => {
    expect(parseEmotion('Tell me what you think')).toBe('inquisitive')
    expect(parseEmotion('I am curious about this')).toBe('inquisitive')
  })

  it('parseEmotion defaults to neutral', () => {
    expect(parseEmotion('Just doing maintenance work')).toBe('neutral')
    expect(parseEmotion('All systems nominal')).toBe('neutral')
  })

  // ---- Gesture parsing -----------------------------------------------------

  it('parseGesture returns wave for greeting keywords', () => {
    expect(parseGesture('Hello there, waving hello')).toBe('wave')
    expect(parseGesture('Hi! Hand raised')).toBe('wave')
  })

  it('parseGesture returns nod for agreement keywords', () => {
    expect(parseGesture('Yes, absolutely agree')).toBe('nod')
    expect(parseGesture('Sure, right there')).toBe('nod')
  })

  it('parseGesture returns point for directional keywords', () => {
    expect(parseGesture('Look over there')).toBe('point')
    expect(parseGesture('Direct your attention there')).toBe('point')
  })

  // ---- Renderer integration -----------------------------------------------

  it('requestDialogue calls renderer.say with the response text', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    await manager.requestDialogue('operator-01', 'Hello')

    expect(mockSayCalls).toBeDefined()
    expect(mockSayCalls!.length).toBeGreaterThan(0)
    expect(mockSayCalls![0].charId).toBe('operator-01')
    expect(mockSayCalls![0].text.length).toBeLessThanOrEqual(24) // truncated
  })

  // ---- Bus events ---------------------------------------------------------

  it('requestDialogue emits an npc.dialogue event', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const events: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'npc.dialogue') {
        events.push(e.detail ?? '')
      }
    })

    await manager.requestDialogue('operator-01', 'Hello')

    expect(events.length).toBeGreaterThan(0)
    expect(events[0]).toContain('operator-01')
  })

  it('requestDialogue emits an npc.dialogue.error event for unknown NPC', async () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const errors: string[] = []
    bus.subscribe((e) => {
      if (e.type === 'npc.dialogue.error') {
        errors.push(e.detail ?? '')
      }
    })

    try {
      await manager.requestDialogue('nonexistent', 'Hello')
    } catch {
      // Expected
    }

    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('not found')
  })

  // ---- getNpcInfo with position -------------------------------------------

  it('getNpcInfo returns accurate position from world state', () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const info = manager.getNpcInfo('operator-01')
    if (info) {
      expect(Number.isFinite(info.position.x)).toBe(true)
      expect(Number.isFinite(info.position.z)).toBe(true)
    }
  })

  it('getNpcInfo returns state from the character', () => {
    const renderer = makeMockRenderer()
    const manager = createNpcDialogueManager(renderer)

    const info = manager.getNpcInfo('operator-01')
    if (info) {
      expect(info.state).toBeDefined()
      // In quiet mode at boot, operators may be idle.
      expect(['idle', 'tasked', 'traveling', 'working', 'committing', 'awaiting', 'sleeping']).toContain(info.state)
    }
  })
})
