# Contract: the arbora-city package API

Seam between the arbora-city package and the overstory host page.

Provider: arbora-city CITY-PACKAGE-R001.1
Provider: arbora-city CITY-PACKAGE-R001.4
Provider: arbora-city CITY-PACKAGE-R003.3
Provider: arbora-city CITY-SOURCE-R002
Provider: arbora-city CITY-SOURCE-R001.3
Provider: arbora-city CITY-PACKAGE-R002.1
Provider: arbora-city CITY-PACKAGE-R002.3
Provider: arbora-city CITY-SOURCE-R003
Provider: arbora-city CITY-KIT-R015
Consumer: overstory OVERSTORY-CITYHOST-R001.1
Consumer: overstory OVERSTORY-CITYHOST-R002
Consumer: overstory OVERSTORY-CITYHOST-R003
Consumer: overstory OVERSTORY-CITYHOST-R004
Consumer: overstory OVERSTORY-CITYHOST-R005
Consumer: overstory OVERSTORY-CITYHOST-R006
Consumer: overstory OVERSTORY-CITYHOST-R008

## Wire shape

- `arbora-city/engine`: `mountCity(container, { source, kitBaseUrl, quality?, seed?, reducedMotion? }) -> CityHandle`; `CityHandle` has `dispatch`, `getState`, `getPerf`, `on` and `dispose`.
- `arbora-city/source`: `createArboraSource(transport, options?)`, `createDemoSource()`, `TransportError { code: 'UNAVAILABLE' | 'REFUSED' | 'TIMEOUT', refusal? }`, and `ArboraTransport { invoke(op, params): Promise<unknown> }`.
- `arbora-city/source/operations.json`: a list of `{ op, verb }`, `verb` `ask` or `write`. The host copies it to `<dist>/city-operations.json` and allowlists exactly it.
- `arbora-city-kit --out public/city-kit`: exit 0 on success, 2 usage, 3 digest mismatch, 4 download failure; a failure leaves no output directory.
- Host gateway: `POST /api/apps/city/invoke` with `{ op, params }` answers 200 `{ result }`, or an error body `{ refusal }`.
- `SourceConnectionMachine` (`CITY-SOURCE-R003`) owns retry and the `Degraded` state; the host transport adds no retry and the page never falls back to the demo source.
- The blender asset reference moves to arbora-city's `skills/arbora-city-kit/` (`CITY-KIT-R015`).
- The move: arbora-city's extraction (`CITY-PACKAGE-R002.1`) and overstory's deletion (`OVERSTORY-CITYHOST-R008`) land in one change window.

## Refusal codes

| Code | HTTP | Meaning |
|---|---|---|
| `OP_NOT_ALLOWED` | 403 | The operation is not in `city-operations.json` |
| `UNAVAILABLE` | 503 | The list is missing or invalid, or Arbora is unreachable |
| `TIMEOUT` | 504 | Arbora did not answer in 10 s |
| an Arbora refusal code | 409 | Arbora refused the call; the code passes through |

## Authoritative types

- `src/engine/index.ts` and `src/source/index.ts` in arbora-city.
- `src/apps/city/transport.ts` and `agent/overstory/apps/city/operations.py` in overstory.

## Test vectors

- `src/apps/city/__tests__/transport.test.ts` and `agent/overstory/__tests__/test_city_invoke.py`.
- `tests/source/contract.test.ts` in arbora-city.
