# OVERSTORY-CITY tasks

Governing spec: [spec.md](spec.md). Design: [plan.md](plan.md). Rows: [requirements.md](requirements.md).

Producer first: the fleet seam (R003) and the world producers (R002, R004, R005) land before the simulation that consumes them, and the page shell (R001, R014, R016) lands last. Follow-on rows (R019–R024) are specified, not scheduled for this delivery.

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
