# OVERSTORY — Implementation plan

Governing spec: [spec.md](spec.md). Rows: [requirements.md](requirements.md).

## Summary

The Markets app presents instruments, charts and finance views in the browser and draws only values that owner services compute. The live caller is `APP_ROUTES` (src/apps/markets/routes.ts:12) through the shared route registry. The reuse candidates are the shared Atlas `ohlcAtlasRenderer`, the pure contract modules under src/apps/markets/ and the existing gateway helpers. The contracts are built and tested; the live wiring rows mount them.

## Technical Context

- **Language/Version**: TypeScript with React, Node per package.json
- **Primary Dependencies**: React, React Query, Zod, Vite, Vitest, Playwright, lucide-react
- **Storage**: N/A (the browser holds only cached facts marked stale)
- **Testing**: Vitest with jsdom (`pnpm test`), Playwright (`pnpm test:e2e`), coverage thresholds 90 lines, 90 functions, 85 branches
- **Target Platform**: Phone and desktop browsers, installable PWA
- **Project Type**: web application
- **Performance Goals**: Decimated display of large series keeps finalized output identical
- **Constraints**: No client-side financial computation, no order submission, no ticker-only identity
- **Scale/Scope**: 26 active rows, 16 contract and component modules

## Constitution Check

- I One owner per concept: pass. Each row names one owning module.
- II Extend before you create: pass. Each `Shape:` sentence names the helper to reuse.
- XXIV Complete rows: pass. Every active row holds a caller chain, a shape and a test reference.
- XI Code stays small: pass. Contract modules are single-purpose pure files; the Build contract lists the limits.
- XXI Public files stay portable: pass. The spec holds no host data.

## Project Structure

Existing paths this spec owns:

```text
src/apps/markets/routes.ts           existing  page registry
src/apps/markets/components/         existing  pages and views
src/apps/markets/chart-contract.ts   existing  chart input contract
src/apps/markets/detail-support.ts   existing  tab and mode gating
src/apps/markets/overlay-*.ts        existing  overlay types and alignment
src/apps/markets/performance-card.ts existing  verbatim-value contract
src/apps/markets/csv-import.ts       existing  import preview contract
src/apps/markets/offline-cache.ts    existing  staleness contract
src/apps/markets/chart-a11y.ts       existing  accessibility summary
e2e/markets-app.spec.ts              existing  gains the planned wiring cases
```

## Phase 0: Research

No unknowns. The owner services and their fixtures are cited in the design section by row ID.

## Phase 1: Design

Governing requirements: [spec.md](spec.md). This design defines the WebUI contract proposal; paths in the proposed API table do not claim deployed endpoints exist.

### Existing system and reuse

The React app derives route rendering, sidebar, mobile layout and role filtering from `src/lib/nav-registry.ts` and `src/App.tsx`. The server applies its own role ladder in `agent/overstory/rbac.py`; hiding a route is not authorization. `src/lib/gateway.ts` already returns `{ok,data,unavailable,error}`, validates optional Zod response schemas and distinguishes HTTP 404/501 from empty results. `src/lib/atlas/types.ts` already recognizes a `series` result shape; `src/lib/atlas/renderers.ts` and `src/components/atlas/renderers/index.ts` own the renderer registry. No financial chart is registered in the inspected base. `src/lib/webmcp/atlas.tsx` shows the browser-controller pattern. These are the required integration points.

Use React Query for server state and component/context state for ephemeral UI state. Add a single finance API adapter using existing browser-safe gateway helpers and Zod schemas. Do not add a parallel router, provider client, auth store, chart registry, or browser-side finance calculation engine.

### Architecture and data flow

```text
Browser Finance route / Atlas series result
  -> shared ChartRenderer and finance view models
  -> validated WebUI API adapter
  -> WebUI FastAPI host with session and RBAC checks
  -> authenticated arbora gateway
  -> medulla finance storage/compute
  -> Emerald Exchange + scion-sdk for provider/account ingress and governed effects
```

`meristem` may orchestrate research and backtests but does not own monetary calculations. The WebUI sends bounded read/filter/preset/import-preview requests. It never sends a broker order from a chart or recommendation action. A separate governed owner flow is required for any live effect.

### Proposed browser contract

The gateway and WebUI host should agree these operations before implementation. All lists are bounded and paginated; all writes require CSRF/session protection, authorization and an idempotency key where retryable. Return the existing validated gateway envelope and structured error code, rather than a successful HTTP 200 containing invented defaults.

| Operation | Proposed host route | Request and response contract |
|---|---|---|
| Search/list groups | `GET /api/finance/instruments`, `GET /api/finance/groups` | Query: search, universe/group, venue, assetClass, cursor, limit. Response: stable instrument/listing IDs, labels, venue, quote currency, session calendar, group IDs, coverage and next cursor. |
| Quote and series | `GET /api/finance/quotes`, `GET /api/finance/series` | Query: IDs, source, range, timeframe, priceBasis, cursor, limit. Response: typed scalar or OHLC/volume points, source, revision, currency, session and completeness. Unsupported timeframe returns an explicit error. |
| Portfolio | `GET /api/finance/portfolios`, `GET /api/finance/performance` | Account/group scope, holdings, position/lot references, values and returns as decimal strings, method, benchmark ID, currency, valuation as-of, data quality. |
| Strategy and analysis | `GET /api/finance/analysis` | Instrument/holding ID, immutable snapshot ID, strategy ID/version/parameter hash, evidence IDs, scorecard, action proposal or abstention and reason. No executable order object. |
| Alerts and DCA | `GET/POST /api/finance/alerts`, `GET/POST /api/finance/dca-plans` | Scoped rule/plan ID, cadence and timezone, event ID, dedupe key, due/missed/failed/delivered state, paper/live mode and receipt. Mutations require version precondition. |
| CSV import | `POST /api/finance/imports/preview`, `POST /api/finance/imports` | Multipart file to host only; mapping, per-row validation, source content digest, dry-run counts, idempotency key, import receipt. Never put file contents in local storage. |

Define common `SourceStamp = {sourceId, observedAt, effectiveAt, asOf, session, revision, quality, delaySeconds?}`. Times are ISO-8601 UTC on the wire; exchange session and calendar are separate named fields. A money value is `{amount: decimal-string, currency: ISO-4217}`, never a JSON float. `SeriesPoint` carries a stable bar/event ID and timestamp. OHLC points require open/high/low/close and validate low ≤ open/close ≤ high; scalar points carry one value and units. A missing observation is a gap, not a zero or forward fill. `DataStatus` distinguishes valid, warming, stale, partial, unavailable and denied. A source correction increments revision and replaces the affected point by ID.

For trends, `SignalKey` includes instrument, venue, price basis, timeframe/calendar, algorithm version and parameter hash. A flip event has effective and observed times, finalized-bar ID, prior/new direction, source revision and evidence ID. The first computable direction is not fabricated into a flip. Chart, scanner and alerts consume this same event. `StrategySpec` is versioned and emits proposed actions only; DCA supports fixed amount/shares, cadence and value-averaging, and missed contributions remain visible. Backtest evidence includes costs and an out-of-sample/overfitting assessment before a claim enters a recommendation.

### Layout and chart design

The Markets workspace uses bottom navigation at mobile widths and the existing shell's side rail on desktop. Group tabs scroll horizontally; Basic/Holdings is an explicit mode. Instrument rows pair text with color, a licensed logo fallback, session clock, sparkline and prior-close line. Detail tabs are Chart, Rates, News, Notes, Dividends and Analysis. Portfolio ranges are 1D/1M/YTD/1Y/5Y/ALL; detail ranges are 1D/5D/1M/6M/1Y/5Y/MAX. Do not copy third-party branding.

Build one typed `ChartRenderer` component and register its Atlas wrapper in the existing registry. It draws line/area for scalar portfolios, funds and indices and candles for tradables only when complete OHLC exists. Volume is a separate pane. Trend, DCA, cost-basis and margin overlays share the time axis but retain their own evidence and simulation labels. A touch crosshair and pinch zoom must coexist with page scroll. Keyboard navigation and a text/table representation expose equivalent facts. Keep the chart library behind the component. Lightweight Charts is a candidate, subject to attribution and capability review. Advanced Charts and Pine compatibility are separate products.

Indicators are computed by the owner from full required history before viewport clipping or the owning engine's large-dataset display decimation. The browser requests capped pages and bounded deltas, never full-universe history. A 1,000-instrument scanner loads pages rather than one request per symbol. Presets are versioned user configuration; migrate or reject incompatible versions explicitly.

### Failure, security and compatibility

The host refuses cross-account access even if a user edits a URL. The UI handles 401/403, 404/501 capability absence, malformed payload, stale/partial data, unsupported interval, empty account, interrupted import and disconnected stream separately. Retain the last trustworthy as-of and mark it stale. A cached PWA shell disables current-data and effect claims offline. Logos, news and market data must carry source rights/attribution; unlicensed assets use text fallback. Real estate is a manually valued holding with valuation date and no trade action. Live leverage remains paper-only in this UI until a separately certified per-instrument policy and approver flow exists.

Compatibility: add new typed routes and Atlas projection without changing existing row/graph renderers. Preserve the current `GatewayResult` behavior. Version wire schemas, strategy IDs and presets; validate unknown values rather than coercing them. No database migration belongs to this repository.

### Local setup and reproducible checks

Use Python 3.12–3.14, Node from `.node-version`, pnpm from `package.json`, and `uv`. From this repository root:

```bash
pnpm install --frozen-lockfile
uv venv --python 3.12
source .venv/bin/activate
uv pip install -e '.[test]'
cp .env.example .env
pnpm run dev:server
```

In a second terminal run `pnpm run dev`. `pnpm run dev:server` listens on port 38001. The Vite config listens on port 9000 and proxies `/api` to that backend. An authenticated Arbora backend and provider entitlements are required for live integration. Contract/UI tests use deterministic fixtures without credentials. Do not commit `.env`.

### Quality and delivery gates

Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run test:e2e`, `pnpm run build`, `uv run --all-extras pytest agent/overstory/__tests__`, and `pre-commit run --config .config/pre-commit.yaml --all-files` for a source implementation. For this documentation-only change, run the normal commit hooks and validate links/forbidden references. The local hook `complexity-staged` calls `python3 scripts/check_complexity_staged.py` on staged supported source and uses CCCC. jscpd and dupehound are required design-review concepts but no command or numeric threshold is configured in this repository. Define approved tooling and thresholds before claiming those gates pass. KISS review must name reused route, gateway, renderer and auth wiring and justify every new abstraction. Do not install a self-calibrating baseline or suppress a finding to manufacture green.

### Cross-repository ownership

| Repository | Owner-native deliverable; interface consumed here | IDs |
|---|---|---|
| [medulla](https://github.com/Knuckles-Team/medulla) | finance-v1 accounts, activities, lots, reference sessions, fixed-point accounting, strategy/backtest/recommendation/leverage outputs and golden fixtures | MEDULLA-FINANCE-PRIMITIVES-R004–MEDULLA-FINANCE-PRIMITIVES-R006, MEDULLA-FINANCE-PRIMITIVES-R007–MEDULLA-FINANCE-PRIMITIVES-R009, MEDULLA-FINANCE-PRIMITIVES-R010, MEDULLA-FINANCE-PRIMITIVES-R013 |
| [scion-sdk](https://github.com/Knuckles-Team/scion-sdk) and [emerald-exchange](https://github.com/Knuckles-Team/emerald-exchange) | qualified stock/FX/commodity source and account/import transport; governed effect boundary | SCION-FINANCE-SOURCES-R002, SCION-FINANCE-SOURCES-R003, SCION-FINANCE-SOURCES-R004 |
| [arbora](https://github.com/Knuckles-Team/arbora) | authenticated finance projection, replay-safe DCA scheduling and outbox alert delivery | ARBORA-DATA-MARKET-R006, MEDULLA-FINANCE-PRIMITIVES-R011 |
| [meristem](https://github.com/Knuckles-Team/meristem) | workflow orchestration without a duplicate finance math authority | MEDULLA-FINANCE-PRIMITIVES-R009, ARBORA-DATA-MARKET-R006 |
| [media-downloader](https://github.com/Knuckles-Team/media-downloader) and Emerald skills | source intake, claim/evidence separation and leveraged-trading guide | EMERALD-GUIDE-R001, EMERALD-MEDIA-R001 |
| [overstory](https://github.com/Knuckles-Team/overstory) | this Markets workspace and shared chart | OVERSTORY-R001, OVERSTORY-R002 |

## Phase 2: Task approach

Order the work producer first. The contract modules exist, so the live wiring rows (R001.2, R002.2, R008.2, R010.2, R011.2, R012.2, R013.2, R014.2, R015.2, R016.2) come next, each mounting one component. Wiring rows that touch different files run in parallel. Each task line in tasks.md names one row.

## Complexity Tracking

none. The constitution check passed.

## Build contract

The change must meet these gate thresholds from the organization constitution table.

- Cyclomatic complexity 10 and cognitive complexity 15 per function (`pipelines_hooks/complexity`).
- Words per sentence 20 (`ste`).
- Clone similarity 0.85 blocking at 40 tokens (`dupehound`).
- KISS limits from `.config/kiss.toml`: 35 statements, 15 locals, 20 calls, 3 positional arguments, 4 indentation levels, 300 lines and 10 functions per file.
- Pre-land fast set: `format`, `hygiene`, `secrets`, `types`, `tests-fast`; post-land set: `spec`, `tests`, `supply-chain`.

Repository commands: `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` (thresholds: lines 90, functions 90, branches 85 from vitest.config.ts) and `pnpm test:e2e` for browser rows.

No scanner gaming, no suppression and no duplicate implementation: a row reuses the helper named in its `Shape:` sentence.

## Production caller chain

Entry point: the browser opens `/apps/markets`; `APP_ROUTES` (src/apps/markets/routes.ts:12) lazy-loads `MarketsHome`, which mounts `MarketsShell` (src/apps/markets/components/MarketsShell.tsx:11), `MarketsNav` (src/apps/markets/components/MarketsNav.tsx:63) and, for a listing, `ChartPage` (src/apps/markets/components/ChartPage.tsx:206) → `OhlcChart` (src/apps/markets/components/OhlcChart.tsx:343). Data reads go through src/apps/markets/api.ts. Obsolete paths to delete: none.

## Cross-repo seams

- Owner services compute lots, cost basis, performance and strategies: rows `MEDULLA-FINANCE-PRIMITIVES-R004` to `MEDULLA-FINANCE-PRIMITIVES-R009` and `SCION-FINANCE-SOURCES-R002`; the browser contract is in [contracts/finance-owner-reads.md](contracts/finance-owner-reads.md).
