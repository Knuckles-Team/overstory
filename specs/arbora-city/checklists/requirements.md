# OVERSTORY-CITY verification checklist

Governing spec: [spec.md](../spec.md). State is computed, never written;
this table records the evidence per row. LANDED requires every v1 row
green; VERIFIED additionally requires the headless browser proof and the
lockfile audit against a live host.

Gate evidence captured on branch `arbora-city`, 2026-11-17 (review
amendments 1–36): full frontend suite `pnpm test` 2958 passed; city suites
104/104 (10 files); backend
`agent/overstory/__tests__/test_city_app.py` 12/12; full pytest
`tests agent/overstory/__tests__` 578 passed, 12 skipped, 1 xfailed;
`pnpm typecheck` clean; `pnpm lint` zero errors; `pnpm build` succeeded
with the chunk report recorded in test-spec.md.

Round 2 (2026-11-18 re-review): R002, R003, R005, R006, R007, R010,
R013, R015, R018, R025, R027, R028 and R029 are amended, and R031–R033
land in the same delivery. Their round-2 evidence is captured in this
table by the rework commits; the 2026-11-17 evidence above stands for
the pre-amendment rows.

| ID | Status | Evidence |
|----|--------|----------|
| OVERSTORY-CITY-R001 | green | `src/apps/city/__tests__/surface.test.ts` (4 tests); `APP_SURFACES` registration in `src/apps/index.ts`; `src/lib/apps/__tests__/apps.test.ts` covers the contract. |
| OVERSTORY-CITY-R002 | green | `ecosystem.test.ts` describes `fleetToConnectors (R002)`, `district domains (R002)` (8 domains; `domainOf`; `connectorsByDomain` stable within domain; landmarks at the map centre) and `district sizing (R002)` (7 served / 67 registered / core excluded / 78 plots); `sim.test.ts` boot state asserts plot reservation in domain order. |
| OVERSTORY-CITY-R003 | green | `test_city_app.py`: whitelisted shape, 60 s cache, stated 503, typed refusal, status route (bound `# spec: OVERSTORY-CITY-R003`). |
| OVERSTORY-CITY-R004 | green | `ecosystem.test.ts` describe `core landmarks (R004)` (7 landmarks, roles, rooms). |
| OVERSTORY-CITY-R005 | green | `sim.test.ts` describe `boot state` (17 characters, 14 AI + 3 simulated NPC operators, provenance simulated, `Simulated` roles); `ecosystem.test.ts` describe `roster (R005)`. |
| OVERSTORY-CITY-R006 | green | `sim.test.ts` describe `SC-002: dispatched task runs the full chain within 60 real s` (chain ≤ 60 real s; budgets in [0,100]). |
| OVERSTORY-CITY-R007 | green | `sim.test.ts` describes `approval cycle (R007)` and the refused-dispatch queued event. |
| OVERSTORY-CITY-R008 | green | `sim.test.ts` describe `SC-003: construction and first visit (R008)` (≤ 30 real s; visit ≤ 2 real min; refusal emits queued event). |
| OVERSTORY-CITY-R009 | green | `sim.test.ts` describe `day/night cycle (R009) — SC-005 full day at 4x` (sleep/wake, no night tasks, timeScale 144). |
| OVERSTORY-CITY-R010 | green | `events.test.ts` describes `vocabulary (R010)`, `provenance (R010)` (simulated default; live stamp, caller cannot spoof; `feedFullySimulated` badge condition), `recent ring (R010)`, clock stamping and mode. |
| OVERSTORY-CITY-R011 | green | `sim.test.ts` describe `selection API (R011)`; `render2d.test.ts` `init2D` (same selection in the fallback); `CityPage.test.tsx` smoke. |
| OVERSTORY-CITY-R012 | green | `sim.test.ts` describe `speed and clock semantics (R012)`; `CityPage.test.tsx` describe `parseSpeedParam (R012)`. |
| OVERSTORY-CITY-R013 | green | `assets.test.ts` describes `lockfile (R013)` (18 pins, per-file license inside the allowlist, schema refuses missing license / empty allowlist) and `pinned byte cache (R013)`; `assetQa.test.ts` parses every GLB from its real bytes against the budgets table (18/18 within triangle/material/texture budget, zero embedded images); `CityPage.test.tsx` proves the out-of-allowlist pin is refused before any bytes are fetched; `assets.lock.json` 18/18 verified against on-disk bytes. |
| OVERSTORY-CITY-R014 | green | `CityPage.test.tsx` describe `mode decision (R014)` (LIVE; SIMULATED + banner reason; snapshot boot); `sim.test.ts` describe `seeded PRNG (R014)` (single injected PRNG — `Math.random` provably never called in the sim; same seed boots the identical city); host `available`/503 in `test_city_app.py`. |
| OVERSTORY-CITY-R015 | green | `render2d.test.ts` describes `supportsWebGL probe (R015)` and `init2D (R015)`; `CityPage.test.tsx` describe `WebGL context-loss fallback (R015)` (mid-session loss swaps to the 2D schematic, dead 3D renderer disposed); the `render3d/` split (T025) keeps the context-loss listener in the scene module. |
| OVERSTORY-CITY-R016 | green | `pnpm build` chunk report (test-spec.md): 0 scene-library references in the shell chunk; scene library in the on-demand city chunk group (shared with the pre-existing graph 3D views); `assets.test.ts` weight check (< 5 MB). |
| OVERSTORY-CITY-R017 | green | `test_city_app.py`: `test_normalize_fleet_drops_unrecognized_entries`, `test_tool_names_are_bounded_at_twelve_per_pack` (bound `# spec: OVERSTORY-CITY-R017`). |
| OVERSTORY-CITY-R018 | green | `CityPage.test.tsx` describe `unmount safety (R018)` (dispose; no rAF afterwards). |
| OVERSTORY-CITY-R019 | specified (follow-on) | Row written; no v1 code by design. Planned test: `sim.test.ts::interiors`. |
| OVERSTORY-CITY-R020 | specified (follow-on) | Row written; the `injectLive` seam exists in `events.ts`. Planned test: `events.test.ts::live`. |
| OVERSTORY-CITY-R021 | specified (follow-on) | Row written; in-repo `layout.ts` remains the authority until the served graph lands. Planned test: `ecosystem.test.ts::layout`. |
| OVERSTORY-CITY-R022 | specified (follow-on) | Row written; no v1 code by design. Planned test: `CityPage.test.tsx::dialogue`. |
| OVERSTORY-CITY-R023 | specified (follow-on) | Row written; no v1 code by design. Planned test: `sim.test.ts::presence`. |
| OVERSTORY-CITY-R024 | specified (follow-on) | Row written; the R013 admission path is the intake. Planned test: `assets.test.ts::scaleout`. |
| OVERSTORY-CITY-R025 | green | `encoding.test.ts` describe `encoding table (R025)` (6 channels, one visual = one fact, legend derived from the same table, scene modules read the table not a copy); `CityPage.test.tsx` asserts the rendered legend panel (6 lines). |
| OVERSTORY-CITY-R026 | green | `sim.test.ts` describe `quiet by default (R026)` (quiet: no auto-task/wander/patrol, AI agents hold position; demo: auto-tasking + motion); `CityPage.test.tsx` describes `activity mode (R026)` (quiet badge default; `?demo=1` boots labelled demo) and `parseDemoParam`. |
| OVERSTORY-CITY-R027 | green | `CityPage.test.tsx` describe `keyboard accessibility (R027)` (no form-label stats; labelled scrubber; keyboard-reachable population rows; dialog modal with focus management + Escape + focus restore; keyboard-operable 3D/2D toggle that swaps the renderer); `pnpm run lint` — zero `jsx-a11y` errors on the city sources. |
| OVERSTORY-CITY-R028 | green | `assetQa.test.ts` describe `asset QA budgets (R013/R028)` (per-GLB triangle/material/texture budgets over the real bytes); `perfBudget.test.ts` describe `performance budgets over the bundled snapshot (R028)` (per-building triangle cost, per-domain draw-call cost, stated 60/30 fps targets) — both read the one `BUDGETS` table. |
| OVERSTORY-CITY-R029 | green | `sim.test.ts` describe `replay (R029)` (actions recorded with in-game timestamps; same seed + same recorded actions → identical event sequence; scrubbing to a recorded action reproduces the state deterministically); the scrubber control is exercised in `CityPage.test.tsx` (labelled, wired to the replay driver). |
| OVERSTORY-CITY-R030 | green | `CityPage.test.tsx` describe `first-visit tour (R030)` (runs on first visit, skippable, session-marked, does not re-run in the same session; legend always available); the tour state and session storage live in `ui.ts`/`CityPage.tsx`. |
| OVERSTORY-CITY-R031 | in progress (round 2) | Row written 2026-11-17. The `render3d/` rebuild on `src/lib/scene3d/` and the e2e fidelity harness land in the round-2 rework. Golden-viewpoint capture against the local no-auth stack is pending three Arbora rows (403 on `/api/*` under `WEBUI_AUTH_MODE=none`; zero connectors without credentials; the engine refusing the provisioned content pack) — filed in the arbora specs; the harness runs against the local `SIMULATED` city until they land. Planned test: `e2e/city-fidelity.browser.ts::city_golden_viewpoints`. |
| OVERSTORY-CITY-R032 | in progress (round 2) | Row written 2026-11-17. The edit UX, validation, animation, re-routing and the gateway seam land in the round-2 rework; the round-trip is proven by test with a fake injected invoke. Live persistence is the cross-repo follow-on: arbora's served layout read (ARBORA-FLEET-R084, spec-only in main) and the medulla world-view rows (MEDULLA-WORLD-VIEW-R002/R003, planned); stated as such in the PR reply. Planned test: `layout-edit.test.ts::override_round_trip`. |
| OVERSTORY-CITY-R033 | in progress (round 2) | Row written 2026-11-17. The shared rig (Khronos `glTF-Sample-Models-1.0` RobotExpressive, eight clips mapped to the R012.4 clip set), the pseudonymous-id names and the role encoding land in the round-2 rework; the license is verified at fetch and admitted to the allowlist and SOURCES.md. Planned test: `ecosystem.test.ts::cast_encodes_role`. |

Success criteria (from spec.md): SC-001 maps to `ecosystem.test.ts` and
`sim.test.ts` boot state (counts of characters, landmarks, plots);
SC-002 to `sim.test.ts` (dispatch chain); SC-003 to `sim.test.ts`
(construction and first visit); SC-004 to `assets.test.ts` (lockfile
verification); SC-005 to `sim.test.ts` (full day at 4×).

## Modular asset pack review

- [x] All 16 supplied screenshots map to observations in the [asset pack contract](../asset-pack.md#screenshot-audit).
- [x] Exterior and interior inventory, geometry ownership, determinism and provenance have explicit requirements.
- [x] Each of R048.1–R048.6 maps to one delivery task and a distinct [acceptance case](../test-spec.md#modular-asset-pack-acceptance).

Review the proposed module count and art direction before authoring. Bind the planned checks and record captures and GPU measurements during implementation.
