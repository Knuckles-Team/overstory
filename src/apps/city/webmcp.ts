/**
 * @file webmcp.ts
 * @description The City app's WebMCP browser tools (OVERSTORY-CITY-R034,
 * constitution R-IV): every operator-facing city capability dispatches
 * through the same `CityActions` seam the UI consumes — navigation and
 * view (the 3D/2D toggle, focus, overview, selection, the tour),
 * simulation control (speed, activity mode, the time scrubber), operator
 * actions (dispatch, onboard), the layout edits (R032) and the read
 * context (the inspector and feed state). Tools register on the city
 * page only and retire with it; a capability reachable only from the UI
 * is incomplete.
 */
import { z } from 'zod'
import { appToolName } from '@/lib/apps/contract'
import { makeTool } from '@/lib/webmcp/tools'
import type { WebMcpToolDefinition } from '@/lib/webmcp/types'
import type { CityActions, SelectionHit } from './core/types'
import type { ActivityMode } from './core/sim'
import { LAYOUT_ARCHETYPES } from './schemas'

const APP = 'city'
const SOURCE = 'overstory:src/apps/city/webmcp.ts'

// ---- The read context (the inspector and feed state, bounded) -----------------

export interface CityToolContext {
  mode: 'LIVE' | 'SIMULATED'
  activity: ActivityMode
  speed: number
  view: '3d' | '2d'
  clock: number
  day: number
  selection: SelectionHit | null
  characters: {
    id: string
    kind: 'ai' | 'npc'
    role: string
    state: string
    context: number
  }[]
  buildings: {
    id: string
    name: string
    category: 'core' | 'connector'
    online: boolean
    packStatus: string
    toolCount: number
  }[]
  recentEvents: {
    type: string
    detail: string
    provenance: 'simulated' | 'live'
  }[]
}

/**
 * The controller the page hands in: the same `CityActions` seam the UI
 * consumes (the tools dispatch through it) plus the live read context.
 */
export interface CityToolController {
  actions: CityActions
  readContext: () => CityToolContext
}

// ---- Schemas -----------------------------------------------------------------

const Speed = z.union([
  z.literal(0),
  z.literal(0.5),
  z.literal(1),
  z.literal(1.25),
  z.literal(1.5),
  z.literal(2),
  z.literal(4),
  z.literal(8),
  z.literal(20),
])
const Rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])

const Empty = z.object({}).strict()
const Updated = z.object({ updated: z.literal(true) }).strict()
const LayoutEditResult = z.object({ ok: z.boolean(), reason: z.string().min(1).max(200).optional() }).strict()

const ViewInput = z.object({ view: z.enum(['3d', '2d']) }).strict()
const FocusInput = z.object({ x: z.number().min(-500).max(500), z: z.number().min(-500).max(500) }).strict()
const SelectInput = z.object({ kind: z.enum(['character', 'building']), id: z.string().min(1).max(200) }).strict()
const SpeedInput = z.object({ speed: Speed }).strict()
const AudioInput = z.object({ enabled: z.boolean() }).strict()
const ActivityInput = z.object({ mode: z.enum(['quiet', 'demo']) }).strict()
const ScrubInput = z.object({ offsetS: z.number().int().min(0).max(100_000) }).strict()
const OnboardInput = z.object({ connectorId: z.string().min(1).max(200) }).strict()
const NpcDialogueInput = z.object({ npcId: z.string().min(1).max(200), prompt: z.string().min(1).max(500) }).strict()

// The layout-edit union (R032): the same bounds the UI and the host enforce.
const LayoutEditInput = z.union([
  z
    .object({
      kind: z.literal('move-building'),
      buildingId: z.string().min(1).max(200),
      plot: z.number().int().min(0).max(1023),
      rotation: Rotation.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('rotate-building'),
      buildingId: z.string().min(1).max(200),
      rotation: Rotation,
    })
    .strict(),
  z
    .object({
      kind: z.literal('add-road'),
      from: z.string().min(1).max(200),
      to: z.string().min(1).max(200),
    })
    .strict(),
  z.object({ kind: z.literal('remove-road'), segmentId: z.string().min(1).max(200) }).strict(),
  z
    .object({
      kind: z.literal('district-style'),
      domain: z.string().min(1).max(50),
      archetype: z.enum(LAYOUT_ARCHETYPES),
    })
    .strict(),
  z.object({ kind: z.literal('reset') }).strict(),
])

const ContextCharacter = z
  .object({
    id: z.string().min(1).max(200),
    kind: z.enum(['ai', 'npc']),
    role: z.string().min(1).max(50),
    state: z.string().min(1).max(30),
    context: z.number().int().min(0).max(100),
  })
  .strict()
const ContextBuilding = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    category: z.enum(['core', 'connector']),
    online: z.boolean(),
    packStatus: z.string().min(1).max(50),
    toolCount: z.number().int().min(0),
  })
  .strict()
const ContextEvent = z
  .object({
    type: z.string().min(1).max(50),
    detail: z.string().max(500),
    provenance: z.enum(['simulated', 'live']),
  })
  .strict()
const ContextSchema = z
  .object({
    mode: z.enum(['LIVE', 'SIMULATED']),
    activity: z.enum(['quiet', 'demo']),
    speed: Speed,
    view: z.enum(['3d', '2d']),
    clock: z.number().int().min(0),
    day: z.number().int().min(1),
    selection: SelectInput.nullable(),
    characters: z.array(ContextCharacter).max(50),
    buildings: z.array(ContextBuilding).max(200),
    recentEvents: z.array(ContextEvent).max(20),
  })
  .strict()

// ---- NPC Dialogue output schema (R022) --------------------------------------

const NpcResponse = z
  .object({
    npcId: z.string().min(1).max(200),
    npcName: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    district: z.string().min(1).max(200),
    response: z.string().min(1),
    emotion: z.enum(['happy', 'sad', 'neutral', 'inquisitive']),
    gesture: z.enum(['wave', 'nod', 'point']),
    duration: z.number(),
  })
  .strict()

const NpcInfoOutput = z
  .object({
    npcs: z
      .array(
        z.object({
          npcId: z.string(),
          npcName: z.string(),
          role: z.string(),
          district: z.string(),
          available: z.boolean(),
          position: z.object({ x: z.number(), z: z.number() }),
          state: z.string(),
        }),
      )
      .max(20),
  })
  .strict()

// ---- The tool set --------------------------------------------------------------

function cityTool<Input, Output>(
  name: string,
  description: string,
  input: z.ZodType<Input>,
  output: z.ZodType<Output>,
  execute: (value: Input) => Output | PromiseLike<Output>,
  readOnly = false,
): WebMcpToolDefinition {
  return makeTool({
    name: appToolName(APP, name),
    title: name.replace(/-/g, ' '),
    description,
    inputSchema: input,
    outputSchema: output,
    jsonSchema: z.toJSONSchema(input),
    readOnly,
    source: SOURCE,
    execute,
  })
}

/** The city's full operator surface as WebMCP tools (R034). */
export function createCityTools(controller: CityToolController): readonly WebMcpToolDefinition[] {
  const { actions, readContext } = controller
  return [
    cityTool(
      'get-context',
      'Read the city context: mode, activity, speed, view, clock, the current selection, the population and building lists, and the recent activity feed. Read-only context, the same state the inspector shows.',
      Empty,
      ContextSchema,
      () => readContext(),
      true,
    ),
    cityTool(
      'set-view',
      "Swap the city's view between the 3D scene and the 2D schematic (the accessible non-canvas view).",
      ViewInput,
      Updated,
      ({ view }) => {
        actions.setView(view)
        return { updated: true as const }
      },
    ),
    cityTool('focus', 'Ease the city view toward one ground point (x, z).', FocusInput, Updated, ({ x, z }) => {
      actions.focus(x, z)
      return { updated: true as const }
    }),
    cityTool('overview', 'Ease the city view back to the city overview.', Empty, Updated, () => {
      actions.overview()
      return { updated: true as const }
    }),
    cityTool(
      'select',
      'Select one character or building (the inspector opens on it).',
      SelectInput,
      Updated,
      (hit) => {
        actions.setSelected(hit)
        return { updated: true as const }
      },
    ),
    cityTool('clear-selection', 'Clear the current selection.', Empty, Updated, () => {
      actions.setSelected(null)
      return { updated: true as const }
    }),
    cityTool(
      'start-tour',
      'Re-open the first-visit tour (landmarks, a district, the legend, the controls).',
      Empty,
      Updated,
      () => {
        actions.startTour()
        return { updated: true as const }
      },
    ),
    cityTool(
      'set-speed',
      'Set the simulation speed: 0 (paused), 0.5, 1, 1.25, 1.5, 2, 4, 8 or 20 times.',
      SpeedInput,
      Updated,
      ({ speed }) => {
        actions.speed(speed)
        return { updated: true as const }
      },
    ),
    cityTool(
      'set-activity-mode',
      'Switch the activity mode: quiet (motion proportional to real activity, the default) or demo (continuous behaviour, labelled).',
      ActivityInput,
      Updated,
      ({ mode }) => {
        actions.setActivity(mode)
        return { updated: true as const }
      },
    ),
    cityTool(
      'scrub',
      'Seek the recorded history to in-game seconds after boot (the deterministic replay).',
      ScrubInput,
      Updated,
      ({ offsetS }) => {
        actions.scrub(offsetS)
        return { updated: true as const }
      },
    ),
    cityTool(
      'audio',
      'Turn the synthesized city ambience on or off. It starts off; the browser may keep it silent until a user gesture.',
      AudioInput,
      Updated,
      ({ enabled }) => {
        actions.setAudio(enabled)
        return { updated: true as const }
      },
    ),
    cityTool(
      'dispatch',
      'Dispatch a task to an idle agent (a refused dispatch is a visible queued event).',
      Empty,
      Updated,
      () => {
        actions.dispatch()
        return { updated: true as const }
      },
    ),
    cityTool(
      'onboard',
      'Onboard one connector: its building rises from a free plot.',
      OnboardInput,
      Updated,
      ({ connectorId }) => {
        actions.onboard(connectorId)
        return { updated: true as const }
      },
    ),
    cityTool(
      'layout-edit',
      'Submit one city layout edit: move or rotate a connector building onto a plot, draw or remove a road between intersections, set a district style, or restore the derived layout. Validated against the live city; a refused edit leaves the city unchanged and reports the operator-facing reason.',
      LayoutEditInput,
      LayoutEditResult,
      async (edit) => {
        const result = await actions.layoutEdit(edit)
        return result.reason ? { ok: result.ok, reason: result.reason } : { ok: result.ok }
      },
    ),
    // ---- NPC Dialogue tools (OVERSTORY-CITY-R022) --------------------------------
    cityTool(
      'npc-dialogue',
      "Initiate a dialogue with an NPC (simulated operator character) in the city. Sends the NPC's role context and city state to the LLM via Arbora's agents.run and returns a structured response with emotion and gesture.",
      NpcDialogueInput,
      NpcResponse,
      async ({ npcId, prompt }) => {
        return await actions.npcDialogue(npcId, prompt)
      },
    ),
    cityTool(
      'npc-nearby',
      'List NPCs (simulated operators) currently near the camera view in the city. Read-only context about available characters for dialogue.',
      Empty,
      NpcInfoOutput,
      () => ({ npcs: actions.npcNearby() }),
      true,
    ),
  ]
}
