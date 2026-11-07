# OVERSTORY-API — Implementation plan

Governing spec: [spec.md](spec.md). Rows: [requirements.md](requirements.md).

## Summary

Delivery phase: P5

No scenario of P1 to P4 exercises these rows, so they serve P5.

Overstory consumes one typed, versioned Arbora API client and retires host-owned domain routes. The plan reuses `src/lib/arbora-api/` and the host in `agent/overstory/`, found by searching the code first.

## Technical Context

- **Language/Version**: TypeScript with React for the browser; Python 3.14 for the host
- **Primary Dependencies**: the generated Arbora client in `src/lib/arbora-api/`, Vite, Vitest, Playwright, FastAPI host
- **Storage**: N/A (browser-local state only; no graph or database access)
- **Testing**: `pnpm run test`, `pnpm run test:e2e`, `uv run --all-extras pytest agent/overstory/__tests__`
- **Target Platform**: modern browsers served by the Overstory host
- **Project Type**: web
- **Performance Goals**: N/A
- **Constraints**: no engine or harness import; no fabricated data; Arbora decides
- **Scale/Scope**: one generated client, one host, the route census

## Constitution Check

- R-I The browser shows; arbora decides: pass. Every read and command goes through the Arbora client.
- R-II No fabricated data in the interface: pass. Unsupported operations show a typed unavailable state.
- R-III The frontend type-checks, lints and builds: pass. The build contract below names the commands.

## Project Structure

- `src/lib/arbora-api/` (existing): generated client, `invoke.ts`, `route-census.ts`
- `agent/overstory/api_extensions.py` (existing): host routes being retired
- `agent/overstory/server.py` (existing)
- `specs/arbora-api-consumer/` (existing)

## Phase 0: Research

No unknowns. The dated sections below record each earlier resolution.

## Phase 1: Design

The architecture, ownership, contracts and dated amendments follow in the sections below. Arbora owns authorization and behavior; Overstory owns presentation and the typed client use.

### Current and target wiring

Current WebUI calls are concentrated in `src/lib/api.ts`, `src/lib/admin-api.ts`, `src/lib/atlas/`, `src/lib/webmcp/`, and the FastAPI `agent/overstory/api_extensions.py` facade. The host is assembled in `agent/overstory/server.py`; `src/lib/nav-registry.ts` is the route authority. Audit every current browser route and host handler before deleting it. Target path: browser → same-origin WebUI session host → generated Arbora `/api/v1` client → Arbora operation registry → authorized owning service. Arbora owns credentials, operation schema, scope, effect gate, audit and stable errors; the WebUI owns rendering, interaction and browser-safe session forwarding.

Generate the client into `src/lib/arbora-api/` from a pinned published schema with a repeatable command and checked-in lock/digest. The adapter accepts typed operation name and params, supplies correlation/request ID and caller context through the host, validates error envelopes, and returns a discriminated success/error result. It must not synthesize scopes, bypass server policy or accept arbitrary URL targets from browser input. For effects, the response carries a `plan_ref`, effect class and required confirmation/step-up; confirmation posts the exact unmodified plan reference and binds it to the current principal/session. Denial codes and database codes remain intact for display and debugging without leaking sensitive detail.

### CI support amendments

#### 2026-10-11: run typed lint in one hook process

The shared host gate runs typed lint before consumer tests. The current
filename hook can start concurrent ESLint processes. Each process starts
its own TypeScript project service. Run this hook serially to avoid that
repeated work. Keep the command, filename filters, stages and failure policy.
Do not change the full manual lint check. Check the selected filenames and
hook contract; measure any timing change in hosted CI before claiming a gain.
This CI change does not establish acceptance of a product requirement.

### Cutover sequence

1. Freeze a route census with classifications: UI-local, session/protocol, generated Arbora operation, and retire. Save the census with this spec when implementation starts.
2. Introduce the generated client and prove read/error/auth parity for one route family, then migrate decisions/apps/WebMCP, ontology/graph/Atlas/object-set, and remaining domain families.
3. Move server-side adapters into the same operation path. Delete retired `api_extensions.py` domain blocks and Meristem-internal imports only after each family's regression tests pass. Do not keep a hidden fallback to the old path.
4. Add an architecture gate that rejects new browser-domain endpoints in the host and direct Meristem-internal imports. UI-local endpoints must be allowlisted with owner and reason.

### Compatibility and failure

The `/api/v1` version and schema digest are visible to the client. A version mismatch fails with a concise upgrade state. No call is sent with guessed fields. Preserve pagination cursors, result shapes and cancellation. Timeouts, forbidden, conflict, validation and unavailable responses remain distinguishable. Streaming uses existing authenticated browser transport and the same caller. Cancellation is idempotent. Never log request bodies carrying prompts, secrets or tenant data. For fresh checkout, install `pnpm`/`uv` dependencies as in `AGENTS.md`. Use a checked-in schema fixture or a locally provisioned Arbora service to regenerate and test without a shared deployment.

### Amendments

#### 2026-10-11: engine wheel integrity for host tests

The host tests, including `OVERSTORY-API-R005`, still import the AU numeric layer.
The existing `--engine-wheel` bootstrap option keeps using the rolling
`engine-main` release. Before installation, bootstrap must check the downloaded
wheel against the selected GitHub asset's SHA 256 digest. A missing digest or
mismatched download must stop bootstrap. After installation, bootstrap must
import `agent_utilities.numeric` to run its existing certified-kernel check.
Delete any old receipt before sync changes the environment. After the
certification check passes, store the release ID, asset ID, source target and
digest in the virtual environment. The source target is release metadata; it
does not attest the compiled source. This receipt identifies the tested artifact without
adding a fixed source pin. Fixture tests cover matching and invalid downloads.
Real host tests must still pass before runtime acceptance.

CI support source for `OVERSTORY-API-R005` is
[`d3bf9a9651c70688dd19ade62b45dc2897d9fa9a`](https://github.com/Knuckles-Team/overstory/commit/d3bf9a9651c70688dd19ade62b45dc2897d9fa9a).
Seven fixture tests pass. Native host acceptance remains pending. This change
does not add a test binding or claim new runtime verification for the row.

#### 2026-10-11: current pull-request gate takes precedence

A newer pull-request revision must cancel the older run in the same release
concurrency group. This prevents obsolete revisions from delaying the current
host checks, including `OVERSTORY-API-R005`. Push and manual release runs must
keep the existing no-cancellation policy. The group key, gate timeouts and
test scopes stay unchanged. Event contract tests cover PR cancellation and
non-PR preservation. They do not establish native host acceptance.

#### 2026-10-11: test evidence before pre-push metadata checks

The gates job must run its existing test steps after bootstrap and commit
hooks, but before pre-push hooks. This lets selected tests produce real
execution evidence even when the later spec trailer check blocks delivery.
Keep every command, test scope, failure gate and timeout unchanged. Scope
selection still controls which tests run; ordering alone does not establish
`OVERSTORY-API-R005` acceptance. Its real tests must run before adding a binding.

The existing error-code test file now checks the exact length boundary:
64 uppercase characters remain in the log; 65 produce `error_code=none`.
These tests import the real host module. They have no new spec binding until
hosted execution passes. The existing scope resolver selects this changed
test file without a second test list or a broader scope override.

#### 2026-10-11: check the real host after wheel installation

The host imports AU's Agent Library constants and store. The old AU pin
predates that module. Parent PR #80 source `23abf3493a114389e101efbd0190382dcef30d64`
updates AU to `f0cd9fd58d168f2c094787b08eab0ef4e06303aa` and the connector SDK
to `8e2d7c50896a9e416ec76e53c4a9a585cc5f4d28`, with a regenerated lockfile.
Merge that repair without changing its immutable pins or dependency lock.
Import the real host module after numeric certification during wheel bootstrap.
Write the receipt only after both imports pass. This check enables the existing
host tests, including `OVERSTORY-API-R005`; it does not establish their acceptance.
Do not replace the public owner API or hide an import failure.

#### 2026-10-11: bind the tested failure-log tests

Hosted job [38129639497](https://github.com/Knuckles-Team/overstory/actions/runs/38129639497)
tested source `1684efea0e6d85f720803a6b729bdc2ee2b01a38` with the real host
and certified engine wheel. At 10:00:11 UTC, all five tests in
`tests/test_log_failure_error_code.py` passed. All 19 selected tests passed.
The tests cover typed and plain codes, missing or malformed codes, message
redaction, and the 64/65-character boundary. Bind these tested tests to
`OVERSTORY-API-R005` without changing their semantics. Generate the delivery
record after publishing this source. This evidence covers failure logging;
it does not establish acceptance of the other consumer requirements.

#### Host composition without an engine (OVERSTORY-API-R011.1)

The WebUI holds no graph engine. A host composes its own routes on the real
factory through `application_composer`. Graph data reaches the WebUI only
through Arbora served operations in `host.py`. Host composition owns agent
and session lifecycle. Injection does not create identity or authority.

### Responsive workspace route/action census consumer

OVERSTORY-API-R003.2 remains the owner of populated domain-route census data and its CI classifier. OVERSTORY-APPS-R045 consumes that classification for each visible action: generated Arbora operation, explicitly browser-local behavior or unavailable capability. A redesigned button or WebMCP tool must not silently fall back to a host-owned domain implementation. R007 preview/confirmation/step-up, R011 identity/stream/cancel and R011.1 composed-host refusal remain unchanged. Complete the API census before claiming full capability coverage; UI route presence is not evidence that a backend operation is served.

### Catalog and source discovery use graph queries

Catalog, glossary, stewardship, lineage, prompt-candidate and virtual-source questions use Arbora `ask`/`find` intent routing to `query.nl`, or typed `query.uql` for programmatic clients. Do not introduce or regenerate a bespoke `catalog.search`, `glossary.list/get`, `stewardship.list/get`, `catalog.lineage`, `catalog.prompt_candidates` or `query.sources` operation family. Arbora owns intent routing and the governed source executor; EG owns ontology, relevance and graph query semantics. This follows merged [Arbora #432](https://github.com/Knuckles-Team/arbora/pull/432), ARBORA-OPS-R855.1/R855.4–R855.6 and ARBORA-FLEET-R043.2/R043.3/R043.7. The related [EG #739](https://github.com/Knuckles-Team/medulla/pull/739) correction owns MEDULLA-TYPED-PACKS-R106/R108 and MEDULLA-DECISION-ENGINE-R814; its still-open specification is not a delivered producer receipt. The route/action census binds these query operations, preserving typed tenant/purpose, pagination, refusal and cancellation behavior. A local component app catalog or dashboard save contract does not imply a new metadata catalog read API.

### Amendment 2026-10-24: public execution adapter

R011.2 retains its original conversation and root-task identity contract and recorded source evidence.
R011.3 adds node-bound public execution records and capability projection without replacing that contract.

Current path: `Chat.tsx` -> host model -> `orchestrator_model.py:220` `_run_turn` -> `agents.run`.
`_reply_stream` at line 260 waits for `_run_turn`, then yields final text and identity/usage metadata.
It does not currently yield rich summary, tool or child-transcript parts from the execution producer.
Existing reasoning and tool widgets therefore do not prove live orchestration visibility.

Extend that adapter and the existing typed browser client only after the generated producer contract is available.
`ARBORA-OPS-R021.4.8` owns graph snapshots and updates; `ARBORA-OPS-R021.4.9` owns authorized records and capabilities.
`ARBORA-RELEASE-R003.4.12` and `ARBORA-RELEASE-R003.4.13` own distinct active-message and completed-continuation effects.
Use their registered operations and generated types; this specification does not assign speculative endpoint names.

Preserve existing public replay v1 semantics and decoder invariants.
Version or capability-negotiate graph, lineage and transcript projections separately; refuse unsupported versions without reinterpreting old events.
Keep root request `task_id` separate from event-local `task_id`.
Preserve structured `(run_id, node_kind, local_id)` keys and explicit owner, context and target bindings.
A trace/span identifier or an agent name must never become a conversation target.
Preserve snapshot schema version, completeness, covered cursor and per-run replay cursors without synthesizing global order.
Capabilities default false when absent or unsupported; browser availability never replaces host/backend authorization.
The adapter must reject mismatched identities and unknown schema versions before forwarding protected records or controls.

Project only public summaries, redacted tool activity and authorized conversation records into the existing parts rendering path.
Preserve event identity for deduplication and explicit fold choices.
Private reasoning, unknown fields and service credentials must not enter browser parts, URLs, logs or local persistence.
A missing or denied producer must remain unavailable; legacy text-only replies must continue without invented graph data.
Keep installed-provider proof separate from pure mapping, mounted-widget and synthetic browser fixtures.

#### 2026-10-24: Flat execution read adapter

R011.4 defines a bounded source consumer for the separately versioned
`runs.execution_graph` operation. The existing canonical browser invoke
transport preserves CSRF, same-origin credentials and abort signals. Require
exact selected task/run binding and the producer's default-false child
capabilities. Validate the explicit flat dependency graph and observed event
evidence without adapting replay-v1 or synthesizing child targets. Unsupported,
malformed and denied reads remain distinct. This partial source slice does not
close the public transcript, nested-run or installed-producer requirements.

### Embedded tracing and console ownership

An embedded WebUI with Logfire disabled does not configure or replace its host tracing pipeline. Explicitly enabled WebUI tracing retains its existing export and instrumentation policy and directs console diagnostics to stderr. Structured application logging stays unchanged. No setting, credential or export destination is provisioned by this repair.

### Host route migration, route by route (OVERSTORY-API-R012.1 to R012.11)

Pre-untangled design for these rows, one line per answer.

- Owner. Overstory owns the screen and the call from each view; Arbora owns each operation (the operation rows filed in Arbora); medulla owns the query constructs. The host owns static serving, the OIDC session and the generated-client proxy only.
- Cohesion. Routes that call one target family migrate together, so the caller edit and the route deletion sit in one PR.
- Dependency direction. A view imports the generated client; the client calls Arbora. The host imports neither a view nor a domain module.
- Interface depth. The host has no domain route. The generated client is the one surface.
- Special cases. None. Every route has a target operation or retires; the allowed host set is a closed list in the census test.
- State. A migrated route has the census state `served`; `pending-arbora-operation` and `blocked-on-arbora` are the only other values, and the census lint closes the set.
- Environment. None.

Order. R012.1 and R012.3 wait for the aggregate query row only for the `node-types` view; the other groups wait for their operation row. Within the PRs the order is: groups whose operations already exist (graph reads, ecosystem services, memory read and delete), then each group as its operation lands, then R012.11. Merge order of the open PRs: 242, then 244 and 246.

**The census in one table.** Every `retire` row of `src/lib/arbora-api/route-census.json` (165 routes) with its target operation:

| Route group | Method and path | Target operation |
|---|---|---|
| `files` | `GET /api/enhanced/files` | `workspace.files.list` |
| `files` | `GET /api/enhanced/files/{filename:path}` | `workspace.files.read` |
| `files` | `PUT /api/enhanced/files/{filename:path}` | `workspace.files.write` |
| `files` | `DELETE /api/enhanced/files/{filename:path}` | `workspace.files.delete` |
| `config-files` | `GET /api/enhanced/config-files` | `workspace.files.list` |
| `agents` | `GET /api/enhanced/agents` | `agents.library.list` |
| `mcp` | `GET /api/enhanced/mcp/servers/{server_name}/config` | `fleet.servers.config.get` |
| `mcp` | `POST /api/enhanced/mcp/servers` | `fleet.servers.register` |
| `mcp` | `PUT /api/enhanced/mcp/servers/{server_name}` | `fleet.servers.update` |
| `mcp` | `DELETE /api/enhanced/mcp/servers/{server_name}` | `fleet.servers.remove` |
| `tools` | `POST /api/enhanced/tools/toggle` | `fleet.tools.toggle` |
| `tools` | `GET /api/enhanced/tools/graph` | `fleet.catalog.list` |
| `tools` | `POST /api/enhanced/tools/graph/{tool_id}/toggle` | `fleet.tools.toggle` |
| `skills` | `POST /api/enhanced/skills/{skill_id}/toggle` | `fleet.skills.toggle` |
| `reload` | `POST /api/enhanced/reload` | `ops.config.set (key reload)` |
| `cron` | `GET /api/enhanced/cron/calendar` | `schedule.tasks.read` |
| `cron` | `GET /api/enhanced/cron/logs` | `schedule.tasks.read` |
| `upload` | `POST /api/enhanced/upload` | `workspace.files.write` |
| `graph` | `GET /api/enhanced/graph/nodes` | `eg.graph.GetNodesByLabel` |
| `graph` | `GET /api/enhanced/graph/relationships` | `eg.graph.GetEdgesPage` |
| `graph` | `GET /api/enhanced/graph/graph3d` | `eg.graph.GetSubgraph` |
| `graph` | `GET /api/enhanced/graph/graph3d/scope` | `eg.graph.GetSubgraph` |
| `graph` | `GET /api/enhanced/graph/graph3d/refresh` | `eg.graph.GetSubgraph` |
| `graph` | `GET /api/enhanced/graph/graph3d/clusters` | `eg.compute.ClusterHierarchyClusters` |
| `graph` | `GET /api/enhanced/graph/graph3d/expand` | `eg.compute.ClusterHierarchyExpand` |
| `graph` | `GET /api/enhanced/graph/stats` | `eg.graph.NodeCount + eg.graph.EdgeCount + eg.graph.Metrics` |
| `graph` | `GET /api/enhanced/graph/node-types` | `query.uql (aggregate)` |
| `graph` | `POST /api/enhanced/graph/memory` | `memory.write ` |
| `graph` | `GET /api/enhanced/graph/memory/{memory_id}` | `memory.read` |
| `graph` | `PUT /api/enhanced/graph/memory/{memory_id}` | `memory.write ` |
| `graph` | `DELETE /api/enhanced/graph/memory/{memory_id}` | `memory.delete` |
| `graph` | `POST /api/enhanced/graph/link` | `eg.graph.AddEdge ` |
| `graph` | `GET /api/enhanced/graph/search` | `retrieval.search` |
| `graph` | `GET /api/enhanced/graph/impact/{symbol}` | `eg.compute.GetBlastRadius` |
| `graph` | `POST /api/enhanced/graph/query` | `query.uql` |
| `graph` | `GET /api/enhanced/graph/viz/capabilities` | `eg.ingestion.Viz` |
| `graph` | `POST /api/enhanced/graph/viz/render` | `eg.ingestion.Viz` |
| `graph` | `POST /api/enhanced/graph/magma` | `retrieval.search` |
| `code` | `POST /api/enhanced/code/nav` | `code.context.read` |
| `code` | `GET /api/enhanced/code/instances` | `code.context.read` |
| `kb` | `POST /api/enhanced/kb/ingest` | `ingest.submissions.create` |
| `kb` | `GET /api/enhanced/kb/list` | `kb.articles.read` |
| `kb` | `GET /api/enhanced/kb/search` | `kb.articles.read` |
| `kb` | `GET /api/enhanced/kb/article/{article_id}` | `kb.articles.read` |
| `kb` | `POST /api/enhanced/kb/health` | `ingest.drift.list` |
| `kb` | `POST /api/enhanced/kb/update` | `memory.write` |
| `sdd` | `GET /api/enhanced/sdd/constitution` | `sdd.documents.read` |
| `sdd` | `POST /api/enhanced/sdd/constitution` | `retired (read-only view)` |
| `sdd` | `GET /api/enhanced/sdd/specs` | `sdd.documents.read` |
| `sdd` | `POST /api/enhanced/sdd/spec` | `retired (read-only view)` |
| `sdd` | `GET /api/enhanced/sdd/plans` | `sdd.documents.read` |
| `sdd` | `GET /api/enhanced/sdd/tasks` | `sdd.documents.read` |
| `sdd` | `POST /api/enhanced/sdd/sync` | `retired (read-only view)` |
| `resources` | `GET /api/enhanced/resources` | `resources.list` |
| `resources` | `POST /api/enhanced/resources/spawn` | `resources.spawn` |
| `agent-library` | `GET /api/enhanced/agent-library/agents` | `agents.library.list` |
| `agent-library` | `GET /api/enhanced/agent-library/tools` | `agents.library.list` |
| `agent-library` | `GET /api/enhanced/agent-library/suggestions` | `agents.library.list` |
| `agent-library` | `GET /api/enhanced/agent-library/agents/{agent_id:path}` | `agents.library.get` |
| `agent-library` | `POST /api/enhanced/agent-library/agents` | `agents.library.create` |
| `agent-library` | `PUT /api/enhanced/agent-library/agents/{agent_id:path}` | `agents.library.update` |
| `agent-library` | `DELETE /api/enhanced/agent-library/agents/{agent_id:path}` | `agents.library.delete` |
| `agent-library` | `POST /api/enhanced/agent-library/a2a` | `agents.library.a2a` |
| `agent-library` | `GET /api/enhanced/agent-library/config-summary` | `agents.library.summary` |
| `maintenance` | `GET /api/enhanced/maintenance/status` | `ops.maintenance.status` |
| `maintenance` | `POST /api/enhanced/maintenance/trigger` | `ops.maintenance.run` |
| `pipeline` | `GET /api/enhanced/pipeline/status` | `ingest.pipeline.status` |
| `pipeline` | `POST /api/enhanced/pipeline/trigger` | `ingest.pipeline.run` |
| `models` | `GET /api/enhanced/models` | `models.list` |
| `config` | `GET /api/enhanced/config/backend` | `ops.config` |
| `config` | `PUT /api/enhanced/config/backend` | `ops.config.set` |
| `config` | `GET /api/enhanced/config` | `ops.config` |
| `config` | `GET /api/enhanced/config/groups` | `ops.config (view)` |
| `config` | `GET /api/enhanced/config/schema` | `ops.config (view)` |
| `config` | `GET /api/enhanced/config/secret-status` | `ops.config (view)` |
| `config` | `PUT /api/enhanced/config` | `ops.config.set` |
| `prompts` | `GET /api/enhanced/prompts/graph` | `prompts.list` |
| `prompts` | `GET /api/enhanced/prompts/graph/{prompt_id}` | `prompts.get` |
| `prompts` | `POST /api/enhanced/prompts/graph` | `prompts.create` |
| `prompts` | `PUT /api/enhanced/prompts/graph/{prompt_id}` | `prompts.update` |
| `prompts` | `GET /api/enhanced/prompts/graph/{prompt_id}/versions` | `prompts.versions` |
| `prompts` | `POST /api/enhanced/prompts/graph/{prompt_id}/rollback/{version_id}` | `prompts.rollback` |
| `prompts` | `GET /api/enhanced/prompts/graph/{prompt_id}/diff/{version_a}/{version_b}` | `prompts.diff` |
| `prompts` | `GET /api/enhanced/prompts` | `prompts.list` |
| `prompts` | `GET /api/enhanced/prompts/{name}` | `prompts.get` |
| `prompts` | `PUT /api/enhanced/prompts/{name}` | `prompts.update` |
| `goals` | `POST /api/enhanced/goals` | `agents.goals.run` |
| `goals` | `GET /api/enhanced/goals` | `agents.goals.list` |
| `goals` | `GET /api/enhanced/goals/{goal_id}/iterations` | `agents.goals.iterations` |
| `goals` | `POST /api/enhanced/goals/{goal_id}/cancel` | `agents.goals.cancel` |
| `llm` | `GET /api/enhanced/llm/models` | `models.list` |
| `llm` | `GET /api/enhanced/llm/embedding-models` | `models.list` |
| `llm` | `GET /api/enhanced/llm/model-schema` | `ops.config (view schema)` |
| `llm` | `GET /api/enhanced/llm/model-detail` | `ops.config (view schema)` |
| `llm` | `PUT /api/enhanced/llm/models` | `ops.config.set` |
| `llm` | `PUT /api/enhanced/llm/embedding-models` | `ops.config.set` |
| `ecosystem` | `GET /api/enhanced/ecosystem/services` | `fleet.status` |
| `ecosystem` | `GET /api/enhanced/ecosystem/atlassian/kanban` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/github/prs` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/{forge}/mrs` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/portainer/stacks` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/datascience/training` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/scholarx/papers` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/uptime/status` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/searxng/search` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/homeassistant/devices` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/nextcloud/events` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/microsoft/emails` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/mediadownloader/downloads` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/qbittorrent/torrents` | `ecosystem.widgets.read` |
| `ecosystem` | `GET /api/enhanced/ecosystem/stirlingpdf/jobs` | `ecosystem.widgets.read` |
| `tunnel-manager` | `GET /api/enhanced/tunnel-manager/hosts` | `ecosystem.widgets.read` |
| `tunnel-manager` | `POST /api/enhanced/tunnel-manager/hosts` | `ecosystem.widgets.read` |
| `systems-manager` | `GET /api/enhanced/systems-manager/resources` | `ecosystem.widgets.read` |
| `systems-manager` | `GET /api/enhanced/systems-manager/processes` | `ecosystem.widgets.read` |
| `container-manager` | `GET /api/enhanced/container-manager/containers` | `ecosystem.widgets.read` |
| `repository-manager` | `GET /api/enhanced/repository-manager/repos` | `ecosystem.widgets.read` |
| `repository-manager` | `POST /api/enhanced/repository-manager/bulk` | `ecosystem.widgets.read` |
| `voice` | `POST /api/enhanced/voice/transcribe` | `media.transcribe` |
| `system` | `GET /api/enhanced/system` | `ops.doctor` |
| `commands` | `POST /api/enhanced/commands/execute` | `commands.execute` |
| `commands` | `GET /api/enhanced/commands/autocomplete` | `commands.autocomplete` |
| `workflows` | `GET /api/enhanced/workflows` | `workflows.list` |
| `workflows` | `POST /api/enhanced/workflows` | `workflows.create` |
| `workflows` | `POST /api/enhanced/workflows/{wid:path}/run` | `workflows.run` |
| `atlas` | `GET /api/enhanced/atlas/sources` | `ingest.sources.list` |
| `atlas` | `GET /api/enhanced/atlas/sources/{source_id}/connection` | `ingest.sources.connections.get` |
| `atlas` | `POST /api/enhanced/atlas/sources/{source_id}/connection` | `ingest.sources.connections.create` |
| `atlas` | `POST /api/enhanced/atlas/sync/preview` | `ingest.sources.sync.preview` |
| `atlas` | `POST /api/enhanced/atlas/sync/runs` | `ingest.sources.sync` |
| `atlas` | `GET /api/enhanced/atlas/sync/runs` | `ingest.sources.runs.get` |
| `atlas` | `POST /api/enhanced/atlas/sync/runs/{run_id}/cancel` | `ingest.sources.runs.cancel` |
| `atlas` | `GET /api/enhanced/atlas/sources/providers` | `ingest.sources.providers.list` |
| `atlas` | `GET /api/enhanced/atlas/sources/connections` | `ingest.sources.connections.list` |
| `atlas` | `POST /api/enhanced/atlas/sources/connections` | `ingest.sources.connections.create` |
| `atlas` | `DELETE /api/enhanced/atlas/sources/connections/{connection_id}` | `ingest.sources.connections.delete` |
| `atlas` | `POST /api/enhanced/atlas/sources/connections/{connection_id}/discover` | `ingest.sources.discover` |
| `atlas` | `GET /api/enhanced/atlas/sources/connections/{connection_id}/mapping` | `ingest.sources.mapping.get` |
| `atlas` | `POST /api/enhanced/atlas/sources/connections/{connection_id}/mapping/propose` | `ingest.sources.mapping.propose` |
| `atlas` | `POST /api/enhanced/atlas/sources/connections/{connection_id}/mapping/approve` | `ingest.sources.mapping.approve` |
| `atlas` | `GET /api/enhanced/atlas/sources/connections/{connection_id}/status` | `ingest.sources.status` |
| `atlas` | `POST /api/enhanced/atlas/sources/sync/preview` | `ingest.sources.sync.preview` |
| `atlas` | `POST /api/enhanced/atlas/sources/sync` | `ingest.sources.sync` |
| `atlas` | `GET /api/enhanced/atlas/sources/runs/{run_id}` | `ingest.sources.runs.get` |
| `atlas` | `POST /api/enhanced/atlas/sources/runs/{run_id}/cancel` | `ingest.sources.runs.cancel` |
| `ontology` | `GET /api/enhanced/ontology/object-types` | `ontology.classes.list` |
| `ontology` | `GET /api/enhanced/ontology/property-types` | `ontology.properties.list` |
| `ontology` | `GET /api/enhanced/ontology/interfaces` | `ontology.classes.list` |
| `ontology` | `GET /api/enhanced/ontology/interfaces/{name}/implementers` | `ontology.classes.get` |
| `ontology` | `POST /api/enhanced/ontology/object-set/search` | `ontology.objects.search` |
| `ontology` | `POST /api/enhanced/ontology/object-set/search-around` | `ontology.objects.search_around` |
| `ontology` | `POST /api/enhanced/ontology/object-set/pivot` | `ontology.objects.pivot` |
| `ontology` | `POST /api/enhanced/ontology/object-set/aggregate` | `ontology.objects.aggregate` |
| `ontology` | `POST /api/enhanced/ontology/object-set/save` | `ontology.object_sets.save` |
| `ontology` | `GET /api/enhanced/ontology/object-set/list` | `ontology.object_sets.list` |
| `ontology` | `GET /api/enhanced/ontology/actions` | `ontology.actions.list` |
| `ontology` | `POST /api/enhanced/ontology/object-set/action` | `ontology.actions.apply` |
| `ontology` | `GET /api/enhanced/ontology/object/{object_id}` | `ontology.objects.get` |
| `ontology` | `POST /api/enhanced/ontology/object/{object_id}/edit` | `ontology.objects.edit` |
| `ontology` | `POST /api/enhanced/ontology/object/{object_id}/revert` | `ontology.objects.revert` |
| `ontology` | `POST /api/enhanced/ontology/function/invoke` | `ontology.functions.invoke` |
| `ontology` | `POST /api/enhanced/ontology/derive` | `ontology.derive` |
| `ontology` | `POST /api/enhanced/ontology/document/process` | `ontology.document.process` |
| `ontology` | `GET /api/enhanced/ontology/object-view/{object_type}` | `ontology.object_views.get` |
| `ontology` | `POST /api/enhanced/ontology/object-view/{object_type}` | `ontology.object_views.put` |

## Phase 2: Task approach

`tasks.md` follows the rows in dependency order. Producer rows come first. Independent view rows may run in parallel.

## Complexity Tracking

None. The constitution check passed.

## Build contract

Run `pnpm run typecheck`, `pnpm run test`, `pnpm run build` and `pre-commit run --config .config/pre-commit.yaml --all-files`. Reuse the existing client and shell seams. Do not duplicate them or game a scanner.

## Production caller chain

A browser page calls `src/lib/arbora-api/invoke.ts`, which sends the typed operation to the same-origin host in `agent/overstory/server.py`. The host binds the caller and calls the Arbora operation. Delete each `api_extensions.py` domain route once its generated operation is proven.

## Cross-repo seams

none
