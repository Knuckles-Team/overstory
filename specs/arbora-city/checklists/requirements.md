# OVERSTORY-CITY verification checklist

Governing spec: [spec.md](../spec.md). State is computed, never written;
this table records the evidence per row. LANDED requires every v1 row
green; VERIFIED additionally requires the headless browser proof and the
lockfile audit against a live host.

Gate evidence captured on branch `arbora-city`, 2026-11-16: full frontend
suite `pnpm test` 2906 passed; city suites 59/59; backend
`agent/overstory/__tests__/test_city_app.py` 9/9; full pytest 590 passed,
12 skipped; `pnpm typecheck` clean; `pnpm lint` zero errors on the city
sources; `pnpm build` succeeded with the chunk report recorded in
test-spec.md.

| ID | Status | Evidence |
|----|--------|----------|
| OVERSTORY-CITY-R001 | green | `src/apps/city/__tests__/surface.test.ts` (4 tests); `APP_SURFACES` registration in `src/apps/index.ts`; `src/lib/apps/__tests__/apps.test.ts` covers the contract. |
| OVERSTORY-CITY-R002 | green | `ecosystem.test.ts` describes `fleetToConnectors (R002)` and `district sizing (R002)` (7 served / 67 registered / core excluded / 78 plots). |
| OVERSTORY-CITY-R003 | green | `test_city_app.py`: whitelisted shape, 60 s cache, stated 503, typed refusal, status route (bound `# spec: OVERSTORY-CITY-R003`). |
| OVERSTORY-CITY-R004 | green | `ecosystem.test.ts` describe `core landmarks (R004)` (7 landmarks, roles, rooms). |
| OVERSTORY-CITY-R005 | green | `sim.test.ts` describe `boot state` (17 characters, 14 AI + 3 human); `ecosystem.test.ts` describe `roster (R005)`. |
| OVERSTORY-CITY-R006 | green | `sim.test.ts` describe `SC-002: dispatched task runs the full chain within 60 real s` (chain ≤ 60 real s; budgets in [0,100]). |
| OVERSTORY-CITY-R007 | green | `sim.test.ts` describes `approval cycle (R007)` and the refused-dispatch queued event. |
| OVERSTORY-CITY-R008 | green | `sim.test.ts` describe `SC-003: construction and first visit (R008)` (≤ 30 real s; visit ≤ 2 real min; refusal emits queued event). |
| OVERSTORY-CITY-R009 | green | `sim.test.ts` describe `day/night cycle (R009) — SC-005 full day at 4x` (sleep/wake, no night tasks, timeScale 144). |
| OVERSTORY-CITY-R010 | green | `events.test.ts` describes `vocabulary (R010)`, `recent ring (R010)`, clock stamping and mode. |
| OVERSTORY-CITY-R011 | green | `sim.test.ts` describe `selection API (R011)`; `render2d.test.ts` `init2D` (same selection in the fallback); `CityPage.test.tsx` smoke. |
| OVERSTORY-CITY-R012 | green | `sim.test.ts` describe `speed and clock semantics (R012)`; `CityPage.test.tsx` describe `parseSpeedParam (R012)`. |
| OVERSTORY-CITY-R013 | green | `assets.test.ts` describes `lockfile (R013)` and `pinned byte cache (R013)`; `assets.lock.json` 18/18 verified against on-disk bytes. |
| OVERSTORY-CITY-R014 | green | `CityPage.test.tsx` describe `mode decision (R014)` (LIVE; SIMULATED + banner reason; snapshot boot); host `available`/503 in `test_city_app.py`. |
| OVERSTORY-CITY-R015 | green | `render2d.test.ts` describes `supportsWebGL probe (R015)` and `init2D (R015)`. |
| OVERSTORY-CITY-R016 | green | `pnpm build` chunk report (test-spec.md): 0 scene-library references in the shell chunk; scene library in the on-demand city chunk group (shared with the pre-existing graph 3D views); `assets.test.ts` weight check (< 5 MB). |
| OVERSTORY-CITY-R017 | green | `test_city_app.py`: `test_normalize_fleet_drops_unrecognized_entries`, `test_tool_names_are_bounded_at_twelve_per_pack` (bound `# spec: OVERSTORY-CITY-R017`). |
| OVERSTORY-CITY-R018 | green | `CityPage.test.tsx` describe `unmount safety (R018)` (dispose; no rAF afterwards). |
| OVERSTORY-CITY-R019 | specified (follow-on) | Row written; no v1 code by design. Planned test: `sim.test.ts::interiors`. |
| OVERSTORY-CITY-R020 | specified (follow-on) | Row written; the `injectLive` seam exists in `events.ts`. Planned test: `events.test.ts::live`. |
| OVERSTORY-CITY-R021 | specified (follow-on) | Row written; in-repo `layout.ts` remains the authority until the served graph lands. Planned test: `ecosystem.test.ts::layout`. |
| OVERSTORY-CITY-R022 | specified (follow-on) | Row written; no v1 code by design. Planned test: `CityPage.test.tsx::dialogue`. |
| OVERSTORY-CITY-R023 | specified (follow-on) | Row written; no v1 code by design. Planned test: `sim.test.ts::presence`. |
| OVERSTORY-CITY-R024 | specified (follow-on) | Row written; the R013 admission path is the intake. Planned test: `assets.test.ts::scaleout`. |

Success criteria (from spec.md): SC-001 maps to `ecosystem.test.ts` and
`sim.test.ts` boot state (counts of characters, landmarks, plots);
SC-002 to `sim.test.ts` (dispatch chain); SC-003 to `sim.test.ts`
(construction and first visit); SC-004 to `assets.test.ts` (lockfile
verification); SC-005 to `sim.test.ts` (full day at 4×).
