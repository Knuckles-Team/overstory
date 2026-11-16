# OVERSTORY-CITY test spec

Governing spec: [spec.md](spec.md).

## Positive tests (vitest)

- `src/apps/city/__tests__/surface.test.ts` — describe `city surface (R001)`.
  The route literals satisfy `surfaceProblems`; the surface declares its id,
  capability and empty WebMCP/Atlas sets; exactly one route `/apps/city`,
  lazy-loaded, user role; resolves through the one route registry and is
  registered. Bound: `// spec: OVERSTORY-CITY-R001`.
- `src/apps/city/__tests__/ecosystem.test.ts`
  - describe `fleetToConnectors (R002)`: 7 served servers → 7 online
    buildings with tool lists; 67 registered-unpublished → 67 planned
    plots; arbora core excluded from the connector district (it is a
    landmark); deterministic placement. Bound:
    `// spec: OVERSTORY-CITY-R002`.
  - describe `district sizing (R002)`: holds 78 plots; the current
    74-connector catalog always fits. Bound:
    `// spec: OVERSTORY-CITY-R002`.
  - describe `core landmarks (R004)`: exactly 7 landmarks, each with a
    name, role and ≥1 internal location. Bound:
    `// spec: OVERSTORY-CITY-R004`.
  - describe `roster (R005)`: 17 citizens — 14 AI agents and 3 human
    operators, each a distinct rider. Bound:
    `// spec: OVERSTORY-CITY-R005`.
- `src/apps/city/__tests__/sim.test.ts` (deterministic ticks, real-second
  pacing)
  - describe `boot state (R005/R002/R004)`: the pinned roster spawns (17
    characters, 14 AI + 3 human); the seven core landmarks build, each
    with a door; served packs boot as built online buildings with their
    real tools; registered packs reserve named plots, unbuilt. Bound:
    `// spec: OVERSTORY-CITY-R005`.
  - describe `SC-002: dispatched task runs the full chain within 60 real
    s (R006/R007)`: assign → travel → tool call (naming a real building
    tool) → result → knowledge commit → idle, ≤ 60 real s at 1×; context
    budget rises with tool calls, compacts at the vault at ≥85% and
    resumes below the threshold; budgets stay in [0,100]. Bound:
    `// spec: OVERSTORY-CITY-R006`.
  - describe `approval cycle (R007)`: a dispatch succeeds at boot; the
    approval cycle emits `task.pending_approval` then `task.approved`; a
    dispatch with no idle agent fails with a queued event. Bound:
    `// spec: OVERSTORY-CITY-R007`.
  - describe `SC-003: construction and first visit (R008)`: onboarding
    builds on an empty plot, `construction.progress` milestones every
    25%, completion ≤ 30 real s, first agent visit ≤ 2 real minutes;
    no-empty-plot refusal emits a visible queued event. Bound:
    `// spec: OVERSTORY-CITY-R008`.
  - describe `day/night cycle (R009) — SC-005 full day at 4x`: a
    complete day at 4× in ~2.5 real minutes; every character sleeps and
    wakes; no new tasks start at night; the in-game clock runs at
    timeScale 144 (one day = ten real minutes at 1×); no character leaves
    walkable ground. Bound: `// spec: OVERSTORY-CITY-R009`.
  - describe `speed and clock semantics (R012)`: speed scales the clock
    and the action timers together; pause freezes both. Bound:
    `// spec: OVERSTORY-CITY-R012`.
  - describe `selection API (R011)`: selecting a character or building
    returns its record. Bound: `// spec: OVERSTORY-CITY-R011`.
- `src/apps/city/__tests__/events.test.ts`
  - describe `vocabulary (R010)`: every declared type is accepted through
    the live bridge; unknown types are counted, not fatal.
  - describe `recent ring (R010)`: bounded at 200 events; replays
    startup events for a UI that mounts late; a broken subscriber does
    not kill the bus; ids are unique per emission.
  - describe `clock stamping and mode`: events are stamped from the bound
    time source; `setMode` emits `mode.selected` with the reason.
    Bound: `// spec: OVERSTORY-CITY-R010`.
- `src/apps/city/__tests__/assets.test.ts`
  - describe `lockfile (R013)`: pins exactly 18 files (17 riders + 1
    marker); verifies every pinned file (byte count and sha256, 18/18);
    stays under the 5 MB budget; a corrupted pin refuses after one
    retry. Bound: `// spec: OVERSTORY-CITY-R013`.
  - describe `pinned byte cache (R013)`: the verified bytes are served
    exactly once per pin; a re-pin replaces the previous bytes.
    Bound: `// spec: OVERSTORY-CITY-R013`.
- `src/apps/city/__tests__/render2d.test.ts`
  - describe `supportsWebGL probe (R015)`: true when a GL context exists;
    false when none can be created or creation throws.
  - describe `init2D (R015)`: the fallback renderer receives the same
    plot/character/door data as the 3D renderer (single geometry
    authority) and exposes the full renderer handle.
    Bound: `// spec: OVERSTORY-CITY-R015`.
- `src/apps/city/__tests__/CityPage.test.tsx`
  - describe `parseSpeedParam (R012)`: parses the accepted speeds and
    defaults to 1×.
  - describe `mode decision (R014)`: boots `LIVE` when the host serves
    the fleet; falls back to `SIMULATED` with a stated banner when the
    fleet read fails; verifies every pinned asset at startup (18 verified
    events, no failures); lists the connectors from the live fleet in
    the onboard modal. Bound: `// spec: OVERSTORY-CITY-R014`.
  - describe `unmount safety (R018)`: disposes the renderer and schedules
    no animation frame afterwards. Bound:
    `// spec: OVERSTORY-CITY-R018`.

## Integration (pytest, FastAPI TestClient)

`agent/overstory/__tests__/test_city_app.py` — bound:
`# spec: OVERSTORY-CITY-R003, OVERSTORY-CITY-R017`.

- `test_the_fleet_route_serves_the_whitelisted_catalog` —
  OVERSTORY-CITY-R003: the normalized shape over a fake gateway.
- `test_the_catalog_is_cached_for_sixty_seconds` — OVERSTORY-CITY-R003:
  the second call within 60 s is served from cache (one upstream read).
- `test_an_unreachable_or_absent_catalog_is_a_stated_503` and
  `test_any_other_upstream_failure_is_unavailable_too` —
  OVERSTORY-CITY-R003: 503 with a stated reason.
- `test_a_typed_refusal_passes_its_code_through` — OVERSTORY-CITY-R003:
  the engine's refusal code passes through.
- `test_normalize_fleet_drops_unrecognized_entries` and
  `test_tool_names_are_bounded_at_twelve_per_pack` —
  OVERSTORY-CITY-R017: the whitelist shape; extra fields drop; tool
  names bounded.
- `test_the_apps_catalog_reports_the_city_available` and
  `test_default_apps_registers_one_city_backend` — OVERSTORY-CITY-R003:
  the city app is always available (it degrades, never hides).

## Negative and boundary cases

- Host: gateway unavailable → 503 with a stated reason; typed refusal →
  4xx with the engine's code (FastAPI TestClient, fake gateway).
- Host: a gateway response carrying extra fields is dropped by the
  normalization whitelist (no credential or extra identity can reach the
  browser) — OVERSTORY-CITY-R017.
- Assets: a corrupted pin (wrong byte count / wrong sha256) → placeholder
  character + `asset.failed` in the feed; other characters unaffected.
- Simulation: a refused tool result fails the task with a retry, never an
  uncaught exception across a full day.

## Follow-on rows (planned tests, no v1 code)

- OVERSTORY-CITY-R019: `src/apps/city/__tests__/sim.test.ts::interiors` —
  door trigger enters; the interior renders the building's rooms with the
  same selection and inspector.
- OVERSTORY-CITY-R020: `src/apps/city/__tests__/events.test.ts::live` —
  the `injectLive` seam feeds live run events into the same vocabulary;
  the simulated stream is replaced in `LIVE` mode.
- OVERSTORY-CITY-R021: `src/apps/city/__tests__/ecosystem.test.ts::layout` —
  placement comes from the served world-view graph; geometry tuning
  stays in-repo.
- OVERSTORY-CITY-R022: `src/apps/city/__tests__/CityPage.test.tsx::dialogue`
  — the dialogue panel opens over the chat surface; the reply loop rides
  the served Meristem operation.
- OVERSTORY-CITY-R023: `src/apps/city/__tests__/sim.test.ts::presence` —
  a guest character renders from the ephemeral presence channel.
- OVERSTORY-CITY-R024: `src/apps/city/__tests__/assets.test.ts::scaleout` —
  new lockfile entries with per-asset provenance pass the startup
  verification (R013).

## Quality and release proof

- `pnpm build` — record the chunk report (capture 2026-11-16): the shell
  chunk (`index-2WG4vo9o.js`, 357.39 kB) holds **zero** scene-library
  references; the three.js core ships in the on-demand chunk
  `OrbitControls-Bb8IkPSG.js` (600.97 kB), which is shared with the
  pre-existing graph 3D views (`model-DKoC20zT.js`, imported by the
  `AtlasView`/`Graph3DView`/`Graph3DLodView` chunks already on main before
  this lane); the city chunk group is `CityPage-CtP-f1-v.js` (112.84 kB,
  city core plus the `THREE.BufferGeometryUtils` warn strings pulled in by
  the model loader's static dependency). The invariant is: the scene
  library is never in the shell bundle (OVERSTORY-CITY-R016).
- Asset weight: `du -sb public/city-assets/riders` = 503,452 bytes <
  5 MB.
- Lockfile: every pin in `public/city-assets/assets.lock.json` verifies
  against the on-disk bytes (size + sha256) — 18/18.
- Suites: `pnpm vitest run src/apps/city` (59/59) and
  `uv run --no-sync pytest agent/overstory/__tests__/test_city_app.py`
  (9/9) green on the branch; full `pnpm test` (2906) and full `pytest`
  (590 passed, 12 skipped) green.
- `uvx pre-commit run --config .config/pre-commit.yaml --all-files` passes
  on the branch.
- Headless browser proof (when a host is available): the page boots, the
  mode badge is visible, and a full in-game day at 4× runs with zero
  uncaught console errors. Recorded as VERIFIED evidence, not as a merge
  gate (the merge gate is the test suite above).

## Verification state

LANDED: every test above green on the branch with the build and pre-commit
gates passing. VERIFIED additionally requires the headless browser proof
against a live host plus the lockfile audit, recorded in
`checklists/requirements.md`.
