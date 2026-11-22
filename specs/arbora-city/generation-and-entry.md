# Island generation, growth and game entry

## Repeatable world recipe

Generate one playable starting island from a seed and a versioned recipe. The recipe declares land extent, sea level, terrain variation, climate, district suitability, corridor limits and asset catalog version. Derive independent random streams for terrain, roads, parcels and each stable placement. Use stable ordering and tie-breaks. Rendering, camera travel and chunk load order must preserve world decisions.

1. Combine a seeded coastline distance field with layered noise and regional terrain shapes. Sample a lower-resolution island-wide field before producing detailed render tiles. Share elevations and water boundaries across tile seams.
2. Resolve inland sinks as lakes or drainage outlets. Accumulate downhill flow to form rivers and deltas. Use elevation, slope, moisture and exposure to classify rock, beach, reef, jungle, dry land and snow.
3. Choose connected, dry district and landmark anchors from terrain suitability. Route trunks with terrain-cost A*, including grade, curves, cut/fill and crossing costs. Fit the alignment and check the complete swept width. Generate local streets, lane movements, sidewalks and frontage as specified in the [road-led district contract](ecosystem-districts.md).
4. Assign eligible parcels to building recipes. Attach entrances to the pedestrian network. Place roadside assets in reserved sockets. Produce a stable manifest of terrain, corridors, lots, access and assemblies.
5. Validate the candidate before publishing it. Reuse a valid prior revision if a regeneration attempt fails. Keep retries bounded and report constraint failures.

### Procedural placement is required

All generated map assets, including landmarks, connector lots, housing, parks, shelters, hydrants, waterfront structures, vegetation and traffic controls, must be placed by the versioned seed and the accepted terrain, road, water and parcel constraints. Remove legacy fixed-coordinate placements from both views; do not preserve them as a fallback for a new seed. Asset prototypes may have local coordinates, and an explicit user-pinned edit may have a persisted world coordinate. Every building must have a valid pedestrian connection to the road network; road-dependent services also require a valid vehicle approach. If a valid site does not exist, leave the asset unplaced and report the constraint rather than placing it in water, clipping another asset or disconnecting its access.

### One world and movement model across views

The 2D and 3D views must represent the same generated island, terrain and water boundaries, road graph, placements, characters and vehicles at the same world-coordinate scale and complete world extent. Both renderers consume one authoritative movement and time model; switching views must not reset, duplicate, teleport or independently advance entities. Maintain selection, world-space camera focus and a corresponding visible world span across a switch, including fallback and restoration after WebGL context loss. Transition smoothly when the device permits, honor reduced-motion preferences and keep the existing view usable until the replacement is ready. The transition must not create duplicate simulation loops or retain an inactive GPU-heavy renderer merely for animation. Camera projection can differ, but one metre and a given world coordinate refer to the same place in both views.

## Dry-ground rule

Check the full transformed foundation polygon and entrance path against the buildable land polygon. Exclude ocean, lake, river, canal and flood setback. Require the supported foundation elevation to clear the local water envelope plus the profile's declared freeboard. Use conservative intersection checks against terrain and water cells. A dry center or four dry corners alone cannot certify the footprint. Reject unsupported foundations and inaccessible entrances. Try a smaller eligible assembly or leave the lot vacant.

Use the same check for initial generation, growth, moves, rotations and terrain edits. Revalidate the entire occupied envelope after a terrain or water revision. Bridge decks, piers and other designated infrastructure use explicit structure profiles with support, elevation and navigation clearance requirements.

## Growth after seed generation

Evaluate growth at bounded revision steps. In the demo, use a labeled seeded demand schedule. In served mode, use admitted changes such as connector lifecycle events or Medulla archive capacity facts. A recipe defines eligibility, trigger, maximum growth per step and what happens when capacity is exhausted. Fill a valid existing lot first. Extend a road only when existing frontage cannot meet demand. Keep unresolved demand visible and retry after relevant state changes.

Persist the seed, recipe version, accepted growth events, stable placement IDs and pinned edits through the owning state contract. In the local sandbox, a replayable fixture can reproduce the result. In served mode, consume authoritative revisions through Arbora under R047. Treat repeated events as idempotent, and reject stale candidates. Preserve unaffected placement IDs during regrowth. Run generation outside the render loop. Stream visible render chunks and release them independently of simulation state.

Algorithm references are [Parish and Müller’s city generation paper](https://people.eecs.berkeley.edu/~sequin/CS285/PAPERS/Parish_Muller01.pdf) and [Mapgen4’s drainage implementation](https://github.com/redblobgames/mapgen4/blob/main/map.ts).

## Discover Arbora City from Overstory

- Signed-in users with City access can open **Apps → Arbora City** through the canonical route registry. The host advertises `app:city` when the city can render. An unavailable live fleet still permits the labeled simulation.
- The explicitly enabled loopback development sandbox exposes **Play Arbora City** from its landing surface. It links to `/apps/city?demo=1` and uses the bundled simulation. Its layout edits operate on in-memory state. Release builds keep normal admission.
- Keep one lazy City route. Verify both entry journeys from the landing UI, keyboard navigation, deep links, browser back, disabled sandbox configuration and the signed-in capability boundary.
