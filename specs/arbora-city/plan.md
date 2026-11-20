# OVERSTORY-CITY — Implementation plan

Governing spec: [spec.md](spec.md). Rows: [requirements.md](requirements.md).

## Summary

The platform is presented as a living city at `/apps/city`: one hosted app
surface, one same-origin host read of the served fleet catalog, and a
deterministic simulation core that the 3D and 2D renderers draw. The live
caller is the app shell: `src/App.tsx` mounts the lazy route from the route
registry, and the host caller is `default_apps()` in
`agent/overstory/apps/__init__.py`. The change reuses the `AppSurface`
contract, the host's injected invoke seam and the `fetchValidated` client;
it adds no store, no second event source and no browser credential.

## Technical Context

- **Language/Version**: TypeScript under the repository strict `tsconfig.json` (`pnpm typecheck`) for the app; Python 3.12–3.14 (FastAPI) for the host adapter.
- **Primary Dependencies**: `three` (scene library, lazy-chunked — already a locked dependency on main, shared with the pre-existing graph 3D views), `react` 19, `zod` response schemas, `fastapi` host — the rest are already locked.
- **Storage**: none. The host is stateless apart from a 60 s in-memory fleet cache keyed by the verified principal and tenant (cancellation-safe single flight for concurrent cold boots, an overall 30 s fresh-read deadline, cursor-paginated catalog read, bounded concurrent per-pack fan-out with a per-call timeout and per-pack degrade); simulation state is browser-local and ephemeral.
- **Testing**: vitest (frontend, deterministic tick pacing) and pytest (FastAPI `TestClient` contract over a fake gateway); one `path::name` test per row in requirements.md.
- **Target Platform**: modern browsers; WebGL2 scene with a canvas 2D schematic fallback; Node build through the repository Vite config.
- **Project Type**: web (hosted app plus a same-origin FastAPI adapter, per the OVERSTORY-APPS app pattern).
- **Performance Goals**: 60 fps at 1× on mid-range hardware; zero scene-library references in the shell chunk; pinned character assets under 5 MB (one shared rig with role variants per R033, replacing the 18-file rider pack); one fetch per pinned file; the stated budgets of R028 (triangles ≤ 4000 per building, draw calls ≤ 150 per district, texture memory ≤ 32 MB, 60 fps integrated / 30 fps mobile), measured from the real scene graph over the bundled snapshot and by measured frame time on the fidelity harness (R012.9), not asserted.
- **Constraints**: no credential, token or identity value in the browser (R017); fleet data only through the host (R003); city activity is the labelled seeded simulation in both modes, not a decision; no new store or event source; the simulation draws randomness only from the injected seeded PRNG (R014); licensing is a gate — the lockfile allowlist is checked at startup (R013).
- **Scale/Scope**: 33 rows; 75 fleet servers (7 served, 67 registered-unpublished, arbora core excluded); 78 plots; 17 characters (14 AI agents, 3 simulated NPC operators); character assets move to one shared rig with role variants (R033), replacing the 18-file rider pack.

## Constitution Check

- **R-I (the browser shows; arbora decides)**: pass. The browser reaches the fleet only through the same-origin host routes; the host calls the served operation `fleet.catalog.list` as the bound actor; the browser computes no decision (city activity is a labeled presentation simulation, not a platform decision).
- **R-II (no fabricated data in the interface)**: pass. `LIVE` mode shows served fleet data; `SIMULATED` mode is the explicitly labeled bundled snapshot with a banner stating the reason; asset verification shows the truth (verified or placeholder cube).
- **R-III (the frontend type-checks, lints and builds)**: pass. `pnpm typecheck`, `pnpm lint` and `pnpm build` are green on the branch; the build chunk report is recorded in test-spec.md.

## Project Structure

New (this spec):

```text
src/apps/city/
├── surface.ts               AppSurface: id, routes, capability
├── routes.ts                the one /apps/city route (lazy element)
├── api.ts                   typed client for /api/apps/city/* (fetchValidated)
├── schemas.ts               Zod schemas for the host responses
├── components/CityPage.tsx  page shell: mode decision, asset verify, mount/dispose
├── core/
│   ├── ecosystem.ts         fleet→connectors mapping, landmarks, roster, bundled snapshot
│   ├── layout.ts            geometry: roads, water, 78 plots, houses, parks, path graph
│   ├── assets.ts            verified-byte asset cache (one fetch per pin)
│   ├── events.ts            typed event bus + vocabulary + recent ring + provenance
│   ├── sim.ts               world state machine (the only writer of world state)
│   ├── prng.ts              seeded PRNG (mulberry32, injectable; the only randomness)
│   ├── replay.ts            recorded-action replay driver for the time scrubber
│   ├── encoding.ts          the one visual-encoding table + legend text (R025)
│   ├── budgets.ts           asset QA and performance budgets as data (R013/R028)
│   ├── render3d/            the 3D scene, split from render3d.ts: scene.ts (renderer,
│   │                        day/night, context loss), labels.ts, buildings.ts,
│   │                        characters.ts, picking.ts
│   ├── render3d.ts          facade: the init3D entry point over the render3d/ modules
│   ├── render2d.ts          canvas schematic (2D fallback, city zoom level, a11y view)
│   └── ui.ts                top bar, population list, inspector, feed, dispatch/onboard, speed
└── __tests__/               vitest suites (see test-spec.md)
src/lib/scene3d/             the shared 3D scene pipeline (OVERSTORY-DESIGN-R012):
├── pipeline.ts              filmic tone mapping, HDR/PMREM environment, sun +
│                            cascaded shadows, SSAO, emissive-only bloom, fog, sky
├── tiers.ts                 the three quality tiers, chosen from measured frame time
├── audit.ts                 material / density / label audits (R012.2/R012.3/R012.7)
├── labels.ts                screen-space labels with collision avoidance (R012.7)
├── roads.ts                 road-network generation and edit validation (R012.6)
├── sequences.ts             interruptible state-change sequences (R012.5)
├── characters.ts            the shared rig: clip set, crossfades, foot-speed match
└── generators/              seeded procedural building / road / prop kits (R012.10)
public/city-assets/
├── assets.lock.json         pins: source commit, sha256, byte count, license,
│                            license_allowlist (checked at startup)
├── manifest.json            the reviewed asset manifest (R012.10 pipeline input)
├── SOURCES.md               dataset survey (used and rejected)
├── riders/*.glb             17 rider models + 1 placeholder cube (~0.5 MB;
│                            superseded by the shared rig once R033 lands)
└── characters/              the shared rig and role variants (R033)
e2e/
├── scene-fidelity.browser.ts  golden viewpoints + measured p95 frame time (R012.9)
docs/art-direction.md        the style guide every asset is checked against (R012.8)
agent/overstory/apps/city/
├── __init__.py              CityGateway + build_city_router exports
├── gateway.py               fleet read: normalization, 60 s cache, refusal classification
└── router.py                GET /status, GET /fleet
agent/overstory/__tests__/test_city_app.py   host contract tests
```

Edited (existing): `src/apps/index.ts` (registration in `APP_SURFACES`),
`src/apps/surfaces.ts`, `src/lib/apps/__tests__/apps.test.ts`,
`public/spa-routes.json`, `agent/overstory/apps/__init__.py` (the city
`AppBackend`). The scene library (`three`) is already a locked dependency on
main (shared with the pre-existing graph 3D views); this lane adds no
dependency.

## Phase 0: Research

Two unknowns were open when the plan was written; both are resolved and
recorded in [research.md](research.md):

1. What the live fleet actually serves — resolved by the 2026-11-15 live
   capture (75 registered servers; 7 served packs with their tool counts;
   67 registered-unpublished; the arbora core pack, which is excluded from
   the connector district because it is a landmark).
2. How pinned binary character assets pass the repository security gate —
   resolved by reading the gate source: the sanitizer inspects every source
   file and skips only a fixed binary-extension list; the GLB extension is
   not on that list, so an upstream gate change is the unblock. The lane
   keeps per-file sha256 and byte counts in
   `public/city-assets/assets.lock.json` in the meantime.

No further unknowns block this delivery.

## Phase 1: Design

The seven design answers:

- **Owner.** Overstory owns the whole delivery: the presentation layer and the same-origin host read. The fleet fact belongs to Arbora (a served read consumed through the host); the spec standard belongs to pipelines (this spec follows it). No row crosses owners.
- **Cohesion.** The simulation core, the renderers, the UI panels and the page shell change together and live beside each other under `src/apps/city/`; the host read lives beside the other app backends under `agent/overstory/apps/`; the pinned assets and their lockfile live together under `public/city-assets/`.
- **Dependency direction.** The page shell depends on the core modules; the renderers depend on `layout.ts` (one geometry authority) and the `sim.ts` world; the host depends on the host's existing invoke seam. Nothing new points upward; the new app registers into the existing `APP_SURFACES` list.
- **Interface depth.** none — no new abstraction. Every seam reuses an existing one: the `AppSurface` contract (`src/apps/index.ts`), `fetchValidated` (`src/lib/api-validation.ts`), the injected invoke in `agent/overstory/apps/city/gateway.py`, the `RouteDef` registry (`src/lib/nav-registry.ts`).
- **Special cases.** Live/simulated mode is one decision with two sources and a visible badge, not a branch per failure. The 2D fallback is a view over the identical world, not a parallel system; a lost WebGL context falls back to it (R015). District overflow is one bounded refusal (queued event), not per-plot patches. An illegal state transition is refused at the guarded function (R006); a license outside the allowlist is refused at startup (R013).
- **State.** The character lifecycle is the declared state machine (R006): `AGENT_STATES` and `AGENT_TRANSITIONS`, one guarded transition function; the activity mode is `quiet` (default) or `demo` (R026); randomness is the injected seeded PRNG (R014); construction is a milestone stream (`construction.progress` every 25%) to a terminal built state; the asset cache holds verified bytes keyed by pin; replay records operator actions for the scrubber (R029). No flag or nullable timestamp carries meaning.
- **Environment.** Nothing a deployment varies is hardcoded: the speed query parameter, the fleet host (the host's existing gateway configuration) and the asset origin (same-origin `/city-assets`) are all configuration or ambient; the local debug path is documented in [quickstart.md](quickstart.md).

### Architecture

```text
Browser (Vite bundle, lazy route chunk)
├── src/apps/city/            (tree above: surface, routes, api, schemas,
│                             CityPage, core/*, __tests__/*)
└── public/city-assets/       (lockfile + 18 pinned GLBs, served same-origin)

Host (FastAPI, same-origin)
└── agent/overstory/apps/city/
    ├── gateway.py            CityGateway: normalized fleet read, 60 s cache
    └── router.py             GET /status, GET /fleet → served fleet.catalog.list
```

### Data flow

The browser talks only to the same-origin host. The host's city routes call
the one served Arbora operation (`fleet.catalog.list`) as the bound actor;
Arbora owns admission for the call. The normalized answer (server name,
served tool count, pack status) becomes the connector district: served
packs are built online buildings, registered-unpublished packs are planned
plots. City *activity* — walking agents, tasks, day/night — is the
deterministic simulation core (`core/sim.ts`), the only writer of world
state; every state change emits a typed event on `core/events.ts`. The
renderers subscribe and poll world state each frame; the UI subscribes for
the feed, inspector and panels. The 2D fallback reuses the identical
`layout.ts` graph and `sim.ts` — it is a view, not a second system.

### Event vocabulary

One bus; the simulation and (later) the live bridge emit the same types:

```jsonc
{
  "id": "ev-…",
  "ts": 942.5,             // in-game seconds
  "type": "task.assigned",
  "character": "chad",     // optional ref
  "building": "vector",    // optional ref
  "task": "t-12",          // optional ref
  "detail": "tool: query_vectors at Vector Hall"
}
```

Types: `character.spawned`, `character.idle`, `character.traveling`,
`task.assigned`, `task.pending_approval`, `task.approved`, `task.queued`,
`tool.call`, `tool.result`, `task.failed`, `knowledge.committed`,
`context.compacted`, `connector.joined`, `construction.progress`,
`building.completed`, `operator.dispatched`, `asset.verified`,
`asset.failed`, `mode.selected`.

### Asset provenance

18 GLBs (17 riders + placeholder marker cube, ~0.5 MB total) from the
MIT-licensed Hugging Face dataset, pinned at commit
`cf7ac1f31de6235d9033ffcece98e055e2a14535`. Per-file sha256 and byte count
in `public/city-assets/assets.lock.json`; the dataset survey (used and
rejected) is recorded in `public/city-assets/SOURCES.md` beside the
lockfile. Later generated facade art is admitted through new lockfile
entries with per-asset provenance (R024).

### Key decisions

- **The fleet is the catalog.** An earlier prototype curated 24 connectors
  from a repository inventory; that was the wrong authority. The fleet
  catalog served by Arbora is the one source of truth for what exists, what
  is online and what is registered; the city maps it 1:1.
- **The scene library is a package dependency, lazy-chunked.** The
  standalone prototype loaded the scene library from a CDN import map.
  Inside the workspace it is a normal dependency; the `/apps/city` route is
  the only entry that imports it, so the shell bundle is unaffected (R016).
- **The simulation core ports as TypeScript ES modules.** It carries no
  React dependency; `CityPage` mounts it into a container and disposes it on
  unmount (R018).
- **The district is sized to the fleet.** 78 plots (6 columns × 13 rows)
  exceed the current catalog (74 connectors), so growth never needs to
  extend the city; a refusal with a visible queued event remains the
  bounded behavior if the catalog outgrows the district.
- **The time model.** In-game clock at timeScale 144 (one day = ten real
  minutes at 1×); character actions paced in real seconds at 1×; the speed
  control multiplies both together; `?speed=0|1|2|4` sets the initial speed.

### Amendments

#### 2026-11-15: Reconcile with the detailed "Living 3D World View" phase plan

The phase plan (walkable exterior, enterable interiors, prompt-driven NPCs
plus live agent mirroring plus human presence, connector district
mirroring, asset scale-out) is the long-range trajectory for this
capability. This delivery (R001–R018) is its foundation and a strict
subset. The plan's ownership model agrees with the repository boundary
rules:

- **Overstory owns the presentation layer and local interaction state** —
  exactly what R001–R018 ship (app surface, scene, simulation core, host
  read seam).
- **Durable world state, ontology, NPC memory, spatial relations and
  provenance belong to Medulla** — the world-view ontology is spec'd there
  (the world-view spec), not here; Overstory consumes it later through
  served operations (R021).
- **Live agent activity and streams belong to arbora / agent-utilities** —
  run-event consumption is the follow-on seam named under Cross-repo
  seams; the city renders it (R020).

Phase → delivery map:

| Plan item | v1 (this delivery) | Follow-up row |
|---|---|---|
| Overstory embedding (app pattern, scene-library dependency) | shipped (`/apps/city`) | — |
| Walkable exterior shell | orbit + click-to-inspect + 2D fallback; no first-person yet | R019 |
| World-view ontology plus layout data flow | connector district from the live fleet catalog; layout authority in-repo for now | R021 (the ontology itself is spec'd in Medulla) |
| Interiors plus portals | not started | R019 |
| Prompt-driven NPCs | deterministic roster behavior (17 citizens, 3 humans) | R022 (LLM execution in Meristem) |
| Harness agent mirroring | city activity is the deterministic simulation in both modes (R014) | R020 (the stream is served by arbora) |
| Human visitor presence | 3 human operators, simulated | R023 |
| Connector → spatial mapping | shipped — the full registered catalog (74 connectors, 78 plots) | — |
| World as activity mirror | typed event vocabulary + activity feed (simulated events) | R020 |
| Asset scale-out | 18 pinned MIT GLBs, procedural buildings, ~0.5 MB, lockfile provenance | R024 |

Decisions: the route stays `/apps/city` — the app contract provides auth,
role and capability gating, and sidebar placement for free; a top-level
`/world` entry would be one route-registry row if the city ever outgrows
the app section. Raw scene library (no framework wrapper), matching the
repository's existing 3D view patterns. The asset-admission pattern
(lockfile + provenance + startup verification, R013) is already built and
is the intake path for the later asset expansion (R024).

#### 2026-11-17: PR review — provenance, determinism, and the cross-repo owners

The v1 delivery was reviewed point by point (36 points, ordered by impact).
The must-fix findings are implemented in v1, the plan-scope gaps are now
specified rows with named owners, and the game-design and asset-pipeline
points are specified as rows or follow-ons:

- **Provenance and honesty (must-fix).** `LIVE` now means exactly the
  connector district; every activity element carries a per-event provenance
  flag and the feed shows a "simulated activity" badge (R010, R014). The
  three fictional operator characters are re-kinded as NPC and labelled
  simulated (R005, R007).
- **Determinism (must-fix).** One seeded PRNG (mulberry32, fixed default
  seed, injectable) drives every random draw; `Math.random()` is gone from
  the simulation, so runs replay and tests assert exact sequences (R014).
  The time scrubber replays recorded operator actions against that seed
  (R029).
- **Host read (must-fix).** The fleet cache is keyed by the verified
  principal and tenant; cold boots single-flight the in-flight read; the
  per-pack fan-out runs concurrently under a cap with a per-call timeout
  (R003).
- **State machine (plan gap, now v1).** The lifecycle is one declared
  transition table with a single guarded transition function (R006).
- **Cross-repo owners (plan gap, now specified).** The follow-on rows
  R019–R024 name their owners in the owning repositories: the served
  layout read row in the arbora fleet-catalog spec, the presence-channel
  row and the activity-stream row in the arbora hosted-operations spec,
  and the three world-view rows in the medulla world-view spec, with the
  run-trace and prompt-asset rows from the medulla orchestration
  vocabulary. The owner rows were created in those repositories first;
  this spec's `Depends:` lines point at them. The world-view ontology adds
  only spatial classes and relations extending the core ontology — not a
  parallel model — and the layout is derived from the catalog with stored
  manual overrides only (review points 14–15).
- **Quality (v1).** `render3d.ts` is split into `render3d/` modules
  (scene, labels, buildings, characters, picking) behind the facade
  (R025); a lost WebGL context falls back to the 2D schematic (R015); the
  population list, inspector and modal are keyboard reachable with the
  2D view as the non-canvas equivalent, and the `jsx-a11y` findings are
  fixed (R027); the lockfile carries per-file licenses and an allowlist
  that startup verification enforces, plus automated asset QA budgets
  (R013).
- **Game design (v1).** One visual encoding table with an always-on HUD
  legend (R025); quiet-by-default activity with a labelled demo mode
  (R026); the 2D schematic doubles as the top semantic-zoom level
  (R015); districts group by business domain with the core landmarks at
  the centre (R002); performance budgets are acceptance criteria checked
  in tests against the bundled snapshot (R028); first-visit tour
  (R030).
- **Identity (follow-on, now specified).** Real agents map to persistent
  characters through a stable pseudonymous id assigned on the host, never
  the agent's identity — R017 stays intact (R020).
- **Asset scale-out (follow-on, now specified).** The craft-suite asset
  pipeline is specified in R024: locked style bible and reference sheet,
  fixed per-asset pipeline, kits over one-offs, one shared rigged base
  body, splats for vistas only, governed spend, and automated QA — a
  failing asset never enters the lock.

The week estimates in the phase plan are replaced by these rows' exit
criteria and bound tests; each phase's work is filed in the owner
repository's spec with `Depends:` links (review point 18).

#### 2026-11-18: Re-review — the to-merge bar and the round-2 rework

The re-review checked the 36 points against the code: about half are only
partly done, three of the reply's claims do not match the code, and the
visual quality is below the bar now written down as
OVERSTORY-DESIGN-R012.x rows. This delivery fixes the to-merge list:
findings 1–6, the true encoding legend (point 23), the honest scrubber
(point 22), the measuring performance test (point 29), the 3D rebuild
against R031–R033, and the golden-viewpoint proof per R012.9.

**Backend (R003 amendment, T042).** The single flight becomes a real
asyncio task with `asyncio.shield` for the waiters and `finally`
cleanup, so a cancelled caller neither strands nor cancels the shared
read (finding 1); a typed refusal or timeout on one pack degrades that
pack's tool list to empty instead of failing the whole read (finding 6);
the fresh read is bounded by an overall 30 s deadline; the catalog read
paginates by cursor (`limit: 100`, safety cap ten pages) and the per-pack
tool read filters by `servers: [name]` rather than free text (finding 7
— the contract file now documents the live wire shape the code parses).

**Frontend correctness.** The renderers honour the asset gate at render
time (finding 4); disposal traverses the scene and force-loses the
context (finding 5); `transition()` refusal results are honoured — state
and behaviour never diverge (point 8); a refused dispatch targets a
queued event, never a silent swap, and the action record is bounded
(finding 8); refused events carry operator-facing wording; `Math.random`
is gone from the renderers (point 2); feed rows show provenance and the
streaming indicator stops claiming "live" while nothing live streams
(point 1); the panels update in place so keyboard focus survives the 4 Hz
refresh (point 12); the legend is true — the encoding table drives every
rendered channel and the test verifies the scene against the table
(points 23 and finding 3); the scrubber replays from the active mode's
own fleet source and labels the replayed window (finding 2, point 22);
the performance test builds the real scene graph and measures (point 29).

**The 3D rebuild (R031–R033).** `src/lib/scene3d/` lands as the shared
pipeline (filmic tone mapping, pinned HDR environment, sun + cascaded
shadows, SSAO, emissive-only bloom, fog, sun-driven sky; the three
quality tiers; the audits), the city's `render3d/` is rebuilt on it, and
`docs/art-direction.md` fixes the style guide (R012.8). The cast moves to
one shared rig — Khronos `glTF-Sample-Models-1.0` RobotExpressive, its
eight clips mapped onto the R012.4 clip set, the license verified at
fetch and admitted to the allowlist and SOURCES.md — with the
pseudonymous ids (R020) naming the characters and the comic roster
leaving the city (R033, point 27). Textures are runtime canvas-generated
shared-atlas PBR sets (the R012.10 procedural route): no shipped texture
files, and the decision is documented in the style guide. Operator layout
editing (R032) lands in full — edit UX, validation, animation, re-routing
and the gateway seam; the round-trip is proven by test with a fake
injected invoke, and live persistence is the cross-repo follow-on (arbora's
served layout read, ARBORA-FLEET-R084, spec-only in arbora main; the
medulla world-view rows, planned) — stated as such in the PR reply.

**Phases by owner (point 18).** The phase plan's phases are restructured
by the owning repository; every row is filed in its owner's spec and the
`Depends:` lines point at the owner rows:

| Owner | Rows | State (2026-11-18) |
|---|---|---|
| Overstory (this repo) | R001–R018 (v1), R025–R033 (rounds 1–2) | this PR: v1 plus the round-2 rework |
| Overstory (follow-on) | R019–R024 | specified, no v1 code |
| Arbora | the `fleet.catalog.list` provider (ARBORA-FLEET-R040) | live; consumed by R003 |
| Arbora | the served layout read (ARBORA-FLEET-R084) | spec-only in main (`ecaeeda2`); lands with R032's live persistence |
| Arbora | the presence channel and the activity stream (hosted-operations spec) | spec'd; R020/R023 follow-ons |
| Arbora | the engine catalog drift rows (`ONTOLOGY_ORPHAN`, `ONTOLOGY_CORE_CONFLICT`, `PACK_TOO_LARGE`) | filed 2026-11-18; blocks the `craft-suite-api` pack import (nothing served yet) |
| Medulla | the world-view ontology (MEDULLA-WORLD-VIEW-R001/R002/R003) | spec'd, all planned; R021/R032 follow-on |
| Medulla | the run-trace vocabulary and the prompt assets (orchestration vocabulary) | spec'd; R020/R022 follow-ons |
| Meristem | the NPC dialogue reply loop | R022 follow-on |
| Connectors | the craft-suite app tools (CONN-CRAFT-SUITE-API-APPS) | `registered_unpublished`, nothing served; the image-edit operations must land first (2026-11-17 correction); the R012.10 route 2 consumes them |
| Pipelines | the spec standard | process dependency |

**Fidelity proof (R012.9).** The golden viewpoints and the measured p95
frame time run on the e2e fidelity harness. Against the live local
no-auth stack the capture is still blocked by the three Arbora gaps
(403 on `/api/*` under `WEBUI_AUTH_MODE=none`; zero connectors without
credentials; the engine refusing the provisioned content pack) — rows for
each are filed in the arbora specs, as the 2026-11-17 note stated. The
harness runs now against the local `SIMULATED` city (bundled snapshot, no
auth needed), and the live no-auth capture is recorded as pending in the
test spec rather than claimed.

#### 2026-11-19: The shared-rig cast (R033) — the borrowed roster leaves

The 2026-11-18 re-review's cast finding (R033) lands with this note. The
borrowed third-party roster — 17 rider GLBs and their comic character
names from another game's asset pack — leaves the city. All 17
characters move to **one shared humanoid rig** with role encoding:

- **The pinned rig:** `RobotExpressive.glb` from the three.js repository
  (model by Tomás Laulhé, modifications by Don McCurdy), **CC0 1.0**
  (inside the lock's license allowlist), pinned at the exact commit of
  tag `r186` — the same major the repository runs three at. It lands at
  `public/city-assets/characters/robot-expressive.glb` with a lock entry
  (sha256, byte count, license); the throttlebrawl pack keeps only the
  placeholder `marker-cube.glb` (moved to the `city-assets/` root, still
  locked) because the construction markers use it.
- **The clip set (R012.4 bar):** the rig bundles 14 authored clips. Six
  map onto the shared eight-clip set directly — `Idle`→idle,
  `Walking`→walk, `Running`→run, `Punch`→work, `Wave`→talk,
  `Dance`→celebrate, `Death`→fail — and `carry` (a hold-and-move cycle
  with no authored equivalent) is completed by the shared library:
  `completeClipSet` in `src/lib/scene3d/characters.ts` derives it as a
  deterministic keyframe layer over the rig's own skeleton rest pose.
  Every character therefore carries the full blended clip set, and a rig
  missing its locomotion core (idle/walk/run) fails loudly, per
  R012.4.
- **The roster:** `ROSTER` entries now carry a **pseudonymous id**
  (R020 — `agent-01`…`agent-14`, `operator-01`…`operator-03`), the
  display name *is* the id, and a **role** from the R025 vocabulary
  (`operations`, `maintenance`, `security`, `core` for the simulated
  operators). Silhouette, outfit and colour encode type and role through
  the shared palette's `role-*` tokens — no private colour copies. The
  three simulated operators keep their fixed behaviour (dispatch,
  patrol, nightshift) under their new ids.
- **The bound test:** `ecosystem.test.ts::cast_encodes_role` (R033's
  named test) proves every roster entry maps to the one rig with the
  full clip set, and that its colour is the encoding-table colour for
  its role.

### Rejected alternatives

- **Server-side rendered frames (WebRTC/WebGPU stream):** server GPU cost
  O(viewers); breaks at the first 100 concurrent users.
- **Iframe-mounted standalone app:** a second document severs WebMCP,
  theming, and the route registry; the `AppSurface` contract exists
  precisely to avoid that.
- **Per-user server state (authoritative city per tenant):** a second store
  plus sync; violates the one-engine principle. The city is a projection of
  the fleet catalog plus a local simulation.
- **CDN import map for the scene library inside the repo:** the workspace
  bundle is the distribution path; a runtime CDN fetch adds a dependency
  outside the lockfile and breaks offline dev.

## Phase 2: Task approach

One task per row, producer first (see [tasks.md](tasks.md)): T001–T003
build the world producers (district, landmarks, population); T004–T005 the
asset verification and event seams; T006–T012 the simulation behavior
(lifecycle, operators, construction, day/night, selection, speed, 2D
fallback); T013–T014 the host read and the mode decision; T015–T018 the
route wiring, credential whitelist and unmount safety. T019–T024 are the
follow-on rows: specified, no v1 code, no schedule. T025–T041 are the
2026-11-17 review amendments and the fidelity rows R031–R033; T042–T053
are the 2026-11-18 re-review amendments — one task per amended row — and
land in this delivery with the R031–R033 rebuild: the host read first
(T042), then the sim and the renderers (T043–T053). Verification evidence
(tests, build chunk report, lockfile audit) is recorded per row in
[checklists/requirements.md](checklists/requirements.md).

## Complexity Tracking

none — the Constitution Check passed on all three repository articles; no
violation is justified or pending.

## Build contract

- `pnpm typecheck` — zero errors.
- `pnpm lint` — zero errors on the touched sources (the repository
  downgrades `jsx-a11y` label findings to warnings; no new warning class).
- `pnpm test` — the full frontend suite; the city suites in
  [test-spec.md](test-spec.md) are bound to their rows.
- `uv run --no-sync pytest agent/overstory/__tests__/test_city_app.py` —
  the host contract (shape, 60 s cache, 503, typed refusal, whitelist).
- `pnpm build` — the shell chunk holds zero scene-library references; the
  scene library ships in the on-demand city chunk group (chunk report in
  test-spec.md); pinned assets verify 18/18 against the lockfile.
- `uvx pre-commit run --config .config/pre-commit.yaml --all-files` — the
  full gate set, including the spec and secret gates.

Code shapes the change must hold: typed boundaries (Zod schemas at the
host response seam, strict TypeScript at the browser boundary); one
geometry authority (`layout.ts`); the dispose contract on unmount;
whitelist-only fleet normalization; bound tests naming their rows.

## Production caller chain

Browser:

1. `src/App.tsx` mounts the route from the `ROUTES` registry
   (`src/lib/nav-registry.ts`) → `src/apps/city/routes.ts:23`
   (`element: lazy(() => import('./components/CityPage'))`).
2. `src/apps/city/components/CityPage.tsx:156` fetches
   `GET /api/apps/city/status` and `GET /api/apps/city/fleet` through
   `src/apps/city/api.ts:13` and `api.ts:17` (`fetchValidated`).
3. On success the page verifies the pinned assets (one fetch each, sha256
   against `public/city-assets/assets.lock.json`), maps the fleet through
   `ecosystem.fleetToConnectors`, and starts `sim.initSim`.
4. The animation loop ticks `sim.tickSim`; the renderers draw; the UI
   panels update on bus events; the effect cleanup disposes (R018).
5. On fleet failure the page boots from `FLEET_SNAPSHOT`, sets mode
   `SIMULATED`, and shows the banner (R014).

Host:

1. `GET /api/apps/city/fleet` → `build_city_router`
   (`agent/overstory/apps/city/router.py:50`).
2. → `CityGateway.fleet()` (`agent/overstory/apps/city/gateway.py:118`) →
   `_fresh_read` (`gateway.py:134`) → the injected invoke with the catalog
   operation and the browse parameters.
3. The invoke is the host's `served` operation, wired in `default_apps()`
   (`agent/overstory/apps/__init__.py:79`); Arbora owns admission and
   serves `fleet.catalog.list`.

No obsolete paths to delete: the standalone prototype lives outside the
repository (a frozen reference), and no earlier city code existed in-repo.

## Cross-repo seams

- **Arbora** — the served fleet catalog read (`fleet.catalog.list`), consumed by OVERSTORY-CITY-R003 and whitelisted by OVERSTORY-CITY-R017; the provider row, wire shape and refusal codes are in [contracts/arbora-fleet-catalog.md](contracts/arbora-fleet-catalog.md).

`pipelines` owns the spec standard this spec follows (file set, computed
states, contract documents); it is a process dependency, not a data seam.
No other seam: the city adds no store, no second event source, and no
credentials to the browser.
