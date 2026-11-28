# OVERSTORY-CITY research

Findings that support decisions in plan.md, in this platform's terms.

## The live fleet is the connector authority

Question: what is the authority for which connectors exist, which are
online, and which tools they serve?

Resolution: the served fleet catalog read (`fleet.catalog.list`) is the
authority. A curated list was rejected: it duplicates a fact owned by the
served catalog, goes stale on every onboarding, and adds a second source
the city would have to reconcile.

Live capture (2026-11-15, from the host's bound actor): 75 registered
servers — 7 served packs (audio-transcriber 12 tools, dockerhub 82,
mealie 254, nextcloud 89, openbao 42, sql 33, vector 7), 67
registered-unpublished, plus the arbora core pack (15 skills, 29 prompts).
The arbora core is excluded from the connector district: it is a core
platform component and renders as a landmark, not a connector.

Consequences: the connector district is 78 plots (6 columns × 13 rows),
exceeding the current 74-connector catalog; the hosted read is cached for
60 s; an unreachable read degrades the city to its bundled snapshot
(captured the same day) with the mode badge reading `SIMULATED`.

## Pinned binary assets and the security gate

Question: how do the 18 pinned binary character assets pass the
repository's security gate, which inspects every source file?

Resolution: reading the gate source, the sanitizer decodes every file
strictly and skips only a fixed list of trusted binary extensions
(images, fonts, media, archives). The GLB extension is not on that list,
and the gate has no file-level, path-level or value-list exemption
(anywhere in the sanitizer: only a justified per-line marker in text
files). So the binary assets are uninspectable as-is, and the fix is an
upstream gate change: add the GLB extension to the sanitizer's excluded
extension list in pipelines (the gate-owning repository), with a bound
test.

In the meantime the lane keeps the provenance intact: one exact source
commit, per-file sha256 and byte count in
`public/city-assets/assets.lock.json`, the dataset survey (used and
rejected) in `public/city-assets/SOURCES.md`, and startup verification of
every pin in the app (OVERSTORY-CITY-R013). The overstory lane's commit
and push are blocked on the upstream gate change landing first.

## Licensing is a gate, not a note

Question: when the asset scale-out (OVERSTORY-CITY-R024) uses generated
models, whose licence must be checked?

Resolution: not only the hosting repository's. Some 3D-generation model
licences restrict use by territory or scale, so the generator model's
terms are part of the asset's provenance. The lockfile therefore carries a
per-file `license` and a top-level `license_allowlist`; startup
verification refuses a pin whose license is outside the allowlist
(OVERSTORY-CITY-R013), and every locked asset passes automated QA against
the stated budgets (triangles ≤ 4000, materials ≤ 16, texture size ≤
2048 px, bounds) with a rendered turnaround thumbnail on file for human
review. A failing asset never enters the lock.

## Direction review of 2026-11-20: decisions the review left open

Question: the review names R022 as the row that becomes full customization. In this spec R022 is the NPC dialogue row.
Resolution: the customization extends R032 (operators shape the city) and the new R040 (the edit layer). R022 keeps the dialogue. The review's intent, "manual overrides only" becoming a full layer over the generator, is carried by R032 and R040.

Question: principle R-G1 says no business, product or connector is named in game code, but the seven core landmarks (R004) and the bundled fleet snapshot (R002, R014) name platform components.
Resolution: the new modules (mapping, growth, traffic, hall, edit layer) name nothing, and a test enforces it. The landmarks and the snapshot are a labelled simulated fallback. They move into served facts when R021 lands, and the fallback shrinks to the neutral fixture in `graphFacts.ts`.

Question: how is the "ship arrives at the exchange" horn cued when the sim has no such event?
Resolution: the cue table keys the horn on `ship.arrived`, which the exchange archetype will emit when time-series and market facts are served. The cue is tested, and the event is planned.

Question: which web UI route is the twin of each city work action (R043)?
Resolution: the parity table records only what exists. Onboarding maps to the fleet view. Dispatch and the layout edit have no web UI twin yet and name the row that closes the gap. The parity test fails if a work action has neither.

Question: where do the first-person, interior and dialogue views stand (R043)?
Resolution: they stay planned behind R019 and R022. Pure view actions need no web UI twin.

Question: should the audio start on page load?
Resolution: no. Browsers block it before a user gesture and it surprises an operator. The engine starts muted, the toggle is the gesture, and the WebMCP tool may be ignored by the browser until a gesture has occurred.

Question: R012.9 golden viewpoints.
Resolution: still blocked on the Arbora no-auth rows (`ARBORA-IDENTITY-R004.7.3`, `ARBORA-FLEET-R085`) and the engine content-pack refusal. The local simulated capture harness is planned in R031 and R012.9 and is not claimed done here.

## Production-world review of 2026-11-20

The [2026-11-21 screenshot audit](asset-pack.md#screenshot-audit) compares three reference city views, two current city views and eleven detailed kit references. The seven pasted notes have identical contents. Their 4 m grid and library suggestions are design candidates. This draft adopts local module dimensions and freeform, road-relative placement. The supplied screenshots establish the visual bar even though the linked video could not be inspected.

Question: can the current procedural city be called production-grade or be
compared visually with a commercial city builder?

Resolution: no. It is a systems visualization with a legible interaction
model, not yet a composed game world. The observed scene has a repetitive
road grid, sparse district differentiation, weak horizon composition, flat
terrain, and incomplete building silhouettes. Rendering correctness and
frame pacing repairs do not substitute for authored visual hierarchy.

The durable design decision is R041.1: build one production-world vertical
slice before broadening the map. It must prove a dense core, skyline, terrain,
waterfront, river or canal, bridges, boats, sky and ambient flight, plus
watertight building geometry. The three approved overview cameras are the
review artifact. No direct asset or design copying from commercial games is
permitted; R013 and R046 remain the provenance gate.

Question: why do character locations reset and disagree between viewers?

Resolution: the current `initSim` creates a browser-local roster and the page
disposes it on unmount. The stored layout is shared, but the character state
is not. R047 moves the source of truth to Medulla through Arbora's revisioned
city-state operation. Snapshot cadence stays bounded; visual interpolation is
local only. Human avatars can update only their own virtual location. Physical
location is out of scope and must never enter the city state.
