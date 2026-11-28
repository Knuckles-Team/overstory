# OVERSTORY-CITYHOST — Implementation plan

Governing spec: [spec.md](spec.md). Rows: [requirements.md](requirements.md).

## Summary

The page calls `mountCity` from `arbora-city/engine` with an Arbora source whose transport posts to `POST /api/apps/city/invoke`. The host allowlists the package's `operations.json` and calls Arbora as the bound actor. The route manifest marks `/apps/city` isolated, the security middleware sends COOP and COEP on that document only, and crossing the boundary loads a new document.

## Technical Context

- **Language/Version**: TypeScript 6.0 (strict) with React 19 in the browser; Python 3.14 with FastAPI in the host
- **Primary Dependencies**: `arbora-city` ^0.1.0, `three` 0.186, `zod` 4.6, `vite` 8, `vitest` 5, `@playwright/test`; FastAPI and pydantic in the host
- **Storage**: N/A: the host caches one catalog read for 60 s in memory
- **Testing**: Vitest under `src/**/__tests__/`, pytest under `agent/overstory/__tests__/`, node tests under `scripts/`, Playwright under `e2e/`
- **Target Platform**: Evergreen browsers; the overstory FastAPI host
- **Project Type**: web application (React page shell plus Python host)
- **Performance Goals**: the city chunk holds the engine and `three`; the shell bundle holds neither
- **Constraints**: the browser never contacts Arbora; only listed operations pass; only the city document is isolated
- **Scale/Scope**: 1 route, 1 gateway route, the WebMCP tool set, 3 isolation headers

## Constitution Check

- R-I The browser shows; arbora decides: pass. The gateway forwards listed operations as the bound actor and decides nothing.
- R-II No fabricated data: pass. A failed read shows `Degraded`; only the explicit sandbox shows the labelled demo.
- R-III The frontend type-checks, lints and builds: pass. Each row names its test and the build proof.
- R-IV The full operator surface is WebMCP: pass. `R005` keeps every tool and dispatches through the handle.
- R-V The city engine belongs to arbora-city: pass. No row adds engine code to overstory.

## Project Structure

```text
src/apps/city/components/CityPage.tsx     (mount and dispose)
src/apps/city/components/CityWebMcp.tsx   (tools from the handle)
src/apps/city/handleContext.ts            (new)
src/apps/city/transport.ts                (new)
src/apps/city/webmcp.ts                   (tools from the handle)
src/apps/city/routes.ts, surface.ts       (isolation field, client)
src/lib/nav-registry.ts                   (RouteDef.isolation)
src/lib/route-isolation.ts                (new)
scripts/site-route-registry.mjs           (manifest version 2)
vite.config.ts                            (cityOperations, cityIsolationHeaders)
agent/overstory/apps/city/router.py       (invoke route)
agent/overstory/apps/city/gateway.py      (invoke_allowed)
agent/overstory/apps/city/operations.py   (new)
agent/overstory/server.py                 (isolation headers, manifest version 2)
e2e/city-isolation.browser.ts, .config.ts (new)
scripts/city-chunk.test.mjs, city-cutover.test.mjs (new)
```

## Phase 0: Research

Two decisions, recorded in [research.md](research.md): the embedder policy and the document boundary.

## Phase 1: Design

1. **Owner.** This repository owns the host page, the gateway and the response headers; arbora-city owns the engine and the operation list; arbora owns the operations.
2. **Cohesion.** The mount, the transport and the tools change when the package API changes; the gateway and headers change with the host.
3. **Dependency direction.** The page depends on `arbora-city`; the package depends on nothing here. The gateway depends on the injected Arbora invoke.
4. **Interface depth.** `ArboraTransport.invoke` hides the gateway; `CityHandle` hides the engine. The page has two call sites of the package: `mountCity` and the source constructors.
5. **Special cases.** One special case: the sandbox mounts the demo source. No other branch picks a source.
6. **State.** None. The connection lifecycle is the package's `SourceConnectionMachine`; the host holds a cache entry only.
7. **Environment.** Environment. `VITE_CITY_SANDBOX` is the only flag. The kit URL `/city-kit/` and the 10 s gateway timeout are stated here.

## Phase 2: Task approach

The package dependency first, then the transport and gateway, then the mount and tools, then the isolation rows, then the cutover in the change window of `CITY-PACKAGE-R002.1`.

## Complexity Tracking

none

## Build contract

Gates: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm build`, `pytest`, `pipelines-hook spec-standard`. Organization limits apply.

## Production caller chain

`/apps/city` -> `CityPage` -> `mountCity` (`arbora-city/engine`) -> `createArboraSource(createGatewayTransport())` -> `POST /api/apps/city/invoke` -> `CityGateway.invoke_allowed` -> Arbora `invoke`. Document load -> `SecurityHeadersMiddleware` -> COOP and COEP for `/apps/city`. Obsolete paths deleted by `R008`: the `EventSource('/avatar/presence')` client of `src/apps/city/api.ts` and the routes `/fleet`, `/layout`, `/state` and `/state/heartbeat`.

## Cross-repo seams

- `CITY-PACKAGE-R001.1`, `R001.4`, `R002.1`, `R002.3`, `R003.3`, `CITY-SOURCE-R001.3` and `CITY-SOURCE-R002` provide the package API, the operation list and the move that `R002` to `R006` and `R008` consume. Contract: [contracts/arbora-city-package.md](contracts/arbora-city-package.md).
- `R007` provides the isolation that `CITY-RUNTIME-R001.3` consumes. Contract: [contracts/cross-origin-isolation.md](contracts/cross-origin-isolation.md).
