# OVERSTORY-CITY — Arbora City

**Owner:** `overstory`. Cross-repo IDs: the provider-side fleet-catalog row is recorded in [contracts/arbora-fleet-catalog.md](contracts/arbora-fleet-catalog.md); the follow-on rows R019–R024 additionally name owner rows in the arbora specs (the served layout read, the presence channel, the activity stream) and the medulla specs (the world-view ontology, the run-trace and prompt-asset vocabularies); R032's operator layout edits write through the same served layout read once it lands (ARBORA-FLEET-R084, with the medulla world-view rows supplying the override and spatial rules). State is computed by the generator, never written here.

Component: Arbora City (hosted app)
Depends-on: [OVERSTORY-APPS](../arbora-app-surface/spec.md), [OVERSTORY-API](../arbora-api-consumer/spec.md)
References: [ARBORA fleet catalog operations](https://github.com/Knuckles-Team/arbora) (`fleet.catalog.list`), [ecosystem boundaries](https://github.com/Knuckles-Team/pipelines/blob/main/reference/ecosystem-boundaries.md)
Code: ../../src/apps/city/surface.ts ../../agent/overstory/apps/city/router.py

## Outcome

A person opens one page and sees their agent platform as a living city. Every
core platform component is a landmark building; every connector in the Arbora
fleet is a building in the connector district — served connectors stand built
and online, registered connectors stand as planned plots; every AI agent and
human operator is a walking low-poly character. Autonomous work is visible at
a glance: agents travel, work, commit knowledge and sleep on a day/night
cycle, and an activity feed speaks the platform's operation vocabulary. Every
simulated element is labelled as such; every visual encodes one fact, and
nothing moves without a reason.

## User Scenarios & Testing

### User Story 1 - See the platform as a living city (Priority: P1)

A person opens the city page and immediately sees the platform: the seven
core landmarks, every served connector built and online, every registered
connector as a planned plot, and the agent population moving.

**Acceptance scenarios**

1. Given Arbora serves the fleet catalog, When the city page loads, Then the
   connector district shows one building per fleet server: a built online
   building for each `served` pack and a planned plot for each
   `registered_unpublished` pack, and the mode badge reads `LIVE`.
2. Given the fleet catalog has 7 served and 67 registered-unpublished servers,
   When the page loads, Then the stat bar reads `7/74 connectors online`
   (arbora core is a landmark, not a connector) and all 74 plots are named.
3. Given the person selects any building, When the selection lands, Then the
   inspector shows the building's role, its fleet pack status, its tools
   (served only) and its internal locations.

### User Story 2 - Ecosystem growth is visible (Priority: P1)

A registered connector is published by Arbora. The city reflects it without
redeployment.

**Acceptance scenarios**

1. Given a connector is a planned plot, When its pack status becomes `served`
   in a refreshed fleet read, Then the plot shows a building rising (crane
   animation, progress milestones in the feed) and the online count rises by
   one.
2. Given the district is fully plotted, When the catalog outgrows the
   district, Then onboarding of a new connector is refused with a visible
   queued event; the district is sized (78 plots) so this cannot occur with
   the current catalog.

### User Story 3 - Simulated operators are never mistaken for real ones (Priority: P1)

A person can always tell a simulated operator character from an AI agent,
and can see which elements of the city are simulated.

**Acceptance scenarios**

1. Given the population list is open, When the person reads any row, Then the
   row shows an `AI` or `NPC` kind badge plus the character's state and
   context bar; the NPC rows are labelled simulated.
2. Given the page shows the full population, When the city boots, Then it
   contains exactly 14 AI agents and 3 simulated operator characters (NPC
   kind), each a distinct pinned low-poly GLB character.

### User Story 4 - Steer the platform from the city (Priority: P2)

A person dispatches a task and inspects any character or building.

**Acceptance scenarios**

1. Given an idle agent exists, When the person presses dispatch, Then a human
   operator assigns the task and the feed shows the full chain:
   assign → travel → tool call → tool result → knowledge commit → idle,
   within 60 real seconds at 1× speed.
2. Given the person selects a character, When the selection lands, Then the
   camera focuses and the inspector shows kind, state, current task, context
   budget, mood and recent events.

### User Story 5 - Cheap and lazy (Priority: P2)

The city must not slow the rest of the operator workspace.

**Acceptance scenarios**

1. Given another page is open, When the city route has never been visited,
   Then the 3D scene library has not been downloaded (lazy route chunk).
2. Given the city loads, When every pinned character asset has been fetched,
   Then each pinned file was fetched exactly once (verified-byte reuse) and
   total pinned asset weight stays under 5 MB.

### User Story 6 - Degrade honestly (Priority: P1)

Every failure path is visible and typed.

**Acceptance scenarios**

1. Given the Arbora fleet operation is unreachable, When the city page loads,
   Then the mode badge reads `SIMULATED`, the city boots from the bundled
   fleet snapshot, and the banner states the reason.
2. Given a pinned character asset fails to fetch or hash, When the city
   retries once and fails again, Then that character renders as a placeholder
   cube, a typed `asset.failed` event appears in the feed, and the other
   characters are unaffected.
3. Given WebGL is unavailable, When the page loads, Then a 2D schematic of
   the same city graph renders with the same characters, events and
   inspector.
4. Given the WebGL context is lost, When the loss is not restored, Then the
   2D schematic takes over the canvas — no dead canvas.

### Edge Cases

- Arbora unreachable → `SIMULATED` mode with the bundled fleet snapshot;
  banner states the reason; simulation continues.
- The WebGL context is lost → the 2D schematic takes over; the simulation
  and the feed continue uninterrupted.
- The city is quiet by default → with no operator action, no agent moves on
  its own; the labelled demo mode restores the continuous behaviour.
- A pinned asset fails to fetch or hashes wrong → retry once; on second
  failure the character renders as the placeholder cube, a typed failure
  event is emitted, and the feed shows it.
- Onboarding with no empty plot → refused with a visible queued event. The
  district (78 plots) exceeds the current catalog (74 connectors), so this
  fires only if the catalog outgrows the district.
- Night arrives while an agent is working → the agent finishes the current
  tool call, returns home, and receives no new assignments until morning.
- Two agents commit to the vault simultaneously → both pulses render; the
  knowledge counter increments once per commit event.

## Requirements

- **FR-001**: The city is a hosted app at `/apps/city` with an honest mode — live fleet, or a labeled simulated fallback over the bundled snapshot — a 2D fallback when WebGL is absent, and lazy loading that leaves the shell bundle untouched. Rows: OVERSTORY-CITY-R001, OVERSTORY-CITY-R003, OVERSTORY-CITY-R014, OVERSTORY-CITY-R015, OVERSTORY-CITY-R016.
- **FR-002**: The connector district is the live fleet: one named plot per fleet server, served packs built online, registered packs planned, and a visible construction sequence when a pack is published. Rows: OVERSTORY-CITY-R002, OVERSTORY-CITY-R008.
- **FR-003**: Seven core landmarks (one per platform component) and a pinned, permissive-licensed character population — 14 AI agents plus 3 simulated operator characters, re-kinded as NPC and labelled simulated. Rows: OVERSTORY-CITY-R004, OVERSTORY-CITY-R005.
- **FR-004**: A seeded, deterministic simulation of agent and operator activity: an explicit state machine with one guarded transition, dispatch and approval, day/night, speed control, selection and inspector. Rows: OVERSTORY-CITY-R006, OVERSTORY-CITY-R007, OVERSTORY-CITY-R009, OVERSTORY-CITY-R011, OVERSTORY-CITY-R012.
- **FR-005**: An activity feed in the platform's typed event vocabulary, and pinned asset verification at startup. Rows: OVERSTORY-CITY-R010, OVERSTORY-CITY-R013.
- **FR-006**: No credentials or identities in the browser, and safe unmount with no surviving background work. Rows: OVERSTORY-CITY-R017, OVERSTORY-CITY-R018.
- **FR-007**: The follow-on world: enterable buildings, live ecosystem mirroring, Medulla-backed layout, NPC dialogue, visitor presence and asset scale-out — each naming its owner rows in the arbora and medulla specs. Rows: OVERSTORY-CITY-R019, OVERSTORY-CITY-R020, OVERSTORY-CITY-R021, OVERSTORY-CITY-R022, OVERSTORY-CITY-R023, OVERSTORY-CITY-R024.
- **FR-008**: The city reads like the platform it mirrors: one visual encoding table with an always-on legend, quiet-by-default activity with a labelled demo mode, full keyboard accessibility, performance budgets as acceptance criteria, a time scrubber over deterministically replayable history, and a first-visit tour. Rows: OVERSTORY-CITY-R025, OVERSTORY-CITY-R026, OVERSTORY-CITY-R027, OVERSTORY-CITY-R028, OVERSTORY-CITY-R029, OVERSTORY-CITY-R030.
- **FR-009**: The flagship bar: the 3D view meets the shared fidelity bar (the browser-design-system spec's R012.1–R012.9 rows), operators shape the layout through validated, animated, stored edits, and the cast reads as the fleet — one shared rig with role encoding replacing the borrowed roster. Rows: OVERSTORY-CITY-R031, OVERSTORY-CITY-R032, OVERSTORY-CITY-R033.

## Success Criteria

- **SC-001**: First load shows all 17 characters, the 7 landmarks, and one named plot per fleet connector, with the served ones built and online. Rows: OVERSTORY-CITY-R002, OVERSTORY-CITY-R004, OVERSTORY-CITY-R005.
- **SC-002**: A dispatched task produces a complete event chain (assign → travel → at least one tool call → commit → idle) within 60 real seconds at 1× speed. Rows: OVERSTORY-CITY-R006, OVERSTORY-CITY-R007.
- **SC-003**: A connector building completes construction within 30 real seconds at 1× speed; the new building receives its first agent visit within 2 real minutes. Rows: OVERSTORY-CITY-R008.
- **SC-004**: Lockfile verification passes for every pinned character asset with zero mismatches. Rows: OVERSTORY-CITY-R013.
- **SC-005**: A full in-game day at 4× speed (10 minutes real) produces zero uncaught errors. Rows: OVERSTORY-CITY-R009.

## Assumptions

- City *activity* (walking agents, tasks, day/night) is the seeded
  deterministic simulation in both modes in this delivery; `LIVE` covers the
  connector district only — the building list comes from the fleet, and
  every activity element is labelled simulated (per-event provenance, feed
  badge). Live run-event consumption is the follow-on row
  OVERSTORY-CITY-R020, not part of this delivery.
- The fleet catalog served by Arbora is the single authority for the
  connector district; the 78-plot district exceeds the current
  74-connector catalog, so growth never needs to extend the city geometry.
- Character assets are pinned and permissively licensed: one shared rig
  with role variants per OVERSTORY-CITY-R033 (the 2026-11-17 delivery
  carried the 18-file rider pack); buildings, roads and water are
  procedural geometry, not assets.
- Target platforms are modern browsers; WebGL availability is probed at
  runtime and the 2D schematic covers its absence.
- Success criteria are measured in real seconds at 1× (what an operator
  waits), while the in-game clock runs at timeScale 144 (one day = ten real
  minutes).

## Why a new spec

Search: `git grep -n -i "city\|connector district\|simulated city" -- specs`
finds no WebUI row for a platform-city view. OVERSTORY-APPS owns the app shell
and the `AppSurface` contract the city implements. OVERSTORY-API owns the
arbora client seam the city's host routes ride on. No existing spec owns city
presentation, the fleet-to-city mapping, or the simulation core. This spec
owns all three and extends none of them.

## Scope and interfaces

- Owns the `/apps/city` page, the `city` hosted app (host routes under
  `/api/apps/city`), the fleet-to-city mapping, the simulation core, the
  3D/2D renderers and the pinned character assets.
- Does not own fleet state. Arbora serves the fleet catalog
  (`fleet.catalog.list`); the city reads it through the host only.
- Does not own run-event streaming into the city. Consuming live run events
  is the follow-on row OVERSTORY-CITY-R020; this delivery wires live
  *fleet state* and keeps city *activity* in the deterministic
  simulation, marked `SIMULATED` in the UI.
- Does not own generated building art. A later phase (OVERSTORY-CITY-R024)
  admits generated facade/sign art through new lockfile entries with
  per-asset provenance.

## Data model

- **Character** — `id`, `kind` (`ai` | `human`), `name`, `riderId`, `state`
  (`idle` | `tasked` | `traveling` | `working` | `committing` | `sleeping` |
  `patrolling`), `contextUsage` (0–100), `mood`, `homePlot`, `eventRefs[]`.
- **Building** — `id`, `category` (`core` | `connector`), `name`, `role`,
  `fleetServer` (connector only), `packStatus` (`served` |
  `registered_unpublished`), `tools[]`, `rooms[]`, `online` (bool),
  `visitCount`.
- **Task** — `id`, `agentId`, `buildingId`, `toolName`, `state`
  (`queued` | `pending_approval` | `active` | `done` | `failed`),
  `approvalRequired` (bool).
- **Event** — `id`, `type` (typed vocabulary, see plan.md), `ts` (in-game
  seconds since midnight), `refs` (`characterId`, `buildingId`, `taskId`),
  `detail`.
- **CityState** — `day`, `clock` (in-game seconds since midnight, 0–86400),
  `mode` (`live` | `simulated`), `knowledgeCommitted`, `toolCalls`,
  `incidents`, `approvals`, `connectorsOnline`.

### Time model

The in-game clock runs at a fixed `timeScale` (144 in-game seconds per real
second at 1×), so one in-game day is ten real minutes and the day/night cycle
reads as a living city. Character actions — walking, tool calls,
construction, task cadence — are paced in **real** seconds at 1× so motion
and work look natural; the speed control multiplies the clock and the action
timers together. Success criteria are therefore measured in real
seconds (what an operator actually waits), not in-game seconds.
