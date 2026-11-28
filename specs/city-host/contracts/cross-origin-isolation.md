# Contract: cross-origin isolation of the city page

Seam between the overstory response headers and the arbora-city snapshot transport.

Provider: overstory OVERSTORY-CITYHOST-R007
Provider: overstory OVERSTORY-CITYHOST-R007.2
Provider: overstory OVERSTORY-CITYHOST-R007.4
Consumer: arbora-city CITY-RUNTIME-R001.3

## Wire shape

- The `/apps/city` document carries `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- Responses under `/assets/` and `/city-kit/` carry `Cross-Origin-Resource-Policy: same-origin`; worker scripts under `/assets/` also carry `Cross-Origin-Embedder-Policy: require-corp`.
- No other document carries either policy. Crossing between the city and another route loads a new document.
- With the headers, `selectTransport()` returns `shared`; without them it returns `transfer`, and `PerfSample.snapshotTransport` reports the value.

## Refusal codes

- None. A page without isolation selects `transfer`; nothing is refused.

## Authoritative types

- `SecurityHeadersMiddleware` and `SpaRouteManifest` in `agent/overstory/server.py`.
- `selectTransport` in `src/engine/runtime/transport.ts` of arbora-city.

## Test vectors

- `agent/overstory/__tests__/test_route_isolation.py` and `e2e/city-isolation.browser.ts`.
- `tests/engine/runtime/transport.test.ts` in arbora-city.
