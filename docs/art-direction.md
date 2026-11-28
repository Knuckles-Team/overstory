# City art direction

One art direction for every 3D scene (the city first, OVERSTORY-DESIGN-R012.8).
This page fixes the palette, the rendering approach, the scale and proportion
sheets, the architectural vocabulary per district archetype, and the lighting
moods. The machine-readable half of this guide — the palette with token
provenance, the archetype vocabulary, the trim-sheet layout, the budgets and
the material sets — lives in [`src/lib/scene3d/palette.ts`](https://github.com/Knuckles-Team/overstory/blob/main/src/lib/scene3d/palette.ts),
and the asset lock check
(`src/lib/scene3d/__tests__/assets.test.ts::style_guide_conformance`)
verifies the locked assets against it. The page and the module are one
direction: change one, the check breaks the other.

Stylized is not flat-colour. Every surface still carries the physically based
materials of R012.2 (an authored base-colour map — the shared trim sheet — on
a standard material) and the lighting of R012.1. The material audit
(`src/lib/scene3d/audit.ts::materialAudit`) enforces that on the live scene
graph.

## Scale and grid

- **1 unit = 1 metre.** Nothing in the scene is scaled for looks.
- **Characters are 1.75 m** — the shared rig (`src/lib/scene3d/characters.ts`)
  binds at that height, and its proportion sheet below pins the readable
  parts.
- **Modular grid cells.** Plots are 1×1 cells (7 m wide on the 10 m street
  grid) and 2×2 for the larger landmarks. The city layout
  (`src/apps/city/core/layout.ts`) places every building on that grid;
  off-grid placement is a review finding, not a style.
- **Roads are 10 m grid runs** (two 2.6 m lane pairs with a centre line),
  kerbed, with crosswalk bands at every intersection — the road tile
  generator (`src/lib/scene3d/generators/roads.ts`) emits the ribbon, kerbs
  and zebra bands as one asset.

## Palette

Every scene colour derives from a browser design token in
[`src/index.css`](https://github.com/Knuckles-Team/overstory/blob/main/src/index.css) (documented in the
[design system](design-system.md)) — a direct copy or a declared derivative.
A colour that is not in this table does not enter the scene.

| Role | Token | Hex | Use |
|---|---|---|---|
| Sky — day | `--atmosphere-light` | `#faf3de` | Daytime sky dome and ambient field |
| Sky — night | `--glass-field-floor` | `#45685b` | Night sky dome |
| Sun — day | `--atmosphere-light` (lightened) | `#fff2d8` | High-sun colour |
| Sun — dusk | `--chart-3` (lightened) | `#ffb37a` | Low-sun window (elevation < 0.25) |
| Moon — night | `--chart-2` (lightened) | `#8fa8d8` | Cool moonlight (elevation ≤ −0.12) |
| Wall — gateway | `--primary` | `#3e634f` | The core landmark carries the brand green |
| Wall — datahall | `--secondary` | `#e6ebe1` | Data-hall facades |
| Wall — workshop | `--chart-5` | `#655946` | The warm taupe of the trades |
| Wall — storehouse | `--border` | `#c5cfc1` | Storehouse facades |
| Wall — studio | `--accent` | `#dde9d8` | Studio facades |
| Wall — docks | `--atmosphere-sage` | `#b5c5ab` | Dock and pier structures |
| Windows | `--glass-field-blue` | `#87aaba` | Window bands (the glass from the field) |
| Roof | `--foreground` | `#111111` | The dark roofline carries the silhouette |
| Road | `--input` | `#738170` | The slate-sage asphalt |
| Road marking | `--card` | `#f7f8f2` | Ivory dashes, centre line, crosswalks |
| Water | `--chart-2` | `#2a5c75` | The shoreline water |
| Park | `--atmosphere-sage` | `#b5c5ab` | Park and plaza surfaces |
| Role — operations | `--ring` | `#245f70` | Blue reads as the control layer |
| Role — maintenance | `--chart-3` | `#78520a` | Ochre reads as the trades |
| Role — security | `--destructive` | `#963f37` | The guard accent |
| Role — core | `--primary` | `#3e634f` | The core actors |

Character roles are encoded in silhouette and outfit colour (R025 in the
city): one shared humanoid rig, role variants through the role palette
above — never a different body per role.

## Rendering

- **Stylized physically based rendering.** `MeshStandardMaterial` on the
  shared trim sheet (`city-trim-sheet`, one 1024×1024 RGBA8 sheet — 4 MB,
  well inside the 32 MB whole-scene texture budget). No flat-colour meshes:
  the material audit fails any non-marker surface without an authored
  base-colour map.
- **The shared trim sheet.** Disjoint UV bands: street furniture v 0.02–0.20
  (one row per kind), buildings v 0.25–0.75 (one column per building; wall,
  window band and roof rows inside the region), roads v 0.78–0.98 (u across
  the width, v along the run). The generators' UVs are pinned to these bands,
  and the asset lock verifies them.
- **Quality tiers (R012.1).** The pipeline drops passes from the high tier
  only, driven by p95 frame time (a 30-frame floor, no auto-promote); an
  operator override wins. SSAO, bloom and FXAA ride the composer; the tier
  never changes the palette or the geometry.
- **Low-poly geometry.** Buildings are wall panels with a per-storey window
  band, not box-crowds; props are the kit's primitives merged to one mesh.
  Instanced rendering is the default for the repeated pieces (trees,
  streetlamps, road tiles, props).

## Architectural vocabulary

The per-archetype kit below is the art direction; the building generator
(`src/lib/scene3d/generators/buildings.ts`) implements exactly it, and the
asset lock cross-checks the two. Floor height, parapet and window band are
fixed per archetype; the seed varies the bay rhythm and the panel insets,
never the vocabulary.

| Archetype | Floor height | Parapet | Window band | Wall | Roof | Doors and signage |
|---|---|---|---|---|---|---|
| gateway | 3.4 m | yes | 34 % of the storey | `--primary` | flat, parapet rim | tall core-landmark plate, double doors |
| datahall | 4.2 m | yes | 24 % of the storey | `--secondary` | flat, parapet rim | low band signage, wide door bays |
| workshop | 3.0 m | no | 42 % of the storey | `--chart-5` | flat, unrimmed | painted shopfront sign, wide door |
| storehouse | 3.2 m | yes | 30 % of the storey | `--border` | flat, parapet rim | stencilled door numbers |
| studio | 3.6 m | no | 46 % of the storey | `--accent` | flat, unrimmed | window displays |
| docks | 2.8 m | no | 38 % of the storey | `--atmosphere-sage` | flat, unrimmed | pier signs |

Windows are the band above each storey's wall (the region's v 0.5–0.9 row);
the storey rhythm is the bay count over a ~3 m module, with the per-building
macro variation breaking visible tiling.

## Proportion sheet

| Piece | Nominal size | Source |
|---|---|---|
| Character | 1.75 m tall | `src/lib/scene3d/characters.ts` |
| Streetlamp | 3.2 m pole, 0.16 m head | `src/lib/scene3d/generators/props.ts` |
| Tree | 0.9–1.1 m trunk, ~1.8 m crown | `src/lib/scene3d/generators/props.ts` |
| Bench | 1.6 × 0.45 m | `src/lib/scene3d/generators/props.ts` |
| Sign | 0.7 × 0.45 m on a 1.1 m post | `src/lib/scene3d/generators/props.ts` |
| Bin | 0.16 m radius, 0.5 m tall | `src/lib/scene3d/generators/props.ts` |
| Road tile | 10 m run, 2.6 m lane pair | `src/lib/scene3d/generators/roads.ts` |
| Plot | 7 m wide on the 10 m grid | `src/apps/city/core/layout.ts` |
| Crosswalk band | 0.9 m deep, 4 zebra stripes | `src/lib/scene3d/generators/roads.ts` |

Readability bar: a character at the building-zoom label distance is at least
12 CSS px (the label floor, `src/lib/scene3d/labels.ts`); anything smaller is
a distance the camera does not serve, not a proportion to shrink.

## Lighting moods

One sun, driven by the scene clock (`src/lib/scene3d/pipeline.ts::sunFromClock`).
The moods are windows of that clock — the e2e scene-fidelity harness
(`e2e/scene-fidelity.browser.ts`, R012.9) captures the golden viewpoints at
each mood's pinned clock; those captures are the reference renders for this
page.

| Mood | Clock window | Sun | Ambient read |
|---|---|---|---|
| Day | high elevation (elevation ≥ 0.25, e.g. noon at 43 200 s) | `#fff2d8` warm white, intensity 1.3, position rises with the elevation | The sage field, full shadow detail |
| Dusk | low-sun window (−0.12 < elevation < 0.25, e.g. 62 000 s) | `#ffb37a` amber, intensity 1.3, long shadows | The window lights carry the street |
| Night | elevation ≤ −0.12 (e.g. 75 600 s) | `#8fa8d8` cool moonlight, intensity 0.35 | The city never goes unlit; lamps and window bands read first |

The sky dome follows the mood (day `#faf3de`, night `#45685b`), and the fog
is wide enough that the far shoreline never pops.

## Asset admission and the license allowlist

Assets enter the scene only through two routes (R012.10): the reviewed
procedural generators, or the craft-suite connector's app tools reached
through Arbora. Third-party kits and hand-authored work are admitted only
under a license the allowlist accepts — permissive licenses only:

**MIT, Apache-2.0, CC0-1.0, CC-BY-4.0, Unlicense.**

Every locked asset records its recipe (or tool calls), inputs, tool versions
and content hash in the asset lock, so any asset regenerates. The asset lock
today is `public/city-assets/manifest.json` (twelve reviewed recipes),
verified by `scripts/scene-assets.mjs --check`; the character rig lock
lands with the city renderer rebuild and checks its license against this
allowlist.

## Contributor guide: producing assets

**Route 1 — the procedural generators.** The kit is
`src/lib/scene3d/generators/` (buildings, road tiles, street furniture, the
shared mulberry32). To add a recipe:

1. Extend a generator (or add a new one behind
   `src/lib/scene3d/generators/index.ts`) so the same seed always produces
   the same asset, within the family's triangle budget
   (`ASSET_BUDGETS` in `palette.ts`), with UVs inside your trim-sheet band.
2. Add the recipe to `public/city-assets/manifest.json` with its seed and
   budget.
3. Run `node scripts/scene-assets.mjs --write-hashes`, then `--check` — the
   runner bundles the real kit (esbuild) and regenerates every entry. Review
   the hash diff before committing: a hash that moves without a reviewed
   geometry change is a bug.
4. The bound tests (`seeded_generators_within_budget`,
   `style_guide_conformance`) and the manifest check are the gate.

**Route 2 — the craft-suite app tools.** Reached through Arbora: the
material and texture apps author the PBR texture sets and atlases (the trim
sheet itself enters through this route); the vector app produces building,
road-tile and zoning icons and sprite sheets; the UI-layout app produces HUD
and menu frames; the raster app edits and slices images; the solid and CAD
modelling apps produce bespoke landmark meshes; the lighting app produces
environment and lighting setups. Every call runs from a reviewed manifest
entry and publishes its output through the connector's artifact exchange; the
output passes this style-guide check and the asset QA budgets before it
enters the asset lock.

Never unconstrained text-to-3D prompting: the two routes above are the only
way geometry gets into the city.

## Caller chain

A 3D surface renderer (first consumer `src/apps/city/core/render3d/`) consumes
this guide through the shared scene pipeline `src/lib/scene3d/`, which owns
the passes, the quality tiers and the audits. The city scene module assembles
the real composer (SSAO, bloom, FXAA) and hands it to the pipeline; the
palette, the archetypes and the moods above are what that module renders.
