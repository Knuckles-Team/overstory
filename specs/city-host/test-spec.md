# OVERSTORY-CITYHOST — Test specification

Governing spec: [spec.md](spec.md).

| Test ID | Requirement | Level | Setup and input | Expected observation | Evidence |
|---|---|---|---|---|---|
| T-001 | `OVERSTORY-CITYHOST-R001` | Unit | The route registry. | `src/apps/city/__tests__/surface.test.ts::city_surface_and_isolated_route`: the route literals satisfy `surfaceProblems`; the route carries `isolation: 'cross-origin'`; `client` names the transport module. | planned |
| T-002 | `OVERSTORY-CITYHOST-R001.1` | Unit | Two builds of the page, one with the flag and one without, and a recording fetch. | `src/lib/__tests__/city-sandbox.test.ts::sandbox_mounts_the_demo_source_and_never_invokes`: with the flag the source kind is `demo` and no request reaches `/api/apps/city/invoke`; without it the kind is `arbora`. | planned |
| T-003 | `OVERSTORY-CITYHOST-R002` | Unit | A build output directory after `pnpm build`. | `scripts/city-chunk.test.mjs::the_kit_and_operations_come_from_the_package`: `city-operations.json` equals the package file byte for byte; `public/city-kit/` is not tracked; `three` and `zod` satisfy the peer ranges. | planned |
| T-004 | `OVERSTORY-CITYHOST-R003` | Unit | A mocked `arbora-city/engine` that records calls; the Vite build manifest. | `src/apps/city/__tests__/CityPage.test.tsx::mounts_once_and_disposes_once` and `scripts/city-chunk.test.mjs::engine_and_three_load_only_in_the_city_chunk`: one `mountCity` call with the stated options; unmount calls `dispose` then `close` once each; no chunk outside the city route imports `arbora-city` or `three`. | planned |
| T-005 | `OVERSTORY-CITYHOST-R004` | Unit | A stub fetch that answers 200, 401, 403, 409, 422, 503, 504 and a network error. | `src/apps/city/__tests__/transport.test.ts::maps_each_status_to_one_transport_outcome`: each status maps to the stated outcome and refusal; one request per call. | planned |
| T-006 | `OVERSTORY-CITYHOST-R005` | Unit | A fake `CityHandle` that records `dispatch` calls and returns a fixed `getState()`. | `src/apps/city/__tests__/webmcp.test.ts::every_tool_dispatches_through_the_handle`: the tool names equal the current set plus `overstory.city.perf`; each action tool makes one `dispatch` call with a valid `CityAction`; every tool has strict schemas. | planned |
| T-007 | `OVERSTORY-CITYHOST-R006` | Integration | A test app over a fake invoke and a dist directory with a two-entry `city-operations.json`. | `agent/overstory/__tests__/test_city_invoke.py::test_invoke_allowlists_maps_refusals_and_caches_the_catalog`: an unlisted op is 403 with no fake call; a missing file is 503 for every op; refusal, unavailable and timeout map as stated; two principals never share a cached catalog; concurrent cold reads make one fake call; a cancelled first caller does not cancel the read. | planned |
| T-008 | `OVERSTORY-CITYHOST-R006.1` | Unit | A fake result with secret-named keys at depths 1, 3 and inside a list, and a captured log. | `agent/overstory/__tests__/test_city_invoke.py::test_secret_named_keys_are_stripped_at_every_depth_and_never_logged`: no secret-named key is in the reply; the log holds the op, status and duration and no param or result value. | planned |
| T-009 | `OVERSTORY-CITYHOST-R007` | Browser | The built server. | `e2e/city-isolation.browser.ts::only_the_city_page_is_cross_origin_isolated`: the rollup holds when every child row holds. | planned |
| T-010 | `OVERSTORY-CITYHOST-R007.1` | Unit | The route registry with the city route. | `scripts/site-assets-contract.test.mjs::the_manifest_lists_isolated_routes`: `isolated_routes` is `['/apps/city']`; a manifest with an isolated path outside `routes` is refused. | planned |
| T-011 | `OVERSTORY-CITYHOST-R007.2` | Integration | The test app with a version 2 manifest and a dist holding `index.html`, one entry script and one worker script. | `agent/overstory/__tests__/test_route_isolation.py::test_only_isolated_routes_get_coop_and_coep`: `/apps/city` has both headers; `/chat` and `/atlas` have neither; the worker script has COEP and CORP; the entry script has CORP only; a refused manifest gives no page COOP or COEP. | planned |
| T-012 | `OVERSTORY-CITYHOST-R007.3` | Unit | A memory router with `/chat`, `/apps/city` and `/atlas`, and a stubbed `location.assign`. | `src/lib/__tests__/route-isolation.test.tsx::crossing_the_isolation_boundary_reloads_the_document`: `/chat` to `/apps/city` and `/apps/city` to `/atlas` each assign once; `/chat` to `/atlas` assigns nothing. | planned |
| T-013 | `OVERSTORY-CITYHOST-R007.4` | Browser | The built server and Chromium. | `e2e/city-isolation.browser.ts::only_the_city_page_is_cross_origin_isolated`: on `/apps/city`, `crossOriginIsolated` is true and `snapshotTransport` is `shared`; after the nav link `/chat` is a new document with `crossOriginIsolated` false; the MCP App frame renders. | planned |
| T-014 | `OVERSTORY-CITYHOST-R008` | Unit | The repository after the cutover commit. | `scripts/city-cutover.test.mjs::no_engine_code_or_moved_row_remains`: no deleted path is tracked; no specifier starts with `@/lib/scene3d` or `@/apps/city/core`; no `OVERSTORY-CITY-` row is left in `specs/`; each deleted ID has exactly one alias whose target is an active row. | planned |

## Negative and boundary cases

- An operation absent from `city-operations.json` refuses `OP_NOT_ALLOWED` with HTTP 403, and the host never calls Arbora for it.
- A build without `city-operations.json`, or with an invalid one, refuses every city operation with `UNAVAILABLE` and HTTP 503.
- A reply that holds a key named `token`, `secret`, `password`, `authorization`, `cookie` or `api_key`, at any depth, reaches the browser without that key.
- Any page other than `/apps/city` that carries `Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy` fails the isolation test.
- A client navigation from a non-isolated route to `/apps/city`, or back, that keeps the same document fails the boundary test.
- After `R008`, a tracked file under `src/apps/city/core/`, `src/lib/scene3d/` or `scripts/asset-kit/`, or an import of `@/lib/scene3d` or `@/apps/city/core`, fails the cutover test.

## Quality and release proof

`pnpm test -- src/apps/city src/lib/__tests__/route-isolation.test.tsx`, `pytest agent/overstory/__tests__/test_city_invoke.py agent/overstory/__tests__/test_route_isolation.py`, and `pnpm exec playwright test -c e2e/city-isolation.config.ts` cover every row. `pnpm build` and `node --test scripts/city-chunk.test.mjs scripts/city-cutover.test.mjs` are the release proof.
