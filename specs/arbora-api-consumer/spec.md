# OVERSTORY-API — Generated Arbora API consumer cutover

**ID:** OVERSTORY-API
**Owner:** overstory
**Related IDs:** MERISTEM-BOUNDARY-R039, OVERSTORY-API-R001, OVERSTORY-API-R002, OVERSTORY-API-R003
**Delivery:** specified; current adapter inventory requires verification
**Acceptance:** open

## Purpose

All domain and administrative actions in the browser use one typed, versioned Arbora API client. The WebUI host keeps only browser protocol, session, safe asset, consent and narrowly necessary UI-local endpoints. It must stop owning a second graph/ontology/agent/finance domain API or calling Agent Utilities internals. The Arbora operation registry owns authorization and behavior. This spec is the WebUI cutover and consumer test contract; it does not implement the Arbora registry.

## Requirements

| ID | WebUI obligation | Related IDs | Proof |
|---|---|---|---|
| OVERSTORY-API-R006 | Generate TypeScript types and client from a pinned Arbora `/api/v1` schema/digest, with one `invoke` adapter and stable error envelope | OVERSTORY-API-R001 | Regeneration-diff and contract tests |
| OVERSTORY-API-R007 | Migrate decisions, Markets/apps, WebMCP and console confirmation to typed operations, preserving preview/confirm/step-up for effects | OVERSTORY-API-R001 | Positive/negative effect tests |
| OVERSTORY-API-R008 | Migrate ontology, graph, Atlas and object-set reads/writes without losing tenant, purpose, paging or error semantics | OVERSTORY-API-R002 | Cross-surface fixtures and browser tests |
| OVERSTORY-API-R009 | Migrate prompts, SDD, knowledge base, sessions, goals, MCP servers/tools and model management operations | OVERSTORY-API-R003 | Route-census and contract tests |
| OVERSTORY-API-R010 | Remove direct Meristem-internal imports and domain handlers from the WebUI host once replacement operations are proven. Preserve browser-local endpoints by explicit inventory | MERISTEM-BOUNDARY-R039, OVERSTORY-API-R001, OVERSTORY-API-R002, OVERSTORY-API-R003 | Static dependency and route-census gate |
| OVERSTORY-API-R011 | Preserve shared auth, credential delegation, streaming/cancel and error handling. Never expose an Arbora service bearer to JavaScript | all | Host integration and adversarial browser tests |

User stories: a tenant reader can browse graph and Atlas results without changing identity. An operator can preview and confirm an effect with its exact plan reference. A contributor can regenerate the client from a public schema and see CI fail if a required operation disappears. Unsupported operations present a typed unavailable state rather than silently falling back to a legacy direct route.

Out of scope: creating new graph, ontology, finance or agent algorithms, or exposing every Arbora administrative operation in UI navigation. Generated API coverage is still required for operations the WebUI consumes.

## Completion

## Delivery slices and dependency decisions

OVERSTORY-API-R001 owns the generated `src/lib/arbora-api/` client, its `invoke` seam, decision and Markets/app callers, WebMCP page tools, and a console confirmation page. The browser sends a typed operation and input to the same-origin session host. The host binds the authenticated caller; the browser never supplies a service token. A write or destructive operation first returns a server-issued preview and `plan_ref`, and the confirmation page sends that exact reference only after the required human action and step-up. A stale reference, changed principal, altered parameters, missing MFA or denial must fail closed. The host's app domain routes retire only after equivalent Arbora operations and fixtures exist.

OVERSTORY-API-R002 owns migration of ontology, graph, Atlas and object-set callers, including the matching blocks in `agent/overstory/api_extensions.py`. The graph/database service remains the durable authority. Preserve source IDs, cursor pagination, tenant and purpose context, typed validation, and partial/unavailable states. Replace each domain block only after the generated operation has positive and cross-tenant denial coverage. No direct database access moves into React.

OVERSTORY-API-R003 owns prompts, SDD, knowledge base, sessions, goals, MCP servers and tools, and LLM/model administration. Inventory every corresponding host route and browser caller before deletion. A checked-in route census must list each old method/path, owning operation ID, caller, scope, effect class, migration state and disposition; UI-local browser routes need an explicit owner and reason. An architecture lint must reject any new unclassified domain route or direct browser domain endpoint, while permitting enumerated session, asset, protocol and UI-local handlers. A missing Arbora operation blocks that family's cutover; the UI shows unavailable instead of using a hidden fallback.

The migration order is OVERSTORY-API-R001 client/host seam, OVERSTORY-API-R002 graph families, then OVERSTORY-API-R003 remaining families. Each slice can merge independently with its own fixture tests, but the status manifest remains `SPECIFIED` until an exact merged revision and evidence for the applicable slice is recorded. No historical source checkpoint alone establishes current-main delivery.

Requirement IDs are defined in [requirements.md](requirements.md); delivery state per ID is in `status.json`.

## Public execution projection

R011.3 extends the existing identity-preserving adapter with the shared backend execution projection.
Rendering components alone do not establish public summary, tool or child-transcript delivery.
The browser and host must consume one released contract without deriving child targets or implementing orchestration.

## User Scenarios & Testing

### User Story 1 - Read graph and Atlas results under one identity (Priority: P1)

A tenant reader browses graph and Atlas results through the typed client so that the identity, tenant and purpose stay the same on every surface.

**Acceptance Scenarios**:

1. **Given** a signed-in tenant reader, **When** the reader opens a graph or Atlas page, **Then** the page reads through the generated Arbora operation and shows only that tenant's data.

### User Story 2 - Confirm an effect with its exact plan reference (Priority: P2)

An operator previews an effect and confirms it so that only the previewed effect runs.

**Acceptance Scenarios**:

1. **Given** a server-issued preview and `plan_ref`, **When** the operator confirms with step-up, **Then** the console sends that exact reference and the effect runs once.
2. **Given** a stale reference, a changed principal or a missing step-up, **When** the operator confirms, **Then** the action is refused and no effect runs.

### User Story 3 - Regenerate the client from a public schema (Priority: P3)

A contributor regenerates the client so that CI fails when a required operation disappears.

**Acceptance Scenarios**:

1. **Given** a pinned schema digest, **When** the contributor regenerates the client, **Then** the diff is empty or CI reports the missing operation.

### Edge Cases

- An operation is missing or the digest differs: the caller shows a typed unavailable state and uses no legacy route.
- A token expires during a stream: the host keeps auth and the cancel stops the stream safely.

## Assumptions

- Arbora publishes a versioned `/api/v1` schema with a digest.
- Browser-local endpoints are listed in the route census with an owner and a reason.
