# Seam: ontology class vocabulary

Provider: medulla MEDULLA-ORCH-VOCAB-R817
Consumer: overstory OVERSTORY-APPS-R030.11.7

## Wire shape

The engine owns the ontology class vocabulary that node colour and shape (R030.11) depend on. The browser calls the served Arbora operation `eg.reasoning.GraphSchemaClasses` through `src/lib/arbora-api/invoke.ts` and renders the answer. Overstory holds no copy of the data and makes no decision about it.

## Refusal codes

A refused or unavailable operation reaches the browser as the typed Arbora refusal; the view shows a stated absence and never a made-up result. The stable codes are defined by the provider row above.

## Authoritative types

The generated Arbora schemas for `eg.reasoning.GraphSchemaClasses`; the browser reads them through the existing operation client.

## Test vectors

Planned served proof under the consumer row: the operation answers through the real Arbora route and the view renders its answer.
