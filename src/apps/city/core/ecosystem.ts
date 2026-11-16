// Ecosystem data for Arbora City.
//
// The connector catalog is the Arbora fleet (fleet.catalog.list), not a
// curated list: served packs are online buildings, registered-unpublished
// packs are planned plots (OVERSTORY-CITY-R002). FLEET_SNAPSHOT is the
// bundled fallback for SIMULATED mode — a capture of the live catalog
// through `fleet.catalog.list` on 2026-11-15 (75 registered servers: 7
// served, 67 registered-unpublished, plus the arbora core).

export interface FleetServer {
  /** Fleet server name, e.g. "sql-mcp". */
  server: string
  /** Served tool count (0 for registered-unpublished packs). */
  toolCount: number
  /** Representative served tool names (≤12); [] when none are served. */
  tools: string[]
  /** Pack status as reported by the fleet catalog. */
  packStatus: 'served' | 'registered_unpublished'
}

export interface ConnectorDef {
  id: string
  name: string
  blurb: string
  archetype: string
  color: number
  tools: string[]
  packStatus: 'served' | 'registered_unpublished'
  /** True when the tool list is simulated (snapshot fallback). */
  simTools: boolean
}

export interface CoreDef {
  id: string
  name: string
  kind: string
  color: number
  role: string
  tools: string[]
  rooms: string[]
}

// ---- Core landmarks (one per core platform component) ---------------------

export const CORE_LANDMARKS: CoreDef[] = [
  {
    id: 'arbora',
    name: 'Arbora',
    kind: 'gate',
    color: 0x5ea0ff,
    role: 'The one door to the platform: served operations, admission, authentication, MCP and A2A serving, the registry, and hosting.',
    tools: ['admission.review', 'registry.lookup', 'mcp.serve', 'a2a.serve'],
    rooms: ['admission', 'registry', 'serving', 'hosting'],
  },
  {
    id: 'medulla',
    name: 'Medulla',
    kind: 'vault',
    color: 0xa06bff,
    role: 'The reasoning and durable knowledge engine: graph, RDF, SQL, vectors, time, blobs, evidence, and provenance.',
    tools: ['eg.graph.GetNodesByLabel', 'eg.graph.GetSubgraph', 'memory.write', 'memory.read'],
    rooms: ['graph', 'rdf', 'sql', 'vectors', 'blobs', 'evidence', 'provenance'],
  },
  {
    id: 'meristem',
    name: 'Meristem',
    kind: 'works',
    color: 0xff7847,
    role: 'The in-run agent harness: run loop, context, fan-out, sandbox, replay, and trace events.',
    tools: ['agents.run', 'agents.plan_run', 'runs.events', 'runs.execution_graph'],
    rooms: ['run-loop', 'context', 'fan-out', 'sandbox', 'replay', 'trace'],
  },
  {
    id: 'overstory',
    name: 'Overstory',
    kind: 'tower',
    color: 0x37d0c3,
    role: 'The browser operator workspace: conversations, approvals, tool activity, and graph-backed views.',
    tools: ['browser.discover', 'browser.request_call', 'approvals.resolve'],
    rooms: ['conversations', 'approvals', 'tool-activity', 'graph-view'],
  },
  {
    id: 'tuig',
    name: 'Tuig',
    kind: 'kiosk',
    color: 0xffc94d,
    role: 'The terminal operator surface for the REST interface.',
    tools: ['terminal.session', 'rest.poll'],
    rooms: ['terminal'],
  },
  {
    id: 'axil',
    name: 'Axil',
    kind: 'pavilion',
    color: 0xff6f9c,
    role: 'The desktop cockpit: specialist agents, embedded terminals, and approvals.',
    tools: ['specialist.run', 'terminal.embed', 'approvals.resolve'],
    rooms: ['desk', 'terminal', 'approvals'],
  },
  {
    id: 'scion',
    name: 'Scion SDK',
    kind: 'dock',
    color: 0x7fd06f,
    role: 'The connector contracts: identity, discovery, synchronization, replay, and write-back.',
    tools: ['fleet.call', 'identity.bind', 'discovery.sync', 'writeback.commit'],
    rooms: ['identity', 'discovery', 'sync', 'write-back'],
  },
]

// The arbora core is a landmark, never a connector plot.
export const ARBORA_CORE_SERVER = 'arbora'

// ---- Bundled fleet snapshot (SIMULATED mode) ------------------------------
// Capture: `fleet.catalog.list` (browse, summary) through the Arbora MCP
// boundary, 2026-11-15. Served packs with captured representative tools;
// all others carry the simulated tool set (simTools).

const S = (server: string, toolCount: number, tools: string[] = [], sim = true): FleetServer =>
  ({
    server,
    toolCount,
    tools,
    packStatus: 'served',
    simTools: sim,
  }) as FleetServer & { simTools?: boolean }
const R = (server: string): FleetServer => ({
  server,
  toolCount: 0,
  tools: [],
  packStatus: 'registered_unpublished',
})

export const FLEET_SNAPSHOT: FleetServer[] = [
  S('audio-transcriber-mcp', 12, ['transcribe', 'summarize_audio', 'list_jobs']),
  S('dockerhub-mcp', 82, ['dockerhub_registry_inspect', 'list_tags', 'list_referrers', 'list_platforms']),
  S('mealie-mcp', 254, ['list_recipes', 'plan_meal', 'grocery_list']),
  S('nextcloud-mcp', 89, ['list_files', 'search', 'share']),
  S('openbao-mcp', 42, ['secrets_read', 'secrets_write', 'list_keys']),
  S('sql-mcp', 33, ['sql_schema_catalog', 'query', 'list_tables']),
  S('vector-mcp', 7, ['list_collections', 'upsert', 'query']),
  R('ansible-tower-mcp'),
  R('archimate-mcp'),
  R('archivebox-mcp'),
  R('aris-mcp'),
  R('arr-mcp'),
  R('atlassian-mcp'),
  R('audiobookshelf-mcp'),
  R('bellwether-mcp'),
  R('caddy-mcp'),
  R('camunda-mcp'),
  R('ciso-assistant-mcp'),
  R('clarity-mcp'),
  R('cloudflare-mcp'),
  R('container-manager-mcp'),
  R('craft-suite-api'),
  R('data-science-mcp'),
  R('documentdb-mcp'),
  R('egeria-mcp'),
  R('emerald-exchange-mcp'),
  R('erpnext-mcp'),
  R('fan-manager-mcp'),
  R('firefly-iii-mcp'),
  R('freshrss-mcp'),
  R('github-mcp'),
  R('gitlab-mcp'),
  R('gramps-mcp'),
  R('home-assistant-mcp'),
  R('jellyfin-mcp'),
  R('jena-mcp'),
  R('kafka-mcp'),
  R('keycloak-mcp'),
  R('lakekeeper-mcp'),
  R('langfuse-mcp'),
  R('leanix-mcp'),
  R('legal-peripherals-mcp'),
  R('lgtm-mcp'),
  R('listmonk-mcp'),
  R('lucerna-mcp'),
  R('mattermost-mcp'),
  R('media-downloader-mcp'),
  R('microsoft-mcp'),
  R('objectstore-mcp'),
  R('okta-mcp'),
  R('onetrust-mcp'),
  R('owncast-mcp'),
  R('paperless-ngx-mcp'),
  R('plane-mcp'),
  R('portainer-mcp'),
  R('postiz-mcp'),
  R('pulselink-mcp'),
  R('qbittorrent-mcp'),
  R('repository-manager-mcp'),
  R('rom-manager-mcp'),
  R('salesforce-mcp'),
  R('scholarx-mcp'),
  R('searxng-mcp'),
  R('servicenow-mcp'),
  R('spark-mcp'),
  R('stirlingpdf-mcp'),
  R('systems-manager-mcp'),
  R('technitium-dns-mcp'),
  R('tunnel-manager-mcp'),
  R('uptime-mcp'),
  R('vaultwarden-mcp'),
  R('webarchiver-mcp'),
  R('wger-mcp'),
  R('world-reference-mcp'),
]

// Simulated tool set for registered packs that build in the simulation
// before the pack serves real tools.
export const SIM_TOOLS = ['ingest', 'query', 'sync']

// ---- Fleet → connector mapping --------------------------------------------

const ARCHETYPES = [
  'tower',
  'diner',
  'containers',
  'booth',
  'books',
  'kiosk',
  'screen',
  'antenna',
  'house',
  'gate',
  'tanks',
  'depot',
] as const
const PALETTE = [
  0x5b8def, 0xffb35c, 0x4d9de0, 0x8f7bd8, 0x9a6bff, 0x6fa86f, 0x5ec8d8, 0xd8845e, 0x77c2a8, 0x66d0a0, 0x6a8caf,
  0xd86f5e,
] as const

function hashName(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) h = ((h ^ name.charCodeAt(i)) * 16777619) >>> 0
  return h
}

function title(name: string): string {
  return name
    .replace(/-mcp$|_agent$|^mcp-/, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Map a fleet catalog read onto the connector district (OVERSTORY-CITY-R002). */
export function fleetToConnectors(fleet: FleetServer[]): ConnectorDef[] {
  return fleet
    .filter((s) => s.server !== ARBORA_CORE_SERVER)
    .map((s) => {
      const h = hashName(s.server)
      return {
        id: s.server,
        name: title(s.server),
        blurb: s.packStatus === 'served' ? `${s.toolCount} served tools` : 'Registered — not yet published',
        archetype: ARCHETYPES[h % ARCHETYPES.length],
        color: PALETTE[(h >>> 8) % PALETTE.length],
        tools: s.tools.length ? s.tools : SIM_TOOLS,
        packStatus: s.packStatus,
        simTools: s.tools.length === 0,
      }
    })
}

// ---- Roster: every pinned rider becomes one citizen ------------------------
// kind "human" marks real operators; everyone else is an AI agent from the
// harness. Character names come from the vendored asset pack, never from
// operator identities (OVERSTORY-CITY-R017).

export interface RosterEntry {
  kind: 'ai' | 'human'
  rider: string
  name: string
  hue: number
  role?: string
}

export const ROSTER: RosterEntry[] = [
  {
    kind: 'human',
    rider: 'the-mayor',
    name: 'The Mayor',
    hue: 0.02,
    role: 'Chief operator — dispatches and approves',
  },
  {
    kind: 'human',
    rider: 'officer-meter',
    name: 'Officer Meter',
    hue: 0.07,
    role: 'Fleet supervisor — patrols the connector district',
  },
  {
    kind: 'human',
    rider: 'pivot',
    name: 'Nightshift',
    hue: 0.12,
    role: 'Night operator — works while the city sleeps',
  },
  { kind: 'ai', rider: 'chad-speedwell', name: 'Chad Speedwell', hue: 0.05 },
  { kind: 'ai', rider: 'deacon-vane', name: 'Deacon Vane', hue: 0.11 },
  { kind: 'ai', rider: 'dial-up', name: 'Dial-Up', hue: 0.17 },
  { kind: 'ai', rider: 'kevin-from-accounting', name: 'Kevin (Accounting)', hue: 0.23 },
  { kind: 'ai', rider: 'mother-rust', name: 'Mother Rust', hue: 0.29 },
  { kind: 'ai', rider: 'sgt-pruitt', name: 'Sgt. Pruitt', hue: 0.35 },
  { kind: 'ai', rider: 'tammy-two-stroke', name: 'Tammy Two-Stroke', hue: 0.09 },
  { kind: 'ai', rider: 'trooper-dalrymple', name: 'Trooper Dalrymple', hue: 0.21 },
  { kind: 'ai', rider: 'player', name: 'The Rookie', hue: 0.31 },
  { kind: 'ai', rider: 'mara-vale', name: 'Mara Vale', hue: 0.41 },
  { kind: 'ai', rider: 'deputy-lindqvist', name: 'Deputy Lindqvist', hue: 0.47 },
  { kind: 'ai', rider: 'juniper-moss', name: 'Juniper Moss', hue: 0.53 },
  { kind: 'ai', rider: 'old-growth', name: 'Old Growth', hue: 0.15 },
  { kind: 'ai', rider: 'gripman-gus', name: 'Gripman Gus', hue: 0.38 },
]
