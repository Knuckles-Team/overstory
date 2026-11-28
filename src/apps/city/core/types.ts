/**
 * @file types.ts
 * @description Shared shapes between the city renderers and the UI layer
 * (OVERSTORY-CITY-R011/R015/R024). Both renderers expose the same
 * {@link CityRenderer} handle so the page and the UI own no view-specific
 * code; the simulation core is the only writer of world state.
 * Includes dynamic asset scale-out types (R024).
 */
// spec: OVERSTORY-CITY-R011, OVERSTORY-CITY-R015, OVERSTORY-CITY-R024, OVERSTORY-CITY-R021
import type * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { RoadGraph } from '@/lib/scene3d/roads'
import type { LayoutEdit, LayoutOverride } from './layoutEdit'
import type { FrameBudgetView } from './frameBudget'
import type { NightWindowReport } from './render3d/windowEmissive'

/** What a click on a renderer hit: one character or one building. */
export interface SelectionHit {
  kind: 'character' | 'building'
  id: string
}

/** The four supported camera modes (OVERSTORY-CITY-R019). */
export type CameraMode = 'overview' | 'street' | 'first-person' | 'enterable'

/** World-space center and approximate vertical field of view, in metres. */
export interface CityViewport {
  x: number
  z: number
  verticalSpan: number
}

/** Renderer counters are sampled on demand by the debug HUD. */
export interface CityRenderDiagnostics {
  tier: string
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  /** The measured average FPS over the frame-budget monitor's window (R065). */
  avgFps: number
  /** The measured floor FPS (worst complete 1-second slice, R065). */
  floorFps: number
  /** Frames slower than the 120 FPS target frame time (R065). */
  slowFrames: number
}

/** One renderer (3D scene or 2D schematic) of the same city. */
export interface CityRenderer {
  /** The view identifier ('2d' or '3d'). */
  view?: '2d'
  /** Draw one frame; `dtReal` is the real elapsed seconds. */
  render(dtReal: number): void
  /** Tear down all handles, listeners and GPU resources. */
  dispose(): void
  /** Ease the view toward one ground point (x, z). */
  focus(x: number, z: number): void
  /** Ease the view back to the city overview. */
  overview(): void
  /** Show a speech bubble above one character for a couple of seconds. */
  say(charId: string, text: string): void
  /** Fit the renderer to a new container size (CSS pixels). */
  onResize(width: number, height: number): void
  /** Reflect the current selection (ring / outline). */
  setSelected(hit: SelectionHit | null): void
  /** Preserve world-space focus and scale when switching view implementations. */
  getViewport?(): CityViewport
  setViewport?(viewport: CityViewport): void
  diagnostics?(): CityRenderDiagnostics
  /**
   * Rebind layer references after the world was replaced (the replay seek,
   * R029). Stateless renderers (the 2D schematic) need no rebind.
   */
  resync?(): void
  /**
   * Swap the road layer for a new road graph (R032): a saved layout edit
   * redraws the network; the 2D schematic reads the graph from the world and
   * needs no call.
   */
  setRoads?(graph: RoadGraph): void
  /** Enter the selected building's generated 3D interior, when supported. */
  enterInterior?(buildingId: string): void
  /** Return from the generated interior to the exterior city view. */
  exitInterior?(): void
  /**
   * The fidelity harness surface (R012.9), on 3D renderers only: the live
   * scene graph the audits walk, the camera and controls the golden views
   * place, and the ambient-time hold that makes a frame identical on every
   * run. Absent on stateless renderers (the 2D schematic).
   */
  fidelity?: CityFidelityCore
}

/** The deterministic-frame surface the fidelity harness (R012.9) needs. */
export interface CityFidelityCore {
  /** The live scene graph the material/density audits walk. */
  scene: THREE.Scene
  /** The perspective camera the golden views place. */
  camera: THREE.PerspectiveCamera
  /** The orbit controls the views settle on. */
  controls: OrbitControls
  /** The renderer's canvas (the frame digest reads it mid-frame). */
  canvas: HTMLCanvasElement
  /**
   * Hold the ambient (real-time-driven) scene time at one value so every
   * rendered frame is identical (the golden captures); null frees it.
   */
  holdAmbient(time: number | null): void
  /** The live frame-budget report (R065); null on stateless renderers. */
  budget?(): FrameBudgetView | null
  /** The live night-window resolution (R066); null on stateless renderers. */
  nightWindows?(): NightWindowReport | null
  /** View-independent diagnostics: average FPS, floor FPS, slow frames (R078). */
  diagnostics?(): CityRenderDiagnostics | null
  /** The first-person camera (OVERSTORY-CITY-R019); null until FPS mode activates. */
  firstPersonCamera?(): import('./render3d/firstPerson').FirstPersonCamera | null
}

/**
 * Dynamic asset scale-out through provenance (OVERSTORY-CITY-R024).  When
 * the catalog lacks an asset the city needs, this module provisions it on
 * demand — creating a ticket (pending), then recording its provenance once
 * Blender generates or an external search discovers it.
 */

/**
 * A description of an asset the city needs but does not yet have.
 * The request is matched against the catalog first; on miss the
 * provisioning pipeline runs.
 */
export interface AssetDescription {
  /** Asset kind: `building`, `decor`, `terrain`, `character`, `water`, `sky`, or `marker`. */
  type: string
  /** Human-readable description of what is needed. */
  description: string
  /** Property keys the asset must satisfy (e.g. `footprint`, `height`). */
  requiredProperties: string[]
  /** Constraints the asset must meet (e.g. `materials <= 8`). */
  constraints: Record<string, number | string | boolean>
}

/**
 * One entry in the provisioning pipeline for a dynamically requested asset.
 */
export interface AssetProvenance {
  /** The canonical asset id (e.g. `building.escalator-modern`). */
  id: string
  /** Where the asset came from: `catalog`, `blender_generate_3d`, `blender_search_poly_haven`, `external_search`, or `exempt_primitive`. */
  source: string
  /** SHA-256 digest of the asset file (empty for exempt primitives). */
  digest: string
  /** Provisioning status: `pending` or `completed`. */
  status: 'pending' | 'completed'
  /** When the provisioning was requested. */
  requestedAt: number
  /** When provisioning completed (null while pending). */
  completedAt: number | null
  /** The source path the lockfile would record. */
  sourcePath: string
}

/**
 * The full provenance chain for one asset — every step from first request
 * through to admission.
 */
export interface AssetProvenanceChain {
  /** The asset id the chain belongs to. */
  assetId: string
  /** The ordered chain of provenance entries. */
  chain: AssetProvenance[]
}

/** What a readiness check returns. */
export interface AssetCheck {
  /** Whether the asset is immediately available (catalog or completed). */
  available: boolean
  /** The asset provenance when available (null while pending). */
  asset: AssetProvenance | null
  /** Whether a provisioning is already underway. */
  pending: boolean
}

/** Provisioning statistics. */
export interface ScaleStats {
  /** Total provisioning requests ever made. */
  requested: number
  /** Requests that have completed. */
  completed: number
  /** Requests still waiting for provisioning. */
  pending: number
  /** Current catalog family count. */
  catalogSize: number
}

/** The manager handle for dynamic asset scale-out (R024). */
export interface AssetScaleManager {
  /** Request a new asset via the provenance pipeline. */
  requestAsset(desc: AssetDescription): AssetProvenance
  /** Check if an asset is available (catalog or pending). */
  checkAssetAvailability(id: string): AssetCheck
  /** Get the full provenance chain for one asset. */
  getProvenanceChain(assetId: string): AssetProvenanceChain
  /** Return provisioning statistics. */
  getScaleStats(): ScaleStats
}

/** The activity mode the sim runs in (R026): quiet is the default. */
export type ActivityMode = 'quiet' | 'demo'

/** The user actions the UI panel invokes on behalf of the page. */
export interface CityActions {
  dispatch(): void
  onboard(connectorId: string): void
  focus(x: number, z: number): void
  overview(): void
  setSelected(hit: SelectionHit | null): void
  speed(value: number): void
  /** Switch the activity mode (R026); the page syncs the simulation. */
  setActivity(mode: ActivityMode): void
  /**
   * Swap the renderer view (R027): the 2D schematic is the top zoom level
   * and the accessible non-canvas view, not only a fallback.
   */
  setView(view: '3d' | '2d'): void
  /** Seek the recorded history to `offsetS` in-game seconds after boot (R029). */
  scrub(offsetS: number): void
  /** Turn the synthesized ambience on or off (R042). Starts muted; turning on needs a user gesture. */
  setAudio(on: boolean): void
  /** Enter the selected building's generated 3D interior. */
  enterBuilding(buildingId: string): void
  /** Return from an entered interior to the exterior city. */
  exitInterior(): void
  /** (Re)start the first-visit tour (R030). */
  startTour(): void
  /**
   * Submit one layout edit (R032): validated against the live world and road
   * graph, saved through the served layout write, applied, and the road
   * layer redrawn. A refused or unavailable edit leaves the city unchanged
   * and reports the operator-facing reason.
   */
  layoutEdit(edit: LayoutEdit): Promise<{ ok: boolean; reason?: string }>
  /**
   * Toggle the first-person / enterable camera mode (OVERSTORY-CITY-R019).
   * Called when the player presses the "E" key or clicks the "Enter" button.
   */
  toggleFirstPerson(): void
  /**
   * Medulla-backed layout operations (R021): save, load, delete layouts,
   * publish changes to Arbora, and subscribe to layout change events.
   * In LIVE mode the client talks through the Medulla KV store; when
   * Medulla is unavailable the client falls back to local-only mode.
   */
  medullaLayout?: MedullaLayoutClient
  /**
   * OVERSTORY-CITY-R022: NPC dialogue. Open the dialogue overlay for an NPC,
   * send a message, or close the session. The underlying manager handles
   * the LLM call through Arbora.
   */
  openDialogue(npcId: string): void
  sendDialogue(npcId: string, message: string): void
  closeDialogue(): void
  /** Overstory-CITY-R022: NPC dialogue. Query the manager for the NPC response to a prompt. */
  npcDialogue(npcId: string, prompt: string): Promise<NpcResponse>
  npcNearby(): NpcInfo[]
}

/**
 * One layout change event fired by the Medulla-backed client.
 * The event type tells the subscriber what happened; the version
 * identifies the layout doc that caused it.
 */
export interface LayoutEvent {
  /** The event kind. */
  type: 'layout-save' | 'layout-published' | 'layout-version'
  /** The version string of the layout doc that caused this event. */
  version: string
  /** Extra context the client populates; absent when none. */
  detail?: string
}

/**
 * A published layout — the layout document plus the Arbora-world metadata
 * that turns a local save into a world-change event (OVERSTORY-CITY-R021).
 */
export interface PublishedLayout {
  /** The layout document. */
  doc: LayoutOverride
  /** The Arbora world-view key that identifies this layout. */
  worldKey: string
  /** The version string (auto-incremented on publish). */
  version: string
  /** ISO-8601 timestamp of the publish. */
  publishedAt: string
  /** True when Arbora accepted the publish. */
  accepted: boolean
  /** Absent when Arbora rejected it; the rejection reason. */
  reason?: string
}

/**
 * The Medulla-backed layout client (OVERSTORY-CITY-R021): persistent layout
 * storage through Medulla's KV store, Arbora publish for world-change events,
 * and polling-based change subscription.
 */
export interface MedullaLayoutClient {
  /**
   * Persist the layout document to Medulla KV. Increments the version,
   * serializes deterministically, and fires a `layout-save` event.
   * Returns silently when Medulla is unavailable (local-only mode).
   */
  saveLayout(doc: LayoutOverride): Promise<void>

  /**
   * Retrieve the latest layout from Medulla KV. Returns null when no
   * layout exists for the client's tenant. Returns local-only when
   * Medulla is unavailable.
   */
  loadLayout(): Promise<LayoutOverride | null>

  /**
   * Remove the layout from Medulla KV. Returns silently when Medulla
   * is unavailable.
   */
  deleteLayout(): Promise<void>

  /**
   * List layout version keys for a tenant. Returns an empty array when
   * Medulla is unavailable.
   */
  listLayouts(tenant: string): Promise<string[]>

  /**
   * Publish the layout to Arbora as a world-layout change event.
   * The Arbora publish is best-effort; the method returns a
   * PublishedLayout regardless of Arbora reachability.
   */
  publishLayout(doc: LayoutOverride): Promise<PublishedLayout>

  /**
   * Subscribe to layout change events. Returns an unsubscribe function
   * that removes the callback. Uses polling-based interval checks —
   * no WebSocket or SSE dependency.
   */
  subscribeToLayoutChanges(callback: (event: LayoutEvent) => void): () => void

  /**
   * Test seam: clear all state so the client can be reused in tests.
   */
  reset(): void
}

/**
 * DOM elements that the UI subsystem reads and mutates (R027).
 */
export interface CityUiElements {
  statPop: HTMLSpanElement
  statKnow: HTMLSpanElement
  statTools: HTMLSpanElement
  statIncidents: HTMLSpanElement
  statConnectors: HTMLSpanElement
  clock: HTMLSpanElement
  mode: HTMLSpanElement
  speedBtn: HTMLButtonElement | null
  layoutBtn: HTMLButtonElement | null
  overlay: HTMLElement | null
  scrubber: HTMLInputElement | null
  scrubberReadout: HTMLElement | null
  playPauseBtn: HTMLButtonElement | null
  replayBtn: HTMLButtonElement | null
  tourBtn: HTMLButtonElement | null
  helpBtn: HTMLButtonElement | null
  legendToggle: HTMLButtonElement | null
  legendPanel: HTMLElement | null
  modal: HTMLElement | null
  btnOnboard: HTMLButtonElement | null
  tour: HTMLElement | null
  banner: HTMLElement | null
  editPanel: HTMLElement | null
  btnEdit: HTMLButtonElement | null
  btnAudio: HTMLButtonElement | null
  btnView2d: HTMLButtonElement | null
  btnView3d: HTMLButtonElement | null
  btnTour: HTMLButtonElement | null
  feedList: HTMLElement | null
  btnDispatch: HTMLButtonElement | null
  btnOverview: HTMLButtonElement | null
  btnDemo: HTMLButtonElement | null
  speedButtons: HTMLButtonElement[] | null
  inspector: HTMLElement | null
  activityBadge: HTMLSpanElement | null
  simBadge: HTMLSpanElement | null
  legend: HTMLElement | null
  popList: HTMLElement | null
}

/**
 * The Medulla key for a city layout doc (tenant-scoped KV).
 */
export interface MedullaLayoutKey {
  /** The tenant that owns this layout. */
  tenant: string
  /** The layout key (default: the tenant's primary layout). */
  key?: string
}

// ---- Live ecosystem mirroring (R020) --------------------------------------

/** One connector snapshot from Arbora. */
export interface ConnectorSnapshot {
  id: string
  name: string
  blurb: string
  archetype: string
  color: number
  tools: string[]
  packStatus: 'served' | 'registered_unpublished'
  simTools: boolean
}

/** One landmark snapshot from Arbora with live online status. */
export interface LandmarkSnapshot {
  id: string
  name: string
  kind: string
  color: number
  role: string
  tools: string[]
  rooms: string[]
  online: boolean
}

/** Fleet / status summary from Arbora. */
export interface FleetStatusSnapshot {
  totalConnectors: number
  servedConnectors: number
  registeredConnectors: number
  arboraReachable: boolean
  cacheStale: boolean
}

/**
 * The shape of live data from Arbora (OVERSTORY-CITY-R020).
 * This is the state the ecosystem mirror polls for.
 */
export interface ArboraState {
  connectors: ConnectorSnapshot[]
  landmarks: LandmarkSnapshot[]
  fleet: FleetStatusSnapshot
  capturedAt: string
}

/**
 * Live ecosystem mirroring interface (R020).
 * The mirror polls Arbora, diffs state changes, and emits
 * typed events that are applied to the city simulation.
 */
export interface EcosystemMirror {
  /** Sync against a new ArboraState snapshot. Returns events. */
  sync(state: ArboraState): EcosystemEvent[]
  /** Peek at buffered events without draining. */
  events(): EcosystemEvent[]
  /** Drain and return all buffered events. */
  drain(): EcosystemEvent[]
  /** Reset the mirror to its initial state. */
  reset(): void
  /** Whether the mirror is active (LIVE mode polling). */
  isActive(): boolean
}

/** An ecosystem event from the live mirroring layer (R020). */
export interface EcosystemEvent {
  type: 'connector-create' | 'connector-update' | 'connector-destroy' | 'landmark-update' | 'fleet-update'
  id?: string
  detail: string
  snapshot?: ConnectorSnapshot | LandmarkSnapshot
  previousId?: string
  seq: number
  capturedAt: string
}

// ---- Avatar presence types (OVERSTORY-CITY-R023) ---------------------------

/**
 * One heartbeat the authenticated visitor publishes to the city-state.
 * The city consumes it to update the avatar's position, heading and zone.
 */
export interface AvatarHeartbeat {
  /** Unique id of the avatar (the authenticated visitor's session id). */
  avatarId: string
  /** World-space position the avatar occupies. */
  position: { x: number; z: number }
  /** Heading in radians (same convention as sim character facing). */
  heading: number
  /** Free-text activity label (idle, walking, observing, etc.). */
  activity: string
  /** Timestamp the heartbeat was generated at (ms epoch). */
  timestamp: number
  /** The district zone the avatar is in; the renderer uses it for proximity. */
  zone: string
}

/**
 * The full avatar state the city maintains for one visitor.
 * Extended from the heartbeat with metadata the renderer needs.
 */
export interface AvatarState {
  avatarId: string
  position: { x: number; z: number }
  heading: number
  activity: string
  /** The district zone the avatar is currently in. */
  zone: string
  /** Last time the city heard from this avatar (ms epoch). */
  lastSeen: number
}

/**
 * One other visitor the current user can see near the camera.
 * Includes the distance so the renderer can label or dim accordingly.
 */
export interface NearbyAvatar {
  avatarId: string
  /** Display name shown in the label layer. */
  displayName: string
  position: { x: number; z: number }
  heading: number
  zone: string
  /** Distance in metres from the camera (or the current avatar). */
  distance: number
}

/**
 * One presence update emitted to subscribers (joined, left, heartbeat, updated).
 */
export interface PresenceUpdate {
  /** The event type that triggered the update. */
  type: 'heartbeat' | 'joined' | 'left' | 'updated'
  /** The avatar state the update carries. */
  avatar: AvatarState
}

/**
 * Unsubscribe handle returned by {@link AvatarPresenceManager.subscribeToPresence}.
 * Call the returned function to stop receiving updates.
 */
export type PresenceSubscription = () => void

/**
 * The avatar presence manager controls the authenticated visitor's virtual
 * avatar: publishing heartbeats, subscribing to other visitors' updates,
 * and disconnecting on page unload.
 */
export interface AvatarPresenceManager {
  /**
   * Publish one heartbeat to the city-state.  Resolves without error on
   * success; in sandbox mode the call is a no-op (no host available).
   */
  publishHeartbeat(data: AvatarHeartbeat): Promise<void>
  /**
   * Subscribe to presence updates from other visitors.  Returns an
   * unsubscribe function — call it to stop receiving updates.
   */
  subscribeToPresence(callback: (updates: PresenceUpdate[]) => void): PresenceSubscription
  /** Return the current avatar state maintained by this manager. */
  getMyAvatar(): AvatarState | null
  /**
   * Return other visitors whose avatars are near the camera (within the
   * configured proximity radius).
   */
  getNearbyAvatars(): NearbyAvatar[]
  /** Tear down the presence session and release all resources. */
  disconnect(): void
}

// ---- NPC Dialogue types (OVERSTORY-CITY-R022) -------------------------------

/** The kind of emotion the LLM assigns to an NPC response. */
export type NpcEmotion = 'happy' | 'sad' | 'neutral' | 'inquisitive'

/** The gesture the NPC performs during dialogue. */
export type NpcGesture = 'wave' | 'nod' | 'point'

/** A parsed response from the NPC dialogue LLM call. */
export interface NpcResponse {
  npcId: string
  npcName: string
  role: string
  district: string
  response: string
  emotion: NpcEmotion
  gesture: NpcGesture
  /** How long the bubble stays visible, in seconds. */
  duration: number
}

/** Metadata about an NPC character discoverable by the dialogue system. */
export interface NpcInfo {
  npcId: string
  npcName: string
  role: string
  district: string
  available: boolean
  position: { x: number; z: number }
  state: string
}

/**
 * The public interface for managing NPC dialogue sessions (OVERSTORY-CITY-R022).
 * NPCs that can respond to player prompts via LLM integration through
 * Arbora's agents system.
 */
export interface NpcDialogueManager {
  /**
   * Request a dialogue response from the LLM for the given NPC.
   * Sends the NPC's role context, city state snapshot, and user prompt
   * to the LLM via Arbora's agents.run, parses the structured output.
   */
  requestDialogue(npcId: string, prompt: string): Promise<NpcResponse>
  /**
   * Return a list of NPC characters currently near the camera view.
   * Only kind 'npc' characters (simulated operators) are included.
   */
  getAvailableNpcs(): NpcInfo[]
  /**
   * Get metadata for a single NPC by id.
   * Returns null if the NPC does not exist.
   */
  getNpcInfo(npcId: string): NpcInfo | null
  /** End the current dialogue session and close the overlay. */
  closeDialogue(): void
  /** Whether a dialogue session is currently active. */
  isOpen(): boolean
}
