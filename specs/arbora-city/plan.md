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
- **Storage**: none. The host is stateless apart from a 60 s in-memory fleet cache; simulation state is browser-local and ephemeral.
- **Testing**: vitest (frontend, deterministic tick pacing) and pytest (FastAPI `TestClient` contract over a fake gateway); one `path::name` test per row in requirements.md.
- **Target Platform**: modern browsers; WebGL2 scene with a canvas 2D schematic fallback; Node build through the repository Vite config.
- **Project Type**: web (hosted app plus a same-origin FastAPI adapter, per the OVERSTORY-APPS app pattern).
- **Performance Goals**: 60 fps at 1× on mid-range hardware; zero scene-library references in the shell chunk; pinned character assets under 5 MB (18 GLBs, ~0.5 MB); one fetch per pinned file.
- **Constraints**: no credential, token or identity value in the browser (R017); fleet data only through the host (R003); city activity is a labeled deterministic simulation, not a decision; no new store or event source.
- **Scale/Scope**: 24 rows; 75 fleet servers (7 served, 67 registered-unpublished, arbora core excluded); 78 plots; 17 characters; 18 pinned GLBs.

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
│   ├── events.ts            typed event bus + vocabulary + recent ring
│   ├── sim.ts               world state machine (the only writer of world state)
│   ├── render3d.ts          scene: landmarks, construction, characters, day/night, selection
│   ├── render2d.ts          canvas schematic fallback (same layout + world)
│   └── ui.ts                top bar, population list, inspector, feed, dispatch/onboard, speed
└── __tests__/               vitest suites (see test-spec.md)
public/city-assets/
├── assets.lock.json         18 pins: source commit, sha256, byte count
├── SOURCES.md               dataset survey (used and rejected)
└── riders/*.glb             17 rider models + 1 placeholder cube (~0.5 MB)
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
- **Special cases.** Live/simulated mode is one decision with two sources and a visible badge, not a branch per failure. The 2D fallback is a view over the identical world, not a parallel system. District overflow is one bounded refusal (queued event), not per-plot patches.
- **State.** The character lifecycle is a state machine with named states (`idle`, `tasked`, `traveling`, `working`, `committing`, `sleeping`, `patrolling`) in `sim.ts`; construction is a milestone stream (`construction.progress` every 25%) to a terminal built state; the asset cache holds verified bytes keyed by pin. No flag or nullable timestamp carries meaning.
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
  provenance belong to Medulla / epistemic-graph** — the world-view
  ontology is spec'd there, not here; Overstory consumes it later through
  served operations (R021).
- **Live agent activity and streams belong to arbora / agent-utilities** —
  run-event consumption is the follow-on seam named under Cross-repo
  seams; the city renders it (R020).

Phase → delivery map:

| Plan item | v1 (this delivery) | Follow-up row |
|---|---|---|
| Overstory embedding (app pattern, scene-library dependency) | shipped (`/apps/city`) | — |
| Walkable exterior shell | orbit + click-to-inspect + 2D fallback; no first-person yet | R019 |
| World-view ontology plus layout data flow | connector district from the live fleet catalog; layout authority in-repo for now | R021 (the ontology itself is spec'd in epistemic-graph) |
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
follow-on rows: specified, no v1 code, no schedule. Verification evidence
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
