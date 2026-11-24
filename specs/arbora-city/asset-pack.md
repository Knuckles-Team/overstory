# Arbora City modular asset pack

Review draft, 2026-11-21. Requirements and evidence are tracked under OVERSTORY-CITY-R048.1 through R048.6.

## Visual target

Build an original Caribbean coastal city with readable low-poly silhouettes and human-scale detail. Use warm plaster, pale stone, painted timber, terracotta, cool glass and charcoal asphalt. Accent storefronts with coral, mango and turquoise. Keep structural materials subordinate to the street composition. Model bevels, sills, rails, curb faces and building entrances where they change a silhouette. Use shared maps for paver joints, seams, wear and small hardware. Reserve activity colors for signs, indicators and live signals.

Daylight must show glass and façade depth, soft contact cues and clear coast colors. Night must retain roof, curb and lane legibility. Use warm window variation, cool street fill and local pools of light. Operational window intensity must continue to encode actual or labeled simulated activity. Decorative lighting must have its own material channel.

## Screenshot audit

| Image | Observed detail and implication for the pack |
| --- | --- |
| 1 · Reference aerial day | Towers have differentiated bases, shafts, setbacks and crowns. Rooftops expose tanks, vents and equipment. Civic stairs and columns, fire escapes, a garage ramp, fuel canopy, bus stops, planted islands, canal edges and a rounded street loop recur at compatible scale. |
| 2 · Reference street | Curb faces, paver seams, drains, manholes, wear and lane paint have distinct scales. Shelter glazing, seat, route sign and bins form a believable stop. Trees have branching crowns. The fountain, gantry, billboard, barriers, truck and taxi retain readable silhouettes. |
| 3 · Reference night | Warm and cool window groups, hotel signs and vehicle lights read independently. Curb, road and roof forms remain legible. The same assets must work under both lighting setups. |
| 4 · Current city overview | Roads read as isolated strips. Several layouts meet the water with stepped edges, straight colored bands or abrupt bridge ends. Regional volumes and dark tree dots dominate undeveloped land. Qualify shoreline, connection and grounding together. |
| 5 · Current city close-up | Slabs, dark glazing, blank wall fields and a sparse shelter lose readability at street height. Agent scale and selection need to read alongside doors, curbs and vehicles. The inspector exposes entry. The image does not establish room quality or traversal. |
| 6 · Garage and security | Roller doors, vehicle lifts, tools and workbench distinguish a garage. Reception counter, waiting seats, office storage and secure partitions distinguish civic/security interiors. Shared walls, doors and tiles support both. |
| 7 · Park | Winding paths connect gates, benches, fountain and multiple planting layers. A bus and parked vehicles sit in their own corridor. Reuse edging and clearance rules at park boundaries. |
| 8 · Grocery | Stocked shelves, produce bins, chiller, baskets and checkout create a clear circulation loop. Use reusable stock clusters for detail at near range. |
| 9 · Mechanic exterior | Shopfront and roller bays define use at a glance. Parapet, HVAC, ducting, pipes, sign, corner sidewalk, hydrant and parked car establish scale. |
| 10 · Restaurant | Dining tables, chairs, menus, crockery, planters, counter and stairs create separate circulation and service areas. Wall openings and brick rhythm remain coherent around corners. |
| 11 · Buildings and parks | Low shops, curved storefronts, apartments, hospital and police massing share a vocabulary. Slides, swings, fence, marked court, rocks, conifer, broadleaf and curved paths make recreation distinct. |
| 12 · Prop and vehicle sheet | Vendor stalls, café seats, umbrellas, planters, bins, post box, hydrant, poles, signals, ads, roof utilities, debris and work-zone tools give public space recognizable uses. Taxi, patrol car, ambulance, bus, passenger cars and motorcycles differ by silhouette and equipment. |
| 13 · Road and sidewalk sheet | Straight and curved paving, corner returns, surface repairs, trench/service details, arrows, crossings and parking markings are separate layers with repeatable joins. Adapt the profile to the road frame. |
| 14 · Healthcare | Reception, exam room and ward use common walls, windows, floors, storage and seats. Beds, curtains and diagnostic carts distinguish rooms. Preserve a continuous clear path. |
| 15 · Active frontage | Awnings, merchandise windows, signs, doors, curb parking, corner paving, coordinated signals and crossing paint establish a walkable storefront row. Vehicle lights and plants carry color at street scale. |
| 16 · Café | Counter, pastry display, beverage equipment, cabinet, seating, framed art and tableware form a distinct room from shared construction pieces. Keep counter and display sockets reusable in other businesses. |

Images are visual evidence. Author original meshes, textures, signs, brands, recipes and layouts. The linked demonstration could not be inspected, so the reference pack's exact asset count is unverified.

## Launch catalog

The [ecosystem landmark and road-led district contract](ecosystem-districts.md) adds capability-specific pieces and builds on the base catalog.

The draft sets **66 reusable exterior module families** as the launch target. One numbered entry counts once. Colorways, LODs, arbitrary rotations, repeated placements and assembled presets do not add to the count. The launch catalog is a floor, not a cap: per the 2026-11-23 scope decision the catalog is open and grows with city need. Extension families are listed in the [extension catalog](#extension-catalog-2026-11-23-scope-expansion) and tracked under R048.10–R048.17, R051 and R054.

| IDs | Independently reusable families in ID order |
| --- | --- |
| 01–12 · Street profiles | Straight carriageway, variable-radius bend, width transition, end cap, T-junction, four-arm junction, skew junction, sidewalk strip, curb return, ramp and tactile pad, planted verge, parking or lay-by edge |
| 13–21 · Infrastructure and markings | Lane and edge markings, crossing and stop/turn markings, drain/manhole insert, paving repair or trench insert, bridge deck, parapet/guardrail, support or abutment, quay/canal bank, boardwalk/pier |
| 22–37 · Architecture | Foundation/plinth, solid bay, corner bay, punched-window bay, curtain-wall bay, storefront bay, pedestrian portal, roller-door bay, balcony, awning, cornice/floor band, setback adapter, flat roof/parapet, pitched roof, rooftop plant, exterior stair/fire escape |
| 38–51 · Public realm | Streetlamp, traffic signal assembly, wayfinding/stop sign, shelter, bench, bin, hydrant, bollard/barrier, billboard/gantry, market stall, café patio set, fountain, planter/tree pit, recreation fixture |
| 52–58 · Landscape | Broadleaf canopy, palm, upland conifer, shrub/hedge, flower/grass cluster, shoreline rock/reef dressing, beach/cliff/delta surface profile |
| 59–66 · Road vehicles | Compact hatchback, sedan, taxi equipment kit, delivery van, utility/refuse truck, transit bus, emergency equipment and body kit, motorcycle |

Shared recipes must assemble a rowhouse, detached home, apartment, hotel, office tower, garage and fuel station. Add civic hall, clinic, security station, grocer, bakery/café and waterfront pavilion recipes. The fuel station needs a distinct canopy, pump islands, sign, forecourt, convenience shop and curb-cut connection. Declare these as subassemblies of the architecture, furnishing and marking families. The emergency kit must compose both patrol and ambulance variants. The park recipe must support a play area and court. Marine extensions have their own registry entries outside the 66-family target. Cover cargo, fishing, yacht, kayak, personal watercraft and water-sports markers.

## Extension catalog (2026-11-23 scope expansion)

The launch catalog is a floor, not a cap. The extension catalog below is open: families are added as the city's districts, infrastructure and transport need them, and every family passes the same authoring protocol, budgets and review gates as the launch families (R-G7, R-G10). Family IDs reuse the existing category namespaces; **covered** marks a launch-catalog family that already satisfies an extended request.

| Domain | Families (category.id) |
| --- | --- |
| Infrastructure landmarks | `building.police-station` · `building.firehouse` · `building.hospital` · `building.energy-plant` · `building.water-works` · `building.funeral-home` · `building.train-station` · `building.bus-station` · `building.airport-terminal` · `building.shipyard` · `building.train-yard` · `building.nuclear-plant` · `building.coal-plant` · `building.fuel-station` (covered) |
| Skyscraper variance | `building.skyscraper-slab` · `building.skyscraper-setback` · `building.skyscraper-tapered` · `building.skyscraper-podium` · `building.skyscraper-twin` · `building.office-tower` (covered; floor-count and crown recipes vary height and shape) |
| Industry and services | `building.ore-plant` · `landscape.mining-site` · `building.oil-gas-plant` · `building.datacenter` · `building.office-campus` |
| Commerce and entertainment | `building.movie-theater` · `building.arcade` · `building.restaurant-row` · `building.mall` · `building.clothing-store` · `building.furniture-store` · `building.fast-food` · `building.pier-carnival` · `building.carnival-bigtop` · `building.theme-park` · `building.stadium` |
| Farming and settlement | `building.farm-barn` · `building.farm-house` · `building.farmers-market` · `landscape.orchard-row` · `building.house-suburban` · `landscape.rural-plot` |
| Wild terrain | `landscape.wild-forest` · `landscape.wild-lake` · `landscape.wild-river` · `landscape.wild-desert` · `landscape.wild-jungle` · `landscape.recreational-lake` |
| Transport fleet | `vehicle.fire-truck` · `vehicle.police-van` · `vehicle.police-suv` · `vehicle.police-helicopter` · `vehicle.hearse` · `vehicle.train-cargo` · `vehicle.train-passenger` · `vehicle.plane-small` · `vehicle.plane-medium` · `vehicle.plane-large` · `vehicle.ambulance`, `vehicle.taxi`, `vehicle.bus`, `vehicle.patrol` (covered) |
| Advanced road classes | `road.highway-4` · `road.highway-6` · `road.highway-8` · `road.toll-portal` · `road.country-2` · `road.dirt-road` · `road.one-way-2` · `road.asymmetric-32` · `road.boulevard-tree` · `road.viaduct-elevated` · `road.flyover-ramp` · `road.interchange-double` · `road.rail-track` · `road.runway` · `road.roundabout` |
| Traffic control | `prop.yield-sign` · `prop.stop-sign`, `prop.traffic-signal` (covered) |
| Civic and community anchors | `building.city-hall` · `building.courthouse` · `building.school` · `building.university` · `building.waste-recycling` · `building.substation` |
| Street life and micro-props | `prop.utility-pole` · `prop.utility-box` · `prop.parking-meter` · `prop.vending-machine` · `prop.bicycle-parked` · `prop.playground-set` · `prop.scaffold-section` · `prop.construction-crane` |
| Fauna | `prop.seagull` |

Notes:

- Wild lakes and rivers compose with the seeded hydrology (R048.5) as shoreline, bank, river-bend and vegetation-density modules, not opaque water volumes. Wild terrain stays outside the serviced basin; construction sites still require dry ground.
- Trains and aircraft ride dedicated corridors (`road.rail-track`, `road.runway`, taxiway pads) declared in the route graph, not the lane graph.
- Lane management, traffic-flow dynamics with buildup, and the multimodal NPC/AI/human route network (train, bus, plane, walking) are engine-side behavior owned by R048.16 and R048.17, not asset families; the pack supplies the signs, signals, lane geometry and corridors they run on.
- The civic and street-life families (R051) complete the launch kit's street furniture: `prop.shelter`, `prop.market-stall`, `prop.recreation` (swing frame) and `prop.construction-zone` (cones and barriers) stay covered by launch families, and `arch.bay-corner` serves the corner frontages (R056). The civilian character pack (R049) extends `public/city-assets/characters/` and is not a kit family; building state variants (R056) are state channels over existing families, not new families.

## Asset and assembly contract

- Author geometry in metres with Y up. Declare forward, base pivot, dimensions, tight bounds, collision proxy and allowed transforms. Use a local 0.25 m authoring increment where useful. World placement may rotate freely. Use authored or calculated road-relative sockets.
- Publish a versioned catalog with a stable family ID, generator or source digest, palette slots, semantic tags, compatible socket types, footprint, LOD references and measured costs. Export reproducible GLBs where baking helps. Record source, attribution and license under the existing asset gate.
- Assign variants with a key derived from world seed, recipe version, stable entity or parcel ID and module slot. Iteration order, camera motion and chunk load order must preserve the result. Persist semantic placement and recipe identifiers through the existing edit/state contracts. Art palette choices must not overwrite operator edits.
- Keep separate geometry or material channels for solid façades, glazing, emissive panels and signs. Attach roofs, canopies, stairs and fixtures through declared sockets. Apply material-specific UVs and physically plausible texel scale. Reject unsupported mating sockets, holes in opaque shells, detached windows and overlapping faces.
- Use shared geometry and atlases. Instance repeated modules and vehicle classes. Compare merged geometry and BatchedMesh for heterogeneous static props by chunk. Keep LOD changes and asset eviction local to the affected chunk. Pool materials, textures and moving instances. Keep loading and interior creation out of the hot frame loop.
- Qualify in stages using proposed family caps of 1,200 triangles for building modules, 600 for small props and 2,500 for near vehicles. Keep R028 and R048 aggregate caps authoritative. Measure real draw submissions, composed buildings, active interiors and visible traffic on the reviewed camera routes.

## Asset authoring and validation protocol

Authored kit assets pass the gates below before export. The authoring pipeline runs each check per family and records the report as PR evidence.

- **Transform convention.** Every primitive keeps its mesh centred on the object origin and carries placement in the object transform. Rotations pivot about the part's own centre, never the world origin. This is what keeps parts attached when a part is rotated: wheel axles, gables, door leaves, stringers.
- **Fresh dependency graph.** Blender scripts force a depsgraph update before every join, origin move and measurement. A stale `matrix_world` bakes parts at the wrong position; the pipeline measures and flags instead of silently shipping.
- **Size guards from design intent.** Every family declares expected extents (dx, dy, dz) from its design intent. The exporter measures the built assembly and flags any axis beyond its guard. Guards follow the design intent, not a guess: a two-storey bay curtain is 4.2 m tall, not 3.4 m.
- **Ground contact.** A family's lowest point sits on its ground plane unless the spec declares otherwise. The export pivot is the bottom centre, so the game seats the family by its origin. Geometry that dips below the ground is flagged and fixed.
- **Parts inside the silhouette.** No part extends past the family's declared silhouette: windshields sit in the cabin face, not beside the body; windows sit proud of the wall face, not floating in front of it. Per-part extents are measured during review, not assumed from the assembly bounds.
- **Multi-angle review.** Each stage is reviewed on a non-overlapping review shelf with top and three-quarter renders before export. Overlaps, floaters and detached parts are found in the render and fixed there, not discovered by a reviewer of the code.
- **Full re-export.** A fix re-exports every family it touches. No GLB in the kit predates the last authoring fix. Catalog digests and byte counts are regenerated from the final files.

## Roads, elevation and lots

Derive road mesh, markings, curb, sidewalk, bridge and lane graph from the same versioned 3D alignment. The alignment gives arc length, grade, tangent, lateral offsets and surface height. Swept profiles own ordinary segments. A junction owns the fill and trims incoming segments at a shared boundary. Provide supported transitions for turns, skew merges, drives, parking and bus bays. Encode crosswalk bars in the crossing frame. Each bar runs parallel to vehicle travel, and the bar array spans the carriageway between paired curb ramps.

Generate terrain and hydrology first. Apply a graded corridor to ground roads and retain terrain beneath elevated corridors. A bridge carries its road and pedestrian connections in the graph. An overpass creates no shared routing node unless a ramp connects the decks. Check deck, support, lane, pedestrian and navigation clearance in three dimensions. Reject connections with broken elevation, excessive grade or radius incompatible with the largest allowed vehicle.

Generate lots from the reserved road corridor using polygon frontages and setbacks. Select modules by frontage, depth, slope, permitted use and access. A rotated building's complete envelope must fit its parcel. Check neighboring parcels, road and sidewalk clearance, eaves and canopy projections. Check the whole footprint and support plane against water and grade. Use verified foundations or terraces on slopes. Reserve water crossing for declared structures. Props use verge, sidewalk furnishing, lot or park sockets and must leave pedestrian paths clear.

Vehicle archetypes require wheel/contact anchors, turning envelope, lane and parking compatibility, front/rear lights and scale fixtures. Routes traverse connected lanes and junction movements in three dimensions. Validate departure, merge, stop line, signal phase and arrival. Run in physical metres per real second or documented simulation rates. Use pooling at eligible entrances or destinations and closed routes where useful. No visible reset inside a lane.

## Interior kits

Use building-local sockets for a door threshold, floor, corner, window wall, partition, ceiling and exit. Assemble a room graph from approved archetype recipes and map existing building rooms to reachable spaces. Review civic reception/security, garage, grocery, restaurant, clinic/ward and café. Reuse floor and wall families, doors, shelving, desks, chairs, counters, cabinets, lights and signs. Use specialty props from the screenshot audit as replaceable sets. Keep functional clearance at doors, aisles, service stations and garage bays. A decorative stair has no traversal affordance unless it reaches a valid landing.

Entry must validate the selected building and a matching exterior portal. Load the room assembly on demand and place the camera or avatar at a walkable threshold. Support navigable rooms, collision and a visible exit. Resolve modeled occupants from existing room assignments. Preserve building identity, operator focus and the exterior return location. Selection changes, overview, 2D fallback, reload and context loss need explicit lifecycle tests. Keyboard, pointer and WebMCP must share the view action path. The 2D view must expose room names and entry availability as accessible context.

| Recipe | Distinct modules and review route |
| --- | --- |
| Civic reception/security | Entry → waiting seats → reception and storage → secure partition. Use a counter, workstation, noticeboard and controlled door. |
| Garage | Pedestrian entry → workbench and tool storage → marked service aisle beside the lift. Keep the roller door and vehicle path clear. |
| Grocery | Entry → produce stand and shelving loop → chiller → checkout → exit. Use stacked stock and basket sprites or low-cost geometry at distance. |
| Restaurant | Host counter → selectable dining zone → separate service passage. Include table settings, lighting, signage and an optional reachable stair. |
| Clinic/ward | Reception → exam room → ward. Use beds, curtains, diagnostic carts, waiting seats and medical storage with clear aisles. |
| Café | Entry → display and checkout → seating → exit. Include pastry display, register, beverage equipment, shelf stock and tableware. |

## Authoring and qualification fixtures

Record stable IDs such as `architecture.storefront-bay` and `road.curb-return`, with compatible connector types such as `facade-edge`, `threshold` and `road-edge`. A socket has a local position, tangent, up direction and interface dimensions. Use shared seam samples for swept meshes. Use a proposed 1 cm maximum mismatch for rigid joins in authoring tests. Check adjoining module pairs at mirrored and rotated orientations.

Use the R048 character scale as the review ruler. Draft targets are 2.1–2.4 m doors, 2.8–3.6 m ordinary storeys and a 1.5 m unobstructed sidewalk strip. Exception profiles declare their own dimensions, intended use and review cases. An authored reference scene must include an oblique junction and a grade-separated crossing. Run a connected vehicle route through each road class before tuning density.

Baseline the current and proposed city at matching poses. Keep seed, daylight, camera lens, viewport, quality tier and population fixture in the capture record. Use the screenshot audit as a review rubric. Report first load, repeat traversal and long-open performance separately. A fleet or GPU unavailable on the reference setup leaves its qualification open.

## Island integration and effects

Preserve the large island and natural boundaries. Define a seeded height and water surface with sand beaches, cliffs, rocky shore, reef shallows, delta, river and canal. Include hills, jungle, dry terrain, canyon and snow peaks. Construction requires dry terrain. Place quay and pier modules along real bank or marine sockets. Watercraft follow navigable depth and bridge clearance. An offshore route stays in water throughout its swept envelope.

Use [ez-tree](https://github.com/dgreenheck/ez-tree) to generate seeded tree variants, [threejs-water](https://github.com/jeantimex/threejs-water) for water, and [threejs-fire-pro](https://github.com/dgreenheck/threejs-fire-pro) for incident effects. Record pinned source, license, color match, target renderer, measured cost and lifecycle. Reuse generated tree geometry and materials across instances. Keep a low-tier path for devices that cannot support the effects.

Every city placement comes from the seeded world recipe, including landmarks, housing, vegetation, props and infrastructure. Generate the connected road network before parcels. Every building requires road frontage and a connected pedestrian route before placement. Reject candidates that cross water, overlap reserved corridors or intersect another asset. Stable IDs and operator edits survive deterministic regeneration.

Fire Pro requires WebGPU. Its compatibility spike must account for the existing WebGL city and qualify an independent fallback. Use incident markers or pooled lightweight particles on that path. Tree and water experiments must preserve the city palette and the same deterministic placement or water boundaries.
