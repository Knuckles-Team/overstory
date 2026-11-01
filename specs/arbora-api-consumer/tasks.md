# API consumer delivery

**States:** SPECIFIED → BUILDING → BUILT → ACCEPTED. Current: **SPECIFIED**. No cutover acceptance is asserted.

- [ ] T001 [US1] OVERSTORY-API-R003.2 Inventory all `api_extensions.py` and browser callers; add a checked-in route-family census with UI-local/Arbora/retire classification.
- [x] T002 [US1] OVERSTORY-API-R006 Pin the Arbora registry schema (`src/lib/arbora-api/generated/openapi.json`, built from `arbora.api.http.openapi.document` over the live registry) and a generator (`pnpm run arbora:client:gen`, openapi-typescript, into `src/lib/arbora-api/generated/schema.ts`) (OVERSTORY-API-R006). **Caveat** (see `generated/README.md`): this snapshot's arbora and medulla checkouts were not digest-pinned to each other, so Medulla-bound operations (`eg.*`) carry a placeholder result/params schema; regenerating from a digest-matched pair is still open. Digest parity and error tests remain open.
- [x] T003 [US1] OVERSTORY-API-R001 Checked the real registry against `#38`'s `decide.*` op ids (OVERSTORY-API-R001 follow-up): **no `decide.*` namespace exists.** The real decision operations are `eg.query.Decide`, `eg.coordination.DecisionLog`, `eg.coordination.DecisionEval`, `eg.coordination.DecisionFit`, `eg.storage.DecisionCommit`, each multiplexing several named actions (e.g. `DecisionLog` carries `get`/`aggregate`/`commit`/`evaluate`/`compact`/`learn`/`resolve`/`verify` selected by a request field) rather than one operation id per `DecisionsTransport` method. Retargeting `arbora-decisions-transport.ts` needs the real per-action request/result shapes, not a rename; tracked separately, not patched into `#38`'s branch.
- [ ] T004 [US1] OVERSTORY-API-R001 Migrate decisions, apps/Markets, WebMCP and effect confirmation; prove denied and step-up cases.
- [x] T005 [US1] OVERSTORY-API-R002 Migrate ontology, graph, Atlas and object sets with tenant and pagination parity. Split into `OVERSTORY-API-R008.1` (ontology), `OVERSTORY-API-R008.2` (graph), `OVERSTORY-API-R008.3` (Atlas), `OVERSTORY-API-R008.4` (object-set); see [requirements.md](requirements.md). `OVERSTORY-API-R008.1` is blocked: the pinned Arbora schema has no concrete ontology-shaped operation yet (its `eg.reasoning.GraphSchema`/`GraphSchemaList`/`OntologyInspect` and `eg.compute.MatchOntologyTerms`/`MineOntologyGap` operations all share one generic placeholder `EgSchemaRef {path: string}` request/response, not the schema-graph/catalogue/object shape the current host route returns).
- [ ] T006 [US1] OVERSTORY-API-R009 Migrate remaining prompts, SDD, KB, sessions, goals, MCP and model families.
- [x] T007 [US1] OVERSTORY-API-R003.1 Add `src/lib/arbora-api/route-census.ts` — `RouteCensusEntry` typed model, strict disposition enum, refusal when a `generated-operation` row omits its owning operation (PR #62).
- [ ] T008 [US1] OVERSTORY-API-R003.2 Add a checked-in route-census data file covering every `api_extensions.py` domain route family, plus an architecture lint rule enforced in CI that rejects any new unclassified domain route.
- [ ] T009 [US1] OVERSTORY-API-R010 Remove replaced host domain routes and Meristem-internal imports; add static architecture guard.
- [ ] T010 [US1] OVERSTORY-API-R010 Run all test-spec gates on exact merged commit, attach route census and CI/browser evidence, then assess acceptance.
- [x] T011 [US1] OVERSTORY-API-R004 Mint a per-request correlation id in `RequestObservabilityMiddleware`. **State: Building.** Remaining: served log check after rollout.
- [x] T012 [US1] OVERSTORY-API-R005 Log the sanitized typed error code in `_log_failure` and add tests/test_log_failure_error_code.py (OVERSTORY-API-R005).
- [x] T013 [US1] OVERSTORY-API-R001 Add `ConsoleConfirmView` + the `console.confirm` route (`src/lib/nav-registry.ts`), built fresh on current main's `invoke.ts`/`identity.ts::confirmedStepUpUrl` plan-ref primitives: fetches the server-held plan by `plan_ref` alone and confirms by reference, never replaying the original request arguments. Test: `src/components/views/__tests__/ConsoleConfirmView.test.tsx` (OVERSTORY-API-R007; partial OVERSTORY-API-R001 — the generated TS client and decisions/Markets/WebMCP migration remain open).


- [x] T014 [US1] OVERSTORY-API-R011.1 Compose host routes through `application_composer` with no engine in the WebUI; prove served-operation calls and `not_available` answers through the real factory.

- [ ] T015 [US1] OVERSTORY-API-R003.2 Join the domain-route census to the app surface action coverage. Reject unclassified redesign/WebMCP actions. Retain owner boundaries and explicit unavailable results.
- [ ] T016 [US1] OVERSTORY-API-R011.2 Bind browser conversation identity and preserve validated admitted references in streamed message metadata; qualify the composed browser-to-Arbora path before completion.

- [x] T017 [US1] OVERSTORY-API-R011.2.1 Bind source preservation and refusal fixtures without claiming installed composition.
- [ ] T018 [US1] OVERSTORY-API-R011.2.2 Qualify the complete parent identity matrix through the installed browser-to-Arbora path.

- [ ] T019 [US1] OVERSTORY-API-R011.3 Consume the released public execution projection through the existing host/browser adapter. Qualify identity, redaction, replay and installed-producer behavior without client-owned orchestration.

- [x] T020 [US1] OVERSTORY-API-R011.4 Qualify the flat execution read adapter with exact identity and adversarial producer fixtures.
- [ ] T021 [US1] OVERSTORY-API-R011.3 Retain nested projections, public transcripts and installed-producer acceptance after this source-only slice.
- [ ] T022 [US1] OVERSTORY-API-R007 Migrate decisions, Markets, WebMCP and the console to typed operations and keep preview, confirm and step-up.
- [ ] T023 [US1] OVERSTORY-API-R008.1 Migrate ontology reads and writes to typed operations with tenant parity.
- [ ] T024 [US1] OVERSTORY-API-R008.2 Migrate graph reads and writes to typed operations with tenant parity.
- [ ] T025 [US1] OVERSTORY-API-R008.3 Migrate Atlas reads and writes to typed operations with tenant parity.
- [ ] T026 [US1] OVERSTORY-API-R008.4 Migrate object-set reads and writes to typed operations with tenant parity.
