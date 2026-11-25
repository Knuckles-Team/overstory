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
  - describe `roster (R005)`: 17 citizens — 14 AI agents and 3 simulated
    NPC operator characters (labelled simulated), each a distinct rider.
    Bound: `// spec: OVERSTORY-CITY-R005`.
- `src/apps/city/__tests__/sim.test.ts` (deterministic ticks, real-second
  pacing)
  - describe `boot state (R005/R002/R004)`: the pinned roster spawns (17
    characters, 14 AI + 3 simulated NPC operators); the seven core landmarks
    build, each with a door; served packs boot as built online buildings
    with their real tools; registered packs reserve named plots, unbuilt;
    plots are grouped by domain keyword with the landmarks at the centre.
    Bound: `// spec: OVERSTORY-CITY-R005`.
  - describe `state machine (R006)`: `AGENT_STATES`/`AGENT_TRANSITIONS`
    declare the lifecycle; the guarded transition function refuses an
    illegal transition with a visible queued event; the refusal result
    is honoured by every caller (a refused transition neither walks,
    changes mood nor emits success events); a refused event carries
    operator-facing wording, not a raw invariant string; a full legal
    chain emits every transition event. Bound:
    `// spec: OVERSTORY-CITY-R006`.
  - describe `SC-002: dispatched task runs the full chain within 60 real
    s (R006/R007)`: assign → travel → tool call (naming a real building
    tool) → result → knowledge commit → idle, ≤ 60 real s at 1×; context
    budget rises with tool calls, compacts at the vault at ≥85% and
    resumes below the threshold; budgets stay in [0,100]. Bound:
    `// spec: OVERSTORY-CITY-R006`.
  - describe `approval cycle (R007)`: a dispatch succeeds at boot; the
    approval cycle emits `task.pending_approval` then `task.approved`; a
    dispatch with no idle agent fails with a queued event; a dispatch
    targeting a busy character is a visible queued event, never a silent
    swap onto another agent. Bound: `// spec: OVERSTORY-CITY-R007`.
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
  - describe `speed and clock semantics (R012)`: the declared speed set
    (0.5×, 1×, 1.25×, 1.5×, 2×, 4×, 8×, 20×) and pause each scale the
    clock and the action timers by exactly their factor; 0.5× slow
    motion halves the rate in the same mode; a full day at 20×
    completes with every invariant holding (no character leaves
    walkable ground, no visible reset); the fixed sub-step accumulator
    keeps in-game time exact across frames of varying length; a speed
    change never alters the in-game state at a given in-game time.
    Bound: `// spec: OVERSTORY-CITY-R012`.
  - describe `selection API (R011)`: selecting a character or building
    returns its record. Bound: `// spec: OVERSTORY-CITY-R011`.
  - describe `quiet and demo (R026)`: in quiet mode no task, wander or
    patrol event occurs without an operator action; in demo mode the
    continuous behaviour runs; the mode is labelled in the badge. Bound:
    `// spec: OVERSTORY-CITY-R026`.
  - describe `deterministic replay (R029)`: the same seed plus the same
    recorded operator actions yields the identical event sequence;
    scrubbing to a recorded action reproduces the state deterministically;
    a replay in `LIVE` mode boots from the served catalog, not the
    bundled snapshot, and the mode badge never swaps; the feed shows the
    labelled replayed window; the action record is bounded to the replay
    window. Bound: `// spec: OVERSTORY-CITY-R029`.
- `src/apps/city/__tests__/events.test.ts`
  - describe `vocabulary (R010)`: every declared type is accepted through
    the live bridge; unknown types are counted, not fatal.
  - describe `recent ring (R010)`: bounded at 200 events; replays
    startup events for a UI that mounts late; a broken subscriber does
    not kill the bus; ids are unique per emission.
  - describe `clock stamping and mode`: events are stamped from the bound
    time source; `setMode` emits `mode.selected` with the reason.
  - describe `provenance (R010)`: every event carries `provenance`
    (`simulated` or `live`); while the feed is fully simulated the badge
    reads "simulated activity"; a live-provenance event clears it; each
    feed row shows the event's provenance mark; the streaming indicator
    reads simulated activity while no live event has landed (never
    "streaming live platform events"); feed detail text is
    operator-facing prose, not raw invariant strings. Bound:
    `// spec: OVERSTORY-CITY-R010`.
- `src/apps/city/__tests__/assets.test.ts`
  - describe `lockfile (R013)`: pins exactly 18 files (17 riders + 1
    marker); every pin carries a `license` inside the top-level
    `license_allowlist`; verifies every pinned file (byte count and sha256,
    18/18); stays under the 5 MB budget; a corrupted pin refuses after one
    retry; a pin with a license outside the allowlist is refused. Bound:
    `// spec: OVERSTORY-CITY-R013`.
  - describe `pinned byte cache (R013)`: the verified bytes are served
    exactly once per pin; a re-pin replaces the previous bytes.
    Bound: `// spec: OVERSTORY-CITY-R013`.
- `src/apps/city/__tests__/assetQa.test.ts`
  - describe `asset QA (R013/R028)`: parses every pinned GLB and checks the
    budgets from `budgets.ts` — triangles ≤ 4000, materials ≤ 16, texture
    size ≤ 2048 px, bounds within the stated range — with a rendered
    turnaround thumbnail on file per asset; a failing asset never enters
    the lock. Bound: `// spec: OVERSTORY-CITY-R028`.
  - describe `render-time gate (R013)`: a refused or hash-mismatched pin
    renders a labelled placeholder; the renderer never fetches
    unverified bytes. Bound: `// spec: OVERSTORY-CITY-R013`.
- `src/apps/city/__tests__/encoding.test.ts`
  - describe `encoding table (R025)`: each visual channel maps to exactly
    one fact; the legend text is derived from the same table; the scene
    modules read the table, not a copy. Bound:
    `// spec: OVERSTORY-CITY-R025`.
- `src/apps/city/__tests__/perfBudget.test.ts`
  - describe `performance budgets (R028)`: builds the real scene graph
    over the bundled snapshot (R014) and measures triangles per
    building, draw calls per district and texture memory from it —
    asserted constants do not count; the fps targets (60 integrated /
    30 mobile) are met by measured frame time on the e2e fidelity
    harness (R012.9). Bound: `// spec: OVERSTORY-CITY-R028`.
- `src/apps/city/__tests__/render2d.test.ts`
  - describe `supportsWebGL probe (R015)`: true when a GL context exists;
    false when none can be created or creation throws.
  - describe `init2D (R015)`: the fallback renderer receives the same
    plot/character/door data as the 3D renderer (single geometry
    authority) and exposes the full renderer handle.
    Bound: `// spec: OVERSTORY-CITY-R015`.
- `src/apps/city/__tests__/CityPage.test.tsx`
  - describe `parseSpeedParam (R012)`: parses the full speed set —
    0.5, 1, 1.25, 1.5, 2, 4, 8, 20 and pause (0) — and falls back to
    1× when the value is absent or invalid.
  - describe `mode decision (R014)`: boots `LIVE` when the host serves
    the fleet; falls back to `SIMULATED` with a stated banner when the
    fleet read fails; verifies every pinned asset at startup (one
    verified event per lockfile pin on the event bus, no failures);
    lists the connectors from the live fleet in the onboard modal.
    Bound: `// spec: OVERSTORY-CITY-R014`.
  - describe `context loss (R015)`: a `webglcontextlost` that is not
    restored swaps the renderer to the 2D schematic — no dead canvas; a
    `webglcontextrestored` resumes the 3D renderer; both listeners are
    exercised through real dispatched DOM events, not direct callback
    calls. Bound: `// spec: OVERSTORY-CITY-R015`.
  - describe `a11y (R027)`: the population list, the inspector and the
    modal are keyboard reachable; the 3D/2D toggle is keyboard operable;
    the panels update in place — keyboard focus on a population row
    survives the 4 Hz refresh; the DOM panels (list, inspector, feed,
    controls) are usable without any canvas; zero `jsx-a11y` findings on
    the city sources. Bound: `// spec: OVERSTORY-CITY-R027`.
  - describe `tour (R030)`: the first-visit tour runs once per session,
    is skippable, and the legend stays available. Bound:
    `// spec: OVERSTORY-CITY-R030`.
  - describe `unmount safety (R018)`: disposes the renderer — the scene
    graph is traversed (geometry, materials and textures disposed), the
    controls are disposed and the WebGL context is force-lost — and
    schedules no animation frame afterwards; a 2D/3D toggle never piles
    up contexts. Bound: `// spec: OVERSTORY-CITY-R018`.

## Integration (pytest, FastAPI TestClient)

`agent/overstory/__tests__/test_city_app.py` — bound:
`# spec: OVERSTORY-CITY-R003, OVERSTORY-CITY-R017`.

- `test_the_fleet_route_serves_the_whitelisted_catalog` —
  OVERSTORY-CITY-R003: the normalized shape over a fake gateway.
- `test_the_catalog_is_cached_for_sixty_seconds` — OVERSTORY-CITY-R003:
  the second call within 60 s is served from cache (one upstream read).
- `test_the_cache_is_scoped_by_principal_and_tenant` —
  OVERSTORY-CITY-R003: a different verified principal or tenant gets its
  own cache entry; no caller is served another caller's view.
- `test_concurrent_cold_boots_share_one_in_flight_read` —
  OVERSTORY-CITY-R003: single flight — concurrent cold boots produce one
  upstream fan-out, all resolve to the same normalized answer.
- `test_the_fan_out_is_concurrent_with_a_cap_and_timeout` —
  OVERSTORY-CITY-R003: the per-pack tool-name reads run concurrently under
  the concurrency cap (8) with a per-call timeout (5 s); a slow pack does
  not hold the fan-out past the timeout.
- `test_a_cancelled_leader_leaves_the_waiters_alive` —
  OVERSTORY-CITY-R003: a cancelled first caller neither cancels nor
  strands the shared read; the remaining waiters still resolve (the
  single flight is a real task, waiters await it through `shield`, the
  in-flight entry clears in `finally`).
- `test_a_refused_pack_degrades_only_that_pack` — OVERSTORY-CITY-R003:
  a typed refusal (403/502) on one pack's tool read degrades that pack's
  tool list to empty; the read as a whole stands, the other packs
  intact.
- `test_the_catalog_read_paginates_by_cursor` — OVERSTORY-CITY-R003:
  a multi-page catalog is read fully by following `next_cursor`
  (`limit: 100`, safety cap ten pages).
- `test_the_fresh_read_deadline_bounds_the_whole_read` —
  OVERSTORY-CITY-R003: a slow upstream past the overall 30 s deadline
  answers 503 with a stated reason.
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
- Host: one pack's tool read is refused → that pack's tool list is
  empty and the read stands; a cancelled caller never cancels or
  strands the shared read (fake gateway).
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
  the `injectLive` seam feeds the served activity stream (run-trace
  records, provenance `live`) into the same vocabulary; the simulated
  stream is replaced in `LIVE` mode; agents map to persistent characters
  through host-assigned pseudonymous ids.
- OVERSTORY-CITY-R021: `src/apps/city/__tests__/ecosystem.test.ts::layout` —
  placement and the spatial relations come from the served world-view
  graph (medulla world-view spec, through the served layout read in the
  arbora fleet spec); geometry tuning stays in-repo.
- OVERSTORY-CITY-R022: `src/apps/city/__tests__/CityPage.test.tsx::dialogue`
  — the dialogue panel opens over the chat surface; the reply loop rides
  the served Meristem operation; the NPC prompt is a revisioned prompt
  asset; untrusted connector data gets the injection handling.
- OVERSTORY-CITY-R023: `src/apps/city/__tests__/sim.test.ts::presence` —
  a guest character renders from the one presence channel (snapshot
  interval, bounded update rate; per-frame movement never durable).
- OVERSTORY-CITY-R024: `src/apps/city/__tests__/assets.test.ts::scaleout` —
  new lockfile entries with per-asset provenance pass the startup
  verification (R013).

- OVERSTORY-CITY-R031: `e2e/city-fidelity.browser.ts::city_golden_viewpoints` —
  the golden viewpoints match the approved images; the material, density and
  label audits pass on the live city scene. Runs against the local
  `SIMULATED` city (bundled snapshot, no auth needed) in this delivery; the
  capture against the local no-auth stack is recorded as pending the three
  Arbora rows (403 on `/api/*` under `WEBUI_AUTH_MODE=none`; zero connectors
  without credentials; the engine refusing the provisioned content pack).
- OVERSTORY-DESIGN-R012.9: `e2e/scene-fidelity.browser.ts::golden_viewpoints_and_frame_time` —
  the golden viewpoints (overview, district, street level, character
  close-up, night, 2D view) match their approved images within tolerance,
  and the measured p95 frame time meets each tier's budget (≤ 16.7 ms high
  tier on the reference GPU, ≤ 33 ms low tier on integrated graphics).
  Runs now against the local `SIMULATED` city; the live no-auth capture is
  pending the three Arbora rows.
- OVERSTORY-CITY-R032: `src/apps/city/__tests__/layout-edit.test.ts::override_round_trip` —
  building moves and road edits persist through the gateway and re-render for
  a second viewer; a disconnecting road edit is refused.
- OVERSTORY-CITY-R033: `src/apps/city/__tests__/ecosystem.test.ts::cast_encodes_role` —
  every character uses the shared rig and full clip set; silhouette and colour
  come from the encoding table.
- OVERSTORY-CITY-R034: `src/apps/city/__tests__/webmcp.test.ts::city_webmcp_surface` —
  the registered `overstory.city.*` set covers navigation, view, simulation
  control, operator actions and the layout edits; every tool carries strict
  input and output schemas; each dispatches through the same action seam as
  the UI; the surface declares the city page in `webmcpPageIds`.

- OVERSTORY-CITY-R035: `src/apps/city/__tests__/mapping.test.ts::registry` — the registry
  resolves every starting archetype; an unknown class falls back to the generic lot.
- OVERSTORY-CITY-R036: `src/apps/city/__tests__/growth.test.ts::roads` — the edge kind sets the road class
  and the weight sets the lane count; the derived graph stays connected.
- OVERSTORY-CITY-R037: `src/apps/city/__tests__/traffic.test.ts::traffic` — density follows activity;
  failures and deploys show their signals; every vehicle carries its provenance.
- OVERSTORY-CITY-R038: `src/apps/city/__tests__/growth.test.ts::hall` — the hall grows monotonically
  with the record count, one wing per modality.
- OVERSTORY-CITY-R039: `src/apps/city/__tests__/growth.test.ts::determinism` — the same graph and seed
  give the same city.
- OVERSTORY-CITY-R040: `src/apps/city/__tests__/editLayer.test.ts::pins` — pins survive regrowth and an
  area resets to its derived form.
- OVERSTORY-CITY-R041: `src/lib/scene3d/__tests__/terrain.test.ts::terrain` — the seeded heightmap is
  reproducible, small in parameters and eroded.
- OVERSTORY-CITY-R042: `src/apps/city/__tests__/audio.test.ts::zoom_layers` — the mix follows the camera
  height; events have cues; the engine starts muted.
- OVERSTORY-CITY-R043: `src/apps/city/__tests__/parity.test.ts::parity` — every city action has a web UI route
  or a named gap.
- OVERSTORY-CITY-R044: `src/apps/city/__tests__/ecosystem.test.ts::three_kinds` — each character has one kind
  and honest provenance.
- OVERSTORY-CITY-R045: `src/apps/city/__tests__/competency.test.ts::competency` — each pillar question
  has an answering assertion or a named playtest.
- OVERSTORY-CITY-R046: `src/apps/city/__tests__/identity.test.ts::identity` — locked licenses, synthesized
  audio and no retired roster names.
- OVERSTORY-CITY-R028 (load gate): `src/apps/city/__tests__/budgets.test.ts::load_budgets` — shipped
  assets fit the initial-load budget and a chunk fits its caps.

## Quality and release proof

- `pnpm build` — record the chunk report (capture 2026-11-17): the shell
  chunk (`index-DODerBU1.js`, 357.49 kB) holds **zero** scene-library
  references; the three.js core ships in the on-demand chunk
  `OrbitControls-Bb8IkPSG.js` (600.97 kB), shared with the pre-existing
  graph 3D views (`model-DKoC20zT.js`, imported by the `AtlasView`/
  `Graph3DView`/`Graph3DLodView` chunks already on main before this lane);
  the city chunk group is `CityPage-5mdJ777h.js` (124.31 kB — the city core
  plus the `render3d/` split, replay driver, encoding table and budgets).
  The invariant is: the scene library is never in the shell bundle
  (OVERSTORY-CITY-R016).
- Asset weight: `du -sb public/city-assets/riders` = 503,452 bytes <
  5 MB.
- Lockfile: every pin in `public/city-assets/assets.lock.json` verifies
  against the on-disk bytes (size + sha256) — 18/18; every pin carries a
  `license` inside the top-level `license_allowlist` (R013 gate), and the
  asset-QA suites parse every GLB from its real bytes against the one
  budgets table (triangles / materials / texture size — 18/18 within
  budget, zero embedded images).
- Suites: `pnpm vitest run src/apps/city` (104/104, 10 files) and
  `uv run --no-sync pytest agent/overstory/__tests__/test_city_app.py`
  (12/12) green on the branch; full `pnpm test` (2958 passed) and full
  `uv run --no-sync pytest tests agent/overstory/__tests__` (578 passed,
  12 skipped, 1 xfailed) green. `pnpm run typecheck` and `pnpm run lint`
  (0 errors; the remaining warnings are the pre-existing baseline) green.
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

## Modular asset pack acceptance

These cases are planned. Bind tests to the full requirement IDs when implemented.

- OVERSTORY-CITY-R001.1: `src/lib/__tests__/city-sandbox.test.ts::requires an explicit development flag and a loopback origin` verifies opt-in and route scope. `e2e/city-sandbox.browser.ts::opens the anonymous demo from the Overstory landing page` aborts session lookup and observes browser-local registration.
- OVERSTORY-CITY-R001.2.1: `e2e/city-sandbox.browser.ts::opens the anonymous demo from the Overstory landing page` follows the link and verifies the demo UI.
- OVERSTORY-CITY-R028.1: `e2e/city-sandbox.browser.ts::reports browser FPS and the 60 FPS target when debug is enabled` waits for measured data and the budget status. R028 reference-hardware performance is measured separately.
- OVERSTORY-CITY-R048.5.1: `src/apps/city/__tests__/worldgen.test.ts::uses one continuous island boundary rather than a rectangular world cutoff` checks wet and dry samples across the rendered island's boundary. `src/apps/city/__tests__/waterways.test.ts` also checks conservative depth rejection, generated wet route segments, and bounded, continuous vessel motion; bridge clearances, actual bathymetry and refresh persistence remain unverified.
- OVERSTORY-CITY-R048.6.1: `src/apps/city/__tests__/sceneSoak.test.ts::holds scene-object and texture references steady through ten minutes of idle demo frames` counts retained scene objects and texture references across 36,000 scripted updates. The browser harness separately records frame times and fixed day/night poses.
- Local sandbox baseline at 1440 × 900 in headless Chromium with SwiftShader passed the material and density audits. A 60-frame sample measured 268.3 ms p50 and 340.2 ms p95. The measurement records software rendering. Hardware qualification and the browser soak remain open under R048.6.
- OVERSTORY-CITY-R048.9.1: `src/apps/city/__tests__/worldgen.test.ts::refuses a river through a foundation even when its center and corners are dry` checks the interior of the footprint and its rotated form. The layout regression also refuses a bank-straddling connector from both an edit and a saved override.
- OVERSTORY-CITY-R031.1: planned `e2e/city-production-world.browser.ts::daylight_contrast` verifies readable day materials and fallback.
- OVERSTORY-CITY-R041.1: planned `e2e/city-production-world.browser.ts::production_world_slice` qualifies the composed regional views.
- OVERSTORY-CITY-R047: planned `e2e/city-production-world.browser.ts::shared_city_state` compares admitted snapshots across two viewers and refresh.

| Requirement | Required checks |
| --- | --- |
| `OVERSTORY-CITY-R048.1` | Check the full catalog — launch families plus the extension catalog — as unique, independently addressable families. Reject missing provenance, hash mismatch, duplicate ID, invalid dimensions, incompatible sockets and unsafe bounds. Rebuild the same pack twice and compare normalized outputs. Every catalog entry must match its lock entry (file, digest, byte count), and every kit file in the lock must have a catalog entry (catalog-integrity check in `catalog.test.ts`). |
| `OVERSTORY-CITY-R048.2` | Capture every recipe in an asset review scene at a common scale. Compare silhouettes, frontage, window rhythm and roofs. Check opaque shells, trim UVs, near props, day/night glass and emissive separation. Verify that part changes do not alter live encoding. |
| `OVERSTORY-CITY-R048.3` | Exercise straight, curved, skewed, sloped and joined profiles with shared seam coordinates. Verify no visible holes, coplanar paint or flipped crossings. Refuse dry-road water crossings, park overlap, blocked sidewalks and deck clearance violations. Require lanes across valid bridges and no phantom turn at an overpass. Follow bus, compact and truck routes through multiple blocks. Detect visible resets or implausible speeds. |
| `OVERSTORY-CITY-R048.4` | Reach every declared room from a valid threshold and return to the original building exterior. Refuse stale IDs, absent portals and blocked paths. Test room reuse, keyboard and WebMCP parity, repeated entry, view changes, context loss and resource cleanup. |
| `OVERSTORY-CITY-R048.5` | View the entire perimeter and sample each coast family. Test terrain continuity across tile seams, dry foundations near the shore and navigable routes through a delta and beneath a bridge. Refuse shallow routes and support/boat intersections. |
| `OVERSTORY-CITY-R048.6` | Pair fixed-seed before/after views at comparable zoom, exposure and time. Review aerial day/night, storefront and fuel forecourt, park/shelter, suburban/rural, canal crossing, coastline and all interior recipes. Include lowest-quality readability and 2D fallback. Record exact revision and device/GPU/browser/resolution/tier. Run the 10-minute steady-state and 15-minute active/onboarding measurements under R048. Collect frame-time p50/p95, draw calls, geometry, texture bytes and heap trends after warmup. Compare teardown after chunk churn and repeated room entry/exit. Record missed targets explicitly. |
| `OVERSTORY-CITY-R048.7` | Compare each landmark silhouette and its rooms. Verify connector category override, unknown fallback, unpublished placeholder and stable ID. Enter Medulla and follow a permitted recall to the correct modality. Verify unavailable or unadmitted values remain undisclosed. Compare UI and WebMCP selection and entry. |
| `OVERSTORY-CITY-R048.8` | Repeat generation with shuffled input and tile order. Exercise reuse of one corridor by several relationships and physical access with zero semantic links. Validate curved polygon lots, dry footprints, doorway reachability, driveway swept space, stop accessibility, overpass separation and bridge limits. Force an impossible route and a conflicting pinned edit. Verify diagnostic output and unchanged accepted revision. |
| `OVERSTORY-CITY-R048.9` | Verify initial playability, connected drainage and identical generation for the same recipe version. Replay identical growth events through refresh with duplicate and stale events. Reject coastal corner overlap, water crossing a dry-corner footprint, submerged support and a flooded entrance. Preserve pins and unrelated IDs. |
| `OVERSTORY-CITY-R048.10` | Seat every infrastructure landmark family on its district lot and compare silhouettes: watch tower, cooling structure, gantry, yard track, canopy and forecourt must read the use at street height. Verify catalog provenance, digests and export QA reports. |
| `OVERSTORY-CITY-R048.11` | Review every commerce, entertainment and recreation family at street height: frontage, signage, queue and forecourt. Check the stadium and theme park against parcel clearance and pedestrian capacity at their scale. |
| `OVERSTORY-CITY-R048.12` | Review the industry, farming and settlement families; verify mining and oil/gas read as working sites and the datacenter as secure infrastructure. Compare the five skyscraper forms across a seeded core district for distinct height and crown variance. |
| `OVERSTORY-CITY-R048.13` | View the full island and sample each wild biome. Verify shoreline, bank and river-bend modules compose with the seeded hydrology, that wild terrain stays outside the serviced basin, and that dry-ground checks still refuse construction in wild water. |
| `OVERSTORY-CITY-R048.14` | Ground every fleet family: wheels or gear touch the corridor, vehicles face forward, lights occupy declared positions. Check trains and aircraft against rail-track, runway and taxiway sizing. |
| `OVERSTORY-CITY-R048.15` | Exercise every advanced class in level-aware profiles: 4/6/8-lane highways and freeways, toll portals, country and dirt roads, one-way, two-lane, asymmetric sections, tree boulevards, bridges, viaducts, flyover ramps and a double-stacked interchange. Verify ramps create no phantom routing nodes and deck, support, lane, pedestrian and navigation clearance hold in three dimensions. |
| `OVERSTORY-CITY-R048.16` | Run deterministic traffic: queue growth and dissipation at reds and bottlenecks, no overlap, clipping or visible reset inside a lane, and the frame budget at review density. Confirm the stop, signal and yield families are the only authority for lane state. |
| `OVERSTORY-CITY-R048.17` | Route one journey per modality between named destinations: a train ride, a bus transfer, a flight and a sidewalk walk. Assert each journey stays on its corridor through connected 3D geometry and that all modalities share one route graph. |
| `OVERSTORY-CITY-R001.2` | Navigate from signed-in Apps and the anonymous sandbox landing surface. Verify keyboard access, browser back, unavailable fleet fallback and inactive sandbox behavior. Confirm an unauthorized viewer gains no protected access. |
| `OVERSTORY-CITY-R049` | Review the civilian pack at street scale: at least twelve variants with distinct body, attire and palette; every variant on the shared rig with the full clip set; variants populate sidewalks, terraces and queues under the schedule. Verify catalog entries, lock licenses and QA budgets. |
| `OVERSTORY-CITY-R050` | Scrub the clock through a full day per building kind: occupancy follows the schedule (homes at night, offices in working hours, commerce at shopping hours, parks at leisure), window emissive follows occupancy, and quiet mode holds. Replay the same seed and assert identical placement; assert a different seed differs. |
| `OVERSTORY-CITY-R051` | Seat every civic anchor on its district lot and read its use at street height (city hall, courthouse, school, university, waste-recycling, substation, the education suite, government and public-services buildings; parks, fountains, statues and monuments on their plaza, lot and verge sockets). Place the street-life families on declared sockets under their district recipes and verify no pedestrian path is blocked; verify interactive nodes receive scheduled citizens. |
| `OVERSTORY-CITY-R052` | Compare species and seasonal palettes across districts; measure wind sway at the frame budget on a seeded capture; verify the low-tier static path renders without motion and without extra pools. |
| `OVERSTORY-CITY-R053` | Capture night with occupancy lights, vehicle lights, neon glow and smoke; capture the rain state with puddle specular response; assert lighting state comes only from day/night and weather, and the texture and frame budgets hold. |
| `OVERSTORY-CITY-R054` | Follow a bird, a pet and a vessel across the island: each stays on its corridor, the vessel uses the shared water route with bounded speed, and the waterfront shows scheduled occupancy. |
| `OVERSTORY-CITY-R055` | Walk the zoom ladder per district: each district layer dominates in its band, new vehicle cues fire, the mix stays inside the cap, and no audio file ships. |
| `OVERSTORY-CITY-R056` | Generate a seeded block with two or three tiers: height, material and density vary by tier and seed; corner variants fill triangular gaps; under-construction, run-down and upgraded states render their declared props and channels and bind to operational facts where one exists. |
| `OVERSTORY-CITY-R057` | Capture street level per district: clutter density matches the recipe, the same seed reproduces it, and no declared pedestrian path is blocked. |
| `OVERSTORY-CITY-R058` | Enter a café and a clinic: occupants match the exterior occupancy, are visible through windows at city zoom, and keyboard, pointer, WebMCP, 2D and context-loss lifecycles hold per the R048.4 contract. |
| `OVERSTORY-CITY-R059` | Generate two complete worlds from two seeds: environment, map, biome and terrain all derive from the seed; the same seed reproduces the identical manifest, a different seed differs, and no placed element traces to anything other than a generator rule. |
| `OVERSTORY-CITY-R060` | The road, rail, water and pedestrian networks come from the network solver: connected, level-aware and complete against the district recipes; rail and water routes appear only where the terrain provides them; no hand-laid segment survives in the manifest. |
| `OVERSTORY-CITY-R061` | Every generated map carries rural, suburban and city-center tiers; zone-based spawns follow the tier recipes for density, height and program; deterministic under the seed and different between seeds. |
| `OVERSTORY-CITY-R062` | A full-manifest sweep finds zero overlapping footprints or envelopes between any two placed elements; nature is placed first and displaced along infrastructure paths; dry-ground and water rules hold at every placement. |
| `OVERSTORY-CITY-R063` | Every asset the city loads is a pinned Blender-original kit family with matching digest; the non-kit pins are exactly the shared rig and the marker cube; catalog, lock and disk stay in integrity at the full family count. In the rendered scene: the provenance audit lists every visible mesh with a catalog family id or an explicit exempt declaration, and no launch-era generated geometry remains. |
| `OVERSTORY-CITY-R067` | The rendered world contains no launch-era generated geometry: overview and street captures show catalog road, building, prop, landscape and vehicle families; water is the continuous procedural coastline surface, not a painted rectangle; the provenance manifest covers every placed model. |
| `OVERSTORY-CITY-R068` | Every absorbed landmark and interior family has a catalog entry with source, digest and budgets; the renderer loads them from the catalog; the provenance audit lists them by family id; review renders match the launch silhouettes at street height. |
| `OVERSTORY-CITY-R069` | A seeded day produces a balanced ledger with income and expense attributable to named districts and activities; the treasury tracks it; the same seed replays identically; economic events surface in the feed and the WebMCP surface. |
| `OVERSTORY-CITY-R070` | Demand curves vary by zone and seed; spawn is demand-gated; a zoning edit through the user layer changes subsequent spawns; determinism holds. |
| `OVERSTORY-CITY-R071` | Population, happiness, unemployment and education evolve per district under the seed; coverage gaps lower happiness; population counts match the scheduled activity. |
| `OVERSTORY-CITY-R072` | Land values respond to declared adjacency changes; the RCI overlay matches the model; the 2D view agrees with the 3D overlay; determinism under the seed. |
| `OVERSTORY-CITY-R073` | Placing a service family covers its radius; an uncovered district decays; removing the service reverses it; maintenance hits the ledger; coverage recomputes after placement changes. |
| `OVERSTORY-CITY-R074` | Production appears as visible logistics traffic on valid routes; consumption draws goods down; an imbalance shifts demand; impossible goods routes are refused. |
| `OVERSTORY-CITY-R075` | Congestion lowers adjacent commercial income and service reliability; relief restores them; the same seed replays identical congestion and income; the debug view reports the measured congestion. |
| `OVERSTORY-CITY-R076` | A placement debits the treasury by the declared construction cost; a standing building accrues maintenance; an under-funded building decays to its state variant; the inspector shows per-building costs. |
| `OVERSTORY-CITY-R077` | Over a seeded world, every entity, placement, road and water feature in the 3D scene has a 1:1 counterpart in the 2D view at the same world coordinates and state encoding and vice versa (zero unmatched or divergent entries); the 2D view renders the full procedural world, not a bare plot schematic; a view switch mid-movement preserves identity, position, route, selection and focus with no duplicate tick, renderer or leaked context. |
| `OVERSTORY-CITY-R078` | A sustained full-scale soak in each view records at least 120 FPS average with a 60 FPS floor; the debug view reports the same measured figures per view; low-tier and reduced-motion paths hold the floor in both views. |
| `OVERSTORY-CITY-R064` | Car, plane, train and boat routes are accepted only when every constraint — connectivity, clearance, depth, level — holds; a blocked route is refused, never patched; the same seed replays the same accept/refuse decisions. |
| `OVERSTORY-CITY-R065` | A sustained full-scale soak records at least 120 FPS average with a 60 FPS floor; the debug view reports the same measured figures; low-tier and reduced-motion paths hold the floor. |
| `OVERSTORY-CITY-R066` | At night, skyscraper windows resolve per-floor occupancy from the schedule at frame rate, two buildings of the same family differ at the same instant, and the frame budget holds with every window live. |

For R015, R027, R048.8 and R048.9, generate at least two different seeds and compare the complete placement manifest against both views. Verify that map assets originate from the recipe or explicit saved user pins, that changed seeds do not retain legacy fixed placements, and that each building has dry, unobstructed road and pedestrian access. Capture the full island in each view and compare world-coordinate positions and metres per visible span. During movement, switch repeatedly between views and exercise context loss and restoration: assert continuous entity identity, position, route, selection and camera focus; no duplicate tick, renderer or leaked context; and no flash of an empty view. Test reduced-motion mode separately. Measure the transition and normal rendering against the existing 60 FPS budget on the reference device.

For R048.5, exercise a seeded vessel journey between connected berths across multiple water edges. Sample the entire hull envelope for land, depth, channel width and bridge clearances; refuse a route when any constraint fails. Assert bounded speed, acceleration and turn rate in real time at each simulation speed, no fixed-radius ocean orbit or visible reset, and the same vessel state in 2D and 3D across view switches and supported reconnects. Test a landlocked berth and a too-deep draft without inventing a route.
