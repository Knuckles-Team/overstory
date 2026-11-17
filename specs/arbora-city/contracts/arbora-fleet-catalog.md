# Contract: Arbora fleet catalog read (`fleet.catalog.list`)

Provider: arbora ARBORA-FLEET-R040
Consumer: overstory OVERSTORY-CITY-R003

This seam is a read. The city host invokes the served fleet catalog
operation as the bound actor and normalizes the answer to server names,
served tool counts and pack status; no new arbora operation is required
and the browser never contacts Arbora directly (OVERSTORY-CITY-R017).

## Wire shape

Request: the served operation `fleet.catalog.list` (scope
`mcp:discover`), called with the browse and summary parameters
(`{'browse': True, 'summary': True}`) as the bound actor through the
host's injected invoke seam (`agent/overstory/apps/city/gateway.py`).

Response (the city consumes the subset below; everything else is dropped
by the normalization whitelist):

```json
{
  "servers": [
    {
      "name": "vector",
      "packStatus": "served",
      "servedToolCount": 7,
      "toolNames": ["query_vectors", "…"]
    }
  ],
  "next_cursor": null
}
```

Live capture 2026-11-15: 75 registered servers — 7 served packs
(audio-transcriber 12 tools, dockerhub 82, mealie 254, nextcloud 89,
openbao 42, sql 33, vector 7), 67 registered-unpublished, plus the arbora
core pack (15 skills, 29 prompts), which the city excludes from the
connector district because it is a core landmark.

## Refusal codes

- Unreachable engine or absent operation → the host answers 503 with a
  stated reason; the city degrades to `SIMULATED` over the bundled
  snapshot (OVERSTORY-CITY-R014).
- Typed refusal from the engine → the refusal code passes through to the
  browser as a 4xx.
- Unrecognized catalog entries → dropped by the normalization whitelist
  (never rendered, never logged); tool names are bounded at twelve per
  pack.

## Authoritative types

- Provider: arbora `arbora/fleet/catalog_items.py` (catalog items and the
  served `fleet.catalog.list` read) in the repository
  Knuckles-Team/arbora, spec `specs/fleet-catalog-and-tools/`.
- Consumer: overstory `agent/overstory/apps/city/gateway.py`
  (`normalize_fleet`, `CityGateway`) and `src/apps/city/schemas.ts`
  (Zod shape of the normalized response).

## Test vectors

- Consumer: `agent/overstory/__tests__/test_city_app.py` (shape over a
  fake gateway, 60 s cache, 503 path, typed refusal, whitelist,
  principal-and-tenant-scoped cache, single-flight cold boot, bounded
  concurrent fan-out).
- Provider: the fleet catalog served tests in the arbora repository
  (catalog list and onboarding hot-path proofs).

## Notes (2026-11-17 review)

- The host cache is keyed by the verified principal and tenant
  (OVERSTORY-CITY-R003): no caller is ever served another caller's view;
  concurrent cold boots share one in-flight read (single flight) and the
  per-pack fan-out runs concurrently under a cap with a per-call timeout.
- The follow-on served layout read (the city-layout row in this
  fleet-catalog spec) extends this catalog seam: it serves the tenant's
  spatial layout from the medulla world-view spec, which supplies the
  spatial facts behind it (see the overstory spec's follow-on rows
  R019–R024 and their `Depends:` lines).
