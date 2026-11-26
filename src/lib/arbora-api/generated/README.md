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

## Served decision, catalog, dashboard, project and fleet reads

The pin carries `decision.list`, `decision.provenance.get`, `decision.why_not`,
`catalog.assets.*`, `dashboard.*`, `project.mode.*`,
`development.proposal.*`, `spec.query` and `fleet.connections.state`. Each can
answer `UNAVAILABLE` until the engine behind it is pinned; `callServed`
(`../served.ts`) folds that and denied and pending-confirmation answers into
labelled states so a view never shows invented data. `fleet.connections.state`
types its result only as `{ value }`; the adapter in `../connections.ts`
validates the rows. `preferences.*` is not in the pin yet.

`DecisionLog.get`, `DecisionLog.aggregate` and `DecisionEval.*` stay
`eg.coordination.*` operations with a placeholder body; their zod schemas are in
`src/components/decisions/decision-schemas.ts`.
