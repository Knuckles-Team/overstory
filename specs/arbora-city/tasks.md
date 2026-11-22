# OVERSTORY-CITY tasks

Governing spec: [spec.md](spec.md). Design: [plan.md](plan.md). Rows: [requirements.md](requirements.md).

Producer first: the fleet seam (R003) and the world producers (R002, R004, R005) land before the simulation that consumes them, and the page shell (R001, R014, R016) lands last. Follow-on rows (R019–R024) are specified, not scheduled for this delivery. The 2026-11-17 review amendments (T025–T038) land after the v1 foundation: the encoding table and renderer split first, then the host-cache amendment, the sim amendments (state machine, provenance, PRNG, quiet/demo, replay), the accessibility work, and the tour last. The 2026-11-18 re-review amendments (T042–T053) land in this delivery with the R031–R033 rebuild (T039–T041): the host read first (T042), then the sim amendments (T045, T052, T053), the renderers and the fidelity harness (T043–T044, T046–T051).

- [x] T001 OVERSTORY-CITY-R002 Fleet-driven connector district. Touches `src/apps/city/core/ecosystem.ts`, `src/apps/city/core/layout.ts`.
- [x] T002 OVERSTORY-CITY-R004 Seven core landmarks. Touches `src/apps/city/core/ecosystem.ts`.
- [x] T003 OVERSTORY-CITY-R005 Pinned character population. Touches `public/city-assets/`, `src/apps/city/core/ecosystem.ts`, `src/apps/city/core/sim.ts`.
- [x] T004 OVERSTORY-CITY-R013 Pinned asset verification. Touches `src/apps/city/core/assets.ts`, `src/apps/city/components/CityPage.tsx`.
- [x] T005 OVERSTORY-CITY-R010 Typed event bus. Touches `src/apps/city/core/events.ts`.
- [x] T006 OVERSTORY-CITY-R006 Agent lifecycle in the simulation. Touches `src/apps/city/core/sim.ts`.
- [x] T007 OVERSTORY-CITY-R007 Human operator behavior. Touches `src/apps/city/core/sim.ts`.
- [x] T008 OVERSTORY-CITY-R008 Connector construction and publication. Touches `src/apps/city/core/sim.ts`.
- [x] T009 OVERSTORY-CITY-R009 Day/night cycle. Touches `src/apps/city/core/sim.ts`, `src/apps/city/core/render3d.ts`.
- [x] T010 OVERSTORY-CITY-R011 Selection and inspector. Touches `src/apps/city/core/render3d.ts`, `src/apps/city/core/render2d.ts`, `src/apps/city/core/ui.ts`.
- [x] T011 OVERSTORY-CITY-R012 Speed control and population list. Touches `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [x] T012 OVERSTORY-CITY-R015 2D schematic fallback. Touches `src/apps/city/core/render2d.ts`.
- [x] T013 OVERSTORY-CITY-R003 Live fleet through the host. Touches `agent/overstory/apps/city/`, `agent/overstory/apps/__init__.py`.
- [x] T014 OVERSTORY-CITY-R014 Mode: live fleet, simulated fallback. Touches `src/apps/city/components/CityPage.tsx`, `src/apps/city/core/ui.ts`.
- [x] T015 OVERSTORY-CITY-R016 Lazy and lightweight. Touches `src/apps/city/routes.ts` (lazy element; `three` is already a locked dependency on main).
- [x] T016 OVERSTORY-CITY-R001 City AppSurface and route wiring. Touches `src/apps/city/surface.ts`, `src/apps/index.ts`.
- [x] T017 OVERSTORY-CITY-R017 No credentials or identities in the browser. Touches `agent/overstory/apps/city/gateway.py`.
- [x] T018 OVERSTORY-CITY-R018 Unmount safety. Touches `src/apps/city/components/CityPage.tsx`.
- [ ] T019 OVERSTORY-CITY-R019 Follow-on: enterable buildings and first-person exterior (no v1 code).
- [ ] T020 OVERSTORY-CITY-R020 Follow-on: live ecosystem mirroring (no v1 code).
- [ ] T021 OVERSTORY-CITY-R021 Follow-on: Medulla-backed world layout (no v1 code).
- [ ] T022 OVERSTORY-CITY-R022 Follow-on: prompt-driven NPC dialogue (no v1 code).
- [ ] T023 OVERSTORY-CITY-R023 Follow-on: human visitor presence (no v1 code).
- [ ] T024 OVERSTORY-CITY-R024 Follow-on: asset scale-out through provenance (no v1 code).
- [x] T025 OVERSTORY-CITY-R025 Visual encoding table and HUD legend; split `render3d.ts` into the `render3d/` modules (scene, labels, buildings, characters, picking) behind the facade. Touches `src/apps/city/core/encoding.ts`, `src/apps/city/core/render3d/`, `src/apps/city/core/render2d.ts`, `src/apps/city/core/ui.ts`.
- [x] T026 OVERSTORY-CITY-R026 Quiet-by-default activity with the labelled demo mode. Touches `src/apps/city/core/sim.ts`, `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [x] T027 OVERSTORY-CITY-R027 Keyboard accessibility for the population list, inspector, modal and the 3D/2D toggle. Touches `src/apps/city/components/CityPage.tsx`, `src/apps/city/core/ui.ts`.
- [x] T028 OVERSTORY-CITY-R028 Performance budgets as acceptance criteria, checked in tests against the bundled snapshot. Touches `src/apps/city/core/budgets.ts`, `src/apps/city/__tests__/`.
- [x] T029 OVERSTORY-CITY-R029 Time scrubber and deterministic replay of recorded operator actions. Touches `src/apps/city/core/sim.ts`, `src/apps/city/core/replay.ts`, `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [x] T030 OVERSTORY-CITY-R030 First-visit tour and always-available legend. Touches `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [x] T031 OVERSTORY-CITY-R003 Amendment: principal- and tenant-scoped fleet cache, single-flight cold read, bounded concurrent fan-out with per-call timeout. Touches `agent/overstory/apps/city/gateway.py`, `agent/overstory/__tests__/test_city_app.py`.
- [x] T032 OVERSTORY-CITY-R002 Amendment: domain-grouped district placement with the core landmarks at the centre. Touches `src/apps/city/core/ecosystem.ts`, `src/apps/city/core/layout.ts`.
- [x] T033 OVERSTORY-CITY-R005 Amendment: re-kind the three operator characters as simulated NPCs, labelled in the badge and inspector. Touches `src/apps/city/core/ecosystem.ts`, `src/apps/city/core/sim.ts`, `src/apps/city/core/ui.ts`.
- [x] T034 OVERSTORY-CITY-R006 Amendment: the explicit transition table and the single guarded transition function. Touches `src/apps/city/core/sim.ts`.
- [x] T035 OVERSTORY-CITY-R010 Amendment: per-event provenance and the simulated-activity feed badge. Touches `src/apps/city/core/events.ts`, `src/apps/city/core/ui.ts`.
- [x] T036 OVERSTORY-CITY-R013 Amendment: license allowlist gate and automated asset QA budgets. Touches `public/city-assets/assets.lock.json`, `src/apps/city/schemas.ts`, `src/apps/city/components/CityPage.tsx`, `src/apps/city/__tests__/`.
- [x] T037 OVERSTORY-CITY-R014 Amendment: the seeded PRNG and the `LIVE` = connector-district-only split. Touches `src/apps/city/core/prng.ts`, `src/apps/city/core/sim.ts`, `src/apps/city/core/ui.ts`.
- [x] T038 OVERSTORY-CITY-R015 Amendment: the WebGL context-loss fallback to the 2D schematic. Touches `src/apps/city/core/render3d/scene.ts`, `src/apps/city/components/CityPage.tsx`.
- [ ] T039 OVERSTORY-CITY-R031 Rebuild the 3D view on the shared scene pipeline to meet the fidelity bar. Touches `src/apps/city/core/render3d/`, `src/lib/scene3d/`, `public/city-assets/`.
- [x] T040 OVERSTORY-CITY-R032 Operator layout editing stored as served layout overrides. Touches `src/apps/city/core/ui.ts`, `agent/overstory/apps/city/gateway.py`.
- [x] T041 OVERSTORY-CITY-R033 Replace the borrowed roster with one rig and role-encoded agent characters. Touches `src/apps/city/core/ecosystem.ts`, `src/apps/city/core/render3d/characters.ts`, `public/city-assets/characters/`.
- [x] T042 OVERSTORY-CITY-R003 Amendment: the cancellation-safe single flight, the 30 s overall fresh-read deadline, the cursor-paginated catalog read, and the per-pack tool-read degrade with the `servers: [name]` filter. Touches `agent/overstory/apps/city/gateway.py`, `agent/overstory/__tests__/test_city_app.py`, `specs/arbora-city/contracts/arbora-fleet-catalog.md`.
- [x] T043 OVERSTORY-CITY-R002 Amendment: domain groups labelled and bounded on the map; overflow past the 78 plots surfaces a queued event, never a silent drop. Touches `src/apps/city/core/ecosystem.ts`, `src/apps/city/core/layout.ts`, `src/apps/city/core/render3d/`, `src/apps/city/core/ui.ts`.
- [x] T044 OVERSTORY-CITY-R015 Amendment: the semantic-zoom ladder (city → district → building; camera-distance bands; damped transitions; the 2D schematic is the city level) and the working context-restore wiring, exercised through real DOM events. Touches `src/apps/city/core/render3d/`, `src/apps/city/core/render2d.ts`, `src/apps/city/components/CityPage.tsx`.
- [x] T045 OVERSTORY-CITY-R029 Amendment: true replay from the active mode's fleet source; the labelled replayed-window feed; the bounded action record. Touches `src/apps/city/core/replay.ts`, `src/apps/city/core/sim.ts`, `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [x] T046 OVERSTORY-CITY-R025 Amendment: the encoding table drives every rendered channel (height, windows, queue, state colour single-sourced); the test verifies the rendered scene against the table. Touches `src/apps/city/core/encoding.ts`, `src/apps/city/core/render3d/`, `src/apps/city/core/render2d.ts`, `src/apps/city/core/ui.ts`, `src/apps/city/__tests__/`.
- [x] T047 OVERSTORY-CITY-R010 Amendment: feed rows show provenance; the streaming indicator is honest; operator-facing feed wording. Touches `src/apps/city/core/events.ts`, `src/apps/city/core/ui.ts`.
- [x] T048 OVERSTORY-CITY-R013 Amendment: the asset gate honoured at render time (verified bytes only; labelled placeholder on refusal); the QA bounds check and turnaround thumbnail. Touches `src/apps/city/core/render3d/`, `src/apps/city/core/assets.ts`, `src/apps/city/__tests__/assetQa.test.ts`.
- [x] T049 OVERSTORY-CITY-R018 Amendment: complete GPU disposal — the scene graph traversal, the camera controls, `forceContextLoss` — so a 2D/3D toggle or a remount never piles up contexts or leaked GPU memory. Touches `src/apps/city/core/render3d/`, `src/apps/city/components/CityPage.tsx`.
- [x] T050 OVERSTORY-CITY-R027 Amendment: in-place DOM panel updates (keyboard focus survives the 4 Hz refresh); the DOM panels are usable without any canvas. Touches `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [ ] T051 OVERSTORY-CITY-R028 Amendment: the performance test builds the real scene graph over the snapshot and measures triangles, draw calls and texture memory; measured frame time on the fidelity harness. Touches `src/apps/city/__tests__/perfBudget.test.ts`, `e2e/scene-fidelity.browser.ts`.
- [x] T052 OVERSTORY-CITY-R006 Amendment: `transition()` results always honoured; a refused transition is a queued event with operator-facing wording and no state or behaviour divergence. Touches `src/apps/city/core/sim.ts`.
- [x] T053 OVERSTORY-CITY-R007 Amendment: a dispatch on a busy target is a visible queued event, never a silent swap. Touches `src/apps/city/core/sim.ts`, `src/apps/city/core/ui.ts`.
- [x] T054 OVERSTORY-CITY-R034 The city's operator surface is WebMCP: navigation/view, simulation control, operator actions and the layout edits register as `overstory.city.*` tools on the city page, dispatched through the same action seam as the UI; the surface declares the city page. Touches `src/apps/city/webmcp.ts` (new), `src/apps/city/surface.ts`, `src/apps/city/components/CityPage.tsx`, `src/apps/city/__tests__/webmcp.test.ts` (new).
- [x] T055 OVERSTORY-CITY-R035 Mapping registry: graph class to city archetype. Touches `src/apps/city/core/mapping.ts`, `src/apps/city/core/graphFacts.ts`.
- [x] T056 OVERSTORY-CITY-R036 Edges become roads: the road-class table. Touches `src/apps/city/core/roadClass.ts`, `src/apps/city/core/growth.ts`.
- [x] T057 OVERSTORY-CITY-R037 Activity becomes traffic and health signals. Touches `src/apps/city/core/traffic.ts`.
- [x] T058 OVERSTORY-CITY-R038 The Hall of Records growth rule. Touches `src/apps/city/core/hall.ts`.
- [x] T059 OVERSTORY-CITY-R039 Deterministic seeded growth. Touches `src/apps/city/core/growth.ts`.
- [x] T060 OVERSTORY-CITY-R040 The user edit layer: pins, regrowth, area reset. Touches `src/apps/city/core/editLayer.ts`.
- [x] T061 OVERSTORY-CITY-R041 Generate first: seeded terrain generator and the generation budgets. Touches `src/lib/scene3d/generators/terrain.ts`.
- [x] T062 OVERSTORY-CITY-R042 Zoom-layered synthesized audio. Touches `src/apps/city/core/audio.ts`, `src/apps/city/webmcp.ts`, `src/apps/city/core/ui.ts`.
- [x] T063 OVERSTORY-CITY-R043 Parity table: every city action has a web UI route. Touches `src/apps/city/core/parity.ts`.
- [x] T064 OVERSTORY-CITY-R044 Three kinds of people with honest provenance. Touches `src/apps/city/core/ecosystem.ts`.
- [x] T065 OVERSTORY-CITY-R045 Competency questions for the five fun pillars. Touches `src/apps/city/core/competency.ts`, `src/apps/city/core/sun.ts`.
- [x] T066 OVERSTORY-CITY-R046 Original identity audit. Touches `src/apps/city/__tests__/identity.test.ts`.
- [x] T067 OVERSTORY-CITY-R028 Load, chunk and audio budgets as a gate. Touches `src/apps/city/core/budgets.ts`, `src/apps/city/__tests__/budgets.test.ts`.

- [x] T068 OVERSTORY-CITY-R001.1 Add the explicit anonymous local city sandbox route posture and browser-local WebMCP registration. Touches `src/lib/city-sandbox.ts`, `src/apps/city/routes.ts`, `src/lib/webmcp/provider.tsx`.
- [ ] T069 OVERSTORY-CITY-R031.1 Restore colour-managed 3D contrast and add rendered regression evidence. Touches `src/apps/city/core/render3d/trimSheet.ts`, `src/apps/city/core/render3d/scene.ts`, `src/lib/scene3d/pipeline.ts`, city tests.
- [ ] T070 OVERSTORY-CITY-R041.1 Build the production-world visual slice: watertight architecture, terrain, waterfront, sky, navigation, landmarks and approved overview captures. Touches generators, `render3d/`, `docs/art-direction.md`, and browser evidence.
- [ ] T071 OVERSTORY-CITY-R047 Hydrate and render Arbora's authoritative revisioned city state; add the host adapter and subject-bound human heartbeat. Touches City API, host gateway/router, state reducer, CityPage and bound tests.
- [ ] T072 OVERSTORY-CITY-R048 Build the procedural regional-world recipe: seeded regional tiles, terrain/hydrology-constrained zoning, generated junction assets, parcel/road/prop collision validation, façade families and streamed LOD/instanced massing.
- [ ] T073 OVERSTORY-CITY-R048 Add the performance-integrity gate: long-running activity soak, scene-object/texture-growth assertions, city-capacity draw-call budgets and dense-core/suburban/waterfront/skyline browser captures.
- [ ] T074 [US5] OVERSTORY-CITY-R048.1 Implement the catalog validator and asset build metadata. Qualify original sources and reference module joins.
- [ ] T075 [US5] OVERSTORY-CITY-R048.2 Deliver original shared modules and all exterior recipes. Review the fuel forecourt and near-street detail.
- [ ] T076 [US5] OVERSTORY-CITY-R048.3 Build connected 3D profiles, lane movements and validated lots. Exercise curved streets, parking, bus stops, bridges and overpasses.
- [ ] T077 [US4] OVERSTORY-CITY-R048.4 Deliver all six interior recipes with collision, entry/exit and shared UI/WebMCP actions.
- [ ] T078 [US5] OVERSTORY-CITY-R048.5 Qualify the full island, shoreline families and marine travel. Record any optional effects evaluation separately.
- [ ] T079 [US5] OVERSTORY-CITY-R048.6 Run reviewed fidelity captures, capacity tests and sustained performance measurements.
- [ ] T080 [US1] OVERSTORY-CITY-R048.7 Build registry-selected ecosystem exterior and room kits. Qualify frontage, entry, specialty pieces and provenance.
- [ ] T081 [US5] OVERSTORY-CITY-R048.8 Derive corridors, parcels and roadside sockets with stable placement and edit validation. Qualify the combined reference scene against R048.6 budgets.
- [ ] T082 [US5] OVERSTORY-CITY-R048.9 Implement deterministic seed generation, revisioned growth, dry-ground checks and replay acceptance.
- [ ] T083 [US1] OVERSTORY-CITY-R001.2 Qualify the signed-in Apps entry and add the sandbox landing entry through the existing route.
- [x] T084 [US1] OVERSTORY-CITY-R001.2.1 Link the loopback landing page to the demo.
- [x] T085 [US3] OVERSTORY-CITY-R028.1 Report observed FPS, target and slow frames in the debug HUD.

## Draft PR milestones

| Spec | Milestone | Remaining acceptance |
| --- | --- | --- |
| R001.1, R001.2 | Loopback development sandbox, landing entry and isolated simulated layout edits | Installed signed-in Apps journey and capability behavior |
| R028 | Debug FPS and slow-frame counters at `?demo=1&debug=1` | Sustained 60 FPS on reference hardware and capacity soak |
| R048.1–R048.9 | Catalog and generation contracts drafted | Minimal kit, dry-land validation, road-led generation, landmark interiors, growth and visual qualification |
| R047 | Shared-state consumer contract drafted | Arbora and Medulla producers and two-viewer acceptance |
