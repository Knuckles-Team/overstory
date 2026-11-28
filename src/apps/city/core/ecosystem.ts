// Ecosystem data for Arbora City (OVERSTORY-CITY-R020).
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

// ---- District domains (R002 amendment) -------------------------------------
// The connector district is grouped by business domain, not catalog order, so
// the map's geography itself carries meaning. A connector's domain is picked
// from keywords in its name; names matching no keyword fall to `general`. The
// sim reserves plots in this domain order (stable within a domain), and
// layout.ts derives the district's plot bands from this list.
export interface DistrictDomain {
  id: string
  /** A connector joins this domain when its name contains one of these. */
  keywords: string[]
}

export const CONNECTOR_DISTRICT: readonly DistrictDomain[] = [
  {
    id: 'data',
    keywords: [
      'sql',
      'document',
      'vector',
      'kafka',
      'jena',
      'lakekeeper',
      'data-science',
      'egeria',
      'spark',
      'lucerna',
      'scholarx',
    ],
  },
  {
    id: 'dev',
    keywords: [
      'github',
      'gitlab',
      'docker',
      'container',
      'atlassian',
      'camunda',
      'ansible',
      'plane',
      'microsoft',
      'repository',
      'leanix',
      'archimate',
      'caddy',
      'cloudflare',
      'portainer',
      'langfuse',
      'systems-manager',
      'technitium',
      'tunnel',
    ],
  },
  {
    id: 'security',
    keywords: ['openbao', 'keycloak', 'okta', 'vaultwarden', 'ciso', 'onetrust', 'lgtm', 'legal'],
  },
  {
    id: 'media',
    keywords: [
      'audio',
      '-arr-',
      'audiobookshelf',
      'jellyfin',
      'media-downloader',
      'owncast',
      'craft',
      'qbittorrent',
      'rom-manager',
    ],
  },
  {
    id: 'documents',
    keywords: ['paperless', 'stirlingpdf', 'archivebox', 'webarchiver', 'nextcloud', 'objectstore', 'gramps'],
  },
  {
    id: 'comms',
    keywords: ['mattermost', 'listmonk', 'postiz', 'freshrss', 'salesforce', 'servicenow', 'fan-manager'],
  },
  {
    id: 'home',
    keywords: ['home-assistant', 'mealie', 'wger', 'erpnext', 'firefly'],
  },
  { id: 'general', keywords: [] },
]

/** The business domain a connector name belongs to (R002). */
export function domainOf(server: string): string {
  for (const d of CONNECTOR_DISTRICT) {
    if (d.keywords.some((k) => server.includes(k))) return d.id
  }
  return 'general'
}

/**
 * Connectors ordered by district domain (stable within each domain, so the
 * catalog order still decides the sequence inside a domain). The sim places
 * plots in this order — never in raw catalog order — so each domain is a
 * contiguous block of the district (R002).
 */
export function connectorsByDomain(connectors: ConnectorDef[]): ConnectorDef[] {
  const order = CONNECTOR_DISTRICT.map((d) => d.id)
  return connectors
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const da = order.indexOf(domainOf(a.c.id))
      const db = order.indexOf(domainOf(b.c.id))
      return da !== db ? da - db : a.i - b.i
    })
    .map((e) => e.c)
}

// ---- Roster: the shared-rig cast (R033) ------------------------------------
// Every character is built on the one pinned shared rig (R033 /
// OVERSTORY-DESIGN-R012.4); the borrowed third-party rider roster and its
// comic character names left the city with the 2026-11-19 amendment. Names
// are the stable pseudonymous ids (R020 — never an agent's identity), and
// silhouette, outfit and colour encode agent type and role through the R025
// encoding table (role → the shared palette's `role-*` tokens; kind 'npc'
// marks the simulated operators, labelled simulated until real presence
// lands, R005/R023).

/** The shared rig every character is built on (R033): one pinned file. */
export const RIG_PATH = 'city-assets/characters/robot-expressive.glb'

/** The R025 role vocabulary the character colour encodes. */
export type RoleId = 'operations' | 'maintenance' | 'security' | 'core'

/** The role display labels (the inspector and badge surface these). */
export const ROLE_LABELS: Record<RoleId, string> = {
  operations: 'Operations agent',
  maintenance: 'Maintenance agent',
  security: 'Security agent',
  core: 'Simulated operator — the fixed characters, not real operators',
}

export interface RosterEntry {
  kind: 'ai' | 'npc'
  /** The stable pseudonymous id (R020) — the character's name is this id. */
  id: string
  /** The R025 role the silhouette, outfit and colour encode. */
  role: RoleId
}

export const ROSTER: RosterEntry[] = [
  // The three simulated operators (kind 'npc', role 'core'): dispatch,
  // patrol and nightshift under their pseudonymous ids.
  { kind: 'npc', id: 'operator-01', role: 'core' },
  { kind: 'npc', id: 'operator-02', role: 'core' },
  { kind: 'npc', id: 'operator-03', role: 'core' },
  // The fourteen AI agents, one persistent character each (R027), roles
  // distributed across the city's functions.
  { kind: 'ai', id: 'agent-01', role: 'operations' },
  { kind: 'ai', id: 'agent-02', role: 'operations' },
  { kind: 'ai', id: 'agent-03', role: 'operations' },
  { kind: 'ai', id: 'agent-04', role: 'operations' },
  { kind: 'ai', id: 'agent-05', role: 'operations' },
  { kind: 'ai', id: 'agent-06', role: 'maintenance' },
  { kind: 'ai', id: 'agent-07', role: 'maintenance' },
  { kind: 'ai', id: 'agent-08', role: 'maintenance' },
  { kind: 'ai', id: 'agent-09', role: 'maintenance' },
  { kind: 'ai', id: 'agent-10', role: 'maintenance' },
  { kind: 'ai', id: 'agent-11', role: 'security' },
  { kind: 'ai', id: 'agent-12', role: 'security' },
  { kind: 'ai', id: 'agent-13', role: 'security' },
  { kind: 'ai', id: 'agent-14', role: 'security' },
]
