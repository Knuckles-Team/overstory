# OVERSTORY-DECIDE — Implementation plan

Governing spec: [spec.md](spec.md). Rows: [requirements.md](requirements.md).

## Summary

The browser app presents decision evidence, proposals, the artifact graph and the project mode. It reads and acts only through arbora operations. It reuses the existing route views, the typed read client and the atlas renderers.

## Technical Context

- **Language/Version**: TypeScript with React; Python 3.14 for the host adapter
- **Primary Dependencies**: The existing app, the typed arbora client and the atlas renderers.
- **Storage**: N/A. The browser holds no durable store.
- **Testing**: Vitest component tests and Playwright browser tests.
- **Target Platform**: Modern browsers and the FastAPI host
- **Project Type**: Web
- **Performance Goals**: N/A. A row states its own budget.
- **Constraints**: The views hold no service credential and no write path to the engine.
- **Scale/Scope**: The rows of requirements.md.

## Constitution Check

- **Article one. The browser shows; arbora decides**: Pass. The views present arbora answers and compute no decision.
- **Article two. No fabricated data in the interface**: Pass. A missing field shows `unavailable`.
- **Article three. The frontend type-checks, lints and builds**: Pass. The build contract lists the commands.

## Project Structure

```text
src/App.tsx                                   existing
src/lib/api.ts                                existing
src/components/views/ProposalReview.tsx       new
src/components/views/ArtifactGraph.tsx        new
src/components/views/ProjectMode.tsx          new
```

## Phase 0: Research

No unknowns; no research.md.

## Phase 1: Design

### Existing components and reuse

The browser application is assembled in `src/App.tsx`. Shared identity and requests live in `src/lib/auth.ts` and `src/lib/api.ts`. `src/components/views/` contains route views; `src/components/atlas/` provides reusable result and graph renderers. The FastAPI host in `agent/overstory/server.py` currently adapts browser protocols. Implementation must inventory the exact current decision route before editing, then extend its typed read client and route registration. Existing graph canvas and table renderers may show structure, but must not change decision semantics. Do not introduce a second decision engine or a browser-to-database credential.

### Data and interaction contract

The WebUI consumes a versioned Arbora read response shaped as `{decision_id, tenant_id, option_id, chosen, premise_refs[], derivation_refs[], constraint_results[], certificate_ref, why_not?, decided_at, record_version}` and a separate evaluation response `{decision_id, evaluation_id, cohort, label_provenance, independent, n_items, n_min, target_coverage, observed_coverage?, observed_risk?, window, method_version, evaluated_at, receipt_ref}`. These are conceptual UI contracts: generated API types prevail when the Arbora operation registry is available. Unknown fields are ignored safely; missing required identifiers fail parsing into an error state. Browser responses carry no service bearer. Why-not is a separate bounded request and never rewrites the committed record.

Query keys include principal/tenant, decision ID, record version, evaluation ID and purpose. Abort old requests on selection or identity change. A receipt is shown only when `independent=true`, `n_items>=n_min`, matching decision/version and nonexpired window. The server remains authoritative and the browser independently withholds unsupported claims. Links to premises open authorized read routes and propagate refusal. Do not turn a ref into raw HTML.

### Failure, privacy and migration

Treat authorization refusal, absent record, unavailable evaluation, insufficient sample, timed-out why-not and transport failure as distinct typed states. Redact private premise text from analytics and client logs. Existing saved links should resolve by stable decision ID. If a legacy route exists, keep only a bounded redirect to the canonical route. Server-generated stale or synthetic labels are shown as diagnostics, never as calibrated evidence. No client-side write path is introduced.

### Independent development

From a clone, run `pnpm install --frozen-lockfile`, `uv venv --python 3.12`, `uv pip install -e '.[test]'`, then `pnpm run dev:server` and `pnpm run dev`. A test Arbora base URL and OIDC test realm may be supplied through documented environment variables; unit/contract tests use checked-in synthetic fixtures and start without a shared deployment. The browser acceptance test provisions its own service/identity fixture or runs in hosted CI. See `test-spec.md` for exact gates.

### Development views

The proposal view lists typed proposals through `ARBORA-OPS-R896.5`. An accept action asks arbora to open a pull request. The view shows the link and the gate state. It holds no other write path. The artifact view renders the answers of `ARBORA-OPS-R896.1` in the served order. The project view shows the mode and submits changes through `ARBORA-OPS-R896.2`. A change to `evolving` shows the pending operator approval. The control never approves itself.

## Phase 2: Task approach

Tasks follow the rows. Each rollup has a component row before its hot-path proof. Tasks for the three views may run in parallel.

## Complexity Tracking

None. The constitution check passed.

## Build contract

Run `pnpm run typecheck`, `pnpm run test`, `pnpm run test:e2e` and `pnpm run build`. The configured CCCC staged rule allows no new function above cyclomatic 10 or cognitive 15. Apply the configured jscpd and Dupehound scanners. Reuse the route, auth and renderer seams. Reject duplicate decision calculations.

## Production caller chain

The route in `src/App.tsx` renders a view in `src/components/views/`. The view calls the typed client in `src/lib/api.ts`. The client calls the arbora operation. No obsolete path exists to delete.

## Cross-repo seams

- `ARBORA-OPS-R896.1`: the artifact intent operations.
- `ARBORA-OPS-R896.2`: the project mode manage operation.
- `ARBORA-OPS-R896.5`: the proposal list and decision operations.
- `MEDULLA-SDLC-R017.2`: the proposal kinds.
