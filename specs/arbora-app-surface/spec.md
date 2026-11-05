# OVERSTORY-APPS — Arbora browser shell and app surfaces

**ID:** OVERSTORY-APPS
**Owner:** overstory
**Related IDs:** OVERSTORY-APPS-R002, OVERSTORY-APPS-R003, OVERSTORY-APPS-R001; OVERSTORY-R003 is the first app consumer
**Delivery:** specified; publication and consumer cutover unverified
**Acceptance:** open

## User outcomes

The browser presents one Arbora product identity and a first-class Apps section. A contributor can add a native or approved package-contributed app using one typed `AppSurface` contract. Navigation, capability filtering, WebMCP exposure, service client and optional Atlas renderer bind to the existing shell without app-specific rewiring. Markets is the first consumer, with its behavior defined by the local Finance spec. This spec owns the reusable shell, app contract and product-name migration, not finance calculations.

## User scenarios and testing

### User Story 1 - Use the Arbora shell and its apps (Priority: P1)

A user opens the browser, sees one Arbora identity and opens an app from the Apps section. A contributor adds a native or approved package-contributed app through one typed `AppSurface` contract.

**Acceptance scenarios**

1. Given a signed-in user whose role allows an app, When the navigation loads, Then the app appears in the Apps section and opens its route.
2. Given a user whose role denies an app, When the user opens its URL directly, Then the shell shows a denied state and loads no app code.
3. Given a contributed descriptor that asks for executable code or an extra privilege, When the host validates it, Then the descriptor is rejected and no route is registered.

### User Story 2 - Read a run and edit the graph honestly (Priority: P2)

A user inspects a run's harness configuration, context use, cost and termination reason, and edits graph nodes, all through arbora.

**Acceptance scenarios**

1. Given a run whose producer reports context overflow, When the user opens the run view, Then the view shows the overflow label and not a generic failure.
2. Given an absent or refused run operation, When the user opens the run view, Then the view reads not available and shows no zero.
3. Given an unauthorized graph edit, When the user saves a node, Then the engine refuses it, the node stays unchanged and the verdict is shown.

### User Story 3 - Work, explore and operate from one workspace (Priority: P2)

A user moves between Work, Explore and Operate contexts, reads memory files with their sync state and resolves a retained conflict.

**Acceptance scenarios**

1. Given a stale memory file save, When arbora retains both versions, Then the Files tab shows both contents and digests and never overwrites the accepted head.
2. Given a feature of the earlier pages, When the user looks for it in the workspace, Then the feature is reachable as a task surface, lens or inspector.

### Edge Cases

- A missing catalog, an unsupported manifest version, a denied capability or a failed app load each show a distinct visible state.
- A late response after a principal, tenant, graph or document change is discarded and protected content is cleared on access loss.
- A refused or expired cursor requires an explicit restart; incompatible snapshots are never concatenated.
- A missing producer operation reads not available and never falls back to a fabricated value.

### Assumptions

- Arbora authorizes every call and the engine owns every decision; the browser filters navigation for presentation only.
- Producer operations that are not yet registered are consumed only after their owner rows land, and their rows stay SPECIFIED until a served run passes.
- The packaged host serves the SPA from the same origin, so no service bearer reaches browser JavaScript.

## Requirements

| ID | Behavior | Related ID | Evidence |
|---|---|---|---|
| OVERSTORY-APPS-R038 | Titles, metadata, webmanifest, assets, theme, UI copy and published Pages identity consistently say Arbora | OVERSTORY-APPS-R002 | Asset regeneration + rendered snapshot + Pages build |
| OVERSTORY-APPS-R039 | Package/import, npm metadata, WebMCP IDs, skills, browser storage/consent and environment variable names keep the overstory component identity. Only user-visible strings are rebranded | OVERSTORY-APPS-R003 | Build and wheel tests |
| OVERSTORY-APPS-R040 | `apps` is one section in `nav-registry.ts`. Each app declares route, capability, typed client, WebMCP page and optional Atlas renderer in one `AppSurface` | OVERSTORY-APPS-R001 | Contract and route-census tests |
| OVERSTORY-APPS-R041 | Native and validated package-contributed apps resolve to the same shape. Untrusted descriptors cannot register executable code, arbitrary URLs or extra privileges | OVERSTORY-APPS-R001 | Invalid descriptor and denied capability tests |
| OVERSTORY-APPS-R042 | Markets consumes the contract without duplicating scanner/chart or gateway wiring in the shell | OVERSTORY-R003, OVERSTORY-APPS-R001 | First-consumer integration test |
| OVERSTORY-APPS-R043 | Storage and consent keys are unchanged by the rebrand, so legacy browser state stays valid. Any future key change expires or migrates it with explicit renewed consent | OVERSTORY-APPS-R003 | Browser test |
| OVERSTORY-APPS-R044 | App navigation works with keyboard, touch, reduced motion and mobile/desktop layouts and has loading, unavailable and denied states | OVERSTORY-APPS-R001 | E2E accessibility suite |

Operator decision: only front-end-facing items carry the Arbora name; the repository, package and runtime identifiers stay `overstory`, an Arbora component. Public examples and setup instructions must use portable addresses and credentials supplied by a contributor, never a private service or inventory. The shell must not receive a service bearer in JavaScript.

## Completion

BUILT requires merged source, generated assets and package metadata with consumers updated. ACCEPTED requires installed wheel and Pages build, clean browser migration/capability tests, one native app and one rejected contributed descriptor, and exact GitHub commit/CI evidence in `tasks.md`. Consumer release and public repository rename remain explicit external acceptance receipts.

Requirement IDs are defined in [requirements.md](requirements.md); delivery state per ID is in `status.json`.

## Additional consumer scope

The existing app, run, session and graph rollups also own the browser consumers listed in plan.md.
They cover evolution evidence, unified sessions, indexed usage, live graph convergence and the additional app interactions.
The app interactions include retrieval comparison, bounded charts, column bindings, editor compatibility, meetings, bookmarks and generated artifacts.
EG retains semantic and policy authority. Arbora retains authenticated serving and host effects. SDK and AU retain their respective transports and execution.
All new requirements remain SPECIFIED until their real served acceptance passes. No implementation or runtime receipt is recorded by this definition batch.

Definition closure remains open for all twelve source inputs.
Missing specialized producer bindings, quantitative limits and complete harness-manifest coverage are definition prerequisites as well as runtime dependencies.
See the open definition prerequisites in plan.md. All new rows remain SPECIFIED.

## Complete responsive Arbora workspace

This extension is SPECIFIED, not an implementation or acceptance claim. It extends the existing owner rather than creating a duplicate redesign specification. The current-state feature inventory and migration obligations are in [workspace-coverage.md](workspace-coverage.md). Every feature remains in scope on mobile and every permitted semantic leaf is directly navigable.

- OVERSTORY-APPS-R045: Complete capability and leaf census.
- OVERSTORY-APPS-R046: One semantic workspace navigation state.
- OVERSTORY-APPS-R047: Native WebMCP action equivalence.
- OVERSTORY-APPS-R048: WebMCP lifecycle and authority preservation.
- OVERSTORY-APPS-R049: Preserve every feature through the Arbora redesign.
- OVERSTORY-APPS-R050: Composed deployment and shared-backend acceptance.

## Ground-up consolidation, not page preservation

OVERSTORY-APPS-R049.1 and R049.2 define the redesign outcome. The product has three primary workspace contexts: Work, Explore and Operate. Existing features become task surfaces, lenses or inspectors within those contexts. They do not remain independently laid-out pages behind a new navigation bar. Legal pages may remain separate where required. Help and settings use contextual utilities.

The capability inventory is a preservation contract, not the proposed page inventory. Compatible deep links resolve into workspace state. Source navigation, object-link and consent fixes are foundations only. They do not prove the visual redesign, semantic zoom, mobile parity or measured task improvement. These new requirements remain SPECIFIED.

## Explore source proof and remaining migration

OVERSTORY-APPS-R049.1.1 is the bounded source proof for retained, read-only Explore investigation. OVERSTORY-APPS-R049.1.2 retains complete contextual migration and rendered acceptance. Work and Operate remain planned until delivered. The new opt-in route does not migrate old URLs or certify real providers. R049.2 still requires the measured redesign outcome.

OVERSTORY-APPS-R049.1.3 defines the narrow Work source composition. It retains conversation selection and the existing Chat instance beside independent task/trace read surfaces. It does not complete correlated run investigation or invent missing producer links. R049.1.2 retains full migration and installed-browser acceptance.

## Nested execution inspection and targeted interaction

R049.1.2 retains complete migration acceptance, including producer-bound execution navigation beyond the independent Work source slice.
R049.1.3 remains evidence for independent task and trace inspection, not a subagent association or chat target.
R049.1.10 through R049.1.12 define new targeted actions through one backend contract.
The browser consumes hierarchy, dependencies, public records and capabilities; it does not schedule agents or infer control targets.

### Request handling without a mode

The single composer under R005.4.1 sends requests without an interaction-mode choice. The backend owns request handling.

## Edit a prompt and keep both conversations

OVERSTORY-APPS-R051 adds an Edit and fork action to an earlier message the caller
sent. A preview makes the retained context and omitted later replies clear.
The original stays intact; the edited prompt begins a new persisted branch with
explicit lineage and a return path. Forking does not undo earlier external
actions. The existing shared Chat and conversation list remain the only UI.

The client cannot implement this with cached-message copies or regeneration.
It requires the producer-owned history and fork operation described in plan.md.
The new rows remain SPECIFIED. Missing capability is unavailable, never a fake
successful branch. Completed-child continuation remains a separate workflow.

### Canonical Work task reads

R049.1.3 task list/detail reads use `agents.tasks.list` and `agents.tasks.get` through the canonical browser operation transport. The bounded first page validates the `tasks` and opaque `nextCursor` envelope; it is not a full task census. Task, context and run references remain distinct provider values. Refusal, malformed responses and mismatched task identity never fall back to legacy session routes. Cancellation and technical traces are outside this read-only migration. Installed canonical browser acceptance remains pending; synthetic transport tests do not qualify it.
