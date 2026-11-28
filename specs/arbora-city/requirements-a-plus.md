# OVERSTORY-CITY A+ — Gap analysis and specification

**Created:** 2026-11-27
**Purpose:** This document maps the gap between the current B-grade implementation (R001–R100) and an A+ "Cities: Skylines 2 / SimCity-class" experience. Every gap item references an existing requirement row and specifies what additional depth, integration, or polish is needed.

---

## Executive Summary

The city's economic engine (R069–R100) has grown to a 20-step co-simulation loop with typed jobs, production chains, migration, transit, weather, growth archetypes, character spawning, and visual overlays. The architecture is solid and the tests pass. **What remains is not more rows — it is depth, integration, and lived-in presence.**

The five gap categories below describe what separates B from A+:

| Gap | What's missing | Why it matters |
|-----|----------------|----------------|
| **1. Visible cause-and-effect** | Economic state → visual world change → feedback. The loop is model-deep but world-shallow. | Players can't *see* their economy at work. Demand gates growth in the model, but the visual world doesn't reliably reflect it. |
| **2. Traffic/road integration** | Vehicles actually move on the road graph with economy-driven density. Congestion is a float, not vehicle count. | Traffic in a city sim is not a number — it's vehicles on roads. The game feels empty when movement is purely cosmetic. |
| **3. Character life** | Characters are spawned and scheduled, but they don't shop, commute, or interact with economy-built buildings. | A city of static NPCs with mood scores isn't alive. Characters must move, choose, and affect the world. |
| **4. Player consequence** | Tax, budget, zoning, and policy controls exist as APIs but don't have delayed visible effects. | City-builder players need to see the consequences of their decisions — slowly, visibly, and unambiguously. |
| **5. Evidence** | No performance soak, no visual proof, no PR body update with evidence of closed-loop growth. | Without evidence, every claim is just words. The spec is only as strong as the proof. |

---

## Gap 1: Visible Cause-and-Effect (Demand → World → Feedback)

### 1.1 Demand-driven window lights (extends R066, R079)

**Current:** R066 drives window emissives from the activity schedule (R050). Buildings have occupancy windows based on the time-of-day and the building's scheduled function.

**A+ requirement:** Window lighting must also reflect the economic state. A building placed by the economy's growth engine should have dim/erratic lights initially (new construction period), transition to full occupancy when it reaches maturity, and dim/revert when decay kicks in from under-funding. The same building on the same lot should look different at different economic moments — not just different times of day.

**Why:** In a real city sim, new buildings don't immediately look inhabited. A+ requires that economic health is visible through the windows, not just through a heatmap overlay.

**Specification:**
- Add an `occupancyState` field to `Building`: `'vacant' | 'construction' | 'new' | 'mature' | 'declining' | 'abandoned'`.
- `completeConstruction` sets it to `'new'` (70% lit windows, sparse occupancy).
- After `fresh` ticks → `'mature'` (full occupancy pattern).
- When decay starts (under-funding, low land value) → `'declining'` (30% lit).
- When demolished → `'abandoned'` then removed (dark, broken windows).
- The window-emissive resolver reads `occupancyState` as a second factor alongside time-of-day: `litProbability = baseSchedule × occupancyMultiplier`.
- The 2D overlay also shows occupancy: a dim building icon in the growth overlay means economic trouble.

### 1.2 Demand markers on empty lots (extends R070, R079)

**Current:** Growth placement checks demand, creates a construction state, and debits the treasury. The growth overlay shows which zones have demand.

**A+ requirement:** When demand exceeds the threshold but construction is prevented (insufficient treasury, no empty lots, wrong zoning), the empty lot should display a visible "planned" or "demand marker" — a ghost building outline with a zone-color filter. When construction begins, the marker transitions to scaffolding. When construction completes, it vanishes. This gives the player a direct visual chain: **demand → planned → building**.

**Why:** A+ requires that the player can look at an empty lot and know *why* it's empty (no demand, no money, wrong zone?) and *what would go there* if conditions changed.

**Specification:**
- Extend `Plot` with `demandMarker?: { zoneType: string; demand: number }`.
- `tickDemandTick` sets the marker on empty lots in under-supplied zones.
- `tryGrowthPlacements` clears the marker when it converts to construction.
- Render3d: the marker is a low-opacity ghost building (same height as the archetype) rendered above empty plots.
- Render2d: the marker shows as a colored outline on the lot.
- The 2D growth overlay adds a "demand" layer showing lots with pending demand.

### 1.3 Economic state → building color/texture (extends R056, R079)

**Current:** Buildings have a fixed `color` based on zone type (green=residential, blue=commercial, orange=industrial). The decay state (R056) affects building state variants.

**A+ requirement:** A building's visual state should be a continuous function of its economic health, not just a step function. A building in distress should progressively show visual cues: paint fading, cracks, flickering lights, scaffolding. A thriving building should show upgrades: better materials, additional floors, decorative elements. This is the visual encoding of the economic state.

**Why:** The encoding table (R025) maps visual properties to facts. A building's appearance should encode its economic health — a fact the player can read at a glance without opening an inspector.

**Specification:**
- The `Building` interface gets an `economicHealth` field (0–1), updated by the economy tick.
- Visual encoding: 0.8–1.0 = pristine (full material, bright), 0.5–0.8 = worn, 0.2–0.5 = run-down, <0.2 = abandoned.
- The building renderer adjusts material roughness, emissive intensity, and adds crack/decay overlays based on `economicHealth`.
- The 2D overlay shows a color gradient from green (healthy) to red (unhealthy) on buildings.

---

## Gap 2: Traffic/Road Integration (Economy → Vehicles → Roads → Congestion)

### 2.1 Economy-driven vehicle generation (extends R094, R048.16)

**Current:** R094 defines traffic density from economic state — commercial districts add vehicles, industrial adds freight, construction adds construction vehicles. The traffic module has the density model.

**A+ requirement:** The vehicles must actually move on the road graph with economy-driven density. The traffic fleet in `render3d/traffic.ts` currently renders ambient vehicles that follow simple routes. A+ requires:

- **Route generation from economy:** Each tick, the economy generates a specific number of vehicles for each type (commuter, commercial, freight, construction). These vehicles are assigned to routes through the road graph via lane-aware BFS (R064).
- **Route duration from economy:** A commercial vehicle's route duration depends on the commercial district's income — higher income = more destinations = longer routes.
- **Fleet visibility:** Vehicles carry a color and type that reflects the economy: commuter vehicles (blue, heading to work districts), freight trucks (orange, heading to industrial zones), construction vehicles (yellow, heading to construction sites).

**Why:** Traffic is not a density number — it's vehicles on roads. A city sim without visible traffic is a diorama.

**Specification:**
- The economy tick emits a `traffic.fleet` event with the count and types of vehicles to generate.
- `trafficFromEconomy()` in `traffic.ts` generates route assignments for each vehicle using the road graph.
- The `TrafficFleet` interface tracks each vehicle's route, position, destination, and type.
- Vehicles that reach their destination are removed (or loop for a new route).
- Each vehicle carries a provenance type: `commuter`, `commercial`, `freight`, `construction`, `transit`.

### 2.2 Real congestion from vehicle count (extends R085, R075)

**Current:** R085 describes congestion from actual traffic simulation, but the implementation uses a congestion float per district that is read from the economy model.

**A+ requirement:** Congestion must be computed from the actual vehicle count on each road edge, not a model float. Each road edge tracks vehicle count vs. capacity:

```
congestion[edge] = min(1.0, vehicleCount[edge] / capacity[edge])
```

This edge-level congestion feeds into the economy:
- Commercial blocks adjacent to congested edges lose income.
- Service vehicles on congested edges move slower (reducing effective coverage radius).
- Construction on congested edges takes longer (prolonged scaffolding).

**Why:** A+ requires that congestion is an emergent property of the road graph, not a model variable. The player should be able to look at a road and see congestion — and understand *why* it's congested (too many vehicles, a bottleneck, a narrow road).

**Specification:**
- `RoadEdge` gets a `vehicles: number[]` array tracking vehicles currently on that edge.
- The traffic tick moves vehicles along edges; vehicles that reach their destination are removed.
- `computeCongestion()` computes congestion per edge from vehicle counts and lane count.
- `tickCongestionRead()` in economy.ts reads the edge-level congestion and maps it to district-level congestion via adjacency.
- The congestion overlay (R096) renders edge-level congestion on the road lines, not district-level blobs.

### 2.3 Goods vehicles on the road network (extends R074, R090)

**Current:** Production chains (R090) compute goods matching between industrial producers and commercial consumers. Goods prices (R082) respond to supply/demand ratios. But goods don't physically move through the road network as visible vehicles.

**A+ requirement:** When a commercial building's goods needs are unmet (R090), a freight vehicle is generated and assigned a route from the nearest industrial producer to the commercial consumer. The vehicle travels on the road graph and, upon arrival, reduces the commercial building's shortage and adds to the city's inventory. Unmet demand generates more vehicles; met demand generates fewer. This creates a visible feedback loop: **production shortage → more trucks on road → less shortage → fewer trucks**.

**Why:** This is the signature of a city sim — the flow of goods creates visible traffic that in turn creates congestion that affects production. The loop is closed when the player can see a truck stuck in traffic and know it's carrying goods their factories need.

**Specification:**
- When a commercial building has unmet goods needs, `tryGenerateGoodsVehicle()` creates a freight vehicle.
- The vehicle's origin is the nearest industrial building (by road distance).
- The destination is the commercial building with the unmet need.
- The route is computed via lane-aware BFS on the road graph.
- The vehicle carries a `goodsType` field.
- On arrival, the vehicle's goods are delivered (inventory increases, unmet needs decrease).
- The visual rendering shows freight trucks (larger vehicles, orange color) following these routes.

---

## Gap 3: Character Life (Population → Behavior → City Presence)

### 3.1 Commuting on the road graph (extends R093, R050)

**Current:** Characters have schedules (R050) and state machines (R006). Characters travel to buildings, work, and commit. But characters spawned from the economy don't actually commute — they are placed on the map but don't walk between their home and workplace on the road graph.

**A+ requirement:** Economy-spawned characters must:
1. Walk from their `homePlot` to their `workPlot` (for employed characters) or to a commercial building (for unemployed characters shopping) on the road graph.
2. Use the pathfinding system (`layout.ts`'s `findPath`) to navigate.
3. Show visible travel time (not teleport).
4. Return home at night (R009).

**Why:** A city of static NPCs is a diorama. Characters walking to work at 8 AM, shopping at noon, and going home at 6 PM is a city.

**Specification:**
- Each `Character` gets a `workBuilding` field (set when the character is assigned a job by the economy's jobs tick).
- When a character's state transitions to `commuting`, they use `findPath(homePlot, workPlot)` to get a route.
- The character walks along the route at a defined speed (2 m/s).
- The character's state machine accepts a `commuting` intermediate state between `idle` and `working`.
- At night, commuting characters are sent home — the schedule overrides the activity.
- The path visual in render3d is shown as a faint line from the character to the destination.

### 3.2 Commercial foot traffic (extends R093)

**Current:** Characters in commercial buildings generate a small positive modifier to commercial income (R092/093). But characters don't actually walk to commercial buildings — the modifier is a float on the district, not a visible behavior.

**A+ requirement:** Employed characters should walk to commercial buildings during commercial hours (08:00–20:00) and spend time there. Each character at a commercial building generates a "foot traffic" count that is visible in the inspector. A building with 50 visitors generates 5× the income modifier of one with 10 visitors. The modifier is capped to prevent infinite scaling.

**Why:** Foot traffic is the visible evidence that the economy's jobs are real — people are physically moving to where they work and spend money.

**Specification:**
- During commercial hours, employed characters periodically choose a commercial building in their district to visit.
- The character walks there via `findPath`.
- At the building, the character stays for a duration (3–8 minutes), generating foot traffic.
- The building tracks a `footTraffic` counter (active visitors).
- The economy tick computes income bonus from foot traffic: `bonus = min(1.5, 1 + footTraffic / 200)`.
- The building's rendering shows a small "crowd" indicator when foot traffic is high.
- Unemployed characters have a reduced visit rate (they visit less frequently due to lower disposable income).

### 3.3 Street-level density (extends R057, R093)

**Current:** Character presence affects the city but not at street level. Characters are on the map but don't create a sense of crowd density.

**A+ requirement:** The density of characters on the street at any moment should be visible. In high-density areas (commercial cores, transit hubs), characters should be clustered. In low-density areas (industrial periphery), characters should be sparse. This density should correlate with the district's population and economic activity.

**Why:** A+ requires that a city "breathes" — you should be able to look at a street and know if it's a busy commercial area or a quiet industrial zone, purely from the character density.

**Specification:**
- Characters are placed near their destination with a small random offset (within 5m of the target).
- At transit hubs, commercial cores, and district centers, characters from different destinations cluster.
- In industrial zones, characters are spread out near their work buildings.
- At night, character density drops across the city (characters go home).
- The 2D view shows a density gradient — populated areas have more character icons.
- The overlay canvas (R096) can show a "pedestrian density" heatmap.

### 3.4 Economic mood → visible behavior (extends R093)

**Current:** Characters have an `economicMood` field that reflects economic conditions. But mood is not expressed through visible behavior — it's a hidden stat.

**A+ requirement:** Economic mood should be expressed through character behavior:
- High mood → normal walking speed, frequent commercial visits, occasional idle animations (standing in groups, chatting).
- Low mood → slower walking, longer idle periods at home, reduced commercial visits.
- Very low mood → characters may leave the city (migrating out).

**Why:** A city's mood should be visible in the street. When the economy is bad, the streets should look emptier and slower.

**Specification:**
- `economicMood` maps to `walkSpeedMultiplier`: 0.8–1.2 based on mood.
- `idleBehavior` changes: high mood = random stroll, low mood = stay at home.
- Characters with mood < 0.2 for 3+ ticks have a probability of migrating (being removed).
- The character's color slightly shifts: brighter for high mood, desaturated for low mood (very subtle, 10% variation).

---

## Gap 4: Player Consequence (Decisions → Visible Effects → Feedback)

### 4.1 Tax policy → visible economic trajectory (extends R083)

**Current:** Tax rate controls exist in the economy model. Changing a tax rate affects the next tick's revenue. But there is no visible feedback showing the player the delayed consequences of their policy decisions.

**A+ requirement:** When the player changes a tax rate, the city must show the consequences through a visible trajectory:
1. **Immediate effect:** The treasury panel updates with the new projected revenue.
2. **Short-term effect (1–3 ticks):** Commercial buildings in the zone show slightly reduced income (visible in the inspector).
3. **Medium-term effect (5–10 ticks):** If taxes are high enough, commercial buildings start decaying, construction stops, and new buildings fail to appear.
4. **Long-term effect (20+ ticks):** The district's land value drops, population migrates out, and the district looks visibly worse (run-down buildings, fewer characters, dimmer windows).

**Why:** A city-builder player needs to see the *delayed* consequences of their decisions. If tax changes have only an immediate treasury update, the player can't learn the policy's effect.

**Specification:**
- The UI shows a "policy impact" timeline: each tax change is recorded with its timestamp and value.
- After each tick, the treasury panel shows the delta compared to the previous tick.
- After 3+ ticks, the inspector shows "since tax change at tick X: income -12%, population -3%".
- Buildings affected by high taxes get a subtle visual marker (a small tax flag icon in the 2D view).
- The 2D economic overlay can show a "tax impact" layer — lots affected by high tax rates are tinted.

### 4.2 Zoning tools with preview and consequence (extends R098, R087)

**Current:** R098 specifies zoning tools but the implementation is deferred. The edit layer (R040) handles layout overrides but doesn't have zoning tools.

**A+ requirement:** The zoning tool must:
1. Allow the player to paint zones on the map (residential, commercial, industrial, mixed-use).
2. Show a **preview** before committing — ghost buildings appear on painted lots showing what will be built.
3. Emit a `zoning.changed` event when committed.
4. Affect growth placement immediately on the next tick.
5. Affect land value on the next tick.
6. Show a **consequence** timeline — the player can undo the zoning and see that the city reverts (or doesn't, if buildings have already been constructed).

**Why:** A zoning tool without preview or consequence is just a color change. A+ requires that the player can see what their zone choice will produce, commit, and then watch the city respond.

**Specification:**
- The edit layer gets a `zone` field per plot: `'residential' | 'commercial' | 'industrial' | 'mixed' | null`.
- When the player selects the zoning tool and clicks on a lot, the lot displays a ghost building preview (based on the zone type and the catalog).
- On commit, the lot's zone policy is updated and `tryGrowthPlacements` respects it.
- The preview vanishes when the actual building is constructed.
- The zoning overlay (R087) is switchable and shows zone colors on all lots.
- Undo restores the previous zone policy and any unconstructed ghost previews.

### 4.3 Service budget → visible coverage (extends R081, R097)

**Current:** Service networks have coverage radii and capacity. Under-funding stops production and causes coverage collapse. But the player cannot easily see which lots are covered and which are not.

**A+ requirement:** The service coverage overlay (R096) must be a clear, interactive view where:
- Covered lots glow green.
- Uncovered lots glow red (with a pulsing animation).
- The player can click on a service building and see its coverage radius.
- The budget panel shows how much each service costs and what fraction of the budget is allocated.
- When a service is underfunded, the corresponding district's coverage radius visibly shrinks on the overlay.

**Why:** A+ requires that the player can diagnose service problems by looking at the overlay — not by opening the inspector for every building.

**Specification:**
- The service coverage overlay renders concentric circles on each service building showing its effective radius.
- Uncovered lots within the city boundary pulse red.
- When a service building is underfunded, its radius shrinks and the previously covered lots that are now uncovered pulse red.
- The budget panel shows a per-service breakdown: cost, budget %, coverage %, population affected.
- Hovering over a service building in the 2D view shows its stats.

### 4.4 Construction cost → treasury feedback (extends R076, R086)

**Current:** Buildings have construction costs that debit the treasury. Maintenance accrues per tick. Under-funding causes decay. But the treasury doesn't show upcoming obligations or give the player a projection.

**A+ requirement:** The treasury panel must show:
1. **Upcoming obligations:** A list of buildings whose maintenance is due in the next N ticks.
2. **Projected balance:** Based on current revenue and expense rates, what the treasury will be in 10, 20, 50 ticks.
3. **Construction affordability:** When growth placement is attempted, the player sees whether the treasury can afford it. If not, a visible "construction deferred" event explains why.
4. **Maintenance priority:** When the treasury can't cover all maintenance, the panel shows which building is at risk of decay (lowest land-value contribution).

**Why:** A+ requires the player to be able to plan — to know what the city can afford and what will happen if they can't pay.

**Specification:**
- The treasury panel shows a mini-chart of projected balance over the next 50 ticks.
- Each tick, a "maintenance due" list is updated.
- When under-funding is detected, the panel highlights the building(s) at risk and explains the choice.
- The "deferred" event in the feed reads: "Construction of {building} deferred: treasury {amount} short".
- The growth overlay shows deferred placements with a dollar-sign icon.

---

## Gap 5: Evidence (Performance, Visual, Test)

### 5.1 Performance soak with economic activity

**Current:** The soak test (sceneSoak.test.ts) measures 10-minute idle stability. It does not include economic activity.

**A+ requirement:** A soak test that runs the economic engine continuously for 60+ ticks (5+ in-game hours) and measures:
- Steady-state FPS (no drift, no leak).
- Memory growth rate (should be <1 MB/hour for the city app).
- Economy tick duration (should be <10ms at steady state, <50ms on construction placement).
- Character count growth stability (should not grow without bound).
- Road graph query latency (should not grow as the city grows).

**Why:** A+ requires that the city sim can run for a long time without degrading. The economic engine adds continuous computation — it must not cause a memory leak or CPU growth.

### 5.2 Visual proof of closed-loop growth

**Current:** The PR body is the old draft. No visual proof of closed-loop growth exists.

**A+ requirement:** Evidence images showing:
1. A demand marker on an empty lot → growth placement → scaffolding → building completed → characters spawned at the building.
2. A district with high commercial demand → commercial buildings placed → characters visiting → high foot traffic → income increase → more demand.
3. A district with high tax rate → reduced income → building decay → dim windows → population loss → lower demand.
4. A goods shortage → freight vehicles on the road → delivery → shortage resolved → fewer vehicles.

**Why:** A+ requires that the spec's claims are demonstrated visually. Screenshots or short videos of the closed-loop growth in action are the strongest evidence.

### 5.3 Integration tests for the full loop

**Current:** economy.test.ts has 71 tests covering individual tick functions. But there are no integration tests that verify the full closed loop: economy → visual world → economy feedback.

**A+ requirement:** Integration tests that verify:
1. **Demand → construction → characters → income → demand:** A commercial demand spike produces a commercial building, spawns characters, generates foot traffic, increases income, and further increases demand.
2. **Tax increase → decay → population loss → demand drop:** Raising commercial tax to 35% causes commercial buildings to decay over 10 ticks, reducing population and demand.
3. **Goods shortage → vehicle generation → delivery → resolution:** A production halt generates freight vehicles that deliver goods, resolving the shortage over time.
4. **Service under-funding → coverage collapse → happiness drop → migration:** Stopping fire service funding causes coverage to collapse, happiness drops, and population migrates out.

---

## Summary: What's Implemented vs What's Needed for A+

| Area | Current (B) | Needed for A+ | Complexity |
|------|-------------|---------------|------------|
| Economic model | 20-step loop, typed jobs, production chains, migration, transit, weather | **Model is complete** | ✅ Done |
| Growth placement | Archetypes, scaffolding, construction states | **→ Visual world:** ghost buildings, demand markers, occupancy states | Medium |
| Character spawning | Base 15, scale with population, cap 200 | **→ Behavior:** commute, shop, cluster, mood-expressed behavior | High |
| Traffic model | Density float per district | **→ Vehicles on graph:** freight, commuter, construction routes | High |
| Congestion | Float per district from economy model | **→ Edge-level:** vehicle count → congestion → economic feedback | Medium |
| Goods flow | Production chains, price signals | **→ Physical goods vehicles** moving on the road network | Medium |
| Visual overlays | 5 overlays (RCI, service, congestion, land value, decay) | **→ Demand markers, occupancy state, density heatmap** | Low |
| Player controls | Tax/budget APIs, RCI panel | **→ Full UI, preview, consequence timeline** | Medium |
| Zoning tools | Not implemented | **→ Paint zones, preview buildings, undo** | Medium |
| Evidence | No visual proof, no economic soak | **→ Soak test, screenshots, integration tests** | Low |

**Total new rows needed: ~15** (not 50+). The existing 132 rows (R001–R100, T001–T160) provide the architecture. The remaining work is depth: making the model visible, making the visible matter, and proving it works.
