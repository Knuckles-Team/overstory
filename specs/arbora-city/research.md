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
