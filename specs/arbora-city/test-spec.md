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
  - describe `speed and clock semantics (R012)`: speed scales the clock
    and the action timers together; pause freezes both. Bound:
    `// spec: OVERSTORY-CITY-R012`.
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
  - describe `parseSpeedParam (R012)`: parses the accepted speeds and
    defaults to 1×.
  - describe `mode decision (R014)`: boots `LIVE` when the host serves
    the fleet; falls back to `SIMULATED` with a stated banner when the
    fleet read fails; verifies every pinned asset at startup (18 verified
    events, no failures); lists the connectors from the live fleet in
    the onboard modal. Bound: `// spec: OVERSTORY-CITY-R014`.
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
- OVERSTORY-CITY-R032: `src/apps/city/__tests__/layout-edit.test.ts::override_round_trip` (planned) —
  building moves and road edits persist through the gateway and re-render for
  a second viewer; a disconnecting road edit is refused.
- OVERSTORY-CITY-R033: `src/apps/city/__tests__/ecosystem.test.ts::cast_encodes_role` (planned) —
  every character uses the shared rig and full clip set; silhouette and colour
  come from the encoding table.

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
