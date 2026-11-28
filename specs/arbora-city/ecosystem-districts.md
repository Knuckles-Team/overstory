# Ecosystem landmarks and road-led districts

This design extends the [modular asset pack](asset-pack.md). R035–R040 govern semantic mapping, graph relationships, traffic, memory, growth and operator edits. R048.7 and R048.8 define the corresponding asset and placement requirements.

## Specialized places

Each landmark has its own exterior silhouette, street frontage and room program. Recipe keys map to capabilities through the existing registry. Assets use shared construction sockets and named specialty modules. The catalog counts the specialty modules separately from the 66 base exterior families.

| Place | Exterior pieces and placement | Interior pieces and interactions |
| --- | --- | --- |
| Arbora gateway | Civic square, covered arrival portal, checkpoint bays and directory canopy. Put its entrance on a public collector with links to civic and service districts. | Admission counters, registry directories, protocol service desks and a hosting gallery. Show admitted service or catalog facts when available. |
| Medulla Hall of Records | Recessed archive portal, reading-room skylights, archive wing and stack-floor modules. Give the public entrance a quiet plaza and separate service frontage. | Catalog desk, graph table, RDF and SQL study bays, document shelves, vector drawers, media cabinets, time-series gallery and evidence/provenance alcove. Map recall to a clerk route and archive expansion to R038. |
| Meristem run works | Repeating workshop bays, dispatch canopy and branching circulation courts. Give the campus pedestrian and service access. | Run-loop floor, context workstations, fan-out bays, sandbox booths, replay theater and trace wall. Show stage transitions from the existing run projection. |
| Overstory exchange | Terraced operator building with glazed galleries, shaded forum and a plaza connected to the gateway. | Conversations booths, approvals desk, tool-activity board and graph gallery. Reach existing workspace views through admitted actions. |
| Scion interchange | Loading canopy, transfer platforms and service yard. Use a quay module only where the parcel has navigable waterfront. | Identity checkpoint, discovery directory, sync conveyor, replay station and write-back counter. Show transfer state from the existing connector contract. |
| Tuig terminal kiosk | Compact shaded kiosk facing a sidewalk, plaza or transit stop. | Terminal desks, session indicator and REST status boards. |
| Axil cockpit pavilion | Smaller operator pavilion with a shaded entry and direct pedestrian access. | Specialist desks, embedded terminal bays and approvals room. |

Medulla's rooms represent kinds of storage, queries and evidence. The scene must derive displayed counts and events from fields admitted for the current view. Real placement, size or activity must never imply an unpublished or private record. A missing provider field has an unavailable state. The demo uses labeled synthetic memory. Reuse its shelf, drawer and catalog modules across wings while preserving each modality's distinct furnishing and readable label.

## Connector recipe families

Select a recipe by admitted connector category and capabilities. Connector ID supplies stable variation and placement identity. Apply a generic service storefront when category is unknown. A registered, unpublished connector can show a reserved plot or construction state. Its placeholder must preserve the connector's lifecycle and must not depict served activity.

| Family | Outside | Inside and access |
| --- | --- | --- |
| Communications and schedules | Post or dispatch hall with queues, signs and curb loading | Sorting stations, messaging booths and timetable wall. Place at neighborhood centers or transit corridors. |
| Documents and storage | Archive storefront or depot with loading bay | Intake, archive shelves, scanning desks and loading aisle. Use a service entrance on larger lots. |
| Data and analytics | Data utility hall with service panels and rooftop cooling | Rack aisles, query room and display tables. Use an authorized activity indicator in the relevant room. |
| Development and operations | Fabrication workshop with roller doors and delivery yard | Workbench, build bays and run status board. Align loading access to a service street. |
| Media | Studio with a lit marqueelike entrance and soundstage volume | Edit desks, production floor and equipment storage. Keep public and loading paths distinct. |
| Security | Civic inspection station with controlled service frontage | Reception, review workstations and evidence lockers. Present only admitted facts about approvals and audits. |
| Home, commerce and general services | Small shop, civic counter or service garage | Reception and capability-specific room. Use placards for details the admitted catalog establishes. |

Each recipe declares exterior modules, room graph, semantic slots, required frontage types, public and service portals, and a minimum parcel envelope. A venue may contribute multiple buildings when it needs distinct entrances or servicing. Keep stable identity across phase changes, relocations, LODs and exterior/interior transitions. Selection and WebMCP must resolve the same place and room identifiers.

## Road data and ownership

Maintain one physical road graph. A node has a stable ID, 3D position, level and junction kind. An edge has endpoint IDs, ordered 3D control points, profile ID, direction, structure type and provenance. Profiles declare lanes, width, sidewalks, verge, grade and vehicle turning constraints. Edges may carry several semantic link references. Physical local access edges have explicit generated or user-authored provenance.

Resolve served relationships into demand for connections under R036. Route compatible demands over shared corridors. Preserve each relationship's identity for inspection even when it shares a street. A traversable lane can serve several relationships. A lane connection must come from its physical junction or ramp. A projected cross-domain link must fit terrain and clearance before becoming a bridge. Keep a relationship inspectable when no safe route exists.

## From graph to street to assets

1. **Reserve terrain and anchors.** Sample elevation, water, flood margin and protected land. Reserve ports, gateway plazas, service yards and pinned sites from the existing edit layer. Keep stable per-area seeds and generation versions.
2. **Route the trunk network.** Connect important gateway, district and harbor anchors first. Score candidate corridors by distance, grade, curvature, water crossing, cut/fill and conflicts. Prefer usable existing corridors. Use a cost-grid search followed by curve fitting as the initial algorithm. Revalidate the fitted curve and the full corridor width.
3. **Grow collectors and local streets.** Branch from compatible trunk stations. Extend toward valid land and existing frontage demand. Prefer a loop when a second connection fits. For a cul-de-sac, require a legal turnaround for the design vehicle. Keep civic grids where useful and follow contours or shore bends elsewhere. Limit attempts and report an unserved district when the constraints prevent access.
4. **Resolve levels and junctions.** Split graph edges at validated at-grade joins. Retain independent levels at grade-separated crossings. Choose ground, bridge or elevated profiles before deriving lane connectors. Add footpaths, sidewalks and crossings to a pedestrian graph. Confirm access for every planned entrance.
5. **Build the corridor model.** Sample each alignment by arc length. Use one position/tangent/up frame for lane centerlines, markings, curb edges, sidewalks, frontage and bridge deck. Cut segment surfaces at junction boundaries. Clip or reserve clearances at crossings, ramps and sight lines.
6. **Create frontage lots.** Offset the reserved corridor by its curb, verge and sidewalk widths. Trace usable block polygons. On open roads, form local bands from buildable land along eligible edges. Split by frontage width and depth. Clip to terrain and existing reservations. Remove slivers and parcels with no safe frontage or access.
7. **Place buildings and roadside kit.** Choose recipes that match lot use, size, grade and access. Place the primary portal facing the frontage tangent. Connect it to the pedestrian graph. Add driveway, loading and transit sockets according to the profile. Fit foundations to grade. Refuse footprints, roof projections, vegetation and utility placements that violate the reserved envelopes.
8. **Validate and publish together.** Validate the road, lane, crossing, parcel and access graphs as one candidate. Publish geometry, routes and asset placements at the same revision. On refusal, retain the previous valid result and report the conflicting IDs and rule.

## Placement and regeneration contracts

- A roadside socket stores edge ID, side, station in metres, lateral offset and surface reference. A stop needs a connected lane, a stop position, a shelter pad and an unobstructed pedestrian route. Put the sign and shelter outside the clear path.
- Hydrants, bins, lamps and trees belong in the furnishing or verge strip. Spacing rules must exclude crossing ramps, junction sight envelopes, loading areas and driveway sweeps. Corner props use junction sockets. Deck fixtures use deck height. Ground lots use site elevation.
- Fit façades to frontage and entrances to the connected sidewalk. A gap between a door and walkable surface prevents occupancy. Keep parking access separate where the road profile calls for it. Attach fuel and loading movements to valid lane connectors.
- An edit invalidates affected alignments, junctions and their adjacent lots. Revalidate neighbors when a changed envelope crosses a tile boundary. Preserve pinned placements and unaffected IDs. Preview conflicts, then refuse any edit that would strand an occupied or pinned site without an accepted relocation.
- Store recipe IDs, transforms, socket references and decision-rule versions as needed for reproducibility. Use the existing layout and served-state seams. Keep generated scenery and physical access distinct from served facts by provenance. Loading order must not change geometry or recorded meanings.

## Reference acceptance scene

An oblique collector leaves Arbora's plaza, passes Overstory, and branches onto a quieter Medulla frontage. A service lane reaches the Meristem campus and a connector loading yard. A transit stop sits beside the collector. A bridge crosses a canal to Scion, with a separate service route passing under the elevated approach. Verify the rendered grades, access paths, shore clearance, inspector and semantic provenance. Enter the Hall of Records, route to the relevant modality, leave through the same portal and inspect a second connector recipe.
