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
- [ ] T025 OVERSTORY-CITY-R025 Visual encoding table and HUD legend; split `render3d.ts` into the `render3d/` modules (scene, labels, buildings, characters, picking) behind the facade. Touches `src/apps/city/core/encoding.ts`, `src/apps/city/core/render3d/`, `src/apps/city/core/render2d.ts`, `src/apps/city/core/ui.ts`.
- [ ] T026 OVERSTORY-CITY-R026 Quiet-by-default activity with the labelled demo mode. Touches `src/apps/city/core/sim.ts`, `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [ ] T027 OVERSTORY-CITY-R027 Keyboard accessibility for the population list, inspector, modal and the 3D/2D toggle. Touches `src/apps/city/components/CityPage.tsx`, `src/apps/city/core/ui.ts`.
- [ ] T028 OVERSTORY-CITY-R028 Performance budgets as acceptance criteria, checked in tests against the bundled snapshot. Touches `src/apps/city/core/budgets.ts`, `src/apps/city/__tests__/`.
- [ ] T029 OVERSTORY-CITY-R029 Time scrubber and deterministic replay of recorded operator actions. Touches `src/apps/city/core/sim.ts`, `src/apps/city/core/replay.ts`, `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [ ] T030 OVERSTORY-CITY-R030 First-visit tour and always-available legend. Touches `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [ ] T031 OVERSTORY-CITY-R003 Amendment: principal- and tenant-scoped fleet cache, single-flight cold read, bounded concurrent fan-out with per-call timeout. Touches `agent/overstory/apps/city/gateway.py`, `agent/overstory/__tests__/test_city_app.py`.
- [ ] T032 OVERSTORY-CITY-R002 Amendment: domain-grouped district placement with the core landmarks at the centre. Touches `src/apps/city/core/ecosystem.ts`, `src/apps/city/core/layout.ts`.
- [ ] T033 OVERSTORY-CITY-R005 Amendment: re-kind the three operator characters as simulated NPCs, labelled in the badge and inspector. Touches `src/apps/city/core/ecosystem.ts`, `src/apps/city/core/sim.ts`, `src/apps/city/core/ui.ts`.
- [ ] T034 OVERSTORY-CITY-R006 Amendment: the explicit transition table and the single guarded transition function. Touches `src/apps/city/core/sim.ts`.
- [ ] T035 OVERSTORY-CITY-R010 Amendment: per-event provenance and the simulated-activity feed badge. Touches `src/apps/city/core/events.ts`, `src/apps/city/core/ui.ts`.
- [ ] T036 OVERSTORY-CITY-R013 Amendment: license allowlist gate and automated asset QA budgets. Touches `public/city-assets/assets.lock.json`, `src/apps/city/schemas.ts`, `src/apps/city/components/CityPage.tsx`, `src/apps/city/__tests__/`.
- [ ] T037 OVERSTORY-CITY-R014 Amendment: the seeded PRNG and the `LIVE` = connector-district-only split. Touches `src/apps/city/core/prng.ts`, `src/apps/city/core/sim.ts`, `src/apps/city/core/ui.ts`.
- [ ] T038 OVERSTORY-CITY-R015 Amendment: the WebGL context-loss fallback to the 2D schematic. Touches `src/apps/city/core/render3d/scene.ts`, `src/apps/city/components/CityPage.tsx`.
- [ ] T039 OVERSTORY-CITY-R031 Rebuild the 3D view on the shared scene pipeline to meet the fidelity bar. Touches `src/apps/city/core/render3d/`, `src/lib/scene3d/`, `public/city-assets/`.
- [ ] T040 OVERSTORY-CITY-R032 Operator layout editing stored as served layout overrides. Touches `src/apps/city/core/ui.ts`, `agent/overstory/apps/city/gateway.py`.
- [ ] T041 OVERSTORY-CITY-R033 Replace the borrowed roster with one rig and role-encoded agent characters. Touches `src/apps/city/core/ecosystem.ts`, `src/apps/city/core/render3d/characters.ts`, `public/city-assets/characters/`.
- [ ] T042 OVERSTORY-CITY-R003 Amendment: the cancellation-safe single flight, the 30 s overall fresh-read deadline, the cursor-paginated catalog read, and the per-pack tool-read degrade with the `servers: [name]` filter. Touches `agent/overstory/apps/city/gateway.py`, `agent/overstory/__tests__/test_city_app.py`, `specs/arbora-city/contracts/arbora-fleet-catalog.md`.
- [ ] T043 OVERSTORY-CITY-R002 Amendment: domain groups labelled and bounded on the map; overflow past the 78 plots surfaces a queued event, never a silent drop. Touches `src/apps/city/core/ecosystem.ts`, `src/apps/city/core/layout.ts`, `src/apps/city/core/render3d/`, `src/apps/city/core/ui.ts`.
- [ ] T044 OVERSTORY-CITY-R015 Amendment: the semantic-zoom ladder (city → district → building; camera-distance bands; damped transitions; the 2D schematic is the city level) and the working context-restore wiring, exercised through real DOM events. Touches `src/apps/city/core/render3d/`, `src/apps/city/core/render2d.ts`, `src/apps/city/components/CityPage.tsx`.
- [ ] T045 OVERSTORY-CITY-R029 Amendment: true replay from the active mode's fleet source; the labelled replayed-window feed; the bounded action record. Touches `src/apps/city/core/replay.ts`, `src/apps/city/core/sim.ts`, `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [ ] T046 OVERSTORY-CITY-R025 Amendment: the encoding table drives every rendered channel (height, windows, queue, state colour single-sourced); the test verifies the rendered scene against the table. Touches `src/apps/city/core/encoding.ts`, `src/apps/city/core/render3d/`, `src/apps/city/core/render2d.ts`, `src/apps/city/core/ui.ts`, `src/apps/city/__tests__/`.
- [ ] T047 OVERSTORY-CITY-R010 Amendment: feed rows show provenance; the streaming indicator is honest; operator-facing feed wording. Touches `src/apps/city/core/events.ts`, `src/apps/city/core/ui.ts`.
- [ ] T048 OVERSTORY-CITY-R013 Amendment: the asset gate honoured at render time (verified bytes only; labelled placeholder on refusal); the QA bounds check and turnaround thumbnail. Touches `src/apps/city/core/render3d/`, `src/apps/city/core/assets.ts`, `src/apps/city/__tests__/assetQa.test.ts`.
- [ ] T049 OVERSTORY-CITY-R018 Amendment: complete GPU disposal — the scene graph traversal, the camera controls, `forceContextLoss` — so a 2D/3D toggle or a remount never piles up contexts or leaked GPU memory. Touches `src/apps/city/core/render3d/`, `src/apps/city/components/CityPage.tsx`.
- [ ] T050 OVERSTORY-CITY-R027 Amendment: in-place DOM panel updates (keyboard focus survives the 4 Hz refresh); the DOM panels are usable without any canvas. Touches `src/apps/city/core/ui.ts`, `src/apps/city/components/CityPage.tsx`.
- [ ] T051 OVERSTORY-CITY-R028 Amendment: the performance test builds the real scene graph over the snapshot and measures triangles, draw calls and texture memory; measured frame time on the fidelity harness. Touches `src/apps/city/__tests__/perfBudget.test.ts`, `e2e/scene-fidelity.browser.ts`.
- [ ] T052 OVERSTORY-CITY-R006 Amendment: `transition()` results always honoured; a refused transition is a queued event with operator-facing wording and no state or behaviour divergence. Touches `src/apps/city/core/sim.ts`.
- [ ] T053 OVERSTORY-CITY-R007 Amendment: a dispatch on a busy target is a visible queued event, never a silent swap. Touches `src/apps/city/core/sim.ts`, `src/apps/city/core/ui.ts`.
