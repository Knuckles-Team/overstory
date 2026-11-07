# Arbora shell and app delivery

No exact-head publication receipt is recorded.

- [ ] T001 [US1] OVERSTORY-APPS-R001 Inventory current brand identifiers, package consumers, generated assets, site links, consent keys and tool IDs on main.
- [x] T002 [US1] OVERSTORY-APPS-R038 Make browser title, metadata, web manifest, docs site name and README consistently present the Arbora brand, with a `site:brand:check` gate (part of `pnpm run build`) proving it. (OVERSTORY-APPS-R038; index.html/webmanifest already said "Arbora"; this fixes `mkdocs.yml` `site_name`/ecosystem entry and `README.md`'s heading, overview line and license line, and is deliberately scoped to brand copy only — no package, import or environment rename.)
- [ ] T003 [US1] OVERSTORY-APPS-R038 Add `apps` navigation and one typed `AppSurface` contract using existing route, contribution, WebMCP and renderer seams.
- [ ] T004 [US1] OVERSTORY-APPS-R038 Integrate Markets as first native consumer and add valid/invalid contributed-app fixtures.
- [x] T005 [US1] OVERSTORY-APPS-R039 Perform atomic public-name package and consumer cutover; regenerate assets and digests; document browser migration. (OVERSTORY-APPS-R039, OVERSTORY-APPS-R043, OVERSTORY-APPS-R002's remaining theme-token/asset-regeneration surface, OVERSTORY-APPS-R003: source commit 677a27e0f701eca99cad20887a0b5c4b8ec9734e exists on local branch feat/eh427-retire-review-20260926 but conflicts heavily with main — rename touches package.json, pyproject.toml, uv.lock, pnpm-lock.yaml and deletes files main already restructured; needs a fresh, smaller port, not a direct cherry-pick. The operator has not yet confirmed this package-identity rename; do not attempt it without that confirmation.)
- [ ] T006 [US1] OVERSTORY-APPS-R039 Run all test-spec gates, installed wheel and Pages build on exact commit; record consumer and publication evidence.
- [ ] T007 [US1] OVERSTORY-APPS-R039 Review every requirement after attaching browser, package and public-site evidence.
- [ ] T008 [US1] OVERSTORY-APPS-R004 Run harness surface (rollup of 1 to 6)
- [ ] T009 [US1] OVERSTORY-APPS-R004.1 Run read goes through the arbora read operations.
- [ ] T010 [US1] OVERSTORY-APPS-R004.2 Applied harness configuration is shown.
- [ ] T011 [US1] OVERSTORY-APPS-R004.3 Context use is shown against the budget.
- [ ] T012 [US1] OVERSTORY-APPS-R004.4 Current plan is shown read-only.
- [ ] T013 [US1] OVERSTORY-APPS-R004.5 Each termination reason has a distinct state.
- [ ] T014 [US1] OVERSTORY-APPS-R004.6 Absent operation shows an honest state.
- [ ] T015 [US1] OVERSTORY-APPS-R030.1 Graph edit types.
- [ ] T016 [US1] OVERSTORY-APPS-R030.2 Send edits to arbora.
- [ ] T017 [US1] OVERSTORY-APPS-R030.3 Wire graph handlers to the engine.
- [ ] T018 [US1] OVERSTORY-APPS-R030.4 Show refusals on unauthorized edits.
- [ ] T019 [US1] OVERSTORY-APPS-R030.5 Semantic filters and persona modes.
- [ ] T020 [US1] OVERSTORY-APPS-R030.6 Edit log with verdicts.
- [ ] T021 [US1] OVERSTORY-APPS-R030.7 Graph edit hot-path proof.
- [ ] T022 [US1] OVERSTORY-APPS-R031.1 Memory file types.
- [ ] T023 [US1] OVERSTORY-APPS-R031.2 Memory file operations.
- [ ] T024 [US1] OVERSTORY-APPS-R031.3 Files tab in the memory view.
- [ ] T025 [US1] OVERSTORY-APPS-R031.4 Authorized retained conflicts and head-free refusals.
- [ ] T026 [US1] OVERSTORY-APPS-R031.5 Sync state labels.
- [ ] T027 [US1] OVERSTORY-APPS-R031.6 Save evidence.
- [ ] T028 [US1] OVERSTORY-APPS-R031.7 Memory files hot-path proof.

No task above names a requirement ID individually; together they must close every ID in [requirements.md](requirements.md) — `OVERSTORY-APPS-R038`, `OVERSTORY-APPS-R039`, `OVERSTORY-APPS-R040`, `OVERSTORY-APPS-R041`, `OVERSTORY-APPS-R042`, `OVERSTORY-APPS-R043`, `OVERSTORY-APPS-R044`, `OVERSTORY-APPS-R001`, `OVERSTORY-APPS-R002`, `OVERSTORY-APPS-R003`, `OVERSTORY-APPS-R004`.
- [ ] T029 [US1] OVERSTORY-APPS-R005 Navigation and dashboards follow the signed-in user's role (rollup).
- [ ] T030 [US1] OVERSTORY-APPS-R005.1 Nav entry declares a minimum role.
- [ ] T031 [US1] OVERSTORY-APPS-R005.1.1 Registry role contract.
- [ ] T032 [US1] OVERSTORY-APPS-R005.1.2 Rendered role filtering.
- [ ] T033 [US1] OVERSTORY-APPS-R005.2 Layout saved per user.
- [ ] T034 [US1] OVERSTORY-APPS-R005.3 Operate renders tiles for returned fleet children with source regression coverage. Complete connector catalog and connection-state acceptance remain open.
- [ ] T035 [US1] OVERSTORY-APPS-R005.4 One chat session list.
- [ ] T036 [US1] OVERSTORY-APPS-R005.5 Every route renders.
- [ ] T037 [US1] OVERSTORY-APPS-R005.5.1 Census detects a throwing view.
- [ ] T038 [US1] OVERSTORY-APPS-R005.5.2 Complete route render acceptance.
- [ ] T039 [US1] OVERSTORY-APPS-R005.6 Each view states its purpose.
- [ ] T040 [US1] OVERSTORY-APPS-R005.6.1 Registry purpose copy.
- [ ] T041 [US1] OVERSTORY-APPS-R005.6.2 Rendered purpose visibility.
- [ ] T042 [US1] OVERSTORY-APPS-R006 One panel relates goals, sessions and fleets (rollup).
- [ ] T043 [US1] OVERSTORY-APPS-R006.1 Link type.
- [ ] T044 [US1] OVERSTORY-APPS-R006.2 Panel reads typed operations.
- [ ] T045 [US1] OVERSTORY-APPS-R006.3 Absent operation is honest.

- [ ] T046 [US1] OVERSTORY-APPS-R030.7 implement the served browser → Arbora operation → fixture-engine journey and prove unauthorized edits leave durable graph state unchanged.
- [ ] T047 [US1] OVERSTORY-APPS-R031.2 R031.2 prerequisite: implement generated EG R085 and Arbora R024.4.1–.6 contracts through canonical invoke; prove registered same-origin hosting. Definitions exist, runtime proof remains missing.
- [ ] T048 [US1] OVERSTORY-APPS-R031.7 implement served snapshot/conflict/refusal journeys and the unchanged-head observation-generation acknowledgment race. Retain and reload authorized versions. Prove redacted denied/revoked reads and browser acknowledgment refusal. Accept sync labels only from EG evidence. No client/host-handler/engine-transport mocks.

<!-- spec-definition-patch:consumer-definitions-20261012 -->
## Consumer implementation tasks

Unchecked tasks remain open. Definitions alone do not establish runtime delivery.

- [ ] T049 [US1] OVERSTORY-APPS-R004.7.1 Implement and prove model for evolution evidence.
- [ ] T050 [US1] OVERSTORY-APPS-R004.7.2 Implement and prove behavior for evolution evidence.
- [ ] T051 [US1] OVERSTORY-APPS-R004.7.3 Implement and prove wiring for evolution evidence.
- [ ] T052 [US1] OVERSTORY-APPS-R004.7.4 Implement and prove refusal for evolution evidence.
- [ ] T053 [US1] OVERSTORY-APPS-R004.7.5 Implement and prove evidence for evolution evidence.
- [ ] T054 [US1] OVERSTORY-APPS-R004.7.6 Implement and prove served acceptance for evolution evidence.
- [ ] T055 [US1] OVERSTORY-APPS-R006.4.1 Implement and prove model for unified harness sessions.
- [ ] T056 [US1] OVERSTORY-APPS-R006.4.2 Implement and prove behavior for unified harness sessions.
- [ ] T057 [US1] OVERSTORY-APPS-R006.4.3 Implement and prove wiring for unified harness sessions.
- [ ] T058 [US1] OVERSTORY-APPS-R006.4.4 Implement and prove refusal for unified harness sessions.
- [ ] T059 [US1] OVERSTORY-APPS-R006.4.5 Implement and prove evidence for unified harness sessions.
- [ ] T060 [US1] OVERSTORY-APPS-R006.4.6 Implement and prove served acceptance for unified harness sessions.
- [ ] T061 [US1] OVERSTORY-APPS-R004.8.1 Implement and prove model for indexed usage analysis.
- [ ] T062 [US1] OVERSTORY-APPS-R004.8.2 Implement and prove behavior for indexed usage analysis.
- [ ] T063 [US1] OVERSTORY-APPS-R004.8.3 Implement and prove wiring for indexed usage analysis.
- [ ] T064 [US1] OVERSTORY-APPS-R004.8.4 Implement and prove refusal for indexed usage analysis.
- [ ] T065 [US1] OVERSTORY-APPS-R004.8.5 Implement and prove evidence for indexed usage analysis.
- [ ] T066 [US1] OVERSTORY-APPS-R004.8.6 Implement and prove served acceptance for indexed usage analysis.
- [ ] T067 [US1] OVERSTORY-APPS-R030.8.1 Implement and prove model for live graph convergence.
- [ ] T068 [US1] OVERSTORY-APPS-R030.8.2 Implement and prove behavior for live graph convergence.
- [ ] T069 [US1] OVERSTORY-APPS-R030.8.3 Implement and prove wiring for live graph convergence.
- [ ] T070 [US1] OVERSTORY-APPS-R030.8.4 Implement and prove refusal for live graph convergence.
- [ ] T071 [US1] OVERSTORY-APPS-R030.8.5 Implement and prove evidence for live graph convergence.
- [ ] T072 [US1] OVERSTORY-APPS-R030.8.6 Implement and prove served acceptance for live graph convergence.
- [ ] T073 [US1] OVERSTORY-APPS-R001.1.1 Implement and prove model for retrieval quality comparison.
- [ ] T074 [US1] OVERSTORY-APPS-R001.1.2 Implement and prove behavior for retrieval quality comparison.
- [ ] T075 [US1] OVERSTORY-APPS-R001.1.3 Implement and prove wiring for retrieval quality comparison.
- [ ] T076 [US1] OVERSTORY-APPS-R001.1.4 Implement and prove refusal for retrieval quality comparison.
- [ ] T077 [US1] OVERSTORY-APPS-R001.1.5 Implement and prove evidence for retrieval quality comparison.
- [ ] T078 [US1] OVERSTORY-APPS-R001.1.6 Implement and prove served acceptance for retrieval quality comparison.
- [ ] T079 [US1] OVERSTORY-APPS-R001.2.1 Implement and prove model for bounded large-data charts.
- [ ] T080 [US1] OVERSTORY-APPS-R001.2.2 Implement and prove behavior for bounded large-data charts.
- [ ] T081 [US1] OVERSTORY-APPS-R001.2.3 Implement and prove wiring for bounded large-data charts.
- [ ] T082 [US1] OVERSTORY-APPS-R001.2.4 Implement and prove refusal for bounded large-data charts.
- [ ] T083 [US1] OVERSTORY-APPS-R001.2.5 Implement and prove evidence for bounded large-data charts.
- [ ] T084 [US1] OVERSTORY-APPS-R001.2.6 Implement and prove served acceptance for bounded large-data charts.
- [ ] T085 [US1] OVERSTORY-APPS-R001.3.1 Implement and prove model for column vector controls.
- [ ] T086 [US1] OVERSTORY-APPS-R001.3.2 Implement and prove behavior for column vector controls.
- [ ] T087 [US1] OVERSTORY-APPS-R001.3.3 Implement and prove wiring for column vector controls.
- [ ] T088 [US1] OVERSTORY-APPS-R001.3.4 Implement and prove refusal for column vector controls.
- [ ] T089 [US1] OVERSTORY-APPS-R001.3.5 Implement and prove evidence for column vector controls.
- [ ] T090 [US1] OVERSTORY-APPS-R001.3.6 Implement and prove served acceptance for column vector controls.
- [ ] T091 [US1] OVERSTORY-APPS-R001.4.1 Implement and prove model for remote editor compatibility.
- [ ] T092 [US1] OVERSTORY-APPS-R001.4.2 Implement and prove behavior for remote editor compatibility.
- [ ] T093 [US1] OVERSTORY-APPS-R001.4.3 Implement and prove wiring for remote editor compatibility.
- [ ] T094 [US1] OVERSTORY-APPS-R001.4.4 Implement and prove refusal for remote editor compatibility.
- [ ] T095 [US1] OVERSTORY-APPS-R001.4.5 Implement and prove evidence for remote editor compatibility.
- [ ] T096 [US1] OVERSTORY-APPS-R001.4.6 Implement and prove served acceptance for remote editor compatibility.
- [ ] T097 [US1] OVERSTORY-APPS-R001.5.1 Implement and prove model for meeting transcripts and summaries.
- [ ] T098 [US1] OVERSTORY-APPS-R001.5.2 Implement and prove behavior for meeting transcripts and summaries.
- [ ] T099 [US1] OVERSTORY-APPS-R001.5.3 Implement and prove wiring for meeting transcripts and summaries.
- [ ] T100 [US1] OVERSTORY-APPS-R001.5.4 Implement and prove refusal for meeting transcripts and summaries.
- [ ] T101 [US1] OVERSTORY-APPS-R001.5.5 Implement and prove evidence for meeting transcripts and summaries.
- [ ] T102 [US1] OVERSTORY-APPS-R001.5.6 Implement and prove served acceptance for meeting transcripts and summaries.
- [ ] T103 [US1] OVERSTORY-APPS-R001.6.1 Implement and prove model for bookmark knowledge views.
- [ ] T104 [US1] OVERSTORY-APPS-R001.6.2 Implement and prove behavior for bookmark knowledge views.
- [ ] T105 [US1] OVERSTORY-APPS-R001.6.3 Implement and prove wiring for bookmark knowledge views.
- [ ] T106 [US1] OVERSTORY-APPS-R001.6.4 Implement and prove refusal for bookmark knowledge views.
- [ ] T107 [US1] OVERSTORY-APPS-R001.6.5 Implement and prove evidence for bookmark knowledge views.
- [ ] T108 [US1] OVERSTORY-APPS-R001.6.6 Implement and prove served acceptance for bookmark knowledge views.
- [ ] T109 [US1] OVERSTORY-APPS-R001.7.1 Implement and prove model for sandboxed design artifacts.
- [ ] T110 [US1] OVERSTORY-APPS-R004.9.1 Implement and prove model for the evolution projection dashboard.
- [ ] T111 [US1] OVERSTORY-APPS-R037.1 Implement and prove model for design flow agent discovery.
- [ ] T112 [US1] OVERSTORY-APPS-R001.7.2 Implement and prove behavior for sandboxed design artifacts.
- [ ] T113 [US1] OVERSTORY-APPS-R001.7.3 Implement and prove wiring for sandboxed design artifacts.
- [ ] T114 [US1] OVERSTORY-APPS-R001.7.4 Implement and prove refusal for sandboxed design artifacts.
- [ ] T115 [US1] OVERSTORY-APPS-R001.7.5 Implement and prove evidence for sandboxed design artifacts.
- [ ] T116 [US1] OVERSTORY-APPS-R001.7.6 Implement and prove served acceptance for sandboxed design artifacts.
- [ ] T117 [US1] OVERSTORY-APPS-R001.8.1 Implement and prove model for interactive code explanations.
- [ ] T118 [US1] OVERSTORY-APPS-R001.8.2 Implement and prove behavior for interactive code explanations.
- [ ] T119 [US1] OVERSTORY-APPS-R001.8.3 Implement and prove wiring for interactive code explanations.
- [ ] T120 [US1] OVERSTORY-APPS-R001.8.4 Implement and prove refusal for interactive code explanations.
- [ ] T121 [US1] OVERSTORY-APPS-R001.8.5 Implement and prove evidence for interactive code explanations.
- [ ] T122 [US1] OVERSTORY-APPS-R001.8.6 Implement and prove served acceptance for interactive code explanations.
<!-- /spec-definition-patch -->

- [ ] T123 [US1] OVERSTORY-APPS-R001.8.6 Reconcile exact specialized producer requirements, operation IDs and schema revisions before marking any source input definition-complete.
- [ ] T124 [US1] OVERSTORY-APPS-R004.8 Obtain owner-defined positive finite latency, layout and viewport bounds for R004.8, R030.8 and R001.2.
- [ ] T125 [US1] OVERSTORY-APPS-R006.4 Bind R006.4 acceptance to every entry in the complete versioned supported-harness manifest.

## Responsive workspace extension: implementation and evidence open

- [ ] T126 [US1] OVERSTORY-APPS-R045 Implement complete capability and leaf census. Run the planned acceptance in test-spec.md. Attach the exact merged revision and evidence. No runtime result is claimed by this specification.
- [ ] T127 [US1] OVERSTORY-APPS-R046 Implement one semantic workspace navigation state. Run the planned acceptance in test-spec.md. Attach the exact merged revision and evidence. No runtime result is claimed by this specification.
- [ ] T128 [US1] OVERSTORY-APPS-R047 Implement native webmcp action equivalence. Run the planned acceptance in test-spec.md. Attach the exact merged revision and evidence. No runtime result is claimed by this specification.
- [ ] T129 [US1] OVERSTORY-APPS-R048 Implement webmcp lifecycle and authority preservation. Run the planned acceptance in test-spec.md. Attach the exact merged revision and evidence. No runtime result is claimed by this specification.
- [ ] T130 [US1] OVERSTORY-APPS-R049 Implement preserve every feature through the arbora redesign. Run the planned acceptance in test-spec.md. Attach the exact merged revision and evidence. No runtime result is claimed by this specification.
- [ ] T131 [US1] OVERSTORY-APPS-R050 Implement composed deployment and shared-backend acceptance. Run the planned acceptance in test-spec.md. Attach the exact merged revision and evidence. No runtime result is claimed by this specification.

## Registered navigation source evidence

- [x] T132 [US1] OVERSTORY-APPS-R046.1 Implement registered navigation controls and shared dispatch. Run the two bound source test files.
- [ ] T133 [US1] OVERSTORY-APPS-R046.2 Complete dynamic deepest-leaf, semantic zoom and actual browser history/focus acceptance. Include keyboard, touch and rendered mobile layouts.

## Consolidated redesign delivery

- [ ] T134 [US1] OVERSTORY-APPS-R049.1 Complete the destination-to-context migration matrix and classify every domain action.
- [ ] T135 [US1] OVERSTORY-APPS-R049.1 Replace standalone layouts with contextual surfaces. Preserve compatible URLs and authorization.
- [ ] T136 [US1] OVERSTORY-APPS-R049.1 Retire duplicate shells and redundant navigation after action and state parity tests pass.
- [ ] T137 [US1] OVERSTORY-APPS-R049.2 Capture old task journeys and compare the actual three-context implementation.
- [ ] T138 [US1] OVERSTORY-APPS-R049.2 Record navigation counts, scroll distances and viewport evidence. Keep failures and unfinished domains open.
- [ ] T139 [US1] OVERSTORY-APPS-R049.1 Carry forward backend, safety, data and action tests. Replace page-layout assertions with consolidated workspace acceptance.
- [ ] T140 [US1] OVERSTORY-APPS-R049.2 Stop cosmetic work on retired layouts. Test the new composition instead of matching old screenshots.

- [ ] T141 [US1] OVERSTORY-APPS-R049.1.1 Bind retained Explore source tests and record their exact source revision and normal gate evidence.
- [ ] T142 [US1] OVERSTORY-APPS-R049.1.2 Finish the destination migration and installed-browser capability matrix. Keep unfinished contexts and producer checks open.

- [ ] T143 [US1] OVERSTORY-APPS-R049.1.3 Bind the retained Work source tests and preserve one existing Chat instance.
- [ ] T144 [US1] OVERSTORY-APPS-R049.1.3 Check independent task/trace reads and typed navigation without claiming missing associations.
- [ ] T145 [US1] OVERSTORY-APPS-R049.1.2 Qualify real producer associations and installed-browser lifecycle before claiming complete correlated Work investigation. Include the nested graph, public records and accessible deep-link journeys. Retain every earlier migration criterion.

- [ ] T146 [US1] OVERSTORY-APPS-R049.1.4 Bind the retained read-only Operate discovery source and its focused tests.
- [ ] T147 [US1] OVERSTORY-APPS-R049.1.4 Preserve filter focus, observed-admission isolation and partial catalog reporting.
- [ ] T148 [US1] OVERSTORY-APPS-R049.1.2 Migrate connector configuration, host launch, containment, approvals, tool load/unload and execution with their actual upstream authority contracts. Qualify served discovery and native browser journeys separately.

- [ ] T149 [US1] OVERSTORY-APPS-R049.1.5 Bind current-response task navigation without inferred trace relationships or execution authority.

- [ ] T150 [US1] OVERSTORY-APPS-R049.1.6 Bind the bounded command catalog and shared selection tests. Keep other dynamic leaves and full migration open.

## Consent placement repair and remaining browser acceptance

- [x] T151 [US1] OVERSTORY-APPS-R046.2.1 Repair consent prompt dismissal and management. Preserve explicit choice semantics and failed-storage denial through source regressions.
- [ ] T152 [US1] OVERSTORY-APPS-R046.2.2 Complete every remaining R046.2 browser and all-leaf obligation. Include rendered consent clearance and mobile input journeys.

- [ ] T153 [US1] OVERSTORY-APPS-R049.1.7 Bind integrated query/validation lens tests and preserve the existing maintainer boundary. Qualify real provider and browser behavior separately.

- [ ] T154 [US1] OVERSTORY-APPS-R049.1.8 Bind attended editor and review tests. Check the trusted-event default in a real browser. Do not classify a provider request as a local tool mutation.

- [ ] T155 [US1] OVERSTORY-APPS-R049.1.9 Bind loaded Work and Operate command adapters. Keep capability discovery separate from permission to call tools.

- [ ] T156 [US1] OVERSTORY-APPS-R049.1.3 Qualify task refresh and attended cancellation against the served provider. Retain separate native browser and complete migration acceptance.

## R048 retained callback repair

- [x] T157 [US1] OVERSTORY-APPS-R048 Validate the R048 registration-lifetime guard with the document adapter and rendered navigation observer (99 focused WebMCP/navigation tests passed). Keep native browser, hidden-page retirement, replay, cross-origin, in-flight cancellation and served authority acceptance open. This partial repair does not complete R048.

## R048 hidden document source repair

- [x] T158 [US1] OVERSTORY-APPS-R048 Validate hidden-document registration cleanup, late acknowledgements and fresh registrations on return. The 98 focused tests passed.
- [ ] T159 [US1] OVERSTORY-APPS-R048 Keep native-browser qualification, full authority acceptance and in-flight cancellation open under R048.

## R048 cooperative execution source contract

- [x] T160 [US1] OVERSTORY-APPS-R048 Validate caller cancellation and registration retirement through the mounted provider and shared tool factory. All 108 focused tests passed.
- [ ] T161 [US1] OVERSTORY-APPS-R048 Qualify native-browser scheduling and served authority independently. Cooperative cancellation does not prove rollback or stop uncooperative handlers.

### R048 native replacement routing

Chromium 156 experimental WebMCP resolved a retained native Tool reference to a new same-name registration. Each native registration now has a unique routing name; the application registry retains the semantic tool ID. This prevents stale native references from selecting replacement callbacks. The rendered route, Back/Forward, deep-link and restoration matrix uses native discovery with synthetic backend responses. Authenticated served authority acceptance remains open; R048 is not complete.

R005.3 source progress: `OperateCatalogPanel` renders the existing enhanced catalog server projection. Registration availability is not connection state; keep the requirement unchecked pending connection and served acceptance.

R005.3 and R049.1.2 source progress includes selected connector definition inspection through the existing enhanced catalog adapter.
Full operational migration and provider connection acceptance remain unchecked.

R049.1.2 next source batch: contextual readiness diagnosis, selected-check inspection and explicit reprobe through the supported dashboard adapter.
Legacy alias retirement, complete migration and live-provider acceptance remain open.

R049.1.2 acceptance batch: preserve readiness failure parity and replace its standalone layout with a typed Operate compatibility adapter.
Qualify catalog and readiness actions, history, focus, keyboard and mobile access before recording completion of this bounded batch.

Bounded readiness alias and catalog/readiness action qualification passed desktop and mobile installed synthetic journeys.
Full R049.1.2 acceptance remains open, including other destinations, native controls, live providers and production identity.

## Cold-entry asset resolution

- [x] T162 [US1] OVERSTORY-APPS-R048 Replace relative production asset references with origin-root references;
  retain explicit Vite asset-base overrides.
- [x] T163 [US1] OVERSTORY-APPS-R048 Exercise generated default and prefixed script/style URLs (2 build tests).
- [x] T164 [US1] OVERSTORY-APPS-R048 Run cold Work, Explore and Operate entries and reloads against the installed
  Arbora composer and production WebUI static mount (3 browser tests passed).
- [ ] T165 [US1] OVERSTORY-APPS-R046.2.2 Complete R046.2.2 navigation and R050 provider acceptance independently.

The production build/typecheck and strict documentation build passed. The served
fixture used installed Arbora 0.1.7, Agent Utilities 3.1.0, SDK 0.2.2 and
medulla 2.27.5 with this candidate WebUI source and built assets. Browser
identity and API data were synthetic; static documents, lazy chunks, styles and
fonts crossed the real HTTP mount in Chromium 156.0.8078.4. This is not
live-provider or auth acceptance.

### R048 attended agent proposal delivery

The armed WebMCP channel accepts an Arbora proposal for human review.
It shows the exact tool, arguments, requesting agent and opaque requester reference.
A trusted human acceptance returns only the proposal decision.
It neither runs a tool nor satisfies the separate exact-request mutation confirmation.
Generation, schema and retained input validation bind the prompt to the active registration.
Expiry, server withdrawal, disconnect and retirement withdraw the prompt.
The client rejects terminal proposal IDs.

Source tests cover proposals, channel transport, rendered review and Python message validation.
Accepted-path component tests use the existing attended-gesture seam.
These fixtures do not establish authenticated served execution or installed native browser acceptance.
OVERSTORY-APPS-R048 remains open pending that composed acceptance.
This change grants no session, arms no browser and changes no production authority.

## Supported Work journey and remaining dependencies

- [x] T166 [US1] OVERSTORY-APPS-R049.1.3 Check conversation response, admitted task, output and independent trace inspection with synthetic browser responses.
- [x] T167 [US1] OVERSTORY-APPS-R049.1.3 Validate producer text artifacts and explicit references without inferring trace or conversation links.
- [ ] T168 [US1] OVERSTORY-APPS-R049.1.2 Migrate supported authoring and other remaining Work capabilities with parity evidence.
- [ ] T169 [US1] OVERSTORY-APPS-R004 Await authoritative current-plan and run-metrics bindings; task text does not replace these fields.
- [ ] T170 [US1] OVERSTORY-APPS-R006.4 Await supported-harness discovery and indexed sessions; browser conversations do not replace this producer.
- [ ] T171 [US1] OVERSTORY-APPS-R050 Qualify the composed served-provider journey and actual authorization boundaries.

## Loaded destination branch delivery

- [x] T172 [US1] OVERSTORY-APPS-R050 Present the existing validated command catalog as native DOM branches and a flat searchable list.
- [x] T173 [US1] OVERSTORY-APPS-R050 Nest only confirmed fleet capabilities and selected-trace nodes beneath their loaded parents.
- [x] T174 [US1] OVERSTORY-APPS-R050 Restore breadcrumb focus, retain the branch while searching, and retire unavailable entries.
- [ ] T175 [US1] OVERSTORY-APPS-R046.2.2 Complete OVERSTORY-APPS-R046.2.2 and OVERSTORY-DESIGN-R005.1 acceptance across deepest dynamic leaves, real touch, manual screen readers and installed providers.

This bounded source implementation uses main `c5c8ce0a3b5b9a09f30c5f9098a83407be396c22`.
Branch drill-in is instantaneous native DOM navigation, not camera animation.
It adds no browser-history entries until a destination is selected. The existing
catalog bounds and typed dispatchers remain authoritative. It does not migrate
legacy pages, infer backend relationships or complete the broad parent rows.


Validation on this branch:

- Workspace component suite: 14 files, 101 tests passed.
- Branch browser journeys: 2 passed, with normal and reduced motion across four viewport shapes.
- Existing viewport continuity journeys: 2 passed, including simulated keyboard occlusion.
- Native Chromium 200-percent zoom journeys: 3 passed at 1280, 640 and 740 physical pixels.
- Production asset regeneration, TypeScript compilation and strict documentation build passed.

The browser fixtures supply synthetic identity and API responses. They are not
live-provider or manual screen-reader acceptance. Earlier runs exposed hidden
focus after dialog resize and animation settling. The shared viewport hook now
repairs both cases. The final browser chain ran on unchanged source.

Rendered captures use synthetic fleet data. The desktop capture is
`branches-1440x900.png`, SHA-256 `1a697b1fe14272569417f50929f08d02d6b62ed0b8aa6b5a15624b1eb481480d`.
The narrow capture is `branches-320x740.png`, SHA-256
`31e22b9af6b865d0b056c13e8a4ab15161cbafe1e38328172122c9d5f4873ad3`.
The browser test writes these files into its configured output directory.

### Work prompt authoring continuation

- [x] T176 [US1] OVERSTORY-APPS-R049.1.2 Compose the existing admin prompt editor as a Work lens and preserve investigation context.
- [x] T177 [US1] OVERSTORY-APPS-R049.1.3 Cover lens navigation, draft retention, owner retirement and explicit save with rendered source tests.
- [ ] T178 [US1] OVERSTORY-APPS-R049.1.2 Qualify served-provider and native-browser prompt authoring, full editor-tool parity, and remaining Work authoring destinations.

- [ ] T179 [US1] OVERSTORY-APPS-R046.2.2 R046.2.2, R047 and R049.1.2: qualify loaded catalog navigation with installed providers. Source tests and the synthetic Chromium catalog journey do not close complete migration or dynamic-leaf acceptance.

### Nested execution explorer

- [ ] T180 [US1] OVERSTORY-APPS-R049.1.10 Add explicit capability-gated active-child targeting without implicit Chat retargeting.
- [ ] T181 [US1] OVERSTORY-APPS-R049.1.11 Add completed-child continuation using its separate backend binding.
- [ ] T182 [US1] OVERSTORY-APPS-R049.1.12 Qualify both actions, reconnect and cancellation through the real Work route and released producer.

### Flat dependency source slice

- [x] T183 [US1] OVERSTORY-APPS-R049.1.13 Qualify the bounded inline view with mounted Work and adapter fixtures.
- [ ] T184 [US1] OVERSTORY-APPS-R049.1.2 Keep actual browser, installed-provider and nested execution acceptance open after the source slice.

## Canopy Glass presentation continuation — 2026-10-24

- [x] T185 [US1] OVERSTORY-APPS-R049.2.1 Specify OVERSTORY-APPS-R049.2.1 within the existing redesign owner and preserve all parent acceptance obligations.
- [ ] T186 [US1] OVERSTORY-APPS-R049.2.1 Apply the shared full-width expanded shell and real Explore list/detail presentation without changing route, auth or WebMCP authority.
- [ ] T187 [US1] OVERSTORY-APPS-R049.2.1 Qualify search, selection, detail tools, return, denial, retained state and focus with source tests and separately recorded rendered journeys.
- [ ] T188 [US1] OVERSTORY-APPS-R049.2 Compare actual old/new tasks, navigation/scrolling effort and reviewed layout captures; the bounded presentation slice cannot close this row.
- [ ] T189 [US1] OVERSTORY-APPS-R049.1.2 R049.1.2/R045/R046/R047/R048: Complete remaining migration, all-leaf navigation, mobile capability parity and native-tool/authority acceptance.
- [ ] T190 [US1] OVERSTORY-APPS-R050 Qualify noauth, EG and OIDC with the installed producers independently; synthetic theme fixtures do not establish served acceptance.

The first implementation covers shared chrome and existing Explore evidence only.
Graph, editor, run, administration, authentication and other native surfaces still
need complete theme and interaction review under their existing owners. Do not
promote a broad row from scoped tests or historical documentation screenshots.

### Remaining composition acceptance after the Canopy shell slice

- [ ] T191 [US1] OVERSTORY-APPS-R049.2 Rebalance the real Work conversation/task split so an empty
  conversation does not reserve most of the center while selected-task details
  are squeezed into a narrow column. Preserve the mounted conversation, drafts,
  execution selection and safe disclosure behavior; do not manufacture content.
- [ ] T192 [US1] OVERSTORY-APPS-R049.2 Complete Work and Operate composition and real wide, narrow,
  low-height and ultrawide pixel review. A shared palette or the first Explore
  list/detail journey does not complete the three-context redesign.

## Native workspace assistant continuation

- [x] T193 [US1] OVERSTORY-APPS-R005.4 OVERSTORY-APPS-R005.4/R049.1.3: Replace the floating launcher/drawer with a visible native assistant using the same mounted Chat and canonical state.
- [ ] T194 [US1] OVERSTORY-APPS-R049.2 Preserve dominant task width, expanded header and an accessible dock/composer across narrow and short layouts.
- [x] T195 [US1] OVERSTORY-APPS-R049.1.3 Check unsent draft, live context, canonical streaming and owner retirement through source tests of the actual Chat seam. Add native dock focus and retained-shell regression tests.
- [ ] T196 [US1] OVERSTORY-APPS-R049.1.2 OVERSTORY-APPS-R049.1.2/R047/R048/R050: Complete native browser co-navigation and installed-provider acceptance separately; a layout change cannot close these rows.

Bounded source evidence: 409 tests across 40 component/Chat/WebMCP files passed
with two workers. The default worker pool exhausted available process memory;
that interrupted run is not validation. Hosted native dock, touch/keyboard,
short/narrow, appearance and pixel qualification remain pending. The dock adds
no provider, scheduler, data endpoint or semantic-tool authority.

Typecheck, scoped typed lint and the production build passed. Local whole-repository
lint exceeded memory. Hosted typecheck and full lint passed on c8bd060, composed
with base 954a227. Browser qualification remains incomplete.

## Retained redesign ledger correction — 2026-10-24

- [ ] T197 [US1] OVERSTORY-APPS-R049.2.2 Complete the original measured redesign criteria beyond the bounded R049.2.1 source slice.

Keep the Work/Operate, baseline comparison and native interaction obligations above open.
Preserve the qualified source child without promoting its broader ancestor.
Metadata guard tests are not evidence that the remaining redesign is accepted.

### Native Explore sampled graph continuation

- [ ] T198 [US1] OVERSTORY-APPS-R049.1.14 Qualify R049.1.14's direct read-only graph composition and retained state.
- [ ] T199 [US1] OVERSTORY-APPS-R049.1.2 Retain R049.1.2's old-route adaptation, Cypher/MAGMA/editing migration and
  served/browser full parity. Local GraphView edits are not engine write proof.

Source qualification passed 121 scoped tests, TypeScript and the production build.
The normal all-files run remains blocked by whole-repository ESLint termination.
Two bounded attempts received SIGKILL. Actual browser/provider acceptance remains open.

## Contextual Work workflow continuation

- [x] T200 [US1] OVERSTORY-APPS-R049.1.15 Extract and qualify the retained administrator-only workflow plan editor within Work using mounted source fixtures.
- [ ] T201 [US1] OVERSTORY-APPS-R049.1.2 OVERSTORY-APPS-R049.1.2/R047/R048: Complete workflow effect authority, full semantic-tool equivalence and served-provider acceptance separately.
- [ ] T202 [US1] OVERSTORY-APPS-R049.1.2 OVERSTORY-DESIGN-R004.1.2/R004.2.2: Qualify actual narrow/short browser interaction and measured redesign acceptance; source layout rules are not pixel or accessibility evidence.

The backend currently leaves Save/Run unavailable and does not implement the
capabilities route. Keep in-memory edits explicitly unpersisted. Do not invent
an effect contract, infer permission from catalog visibility, or claim a public
release from source-only checks.

Bounded workflow source checks passed: 56 tests, full TypeScript compilation and
typed lint for changed source files. Whole-repository lint received SIGKILL
at both 2048 MiB and 1792 MiB heap settings. No whole-lint pass is claimed.
The other all-files hooks passed; the unavailable complexity executable was
skipped locally, not measured. Hosted lint and browser qualification remain open.

The expanded workspace/navigation regression passed 244 tests across 26 files.
Production asset regeneration, strict documentation build and normal staged
commit hooks passed. The authored browser journey remains unrun locally.

## Contextual Operate usage source — 2026-10-25

- [x] T203 [US1] OVERSTORY-APPS-R049.1.16 Extract analytics primitives and owner-bound controller; compose a native Operate Usage lens with retained typed context and scoped validation.
- [ ] T204 [US1] OVERSTORY-APPS-R004.8 R004.8/R006.4 and OVERSTORY-API-R009/R011: Qualify indexed analytics, supported harness discovery, per-session producers and filter-aware drill-down. Missing producers remain unavailable, not synthetic delivery.
- [ ] T205 [US1] OVERSTORY-APPS-R047 R047/R049.1.2 and OVERSTORY-DESIGN-R004.1.2/R004.2.2: Qualify installed identity, full native-tool parity, browser history, keyboard/touch, 320px, short viewport and measured redesign separately. All original broad acceptance remains.

Source checks pass for the extracted Operate usage panels and typed adapters.
Local whole-repository ESLint exceeded memory in two bounded attempts; scoped lint passes.
Native browser scenarios are discoverable, but local Chromium execution remains blocked by the sandbox.
Hosted browser, full lint and installed-producer evidence remain required. No source fixture closes those gaps.

### Integrated native feature-lens source qualification

Integrated source checks passed 413 tests across 40 files, whole TypeScript checking and changed-source lint.
The production build and strict documentation build passed. Four hosted-selection contract tests passed.
The hosted configuration discovers 24 synthetic journeys, including the nine new lens journeys.
These journeys have not run here. Whole-repository ESLint received SIGKILL in two bounded attempts.
Scoped source checks cannot close native-browser, real-provider, workflow-effect or full-migration acceptance.

### Request handling without a mode (2026-10-25)

R005.4.1 local source work: delete obsolete request-mode controls and state; add mounted transport regressions; run scoped Chat suites. Full quality gates and served inference acceptance remain separate.

## Edit-and-fork implementation order

- [ ] T206 [US1] OVERSTORY-APPS-R051 Complete all child acceptance. Producer history and immutable fork admission are blockers, not delivered UI features.
- [ ] T207 [US1] OVERSTORY-APPS-R051.2 First qualify the producer contract linked in plan.md. Then extend existing browser/host adapters without inventing a route or store.
- [ ] T208 [US1] OVERSTORY-APPS-R051.1 Add the own-message action, preview and cancellation through the mounted Chat/composer only after the bound contract exists.
- [ ] T209 [US1] OVERSTORY-APPS-R051.3 Add idempotent lifecycle, read reconciliation and owner/navigation invalidation to the existing request state.
- [ ] T210 [US1] OVERSTORY-APPS-R051.4 Run installed browser and cross-client restart proof; retain explicit unsupported and unverified states until it passes.
- [ ] T211 [US1] OVERSTORY-APPS-R043 Confirm in a browser test that existing consent and storage survive the display rebrand.
- [ ] T212 [US1] OVERSTORY-APPS-R002 Confirm in rendered tests that page titles, metadata and primary labels present Overstory.
- [ ] T213 [US1] OVERSTORY-APPS-R003 Confirm in build and packaging tests that repository, package and runtime identifiers are unchanged.
- [ ] T214 [US1] OVERSTORY-APPS-R040 AppSurface contract declares each app's route, capability and client.
- [ ] T215 [US1] OVERSTORY-APPS-R041 Contributed app descriptors cannot escalate privilege beyond the contract.
- [ ] T216 [US1] OVERSTORY-APPS-R042 Markets consumes the AppSurface contract without shell-side duplication.
- [ ] T217 [US1] OVERSTORY-APPS-R044 App navigation supports accessibility and layout states across devices.
- [ ] T218 [US1] OVERSTORY-APPS-R004.9.2 Behavior: Show optimization progress linked to runs and their source proposals.
- [ ] T219 [US1] OVERSTORY-APPS-R004.9.3 Wiring: Extend ObservabilityView with EG projection read and Arbora operation transport.
- [ ] T220 [US1] OVERSTORY-APPS-R004.9.4 Refusal: Missing or incompatible progress revisions show unavailable.
- [ ] T221 [US1] OVERSTORY-APPS-R004.9.5 Evidence: Bind shown runs to exact proposal revision and progress generation.
- [ ] T222 [US1] OVERSTORY-APPS-R004.9.6 Hot-path proof: Dashboard test links measured runs to proposals.
- [ ] T223 [US1] OVERSTORY-APPS-R030.9.1 Model: Consume ordered change events with graph incarnation, revision and cursor.
- [ ] T224 [US1] OVERSTORY-APPS-R030.9.2 Behavior: Apply committed changes immediately to other authenticated clients without refresh.
- [ ] T225 [US1] OVERSTORY-APPS-R030.9.3 Wiring: Define versioned graph-change subscription contract under EG/Arbora.
- [ ] T226 [US1] OVERSTORY-APPS-R030.9.4 Refusal: Dropped events, expired cursors and revocation produce distinct unavailable states.
- [ ] T227 [US1] OVERSTORY-APPS-R030.9.5 Evidence: Retain event/snapshot revisions and measure commit-to-visible latency bounds.
- [ ] T228 [US1] OVERSTORY-APPS-R030.9.6 Hot-path proof: Two real browsers edit concurrently and see changes without refresh.
- [ ] T229 [US1] OVERSTORY-APPS-R032.1 Model: EG proposal/progress identity separate from calibration/coverage.
- [ ] T230 [US1] OVERSTORY-APPS-R032.2 Behavior: Dashboard shows exact proposal beside measured runs and progress.
- [ ] T231 [US1] OVERSTORY-APPS-R032.3 Wiring: Extend ObservabilityView with generated read contract.
- [ ] T232 [US1] OVERSTORY-APPS-R032.4 Refusal: Missing proposal/progress or incompatible revisions show unavailable.
- [ ] T233 [US1] OVERSTORY-APPS-R032.5 Evidence: Bind shown runs to proposal revision and progress state.
- [ ] T234 [US1] OVERSTORY-APPS-R032.6 Hot-path proof: Real served test links runs to exact proposal and unavailable/refused states.
- [ ] T235 [US1] OVERSTORY-APPS-R033.1 Model: EG viewport-bin request/response and bounded payload semantics.
- [ ] T236 [US1] OVERSTORY-APPS-R033.2 Behavior: Extend renderer with scatter/line interaction.
- [ ] T237 [US1] OVERSTORY-APPS-R033.3 Wiring: Extend shared Atlas renderer.
- [ ] T238 [US1] OVERSTORY-APPS-R033.4 Refusal: Invalid selection or exceeded payload limits remain unavailable.
- [ ] T239 [US1] OVERSTORY-APPS-R033.5 Evidence: Record viewport bounds, source cardinality, bin/byte counts against limits.
- [ ] T240 [US1] OVERSTORY-APPS-R033.6 Hot-path proof: Real billion-point source, pan/zoom/select checks against owner limits.
- [ ] T241 [US1] OVERSTORY-APPS-R034.1 Model: Versioned host compatibility manifest with extension IDs/versions and keybinding profiles.
- [ ] T242 [US1] OVERSTORY-APPS-R034.2 Behavior: Support extension installation/use and shortcuts in existing workbench.
- [ ] T243 [US1] OVERSTORY-APPS-R034.3 Wiring: Reuse WorkspaceIDEView and editor-context bridge.
- [ ] T244 [US1] OVERSTORY-APPS-R034.4 Refusal: Unsupported/incompatible extensions show explicit refusal.
- [ ] T245 [US1] OVERSTORY-APPS-R034.5 Evidence: Bind extension/shortcut verdicts to manifest and workspace revision.
- [ ] T246 [US1] OVERSTORY-APPS-R034.6 Hot-path proof: Real browser extension/shortcut test in authenticated workspace.
- [ ] T247 [US1] OVERSTORY-APPS-R035.1 Model: Meeting/segment/sequence and correction revision.
- [ ] T248 [US1] OVERSTORY-APPS-R035.2 Behavior: Show live segments and ordered corrections.
- [ ] T249 [US1] OVERSTORY-APPS-R035.3 Wiring: SDK owns live transport/provider.
- [ ] T250 [US1] OVERSTORY-APPS-R035.4 Refusal: Keep single-shot behavior honest.
- [ ] T251 [US1] OVERSTORY-APPS-R035.5 Evidence: Bind summary to final transcript and provider revision.
- [ ] T252 [US1] OVERSTORY-APPS-R035.6 Hot-path proof: Real served segments, finalization, local/hosted selection.
- [ ] T253 [US1] OVERSTORY-APPS-R036.1 Model: EG bookmark semantics and meaning-based index.
- [ ] T254 [US1] OVERSTORY-APPS-R036.2 Behavior: Search/filter bookmarks by meaning.
- [ ] T255 [US1] OVERSTORY-APPS-R036.3 Wiring: Use SDK R005.7-.12 producer definitions.
- [ ] T256 [US1] OVERSTORY-APPS-R036.4 Refusal: Denied/unavailable semantic index shows unavailable.
- [ ] T257 [US1] OVERSTORY-APPS-R036.5 Evidence: Bind search/mindmap/export to query revision and semantic index generation.
- [ ] T258 [US1] OVERSTORY-APPS-R036.6 Hot-path proof: Real served semantic filtering, mindmap, CSV/JSON from ingested bookmarks.
- [ ] T259 [US1] OVERSTORY-APPS-R037.2 Behavior: Select available coding agent.
- [ ] T260 [US1] OVERSTORY-APPS-R037.3 Wiring: Reuse McpAppFrame/McpAppHost.
- [ ] T261 [US1] OVERSTORY-APPS-R037.4 Refusal: Unavailable/refused transformations show unavailable.
- [ ] T262 [US1] OVERSTORY-APPS-R037.5 Evidence: Show execution and transformation reference with rendered digest.
- [ ] T263 [US1] OVERSTORY-APPS-R037.6 Hot-path proof: Real served discovery, execution, sandbox isolation.
- [ ] T264 [US1] OVERSTORY-APPS-R005.4.1 Requests without interaction modes.
- [ ] T265 [US1] OVERSTORY-APPS-R052 The shared state-machine census runs in staged mode.
