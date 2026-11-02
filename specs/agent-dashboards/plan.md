# OVERSTORY-DASH — Implementation plan

Governing spec: [spec.md](spec.md). Rows: [requirements.md](requirements.md).

## Summary

Overstory Studio lets a person and the chat agent build dashboards from graph queries. The live caller is `ROUTES` (src/lib/nav-registry.ts:216 `workspace.dashboards`) lazy-loading `DashboardsView`. The reuse candidates are the Atlas UQL adapter, the WebMCP provider, `StatusMessage` and the Radix dialog; no new query client is added.

## Technical Context

- **Language/Version**: TypeScript with React (Node per package.json); Python 3.14 for the server in agent/overstory
- **Primary Dependencies**: React, Radix UI primitives, Tailwind, Vite, Vitest, Playwright; FastAPI on the server side
- **Storage**: N/A (browser preferences in local storage only)
- **Testing**: Vitest with jsdom (`pnpm test`), Playwright (`pnpm test:e2e`), pytest for the server; coverage thresholds 90 lines, 90 functions, 85 branches
- **Target Platform**: Phone, tablet and desktop browsers
- **Project Type**: web application
- **Performance Goals**: N/A (panel results are bounded to 500 rows per query)
- **Constraints**: Queries only through arbora, no direct data-source access, strict schemas, tool results under 1,500 bytes, keyboard-complete controls
- **Scale/Scope**: 16 active rows; 12-column grid, at most 24 panels per dashboard

## Constitution Check

- I One owner per concept: pass. Each row names one owning module.
- II Extend before you create: pass. Each `Shape:` sentence names the helper to reuse.
- XXIV Complete rows: pass. Every active row holds a caller chain, a shape and a test reference.
- XI Code stays small: pass. The Build contract lists the complexity and size limits.
- XXI Public files stay portable: pass. The spec holds no host data.
- R-I The browser shows; arbora decides: pass. Data access goes through the arbora client.
- R-II No fabricated data in the interface: pass. Views show served data or an honest state.

## Project Structure

Existing paths this spec owns:

```text
src/lib/dashboards/model.ts, history.ts   existing  document model and undo history
src/lib/dashboards/query.ts, params.ts    existing  panel queries and parameters
src/lib/dashboards/store.ts, tools.ts     existing  local store and WebMCP tools
src/lib/dashboards/store-arbora.ts        new       arbora-backed store
src/lib/dashboards/query-kinds.ts         new       nl, fleet-call and eg-op runners
src/components/dashboards/                existing  view, panel body, chart, forms
src/components/dashboards/ShareDialog.tsx new       owner and access dialog
src/components/dashboards/CatalogPage.tsx new       catalog browse and search
```

## Phase 0: Research

No unknowns. The caller chain, shape and test of every row come from the current code, so this spec adds no research.md.

## Phase 1: Design

The design keeps queries and storage in arbora and the document, rendering and tools in the browser. The sections below keep the existing design notes.

### OVERSTORY-DASH architecture

### Reuse inventory

- Query: `uqlAdapter` in `src/lib/atlas/adapters/uql.ts` runs panel queries. It posts to the governed graph query route.
- Tools: `makeTool` in `src/lib/webmcp/tools.ts` and `useWebMcpToolSet` in `src/lib/webmcp/provider.tsx`. The registrar follows `src/lib/webmcp/atlas.tsx`.
- Route: one entry in `src/lib/nav-registry.ts`.
- Charts: a small SVG renderer in `src/components/dashboards/ChartSvg.tsx`. The Markets renderer draws finance series only, so the dashboards renderer stays separate.

### Document

```text
Dashboard { schema_version: 1, id, title, revision, params[], panels[] }
Panel { id, title, viz: table|line|bar|kpi, query { kind: uql, text }, layout { x, y, w, h }, options }
```

The document is the catalog asset of MEDULLA-TYPED-PACKS-R108. Arbora saves it under that asset type.
The catalog page (OVERSTORY-DASH-R016) reads MEDULLA-TYPED-PACKS-R106 and R108 assets through the arbora catalog operations.

### Interfaces

- `model.ts` holds pure edit functions. Each returns a new document with revision + 1.
- `history.ts` holds the undo stack and the activity log. Each entry records the actor.
- `tools.ts` builds the WebMCP tools over a controller. Tool names use the `overstory.dashboard.` prefix.
- `store.ts` defines the store interface. The local store is the interim implementation.

### Decisions

- Agent edits run through the same reducer as user edits, so undo is uniform.
- Tool results stay small. The 1,500-byte budget forbids returning row data in full. `preview_query` returns columns, a row count and a short sample.
- Parameters substitute only as validated scalar values. Query text is never built from free text.
- The remaining rows stay SPECIFIED until the arbora dashboard operations land.

### Relation to the Status page

The `observability.live-dashboards` route at `/dashboards` shows fixed metric, log and trace panels. This spec owns graph-query dashboards at `/data-dashboards`. The two share no state.

### Amendment: Overstory Studio display name

Name the existing dashboard-authoring surface Overstory Studio. Keep the
`agent-dashboards` family, OVERSTORY-DASH IDs, `/data-dashboards` route, document
schema, storage keys and WebMCP tool identifiers unchanged. This is display
alignment, not new dashboard implementation. Catalog persistence (R010),
ownership/sharing (R012) and catalog discovery (R016) retain their unmet
obligations and existing acceptance requirements.

## Phase 2: Task approach

Order the work producer first: the document model and query runners, then the store, then the view components. Rows on different files run in parallel. Each task line in tasks.md names one row.

## Complexity Tracking

None. The constitution check passed with no violation.

## Build contract

The change must meet these gate thresholds from the organization constitution table.

- Cyclomatic complexity 10 and cognitive complexity 15 per function (`pipelines_hooks/complexity`).
- Words per sentence 20 (`ste`).
- Clone similarity 0.85 blocking at 40 tokens (`dupehound`).
- KISS limits from `.config/kiss.toml`: 35 statements, 15 locals, 20 calls, 3 positional arguments, 4 indentation levels, 300 lines and 10 functions per file.
- Pre-land fast set: `format`, `hygiene`, `secrets`, `types`, `tests-fast`; post-land set: `spec`, `tests`, `supply-chain`.

Repository commands: `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` (thresholds: lines 90, functions 90, branches 85, statements 90 from vitest.config.ts) and `pnpm test:e2e` for browser rows.

No scanner gaming, no suppression and no duplicate implementation: a row reuses the helper named in its `Shape:` sentence.

## Production caller chain

Entry point: the browser opens `/data-dashboards`; `ROUTES` (src/lib/nav-registry.ts:216) lazy-loads `DashboardsView` (src/components/dashboards/DashboardsView.tsx:115), which uses `useDashboards` (src/components/dashboards/useDashboards.ts:25), runs panel queries through `runPanelQuery` (src/lib/dashboards/query.ts:31) and registers the WebMCP tools (src/components/dashboards/DashboardsView.tsx:127). Obsolete paths to delete: none.

## Cross-repo seams

None. Arbora owns the dashboard operations (ARBORA-OPS-R861) and the catalog operations; overstory consumes them through the shared client in src/lib/arbora-api.
