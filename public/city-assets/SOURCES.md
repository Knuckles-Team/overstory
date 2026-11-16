# SOURCES — provenance for Arbora City

Captured 2026-11-14. This file records every external source the project uses,
per the ecosystem's third-party-attribution convention.

## 1. Hugging Face — 3D asset collection

**Collection browsed:** [cfahlgren1 — "3D datasets in the Dataset Viewer"](https://huggingface.co/collections/cfahlgren1/3d-datasets-in-the-dataset-viewer)
(300+ datasets with 3D mesh previews and Gaussian-splat previews.)

### 1.1 Used: `joshuasundance/throttlebrawl-assets`

- **Repo:** <https://huggingface.co/datasets/joshuasundance/throttlebrawl-assets>
- **Pinned commit:** `cf7ac1f31de6235d9033ffcece98e055e2a14535`
- **Licenses:** MIT (game assets) + ODbL 1.0 (OSM-derived terrain inputs, *not copied*)
- **Why selected:** the only dataset in the collection with (a) a permissive
  license, (b) web-class file sizes (~27–40 KB per character, ~500 KB total for
  all 18 files used), (c) articulated, named-node humanoid characters suitable
  for procedural animation, and (d) an existing asset-pin convention
  (`assets.lock.json` with SHA-256) that this project follows.
- **Files used (18):** 17 rider character GLBs + 1 placeholder marker cube.
  Exact paths, byte sizes, and SHA-256 per file: see [`assets.lock.json`](assets.lock.json).

  | Pack | Characters |
  |------|-----------|
  | `base/models/riders/` | chad-speedwell, deacon-vane, dial-up, kevin-from-accounting, mother-rust, player, sgt-pruitt, tammy-two-stroke, the-mayor, trooper-dalrymple |
  | `region-clinton/models/riders/` | mara-vale |
  | `region-pnw/models/riders/` | deputy-lindqvist, juniper-moss, old-growth |
  | `region-sf/models/riders/` | gripman-gus, officer-meter, pivot |
  | `base/models/placeholder/` | marker-cube |

- **Attribution:** © 2026 the throttlebrawl contributors (MIT). Dataset card:
  "throttlebrawl assets — The big files for throttlebrawl, an MIT-licensed
  browser motorcycle brawler (TypeScript, Three.js)."
- **Not used:** the repo's `region-*/terrain/*.json` files (ODbL 1.0 OSM
  geometry + public-domain USGS elevation). They are specific road-network
  build inputs for the source game; this project generates its own road
  network instead. OSM/USGS sources remain credited in the dataset card.

### 1.2 Surveyed and rejected (recorded so the choice is auditable)

| Dataset | Rejected because |
|---------|------------------|
| `aqi94/palworld-models` | 9–23 MB per GLB (up to ~2 GB for 100 models); fan-extracted commercial IP; license not stated |
| `aqi94/pokemon-za-models` | up to 212 MB per GLB; commercial IP; license not stated |
| `fatto92/wow_models` | 67–85 MB per character GLB; commercial IP |
| `1024m/F1-RL-HF-Assets` | 250 MB for 8 cars; no license tag |
| `gummy-games4/smash_64_remake` | single fan-extracted model; commercial IP |
| `nopparoot15/thai-street-3d` | license marked `other`; 14 MB pair |
| `g-ronimo/objects` | tree not enumerable via API at survey time; CC-BY/Apache mix |
| `cfahlgren1/lowpoly-coder-4b-data` | training corpus (parquet + GLBs for a text-to-GLB model), not a curated asset pack |
| `Kashu7100/eden_assets`, `HarrisonPENG/SpatialBenchGLBs` | trees not enumerable via API at survey time |
| `Luis-Fernando/isla`, `Soiler/villa-assets`, `tolysgames/robocop` | single large scenes/characters (44–191 MB); no license tag |
| Gaussian-splat datasets (`cfahlgren1/3d-splat-samples`, `AlistairWstbrk/splats`, …) | splats are not needed for a low-poly stylized city; viewer weight is high |

## 2. Live platform data (fetched 2026-11-14 through the Arbora MCP boundary)

The city's ecosystem seed data comes from the live platform, not from
hard-coded guesses:

- **Operation registry snapshot** — discovered via the `find` intent over the
  authorized operation registry. Engine operations observed:
  `agents.run`, `agents.plan_run`, `agents.tasks.{list,get,cancel}`,
  `runs.{get,events,current_plan,execution_graph}`,
  `eg.graph.{GetNodes,GetNodesByLabel,GetSubgraph,NodeCount,NodeIds,HasNode,UnionGetNeighbors,UnionGetNodeProperties,GetNodeProperties,GetNodePropertiesBatch}`,
  `eg.coordination.{GetCurrentPlan,CommitWorkItemResult,DeferWorkItem,GetEffectReceipt,…}`,
  `memory.{list,read,write,delete}`, `browser.{discover,request_call}`,
  `fleet.call`, `eg.ingestion.SourceIngest`, `eg.storage.ConnectorPack`,
  `ingest.embedding.admit`.
- **Live fleet servers at capture time:** `audio-transcriber-mcp`,
  `dockerhub-mcp`, `mealie-mcp`, `sql-mcp` (tool lists via `find`; full fleet
  roster is read live at runtime through `fleet.call` discovery — see
  `specs/arbora-city/plan.md`, "Live bridge").
- **Graph:** `eg.graph.GetNodesByLabel(label="Agent")` returned no agent nodes
  at capture time (empty city is a valid state; simulation mode covers it).

## 3. Ecosystem repository catalog (GitHub, fetched 2026-11-14)

- **Organization:** <https://github.com/Knuckles-Team> (110 public repos, MIT)
- **Connector catalog seed:** repo inventory via the GitHub API (pages 1–4
  surveyed, ~90 repos catalogued with name, language, star count, description).
  The catalog in `js/ecosystem.js` maps a curated subset of these repos to
  buildable city buildings; each building links back to its source repo.
- **Constitution:** [Arbora ecosystem constitution v1.13.1](https://github.com/Knuckles-Team/pipelines/blob/main/.specify/memory/constitution.md)
  — read and applied to this project's spec (see `specs/arbora-city/plan.md`,
  "Constitution check").
- **Overstory integration contract:** [overstory README](https://github.com/Knuckles-Team/overstory)
  (v3.0.0: React app + FastAPI host; browser talks only to the same-origin
  host; Arbora injects gateway routes; served on port 8080 when hosted by
  Arbora).
- **Craft suite asset pipeline:** [craft-suite-api README](https://github.com/Knuckles-Team/craft-suite-api)
  (268 typed backend operations as MCP tools, incl. 62 generation operations
  such as image generation — used in the phase-3 asset pipeline to generate
  facade/sign textures on demand).

## 4. Runtime libraries

- 3D scene library and model loader: see dependency manifest in
  `specs/arbora-city/plan.md` (pinned version, CDN-served).
- Everything else is hand-written ES modules; no build step, no other
  dependencies.
