# SOURCES — provenance for Arbora City

Captured 2026-11-14; updated 2026-11-19 (shared-rig cast, OVERSTORY-CITY-R033).
This file records every external source the project uses, per the
ecosystem's third-party-attribution convention.

## 1. Pinned character and marker assets

The city pins exactly two external binary assets (both tracked in
[`assets.lock.json`](assets.lock.json) with SHA-256, byte count and license,
and verified at startup):

### 1.1 Shared rig: `characters/robot-expressive.glb`

- **Source:** [mrdoob/three.js](https://github.com/mrdoob/three.js),
  `examples/models/gltf/RobotExpressive/RobotExpressive.glb`
- **Pin:** tag `r186`, commit
  `9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8` (the same three major the
  repository runs)
- **License:** CC0 1.0 (per the model folder's README)
- **Attribution:** model by [Tomás Laulhé](https://www.patreon.com/quaternius);
  modifications by [Don McCurdy](https://donmccurdy.com) (added three facial
  expression morph targets, converted with FBX2GLTF, removed duplicate
  materials and reduced material metalness).
- **Role in the city:** the one shared humanoid rig every character is
  built on (R033 / R012.4). It ships 14 authored animation clips; six
  map onto the shared eight-clip set (Idle→idle, Walking→walk,
  Running→run, Punch→work, Wave→talk, Dance→celebrate, Death→fail) and
  the remaining clip (`carry`) is completed deterministically by the
  shared library (`completeClipSet`, `src/lib/scene3d/characters.ts`).

### 1.2 Marker: `marker-cube.glb`

- **Source:** Hugging Face dataset
  [`joshuasundance/throttlebrawl-assets`](https://huggingface.co/datasets/joshuasundance/throttlebrawl-assets),
  `base/models/placeholder/marker-cube.glb`
- **Pin:** commit `cf7ac1f31de6235d9033ffcece98e055e2a14535`
- **License:** MIT
- **Attribution:** © 2026 the throttlebrawl contributors (MIT).
- **Role in the city:** the placeholder marker — construction markers and
  reserved-plot markers. The pack's 17 rider character GLBs (and their
  comic character names) left the city with the 2026-11-19 shared-rig
  cast; this cube is the only file kept from the pack.

### 1.3 Surveyed and rejected (recorded so the choice is auditable)

The original survey (2026-11-14, ~300 datasets in the
[cfahlgren1 3D collection](https://huggingface.co/collections/cfahlgren1/3d-datasets-in-the-dataset-viewer))
rejected every dataset except throttlebrawl's for the same reasons:
web-class file sizes, a permissive license, articulated humanoids, and
the asset-pin convention. Rejected then (representative): `aqi94/palworld-models`
(9–23 MB/GLB, fan-extracted commercial IP, no stated license),
`aqi94/pokemon-za-models` (up to 212 MB), `fatto92/wow_models`
(commercial IP), `1024m/F1-RL-HF-Assets` (250 MB, no license tag),
`gummy-games4/smash_64_remake` (commercial IP), `nopparoot15/thai-street-3d`
(license `other`), `g-ronimo/objects` (CC-BY/Apache mix, not enumerable),
`cfahlgren1/lowpoly-coder-4b-data` (training corpus, not a curated pack).
For the 2026-11-19 rig choice the bar was stricter still: a permissive
license, a named articulated skeleton with authored animation clips, and
pinnability at an exact commit — the three.js repository's own example
model is the only rig that meets all three without a license grey zone
(Mixamo-style rigs require an account and redistribution terms; the HF
humanoid datasets are commercial IP or unlicensed).

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

## Interim status (OVERSTORY-CITY-R046)

The shared character rig is an interim third-party asset admitted through the license gate. It is replaced by a generated rig when the generated people rigs land (OVERSTORY-CITY-R041). Until then it stays the only third-party character asset.
