# Seam: graph neighborhood read

Provider: medulla MEDULLA-DURABLE-KERNEL-R876
Consumer: overstory OVERSTORY-APPS-R030.10.10

## Wire shape

The engine owns the neighborhood read that animated graph exploration (R030.10.3) calls. The browser calls the served Arbora operation `eg.graph.GetNeighborhood` through `src/lib/arbora-api/invoke.ts` and renders the answer. Overstory holds no copy of the data and makes no decision about it.

## Refusal codes

A refused or unavailable operation reaches the browser as the typed Arbora refusal; the view shows a stated absence and never a made-up result. The stable codes are defined by the provider row above.

## Authoritative types

The generated Arbora schemas for `eg.graph.GetNeighborhood`; the browser reads them through the existing operation client.

## Test vectors

Planned served proof under the consumer row: the operation answers through the real Arbora route and the view renders its answer.
