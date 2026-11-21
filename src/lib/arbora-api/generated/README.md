# Pinned Arbora operation schema

`openapi.json` is `arbora`'s own `Caller-filtered OpenAPI projection of the
shared operation registry` (`arbora/api/http/openapi.py::document`), built
from the live registry (`arbora.api.ops.{agents,browser,fleet}` plus every
wire-callable EG method `arbora.api.registry.eg_binding.load_eg_bindings`
exposes). `schema.ts` is generated from it with `pnpm run arbora:client:gen`
(openapi-typescript).

## Regenerating the pin

Build arbora's registry (`arbora.api.ops.registry_factory.get_registry`), project it
with `arbora.api.http.openapi.document`, then run
`python scripts/pin_arbora_schema.py <that openapi.json>` and
`pnpm run arbora:client:gen`. The pin script hoists the per-operation `$defs`
that arbora embeds into `components.schemas` (so references resolve) and gives
each REST alias of an operation a distinct `operationId`; operation ids, paths
and the `x-registry-digest` are unchanged.

## Known limits of the current pin

The curated ops carry real Pydantic-derived schemas. The Medulla-bound
generated ops (`eg.<domain>.<Method>`) carry a placeholder object body. Some
curated results are typed only as an object, notably `runs.get` (the per-run
fields of ARBORA-OPS-R021.4.5 are specified but not yet in the served schema)
and the `identity.*` admin operations (ARBORA-IDENTITY-R018 is specified, not
served). `runs.metrics` is not served yet. Consumers parse those results
with strict zod schemas until arbora serves the typed shapes.

## OVERSTORY-API-R001 / OVERSTORY-API-R007 finding

There is no `decide.*` operation namespace. The real decision-related
operations are `eg.query.Decide`, `eg.coordination.DecisionLog`,
`eg.coordination.DecisionEval`, `eg.coordination.DecisionFit`, and
`eg.storage.DecisionCommit` — each multiplexes several named actions in one
operation (for example `DecisionLog` carries `get`/`aggregate`/`commit`/
`evaluate`/`compact`/`learn`/`resolve`/`verify`, selected by a request field,
not by separate operation ids). `arbora-decisions-transport.ts`'s
`decide.records.*` / `decide.outcomes.aggregate` / `decide.receipts.*` ids
predate this schema and do not match it; retargeting that file needs the
real per-action request/result shapes, not a rename, and is tracked
separately rather than patched here.
